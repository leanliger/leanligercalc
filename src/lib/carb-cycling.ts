/**
 * Carb cycling engine.
 *
 * Design principle: **protein and fat are weekly-budgeted, carbohydrate does
 * the cycling.** That ordering is what makes the "7-day totals average out
 * exactly" requirement fall out of the math instead of needing a correction
 * pass:
 *
 *   1. Protein is identical every day → the weekly protein total is exact.
 *   2. Fat is distributed from a fixed weekly fat budget, weighted so low-carb
 *      days carry more of it → the weekly fat total is exact.
 *   3. Carbs on high and low days move by a set percentage off baseline, and
 *      medium days absorb whatever remains of the weekly carb budget → the
 *      weekly carb total is exact.
 *
 * Three exact weekly macro totals ⇒ an exact weekly calorie total, so the
 * average day always lands on the user's target with no rounding drift.
 */

import type {
  CarbCyclingInputs,
  CarbCyclingResult,
  CarbGoal,
  DayPlan,
  DayType,
  MacroTargets,
  TimelineWarning,
  WeeklyTotals,
} from "./types";
import { resolveBodyFat } from "./body-composition";
import { weeklyLossFromDeficit } from "./fat-loss";
import type { BiometricProfile } from "./types";
import { KCAL_PER_G, clamp, round, safeNumber } from "./units";

/** Default deficit as a fraction of TDEE, per goal. */
export const GOAL_DEFICITS: Record<CarbGoal, number> = {
  fatLoss: 0.2,
  recomp: 0.1,
  maintenance: 0,
};

export const GOAL_LABELS: Record<CarbGoal, string> = {
  fatLoss: "Fat loss",
  recomp: "Recomposition",
  maintenance: "Maintenance",
};

export const DAY_LABELS: Record<DayType, string> = {
  high: "High carb",
  medium: "Medium carb",
  low: "Low carb",
};

export const DAY_DESCRIPTIONS: Record<DayType, string> = {
  high: "Hard training — heavy compounds, high volume, or a weak-point session",
  medium: "Standard training day at about your daily target",
  low: "Rest or light conditioning — more fat, fewer carbs for recovery",
};

/**
 * Relative share of the weekly fat budget each day type receives. Low days run
 * higher fat to keep satiety and hormone substrate up while carbs are pulled;
 * high days sit near the floor so the calories can go to carbohydrate.
 */
const FAT_WEIGHTS: Record<DayType, number> = {
  high: 0.8,
  medium: 1.0,
  low: 1.35,
};

/** Weekly fat budget as a multiple of `floor × 7`. See `calculateCarbCycling`. */
const FAT_BUDGET_HEADROOM = 1.08;

/** Guardrails on the cycling amplitude, matching the documented ranges. */
export const HIGH_BOOST_RANGE = { min: 0.15, max: 0.25 } as const;
export const LOW_CUT_RANGE = { min: 0.2, max: 0.3 } as const;

/**
 * Minimum carbohydrate on a low day, in grams. Going below this on a repeated
 * basis compromises training quality and glycogen recovery more than it
 * accelerates fat loss.
 */
const MIN_LOW_DAY_CARBS = 30;

export function caloriesFromMacros(macros: Omit<MacroTargets, "calories">): number {
  return (
    macros.protein * KCAL_PER_G.protein +
    macros.carbs * KCAL_PER_G.carbs +
    macros.fat * KCAL_PER_G.fat
  );
}

/** Daily calorie target implied by TDEE and goal, unless explicitly overridden. */
export function resolveBaselineCalories(inputs: CarbCyclingInputs): number {
  if (inputs.dailyCalorieTarget && inputs.dailyCalorieTarget > 0) {
    return inputs.dailyCalorieTarget;
  }
  const tdee = Math.max(safeNumber(inputs.tdee, 0), 0);
  return tdee * (1 - GOAL_DEFICITS[inputs.goal]);
}

/** Daily protein in grams, from the chosen basis. */
export function resolveProtein(
  profile: BiometricProfile,
  inputs: CarbCyclingInputs,
): number {
  const weight = Math.max(safeNumber(profile.weight, 0), 0);
  const basisWeight =
    inputs.proteinBasis === "leanMass"
      ? weight * (1 - clamp(resolveBodyFat(profile), 1, 70) / 100)
      : weight;
  return basisWeight * Math.max(safeNumber(inputs.proteinPerLb, 1), 0);
}

/**
 * Daily fat floor in grams — the higher of the percentage-of-calories rule and
 * the grams-per-pound rule, so neither a very low calorie target nor a very
 * light lifter can drive fat down to an unhealthy level.
 */
export function resolveFatFloor(
  profile: BiometricProfile,
  inputs: CarbCyclingInputs,
  baselineCalories: number,
): number {
  const fromPercent =
    (baselineCalories * clamp(safeNumber(inputs.fatFloorPercent, 0.2), 0, 0.6)) /
    KCAL_PER_G.fat;
  const fromWeight =
    Math.max(safeNumber(profile.weight, 0), 0) *
    Math.max(safeNumber(inputs.fatFloorGramsPerLb, 0.3), 0);
  return Math.max(fromPercent, fromWeight);
}

interface DayCounts {
  high: number;
  medium: number;
  low: number;
}

function normalizeCounts(inputs: CarbCyclingInputs): DayCounts {
  const high = clamp(Math.round(safeNumber(inputs.highDays, 0)), 0, 7);
  const medium = clamp(Math.round(safeNumber(inputs.mediumDays, 0)), 0, 7);
  const low = clamp(Math.round(safeNumber(inputs.lowDays, 0)), 0, 7);
  return { high, medium, low };
}

/**
 * Distribute the weekly fat budget across day types by weight, then lift any
 * day that landed under the floor and take the shortfall proportionally from
 * the days that still have room.
 */
function distributeFat(
  counts: DayCounts,
  weeklyFatBudget: number,
  floorPerDay: number,
): Record<DayType, number> {
  const types: DayType[] = ["high", "medium", "low"];
  const weightedTotal = types.reduce(
    (sum, type) => sum + counts[type] * FAT_WEIGHTS[type],
    0,
  );

  const result: Record<DayType, number> = { high: 0, medium: 0, low: 0 };
  if (weightedTotal <= 0) return result;

  for (const type of types) {
    result[type] = (weeklyFatBudget * FAT_WEIGHTS[type]) / weightedTotal;
  }

  // Raise anything below the floor, then reclaim the extra from days above it.
  let shortfall = 0;
  for (const type of types) {
    if (counts[type] > 0 && result[type] < floorPerDay) {
      shortfall += (floorPerDay - result[type]) * counts[type];
      result[type] = floorPerDay;
    }
  }

  if (shortfall > 0) {
    const donorCapacity = types.reduce(
      (sum, type) =>
        counts[type] > 0 && result[type] > floorPerDay
          ? sum + (result[type] - floorPerDay) * counts[type]
          : sum,
      0,
    );
    if (donorCapacity > 0) {
      const ratio = Math.min(shortfall / donorCapacity, 1);
      for (const type of types) {
        if (counts[type] > 0 && result[type] > floorPerDay) {
          result[type] -= (result[type] - floorPerDay) * ratio;
        }
      }
    }
    // If capacity was insufficient the weekly fat total rises above budget —
    // intentional, since the floor is a hard health constraint. The resulting
    // calorie overshoot is surfaced as a warning by the caller.
  }

  return result;
}

/**
 * Split the weekly carb budget across day types.
 *
 * High and low days move off baseline by the configured percentages; medium
 * days absorb the remainder so the weekly total is preserved exactly. With no
 * medium days in the schedule there is nothing to absorb, so the two deltas are
 * rescaled against each other until they cancel.
 */
function distributeCarbs(
  counts: DayCounts,
  baselineCarbs: number,
  highBoost: number,
  lowCut: number,
): Record<DayType, number> {
  const weeklyCarbBudget = baselineCarbs * 7;
  const highCarbs = baselineCarbs * (1 + highBoost);
  const lowCarbs = baselineCarbs * (1 - lowCut);

  if (counts.medium > 0) {
    const remaining =
      weeklyCarbBudget - counts.high * highCarbs - counts.low * lowCarbs;
    return {
      high: highCarbs,
      medium: remaining / counts.medium,
      low: lowCarbs,
    };
  }

  // No medium days to absorb the imbalance, so the two swings must cancel each
  // other: nH·boost must equal nL·cut. Shrink whichever side is larger and
  // leave the other at the user's requested amplitude.
  const upSwing = counts.high * highBoost;
  const downSwing = counts.low * lowCut;

  let balancedBoost = highBoost;
  let balancedCut = lowCut;

  if (upSwing > downSwing && counts.high > 0) {
    balancedBoost = downSwing / counts.high;
  } else if (downSwing > upSwing && counts.low > 0) {
    balancedCut = upSwing / counts.low;
  }

  return {
    high: baselineCarbs * (1 + balancedBoost),
    medium: baselineCarbs,
    low: baselineCarbs * (1 - balancedCut),
  };
}

function buildWarnings(
  profile: BiometricProfile,
  inputs: CarbCyclingInputs,
  counts: DayCounts,
  days: DayPlan[],
  baseline: MacroTargets,
  weekly: WeeklyTotals,
  floorPerDay: number,
  /**
   * Pre-clamp carb allocation. The values on `days` have already been floored
   * at zero, so a schedule that mathematically demands negative medium-day
   * carbs is indistinguishable from one that lands on exactly zero unless the
   * raw numbers are checked here.
   */
  rawCarbs: Record<DayType, number>,
): TimelineWarning[] {
  const warnings: TimelineWarning[] = [];
  const totalDays = counts.high + counts.medium + counts.low;

  if (totalDays !== 7) {
    warnings.push({
      level: "danger",
      title: `Schedule covers ${totalDays} days, not 7`,
      detail:
        "High + medium + low days must add up to exactly 7 for the weekly averages to be meaningful.",
    });
  }

  if (baseline.carbs <= 0) {
    warnings.push({
      level: "danger",
      title: "No calories left for carbohydrate",
      detail:
        "Protein and the fat floor already consume the entire calorie target. Lower protein per pound, lower the fat floor, or raise daily calories.",
    });
  }

  const lowDay = days.find((d) => d.type === "low" && d.count > 0);
  if (lowDay && lowDay.carbs < MIN_LOW_DAY_CARBS && baseline.carbs > 0) {
    warnings.push({
      level: "warning",
      title: `Low days fall to ${Math.round(lowDay.carbs)}g of carbs`,
      detail: `Below about ${MIN_LOW_DAY_CARBS}g, training quality and glycogen recovery suffer more than fat loss improves. Reduce the low-day cut or add a medium day.`,
    });
  }

  const mediumDay = days.find((d) => d.type === "medium" && d.count > 0);
  if (mediumDay && rawCarbs.medium < 0) {
    warnings.push({
      level: "danger",
      title: "Medium days cannot balance this schedule",
      detail: `Balancing the week would need ${Math.round(rawCarbs.medium)}g of carbs on medium days. The high-day boost is too large for the number of medium days available — lower the boost, add medium days, or add low days.`,
    });
  } else if (
    mediumDay &&
    baseline.carbs > 0 &&
    Math.abs(mediumDay.carbs / baseline.carbs - 1) > 0.15
  ) {
    const direction = mediumDay.carbs > baseline.carbs ? "above" : "below";
    warnings.push({
      level: "info",
      title: `Medium days sit ${Math.round(Math.abs(mediumDay.carbs / baseline.carbs - 1) * 100)}% ${direction} baseline`,
      detail:
        "Medium days are absorbing the imbalance between high and low days. Rebalance the schedule if you want them closer to baseline.",
    });
  }

  const floored = days.filter((d) => d.count > 0 && d.fatFloorApplied);
  if (floored.length > 0) {
    warnings.push({
      level: "info",
      title: `Fat floor enforced on ${floored.map((d) => DAY_LABELS[d.type].toLowerCase()).join(", ")}`,
      detail: `Every day holds at least ${Math.round(floorPerDay)}g of fat, the higher of your ${Math.round(inputs.fatFloorPercent * 100)}%-of-calories and ${round(inputs.fatFloorGramsPerLb, 2)}g/lb rules.`,
    });
  }

  const proteinPerLb = profile.weight > 0 ? baseline.protein / profile.weight : 0;
  if (proteinPerLb < 0.8 && profile.weight > 0) {
    warnings.push({
      level: "warning",
      title: `Protein is only ${proteinPerLb.toFixed(2)}g per pound of body weight`,
      detail:
        "In a deficit, 1.0–1.2g/lb is the range that best protects lean mass. Raise the protein target if the calories allow it.",
    });
  }

  const targetWeekly = baseline.calories * 7;
  if (targetWeekly > 0 && Math.abs(weekly.calories - targetWeekly) / targetWeekly > 0.02) {
    warnings.push({
      level: "warning",
      title: "Weekly calories drifted from target",
      detail: `The schedule averages ${Math.round(weekly.averageDailyCalories)} kcal/day against a ${Math.round(baseline.calories)} kcal target, because a hard floor had to be honoured.`,
    });
  }

  return warnings;
}

/** Main entry point: build a full weekly carb cycling plan. */
export function calculateCarbCycling(
  profile: BiometricProfile,
  inputs: CarbCyclingInputs,
): CarbCyclingResult {
  const counts = normalizeCounts(inputs);
  const bodyWeight = Math.max(safeNumber(profile.weight, 0), 0);
  const baselineCalories = Math.max(resolveBaselineCalories(inputs), 0);

  const protein = resolveProtein(profile, inputs);
  const floorPerDay = resolveFatFloor(profile, inputs, baselineCalories);

  // Give the weekly fat budget a little headroom above the floor so there is
  // something to redistribute — otherwise every day pins to the floor and the
  // "higher fat on low days" behaviour disappears.
  const weeklyFatBudget = floorPerDay * 7 * FAT_BUDGET_HEADROOM;
  const fatByType = distributeFat(counts, weeklyFatBudget, floorPerDay);

  const totalDays = counts.high + counts.medium + counts.low;
  const baselineFat = totalDays > 0 ? weeklyFatBudget / 7 : floorPerDay;

  const baselineCarbs =
    (baselineCalories - protein * KCAL_PER_G.protein - baselineFat * KCAL_PER_G.fat) /
    KCAL_PER_G.carbs;

  const highBoost = clamp(safeNumber(inputs.highCarbBoost, 0.2), 0, 0.6);
  const lowCut = clamp(safeNumber(inputs.lowCarbCut, 0.25), 0, 0.9);
  const carbsByType = distributeCarbs(counts, Math.max(baselineCarbs, 0), highBoost, lowCut);

  const baseline: MacroTargets = {
    protein: round(protein, 0),
    carbs: round(Math.max(baselineCarbs, 0), 0),
    fat: round(baselineFat, 0),
    calories: Math.round(baselineCalories),
  };

  const types: DayType[] = ["high", "medium", "low"];
  const days: DayPlan[] = types.map((type) => {
    const carbs = Math.max(carbsByType[type], 0);
    const fat = Math.max(fatByType[type] || floorPerDay, floorPerDay);
    const calories = caloriesFromMacros({ protein, carbs, fat });
    return {
      type,
      count: counts[type],
      protein: round(protein, 0),
      carbs: round(carbs, 0),
      fat: round(fat, 0),
      calories: Math.round(calories),
      caloriePercentOfBaseline:
        baselineCalories > 0
          ? round((calories / baselineCalories - 1) * 100, 1)
          : 0,
      perPound: {
        protein: bodyWeight > 0 ? round(protein / bodyWeight, 2) : 0,
        carbs: bodyWeight > 0 ? round(carbs / bodyWeight, 2) : 0,
        fat: bodyWeight > 0 ? round(fat / bodyWeight, 2) : 0,
      },
      fatFloorApplied: (fatByType[type] || 0) <= floorPerDay + 0.01,
    };
  });

  // Weekly totals are summed from the *rounded* daily targets, because those
  // are the numbers the user will actually eat.
  const weeklyProtein = days.reduce((sum, d) => sum + d.protein * d.count, 0);
  const weeklyCarbs = days.reduce((sum, d) => sum + d.carbs * d.count, 0);
  const weeklyFat = days.reduce((sum, d) => sum + d.fat * d.count, 0);
  const weeklyCalories = days.reduce((sum, d) => sum + d.calories * d.count, 0);
  const scheduledDays = totalDays > 0 ? totalDays : 7;

  const tdeeWeekly = Math.max(safeNumber(inputs.tdee, 0), 0) * 7;
  const weeklyDeficit = tdeeWeekly > 0 ? tdeeWeekly - weeklyCalories : 0;

  const weekly: WeeklyTotals = {
    protein: round(weeklyProtein, 0),
    carbs: round(weeklyCarbs, 0),
    fat: round(weeklyFat, 0),
    calories: Math.round(weeklyCalories),
    averageDailyCalories: Math.round(weeklyCalories / scheduledDays),
    weeklyDeficit: Math.round(weeklyDeficit),
    // Shared with the timeline engine so the same deficit never reports two
    // different weekly losses across the two tabs.
    projectedWeeklyLoss: round(
      weeklyLossFromDeficit(
        Math.max(weeklyDeficit, 0),
        bodyWeight,
        clamp(resolveBodyFat(profile), 1, 70),
      ),
      2,
    ),
  };

  const warnings = buildWarnings(
    profile,
    inputs,
    counts,
    days,
    baseline,
    weekly,
    floorPerDay,
    carbsByType,
  );

  return {
    baseline,
    days,
    weekly,
    warnings,
    feasible:
      totalDays === 7 &&
      baseline.carbs > 0 &&
      bodyWeight > 0 &&
      // A schedule the medium days cannot absorb is not a usable plan, even
      // though every individual number it produces looks superficially valid.
      !(counts.medium > 0 && carbsByType.medium < 0),
  };
}

/** Plain-text summary for the copy-to-clipboard card. */
export function formatCarbPlanSummary(
  result: CarbCyclingResult,
  bodyWeight: number,
  unitLabel = "lb",
): string {
  const lines: string[] = [
    "CARB CYCLING PLAN",
    `Body weight: ${round(bodyWeight, 1)} ${unitLabel}`,
    `Baseline: ${result.baseline.calories} kcal/day`,
    "",
  ];

  for (const day of result.days) {
    if (day.count === 0) continue;
    lines.push(
      `${DAY_LABELS[day.type].toUpperCase()} × ${day.count}/wk — ${day.calories} kcal`,
      `  Protein ${day.protein}g | Carbs ${day.carbs}g | Fat ${day.fat}g`,
    );
  }

  lines.push(
    "",
    `Weekly average: ${result.weekly.averageDailyCalories} kcal/day`,
    `Weekly totals: P ${result.weekly.protein}g | C ${result.weekly.carbs}g | F ${result.weekly.fat}g`,
  );

  if (result.weekly.weeklyDeficit > 0) {
    lines.push(
      `Weekly deficit: ${result.weekly.weeklyDeficit} kcal (~${result.weekly.projectedWeeklyLoss} lb/wk)`,
    );
  }

  return lines.join("\n");
}
