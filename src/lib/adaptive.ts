/**
 * Adaptive check-in maths: compare real weigh-ins with the plan, and work out
 * what — if anything — to change.
 *
 * The rules, and why:
 *
 *  - **Rate, not single readings.** Daily weight swings 2–4 lb on water,
 *    sodium and glycogen. The loss rate comes from a least-squares line through
 *    the last 21 days of weigh-ins, which shrugs off any one bad morning.
 *  - **Enough data first.** No verdict until there are at least 6 weigh-ins
 *    spanning at least 10 days. Fewer than that and the slope is mostly noise.
 *  - **A dead band.** Within 0.2 lb/week of plan (or 15% of the planned rate,
 *    whichever is larger) counts as on track. Chasing smaller gaps just
 *    oscillates.
 *  - **Back-calculate real maintenance.** Energy balance says
 *      maintenance = intake + (weekly loss × energy per lb) / 7
 *    using the same fat-vs-lean energy density as the timeline. The gap
 *    between that and the model's estimate is the correction.
 *  - **Small steps.** Each change is capped at ±300 kcal/day and rounded to
 *    25, never pushes intake under the floor (the remainder becomes an
 *    activity target instead), and starts at a diet-week boundary so every
 *    week still averages exactly to its own target.
 *  - **Let a change work.** After an adjustment takes effect, no new
 *    recommendation for 14 days — the first week after any change is
 *    dominated by water and glycogen shifts.
 *  - **Faster than planned is not a win.** Losing well ahead of plan costs lean
 *    mass, so being ahead recommends eating *more*, symmetrically.
 */

import { fatLossFraction, intakeFloor } from "./fat-loss";
import { addDays, daysBetween } from "./dates";
import type { BiometricProfile, FatLossResult, WeekProjection } from "./types";
import { adjustmentOn, type CalorieAdjustment, type WeighIn } from "./tracking";
import { KCAL_PER_LB_FAT, KCAL_PER_LB_LEAN, round } from "./units";

export const ANALYSIS_WINDOW_DAYS = 21;
export const MIN_WEIGH_INS = 6;
export const MIN_SPAN_DAYS = 10;
export const MAX_STEP_KCAL = 300;
export const SETTLE_DAYS = 14;
export const STALE_AFTER_DAYS = 7;
const TREND_ALPHA = 0.1;

/* ------------------------------ plan lookups ------------------------------ */

function rowFor(timeline: FatLossResult, date: string): WeekProjection | null {
  const offset = daysBetween(timeline.requiredStartDate, date);
  if (offset < 0) return timeline.projection[0] ?? null;
  const week = Math.floor(offset / 7);
  return timeline.projection[Math.min(week, timeline.projection.length - 1)] ?? null;
}

/**
 * The plan's predicted scale weight on any date. Within a week the curve is
 * interpolated geometrically, matching the compounding %-per-week model.
 */
export function predictedWeightOn(timeline: FatLossResult, date: string): number | null {
  const rows = timeline.projection;
  if (!timeline.feasible || rows.length === 0) return null;
  const offset = daysBetween(timeline.requiredStartDate, date);
  if (offset <= 0) return rows[0]!.weight;
  const week = Math.floor(offset / 7);
  const a = rows[week];
  const b = rows[week + 1];
  if (!a) return rows[rows.length - 1]!.weight;
  if (!b) return a.weight;
  const frac = (offset % 7) / 7;
  return a.weight * Math.pow(b.weight / a.weight, frac);
}

/** First diet-week start on or after `date`, or null once the plan is over. */
export function weekStartOnOrAfter(timeline: FatLossResult, date: string): string | null {
  const offset = Math.max(daysBetween(timeline.requiredStartDate, date), 0);
  const week = Math.ceil(offset / 7);
  if (week >= timeline.weeksRequired) return null;
  return addDays(timeline.requiredStartDate, week * 7);
}

/**
 * What the plan says to eat on a date, including applied adjustments and the
 * intake floor. Adjustments are read at the week's start, so a week has one
 * consistent target.
 */
export function plannedIntakeOn(
  timeline: FatLossResult,
  adjustments: CalorieAdjustment[],
  date: string,
): number | null {
  const offset = daysBetween(timeline.requiredStartDate, date);
  if (offset < 0 || offset >= timeline.weeksRequired * 7) return null;
  const week = Math.floor(offset / 7);
  const row = timeline.projection[week];
  if (!row) return null;
  const weekStart = addDays(timeline.requiredStartDate, week * 7);
  return Math.max(
    intakeFloor(row.weight),
    row.targetCalories + adjustmentOn(adjustments, weekStart),
  );
}

/* ------------------------------ weight trend ------------------------------ */

export interface TrendPoint {
  date: string;
  trend: number;
}

/**
 * Exponentially smoothed weight (the "Hacker's Diet" trend line). It moves
 * only on days with a reading: a missed day leaves the trend where it was
 * rather than inventing a value for it.
 */
export function trendSeries(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  if (!first) return [];
  let trend = first.weightLb;
  return sorted.map((w) => {
    trend += TREND_ALPHA * (w.weightLb - trend);
    return { date: w.date, trend: round(trend, 2) };
  });
}

/** Least-squares slope in lb/day. Null when it can't be determined. */
export function slopePerDay(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** Energy per pound of weight change, at a given rate and body fat. */
export function energyPerLb(weeklyRate: number, bodyFatPercent: number): number {
  const f = fatLossFraction(weeklyRate, bodyFatPercent);
  return f * KCAL_PER_LB_FAT + (1 - f) * KCAL_PER_LB_LEAN;
}

/* -------------------------------- analysis -------------------------------- */

export type ProgressStatus =
  | "no-plan"
  | "no-data"
  | "not-started"
  | "collecting"
  | "waiting"
  | "on-track"
  | "behind"
  | "ahead";

export interface Recommendation {
  /** Change to daily intake, kcal. Negative = eat less. */
  kcal: number;
  effectiveFrom: string;
  /** New daily average for the week the change starts. */
  newIntake: number;
  /** True when the floor stopped the full cut being applied to food. */
  clampedByFloor: boolean;
  /** Daily activity to add on top, when the floor blocked part of the cut. */
  activityKcal: number;
  reason: string;
}

export interface ProgressAnalysis {
  status: ProgressStatus;
  headline: string;
  detail: string;
  latest: WeighIn | null;
  trendWeight: number | null;
  predictedAtLatest: number | null;
  /** Trend minus prediction, lb. Positive = heavier than the plan. */
  difference: number | null;
  window: { from: string; to: string; count: number; spanDays: number } | null;
  /** lb/week, positive = losing. */
  observedRate: number | null;
  plannedRate: number | null;
  intake: { average: number; source: "logged" | "plan"; loggedDays: number } | null;
  estimatedMaintenance: number | null;
  modelMaintenance: number | null;
  recommendation: Recommendation | null;
  /** Goal date if the observed rate holds. */
  projectedGoalDate: string | null;
  needed: { weighIns: number; days: number } | null;
  /** Latest weigh-in is more than a week old. */
  stale: boolean;
}

const EMPTY: Omit<ProgressAnalysis, "status" | "headline" | "detail"> = {
  latest: null,
  trendWeight: null,
  predictedAtLatest: null,
  difference: null,
  window: null,
  observedRate: null,
  plannedRate: null,
  intake: null,
  estimatedMaintenance: null,
  modelMaintenance: null,
  recommendation: null,
  projectedGoalDate: null,
  needed: null,
  stale: false,
};

const fmtRate = (r: number) => `${Math.abs(r).toFixed(1)} lb/week`;

export function analyzeProgress(
  profile: BiometricProfile,
  timeline: FatLossResult,
  weighIns: WeighIn[],
  adjustments: CalorieAdjustment[],
  today: string,
): ProgressAnalysis {
  if (!timeline.feasible || timeline.projection.length === 0) {
    return {
      ...EMPTY,
      status: "no-plan",
      headline: "Set a goal first",
      detail: "Check-ins compare against your timeline in Plan. Set a goal below your current weight there.",
    };
  }

  const start = timeline.requiredStartDate;
  const goalDate = timeline.finishDate;
  // A week of pre-diet weigh-ins is useful as a baseline; anything older isn't.
  const relevant = weighIns
    .filter((w) => w.date >= addDays(start, -7) && w.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const latest = relevant[relevant.length - 1] ?? null;
  if (!latest) {
    return {
      ...EMPTY,
      status: "no-data",
      headline: "No weigh-ins yet",
      detail: `Weigh in each morning after the bathroom, before eating, and log it here. After ${MIN_WEIGH_INS} weigh-ins over ${MIN_SPAN_DAYS}+ days you'll get your first comparison against the plan.`,
    };
  }

  const trend = trendSeries(relevant);
  const trendWeight = trend[trend.length - 1]?.trend ?? latest.weightLb;
  const predictedAtLatest = predictedWeightOn(timeline, latest.date);
  const difference = predictedAtLatest === null ? null : round(trendWeight - predictedAtLatest, 1);
  const stale = daysBetween(latest.date, today) > STALE_AFTER_DAYS;
  const base = { ...EMPTY, latest, trendWeight, predictedAtLatest, difference, stale };

  if (today < start) {
    return {
      ...base,
      status: "not-started",
      headline: "Plan hasn't started yet",
      detail: `Your diet begins ${start}. Weigh-ins before then give a baseline but don't count toward the comparison.`,
    };
  }

  // Only baseline (pre-diet) weigh-ins so far: nothing to compare yet.
  if (latest.date < start) {
    return {
      ...base,
      status: "collecting",
      headline: "Keep logging",
      detail: `Your weigh-ins so far are from before the diet began on ${start}. Keep logging from day one and the first comparison arrives after ${MIN_WEIGH_INS} weigh-ins over ${MIN_SPAN_DAYS}+ days.`,
      needed: { weighIns: MIN_WEIGH_INS, days: MIN_SPAN_DAYS },
    };
  }

  // The analysis window: up to 21 days ending at the latest weigh-in, and
  // never reaching back before the diet started.
  const windowStart = [addDays(latest.date, -(ANALYSIS_WINDOW_DAYS - 1)), start].sort().pop()!;
  const inWindow = relevant.filter((w) => w.date >= windowStart);
  const first = inWindow[0]!; // non-empty: `latest` itself is >= start
  const spanDays = daysBetween(first.date, latest.date);
  const window = { from: first.date, to: latest.date, count: inWindow.length, spanDays };

  if (inWindow.length < MIN_WEIGH_INS || spanDays < MIN_SPAN_DAYS) {
    const needWeighIns = Math.max(MIN_WEIGH_INS - inWindow.length, 0);
    const needDays = Math.max(MIN_SPAN_DAYS - spanDays, 0);
    const parts = [
      needWeighIns > 0 ? `${needWeighIns} more weigh-in${needWeighIns === 1 ? "" : "s"}` : null,
      needDays > 0 ? `${needDays} more day${needDays === 1 ? "" : "s"} of data` : null,
    ].filter(Boolean);
    return {
      ...base,
      window,
      status: "collecting",
      headline: "Keep logging",
      detail: `Need ${parts.join(" and ")} before comparing against the plan. Daily weight swings too much on water to judge from a few readings.`,
      needed: { weighIns: needWeighIns, days: needDays },
    };
  }

  // Observed vs planned rate across the same days.
  const slope = slopePerDay(
    inWindow.map((w) => ({ x: daysBetween(first.date, w.date), y: w.weightLb })),
  );
  const observedRate = slope === null ? 0 : round(-slope * 7, 2);
  const predFirst = predictedWeightOn(timeline, first.date) ?? first.weightLb;
  const predLast = predictedAtLatest ?? predFirst;
  const plannedRate = round(((predFirst - predLast) / spanDays) * 7, 2);

  // Intake across the window: logged if they logged enough of it, otherwise
  // assume they ate to plan (and say so).
  const logged = inWindow.filter((w) => w.calories !== null);
  const plannedDays: number[] = [];
  for (let d = first.date; d <= latest.date; d = addDays(d, 1)) {
    const kcal = plannedIntakeOn(timeline, adjustments, d);
    if (kcal !== null) plannedDays.push(kcal);
  }
  const planAverage = plannedDays.length
    ? plannedDays.reduce((s, k) => s + k, 0) / plannedDays.length
    : timeline.projection[0]!.targetCalories;
  const useLogged = logged.length >= 5;
  const intakeAverage = useLogged
    ? logged.reduce((s, w) => s + (w.calories ?? 0), 0) / logged.length
    : planAverage;
  const intake = {
    average: Math.round(intakeAverage),
    source: useLogged ? ("logged" as const) : ("plan" as const),
    loggedDays: logged.length,
  };

  const row = rowFor(timeline, latest.date) ?? timeline.projection[0]!;
  const rateForDensity = observedRate > 0 ? observedRate : Math.max(plannedRate, 0.1);
  const density = energyPerLb(rateForDensity / trendWeight, row.bodyFat);
  const estimatedMaintenance = Math.round(intakeAverage + (observedRate * density) / 7);

  const modelRows = new Set<number>();
  for (let d = first.date; d <= latest.date; d = addDays(d, 7)) {
    modelRows.add(Math.floor(Math.max(daysBetween(start, d), 0) / 7));
  }
  const tdees = [...modelRows]
    .map((i) => timeline.projection[Math.min(i, timeline.projection.length - 1)]?.tdee)
    .filter((t): t is number => typeof t === "number");
  const modelMaintenance = tdees.length
    ? Math.round(tdees.reduce((s, t) => s + t, 0) / tdees.length)
    : null;

  // Projected arrival at the goal weight if the observed rate holds.
  const goalWeight = timeline.endWeight;
  let projectedGoalDate: string | null = null;
  if (trendWeight <= goalWeight) projectedGoalDate = latest.date;
  else if (observedRate > 0.05) {
    projectedGoalDate = addDays(latest.date, Math.round(((trendWeight - goalWeight) / observedRate) * 7));
  }

  const analysed = {
    ...base,
    window,
    observedRate,
    plannedRate,
    intake,
    estimatedMaintenance,
    modelMaintenance,
    projectedGoalDate,
  };

  const gap = plannedRate - observedRate; // > 0: losing slower than planned
  const tolerance = Math.max(0.2, Math.abs(plannedRate) * 0.15);
  const intakeNote =
    intake.source === "plan"
      ? " This assumes you ate the planned calories — log what you actually eat for a sharper estimate."
      : "";

  // Give the most recent change two weeks before judging it.
  const recent = adjustments
    .filter((a) => a.effectiveFrom <= latest.date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const pending = adjustments.find((a) => a.effectiveFrom > latest.date);
  if (pending || (recent && daysBetween(recent.effectiveFrom, latest.date) < SETTLE_DAYS)) {
    const change = pending ?? recent!;
    return {
      ...analysed,
      status: "waiting",
      headline: "Giving your last change time to work",
      detail: `Your ${change.kcal > 0 ? "+" : ""}${change.kcal} kcal/day change ${pending ? "starts" : "started"} ${change.effectiveFrom}. The first week after any change is mostly water and glycogen, so the next recommendation comes ${SETTLE_DAYS} days after it starts.`,
    };
  }

  if (Math.abs(gap) <= tolerance) {
    return {
      ...analysed,
      status: "on-track",
      headline: `On track — losing ${fmtRate(observedRate)}`,
      detail: `The plan called for ${fmtRate(plannedRate)} over these ${spanDays} days. No change needed; keep going.${intakeNote}`,
    };
  }

  // Recommend a correction.
  const effectiveFrom = weekStartOnOrAfter(timeline, addDays(today, 1));
  const behind = gap > 0;
  const status = behind ? ("behind" as const) : ("ahead" as const);
  const headline = behind
    ? `Losing slower than planned — ${fmtRate(observedRate)} vs ${fmtRate(plannedRate)}`
    : `Losing faster than planned — ${fmtRate(observedRate)} vs ${fmtRate(plannedRate)}`;

  if (!effectiveFrom) {
    return {
      ...analysed,
      status,
      headline,
      detail: "Your plan is in its final week, so there's no week left to adjust. Hold steady to the goal date.",
    };
  }

  const raw = -(gap * density) / 7;
  const stepped = Math.max(-MAX_STEP_KCAL, Math.min(MAX_STEP_KCAL, Math.round(raw / 25) * 25));

  // Respect the intake floor for the week the change lands in.
  const weekRow = rowFor(timeline, effectiveFrom)!;
  const current = Math.max(
    intakeFloor(weekRow.weight),
    weekRow.targetCalories + adjustmentOn(adjustments, effectiveFrom),
  );
  const floor = intakeFloor(weekRow.weight);
  let kcal = stepped;
  let activityKcal = 0;
  let clampedByFloor = false;
  if (current + kcal < floor) {
    clampedByFloor = true;
    activityKcal = Math.round((floor - (current + kcal)) / 25) * 25;
    kcal = floor - current;
  }

  const reason = behind
    ? `Real maintenance looks ~${Math.abs(Math.round(raw))} kcal/day lower than the model predicted.`
    : `Real maintenance looks ~${Math.abs(Math.round(raw))} kcal/day higher than the model predicted.`;

  const detailParts = [
    behind
      ? `Based on ${window.count} weigh-ins over ${spanDays} days, your real maintenance is about ${estimatedMaintenance.toLocaleString()} kcal/day — the model estimated ${modelMaintenance?.toLocaleString() ?? "more"}.`
      : `You're ahead of plan. Losing faster than planned costs more muscle, so the recommendation is to eat a little more.`,
    Math.abs(raw) > MAX_STEP_KCAL
      ? `The full correction is ~${Math.abs(Math.round(raw / 25) * 25)} kcal/day; this change is capped at ${MAX_STEP_KCAL} to avoid overcorrecting, and the next check-in can go further.`
      : null,
    clampedByFloor
      ? `Food can't go lower without dropping under your ${Math.round(floor).toLocaleString()} kcal floor, so cover the rest with about ${activityKcal} kcal/day of extra activity.`
      : null,
    intakeNote.trim() || null,
  ].filter(Boolean);

  return {
    ...analysed,
    status,
    headline,
    detail: detailParts.join(" "),
    recommendation:
      kcal === 0 && activityKcal === 0
        ? null
        : {
            kcal,
            effectiveFrom,
            newIntake: Math.round(current + kcal),
            clampedByFloor,
            activityKcal,
            reason,
          },
  };
}
