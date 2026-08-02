/**
 * Fat loss timeline engine.
 *
 * The model is a week-by-week simulation rather than a closed-form division,
 * because every quantity in a real diet moves as body weight moves:
 *
 *  1. The loss target is a *percentage* of current weight, so absolute pounds
 *     lost per week shrinks as the diet progresses (the "dynamic rate curve").
 *  2. TDEE falls with body weight, so the calorie target must be re-cut on a
 *     schedule instead of being set once at the start.
 *  3. The split between fat and lean tissue lost depends on both the
 *     aggressiveness of the deficit and how lean the dieter already is.
 *
 * All masses are in pounds; all energy is in kilocalories.
 */

import {
  estimateTdee as estimateTdeeFromProfile,
  minimumSafeBodyFat,
  resolveBodyFat,
} from "./body-composition";
import { addWeeks, todayISO, weeksBetween } from "./dates";
import type {
  ActivityLevel,
  BiometricProfile,
  FatLossInputs,
  FatLossResult,
  TimelineWarning,
  WeekProjection,
} from "./types";
import {
  KCAL_PER_LB_FAT,
  KCAL_PER_LB_LEAN,
  clamp,
  round,
  safeNumber,
} from "./units";

/** Hard ceiling on the simulation so bad inputs can't spin forever. */
const MAX_WEEKS = 156;

export const RATE_PRESETS = {
  conservative: 0.005,
  moderate: 0.0075,
  aggressive: 0.01,
} as const;

export const MIN_RATE = 0.005;
export const MAX_RATE = 0.01;

/**
 * Rate above which lean-mass loss becomes the dominant risk. The UI surfaces a
 * warning at this threshold; the slider itself is capped here, but a fixed
 * event date can still *require* a faster rate than this.
 */
export const RISK_RATE_THRESHOLD = 0.01;

/**
 * Absolute floor on daily intake. Below this a diet stops being a diet and
 * starts being a medical intervention, so the engine clamps and flags it.
 */
const MIN_CALORIE_FLOOR_PER_LB = 8;
const ABSOLUTE_MIN_CALORIES = 1200;

/** Maximum modelled metabolic adaptation, reached late in a long diet. */
const MAX_ADAPTATION = 0.1;
const ADAPTATION_HALF_LIFE_WEEKS = 12;

/**
 * Fraction of weight lost that comes from fat mass.
 *
 * Two effects are combined:
 *  - Aggressiveness: a 0.5%/wk deficit spares lean tissue far better than a
 *    1%/wk deficit (~95% vs ~80% of loss coming from fat).
 *  - Existing leanness: the leaner you already are, the more the body defends
 *    remaining fat and the more lean tissue it will surrender (Forbes' curve).
 *
 * These coefficients are a practical fit to that literature, not a claim of
 * individual precision — two people at the same rate will differ.
 */
export function fatLossFraction(weeklyRate: number, bodyFatPercent: number): number {
  const rate = clamp(weeklyRate, 0.002, 0.02);
  // 0.5%/wk → 0.95, 0.75%/wk → 0.875, 1.0%/wk → 0.80, extrapolating beyond.
  const rateComponent = 0.95 - ((rate - 0.005) / 0.005) * 0.15;
  // Body fat 20% is the neutral pivot; ±20 points shifts the split ±0.15.
  const leannessComponent = ((clamp(bodyFatPercent, 3, 60) - 20) / 20) * 0.15;
  return clamp(rateComponent + leannessComponent, 0.5, 0.98);
}

/**
 * Maintenance calories at an arbitrary point along the diet.
 *
 * Height, age and sex stay fixed as weight falls, so the profile is re-derived
 * at each week's weight and run back through Mifflin-St Jeor. A user-supplied
 * TDEE stays authoritative but is scaled by the same ratio the equation would
 * have produced, so a measured starting value still decays realistically
 * instead of decaying in simple proportion to body weight.
 */
export function tdeeAtWeight(
  profile: BiometricProfile,
  weight: number,
  activityLevel: ActivityLevel,
  tdeeOverride: number | null,
): number {
  const atWeight = estimateTdeeFromProfile({ ...profile, weight }, activityLevel);

  if (tdeeOverride && tdeeOverride > 0) {
    const atStart = estimateTdeeFromProfile(profile, activityLevel);
    return atStart > 0 ? tdeeOverride * (atWeight / atStart) : tdeeOverride;
  }
  return atWeight;
}

/**
 * Metabolic adaptation multiplier for a given week of dieting. Approaches
 * `MAX_ADAPTATION` asymptotically rather than linearly — most of the drop
 * happens in the first couple of months.
 */
export function adaptationFactor(week: number, enabled: boolean): number {
  if (!enabled) return 1;
  const progress = 1 - Math.exp(-week / ADAPTATION_HALF_LIFE_WEEKS);
  return 1 - MAX_ADAPTATION * progress;
}

/**
 * Energy cost of a week's projected tissue loss. Fat and lean mass are priced
 * separately — this is why the engine tracks composition at all.
 */
export function weeklyEnergyDeficit(fatLost: number, leanLost: number): number {
  return fatLost * KCAL_PER_LB_FAT + leanLost * KCAL_PER_LB_LEAN;
}

/**
 * Convert a weekly energy deficit into pounds of body weight.
 *
 * Dividing by a flat 3500 kcal/lb understates the loss, because part of what is
 * lost is lean tissue at 824 kcal/lb. The composition split depends on how fast
 * the loss is, which depends on the split — so this iterates to a fixed point.
 * It converges in a handful of passes.
 *
 * Both calculators route through this so the same deficit never reports two
 * different weekly losses.
 */
export function weeklyLossFromDeficit(
  weeklyDeficit: number,
  bodyWeight: number,
  bodyFatPercent: number,
): number {
  if (weeklyDeficit <= 0 || bodyWeight <= 0) return 0;

  let loss = weeklyDeficit / KCAL_PER_LB_FAT;
  for (let i = 0; i < 8; i++) {
    const rate = loss / bodyWeight;
    const fatFrac = fatLossFraction(rate, bodyFatPercent);
    const energyPerLb =
      fatFrac * KCAL_PER_LB_FAT + (1 - fatFrac) * KCAL_PER_LB_LEAN;
    const next = weeklyDeficit / energyPerLb;
    if (Math.abs(next - loss) < 1e-6) return next;
    loss = next;
  }
  return loss;
}

/** Target weight implied by a goal body fat percentage, holding lean mass fixed. */
export function weightAtBodyFat(leanMass: number, targetBodyFat: number): number {
  const bf = clamp(targetBodyFat, 1, 70) / 100;
  return leanMass / (1 - bf);
}

/**
 * Weekly rate required to get from `startWeight` to `targetWeight` in a fixed
 * number of weeks, given that each week's loss compounds off the new weight.
 *
 *   W_n = W_0 · (1 − r)^n   ⇒   r = 1 − (W_n / W_0)^(1/n)
 */
export function requiredWeeklyRate(
  startWeight: number,
  targetWeight: number,
  weeks: number,
): number {
  if (weeks <= 0 || startWeight <= 0 || targetWeight <= 0) return Number.NaN;
  if (targetWeight >= startWeight) return 0;
  return 1 - Math.pow(targetWeight / startWeight, 1 / weeks);
}

/**
 * Closed-form week count for a compounding percentage loss. Used as a cheap
 * cross-check and for fractional-week precision; the table itself comes from
 * the simulation below.
 *
 *   n = ln(W_n / W_0) / ln(1 − r)
 */
export function weeksToTarget(
  startWeight: number,
  targetWeight: number,
  weeklyRate: number,
): number {
  if (weeklyRate <= 0 || startWeight <= 0 || targetWeight <= 0) return Number.NaN;
  if (targetWeight >= startWeight) return 0;
  return Math.log(targetWeight / startWeight) / Math.log(1 - weeklyRate);
}

interface ResolvedGoal {
  /** Absolute goal weight in pounds, when the goal is weight-based. */
  targetWeight: number | null;
  /** Goal body fat as a fraction, when the goal is composition-based. */
  targetBodyFatFraction: number | null;
}

function resolveGoal(inputs: FatLossInputs): ResolvedGoal {
  if (inputs.goalType === "bodyFat") {
    return {
      targetWeight: null,
      targetBodyFatFraction: clamp(inputs.targetBodyFat, 1, 70) / 100,
    };
  }
  return { targetWeight: inputs.targetWeight, targetBodyFatFraction: null };
}

/** Coaching note attached to notable weeks in the milestone table. */
function milestoneNote(
  week: number,
  weeksRequired: number,
  calorieDrop: number,
  clamped: boolean,
): string | null {
  if (clamped) return "Intake at floor — add cardio instead of cutting further";
  if (week === 0) return "Baseline — log weight daily, average weekly";
  if (week === weeksRequired) return "Goal week — begin reverse dieting";
  if (weeksRequired - week === 4) return "4 weeks out — lock in peak week plan";
  if (weeksRequired - week === 8) return "8 weeks out — reassess rate vs. condition";
  if (calorieDrop >= 100) return `Drop intake ~${Math.round(calorieDrop)} kcal`;
  if (week > 0 && week % 4 === 0) return "Re-measure body fat, recalibrate";
  return null;
}

/**
 * Run the week-by-week simulation.
 *
 * Each iteration: take `weeklyRate` of *current* weight, split it into fat and
 * lean tissue, price that tissue in calories to derive the week's deficit, and
 * subtract it from a TDEE that is itself falling with weight and adaptation.
 */
function simulate(
  profile: BiometricProfile,
  inputs: FatLossInputs,
  rate: number,
): WeekProjection[] {
  const startWeight = Math.max(safeNumber(profile.weight, 0), 0);
  const startBodyFat = clamp(resolveBodyFat(profile), 1, 70);
  const goal = resolveGoal(inputs);

  let weight = startWeight;
  let fatMass = weight * (startBodyFat / 100);
  let leanMass = weight - fatMass;

  const anchorDate =
    inputs.mode === "startDate" ? inputs.startDate : inputs.startDate || todayISO();

  const projection: WeekProjection[] = [];
  let cumulativeLoss = 0;

  for (let week = 0; week <= MAX_WEEKS; week++) {
    const rawTdee =
      tdeeAtWeight(profile, weight, inputs.activityLevel, inputs.tdeeOverride) *
      adaptationFactor(week, inputs.includeMetabolicAdaptation);

    // Look ahead one week to price *this* week's prescription.
    const projectedLoss = weight * rate;
    const fatFrac = fatLossFraction(rate, (fatMass / weight) * 100);
    const projectedFatLoss = projectedLoss * fatFrac;
    const projectedLeanLoss = projectedLoss - projectedFatLoss;
    const weeklyDeficit = weeklyEnergyDeficit(projectedFatLoss, projectedLeanLoss);
    const dailyDeficit = weeklyDeficit / 7;

    const floor = Math.max(
      ABSOLUTE_MIN_CALORIES,
      weight * MIN_CALORIE_FLOOR_PER_LB,
    );
    const uncappedTarget = rawTdee - dailyDeficit;
    const deficitClamped = uncappedTarget < floor;
    const targetCalories = deficitClamped ? floor : uncappedTarget;

    projection.push({
      week,
      date: addWeeks(anchorDate, week),
      weight: round(weight, 1),
      bodyFat: round((fatMass / weight) * 100, 1),
      fatMass: round(fatMass, 1),
      leanMass: round(leanMass, 1),
      weeklyLoss: week === 0 ? 0 : round(projection[week - 1]!.weight - weight, 2),
      cumulativeLoss: round(cumulativeLoss, 1),
      tdee: Math.round(rawTdee),
      targetCalories: Math.round(targetCalories),
      dailyDeficit: Math.round(rawTdee - targetCalories),
      deficitClamped,
      note: null, // filled in once the goal week is known
    });

    // Stop as soon as the goal is met.
    const bodyFatFraction = fatMass / weight;
    const hitWeightGoal =
      goal.targetWeight !== null && weight <= goal.targetWeight + 1e-6;
    const hitBodyFatGoal =
      goal.targetBodyFatFraction !== null &&
      bodyFatFraction <= goal.targetBodyFatFraction + 1e-9;
    if (hitWeightGoal || hitBodyFatGoal) break;

    // Advance one week.
    fatMass = Math.max(fatMass - projectedFatLoss, 0);
    leanMass = Math.max(leanMass - projectedLeanLoss, 0);
    weight = fatMass + leanMass;
    cumulativeLoss = startWeight - weight;
  }

  // Second pass for notes, now that the final week index is known.
  const last = projection.length - 1;
  for (let i = 0; i < projection.length; i++) {
    const entry = projection[i]!;
    const drop = i === 0 ? 0 : projection[i - 1]!.targetCalories - entry.targetCalories;
    entry.note = milestoneNote(entry.week, projection[last]!.week, drop, entry.deficitClamped);
  }

  return projection;
}

function buildWarnings(
  profile: BiometricProfile,
  inputs: FatLossInputs,
  result: Omit<FatLossResult, "warnings">,
  rate: number,
): TimelineWarning[] {
  const warnings: TimelineWarning[] = [];
  const { requiredRate, weeksAvailable, projection } = result;

  if (!result.feasible) {
    warnings.push({
      level: "danger",
      title: "Target is not below current weight",
      detail:
        "Set a goal weight or body fat percentage lower than your current numbers to generate a timeline.",
    });
    return warnings;
  }

  if (requiredRate !== null && requiredRate > RISK_RATE_THRESHOLD) {
    warnings.push({
      level: "danger",
      title: `Required rate is ${(requiredRate * 100).toFixed(2)}% of body weight per week`,
      detail:
        "Anything above 1%/week carries a high risk of lean mass loss, strength drops, and hormonal disruption. Push the event back, raise the goal weight, or accept arriving slightly above target.",
    });
  } else if (rate > RISK_RATE_THRESHOLD) {
    warnings.push({
      level: "danger",
      title: "Selected rate exceeds 1% of body weight per week",
      detail:
        "Sustained loss faster than 1%/week increasingly comes out of lean tissue rather than fat.",
    });
  }

  if (
    requiredRate !== null &&
    weeksAvailable !== null &&
    requiredRate > 0 &&
    requiredRate <= RISK_RATE_THRESHOLD &&
    requiredRate > rate * 1.05
  ) {
    warnings.push({
      level: "warning",
      title: "Timeline is tighter than your selected rate",
      detail: `Arriving on time needs about ${(requiredRate * 100).toFixed(2)}%/week, faster than the ${(rate * 100).toFixed(2)}%/week you selected. Consider starting sooner.`,
    });
  }

  const clampedWeeks = projection.filter((week) => week.deficitClamped).length;
  if (clampedWeeks > 0) {
    warnings.push({
      level: "warning",
      title: `${clampedWeeks} week${clampedWeeks === 1 ? "" : "s"} hit the intake floor`,
      detail:
        "The prescribed deficit would push intake below a safe floor. Those weeks are capped — create the extra gap with activity rather than further food cuts.",
    });
  }

  const leanShare = result.totalLoss > 0 ? result.leanLoss / result.totalLoss : 0;
  if (leanShare > 0.18) {
    warnings.push({
      level: "warning",
      title: `~${Math.round(leanShare * 100)}% of projected loss is lean mass`,
      detail:
        "Slow the rate, keep protein at or above 1g/lb, and maintain heavy training volume to shift this split back toward fat.",
    });
  }

  // The essential-fat floor is substantially higher for women, so the threshold
  // is taken from the profile rather than assumed.
  const safeFloor = minimumSafeBodyFat(profile.sex);
  if (result.endBodyFat < safeFloor) {
    warnings.push({
      level: "danger",
      title: `Projected end body fat of ${round(result.endBodyFat, 1)}% is below the essential-fat floor`,
      detail:
        profile.sex === "female"
          ? "Below roughly 12% body fat, women risk menstrual disruption, bone density loss, and hormonal dysfunction. This is not a target to plan for without medical supervision."
          : "Below roughly 5% body fat is transient stage-day condition, not something to hold. Raise the goal weight.",
    });
  } else if (result.endBodyFat < safeFloor + 3) {
    warnings.push({
      level: "warning",
      title: "Projected end body fat is very low",
      detail:
        "This is peak-week condition. Expect it to be held for days, not weeks, and plan a structured reverse diet immediately after.",
    });
  }

  if (result.weeksRequired > 52) {
    warnings.push({
      level: "info",
      title: "Prep runs longer than a year",
      detail:
        "Plan at least one structured diet break or maintenance phase; adherence and metabolic rate both suffer past ~16–20 continuous weeks.",
    });
  }

  if (inputs.mode === "eventDate" && weeksAvailable !== null && weeksAvailable < 0) {
    warnings.push({
      level: "danger",
      title: "Event date is in the past",
      detail: "Pick an event date after today to compute a required start date.",
    });
  }

  return warnings;
}

/** Main entry point: solve the timeline for a person and a plan. */
export function calculateFatLossTimeline(
  profile: BiometricProfile,
  inputs: FatLossInputs,
): FatLossResult {
  const startWeight = Math.max(safeNumber(profile.weight, 0), 0);
  const startBodyFat = clamp(resolveBodyFat(profile), 1, 70);
  const rate = clamp(safeNumber(inputs.weeklyRate, RATE_PRESETS.moderate), 0.001, 0.03);

  const startLean = startWeight * (1 - startBodyFat / 100);
  const goalWeight =
    inputs.goalType === "weight"
      ? safeNumber(inputs.targetWeight, 0)
      : weightAtBodyFat(startLean, inputs.targetBodyFat);

  const feasible =
    startWeight > 0 &&
    goalWeight > 0 &&
    goalWeight < startWeight &&
    (inputs.goalType === "weight" || inputs.targetBodyFat < startBodyFat);

  const projection = feasible ? simulate(profile, inputs, rate) : [];
  const finalWeek = projection[projection.length - 1];
  const weeksRequired = finalWeek?.week ?? 0;

  // Fractional week count gives a sharper date than the integer week index.
  const precise = feasible
    ? weeksToTarget(startWeight, finalWeek?.weight ?? goalWeight, rate)
    : 0;
  const preciseWeeks = Number.isFinite(precise) && precise > 0 ? precise : weeksRequired;

  const endWeight = finalWeek?.weight ?? startWeight;
  const endBodyFat = finalWeek?.bodyFat ?? startBodyFat;
  const totalLoss = round(startWeight - endWeight, 1);
  const endFatMass = finalWeek?.fatMass ?? startWeight * (startBodyFat / 100);
  const fatLoss = round(startWeight * (startBodyFat / 100) - endFatMass, 1);
  const leanLoss = round(totalLoss - fatLoss, 1);

  const dieting = projection.slice(0, Math.max(projection.length - 1, 1));
  const averageDailyDeficit = dieting.length
    ? Math.round(dieting.reduce((sum, w) => sum + w.dailyDeficit, 0) / dieting.length)
    : 0;
  const averageTargetCalories = dieting.length
    ? Math.round(dieting.reduce((sum, w) => sum + w.targetCalories, 0) / dieting.length)
    : 0;

  let requiredStartDate = inputs.startDate;
  let finishDate = inputs.startDate;
  let weeksAvailable: number | null = null;
  let requiredRate: number | null = null;

  if (inputs.mode === "eventDate") {
    // Work backwards from the show: the diet must begin `weeksRequired` before.
    requiredStartDate = addWeeks(inputs.eventDate, -weeksRequired);
    finishDate = inputs.eventDate;
    weeksAvailable = weeksBetween(todayISO(), inputs.eventDate);
    if (feasible && weeksAvailable > 0) {
      const needed = requiredWeeklyRate(startWeight, goalWeight, weeksAvailable);
      requiredRate = Number.isFinite(needed) ? needed : null;
    } else if (feasible) {
      requiredRate = Number.POSITIVE_INFINITY;
    }
  } else {
    requiredStartDate = inputs.startDate;
    finishDate = addWeeks(inputs.startDate, weeksRequired);
  }

  const base: Omit<FatLossResult, "warnings"> = {
    projection,
    weeksRequired,
    preciseWeeks: round(preciseWeeks, 1),
    finishDate,
    requiredStartDate,
    totalLoss,
    fatLoss,
    leanLoss,
    endWeight,
    endBodyFat,
    averageDailyDeficit,
    averageTargetCalories,
    requiredRate,
    weeksAvailable: weeksAvailable === null ? null : round(weeksAvailable, 1),
    feasible,
  };

  return { ...base, warnings: buildWarnings(profile, inputs, base, rate) };
}

/** Plain-text summary for the copy-to-clipboard card. */
export function formatTimelineSummary(
  profile: BiometricProfile,
  inputs: FatLossInputs,
  result: FatLossResult,
  unitLabel: string,
  convert: (lb: number) => number,
): string {
  if (!result.feasible) return "Timeline unavailable — set a goal below current weight.";

  const startBodyFat = resolveBodyFat(profile);
  const bodyFatSource =
    profile.bodyFatOverride === null ? " (estimated)" : " (measured)";
  const fmt = (lb: number) => `${round(convert(lb), 1)} ${unitLabel}`;
  const lines = [
    "FAT LOSS TIMELINE",
    `Start: ${fmt(profile.weight)} at ${round(startBodyFat, 1)}% body fat${bodyFatSource}`,
    `Goal: ${fmt(result.endWeight)} at ${round(result.endBodyFat, 1)}% body fat`,
    `Rate: ${(inputs.weeklyRate * 100).toFixed(2)}% of body weight per week`,
    "",
    `Duration: ${result.weeksRequired} weeks`,
    `Start date: ${result.requiredStartDate}`,
    `Finish date: ${result.finishDate}`,
    "",
    `Total loss: ${fmt(result.totalLoss)} (${fmt(result.fatLoss)} fat, ${fmt(result.leanLoss)} lean)`,
    `Average intake: ${result.averageTargetCalories} kcal/day`,
    `Average deficit: ${result.averageDailyDeficit} kcal/day`,
  ];

  if (result.requiredRate !== null && Number.isFinite(result.requiredRate)) {
    lines.push(`Required rate to make the date: ${(result.requiredRate * 100).toFixed(2)}%/week`);
  }

  return lines.join("\n");
}

/**
 * Average daily deficit implied by a finished timeline, for handing over to the
 * carb cycling calculator.
 */
export function timelineHandoff(result: FatLossResult): {
  dailyCalories: number;
  dailyDeficit: number;
} {
  const firstDietWeek = result.projection[0];
  return {
    dailyCalories: firstDietWeek?.targetCalories ?? 0,
    dailyDeficit: firstDietWeek?.dailyDeficit ?? 0,
  };
}
