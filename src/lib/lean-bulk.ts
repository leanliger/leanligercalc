/**
 * Lean bulk: the Timeline's other direction. A member gains a set percentage
 * of body weight a week for a set number of weeks, eating maintenance plus a
 * surplus, and then holds at maintenance at the new weight.
 *
 * The result is a FatLossResult with gains as negative losses (see its doc),
 * so the Roadmap, Macros, food targets and check-ins follow a bulk with no
 * maths of their own.
 *
 * The model, and how sure it is:
 *  - Maintenance rises with weight (the same equation as a cut, no metabolic
 *    adaptation).
 *  - Each pound gained costs about KCAL_PER_LB_GAINED. Published figures for
 *    the energy cost of gaining tissue vary widely with training and how lean
 *    someone is, so this is a starting estimate; weekly check-ins correct it
 *    for each member from their real rate of gain.
 *  - The share of the gain that's lean tissue falls the faster the gain and
 *    the fatter the start. It only shapes the projected body fat line.
 */

import { addWeeks, todayISO } from "./dates";
import { resolveBodyFat } from "./body-composition";
import type { BiometricProfile, FatLossInputs, FatLossResult, TimelineWarning, WeekProjection } from "./types";
import { clamp, round, safeNumber } from "./units";

export const GAIN_RATE_PRESETS = {
  slow: 0.00125,
  standard: 0.0025,
  faster: 0.005,
} as const;
export type GainRatePreset = keyof typeof GAIN_RATE_PRESETS;

export const GAIN_RATE_LABELS: Record<GainRatePreset, string> = {
  slow: "Slow",
  standard: "Standard",
  faster: "Faster",
};

export const MIN_GAIN_RATE = 0.001;
export const MAX_GAIN_RATE = 0.01;
/** Above this, most of what's gained is fat. */
export const FAST_GAIN_RATE = 0.005;

export const MIN_BULK_WEEKS = 4;
export const MAX_BULK_WEEKS = 52;
export const DEFAULT_BULK_WEEKS = 16;

/** Estimated energy to gain a pound of body weight (muscle and fat together), kcal. */
export const KCAL_PER_LB_GAINED = 2500;

/** Body fat above which starting with a cut usually serves better, by sex. */
const HIGH_START_BODY_FAT = { male: 20, female: 30 } as const;

/**
 * Rough share of weight gained that's lean tissue: about half at 0.25% a week
 * from 15% body fat, less when gaining faster or starting fatter.
 */
export function leanGainFraction(weeklyRate: number, bodyFatPercent: number): number {
  const rate = clamp(weeklyRate, MIN_GAIN_RATE, 0.02);
  const fromRate = 0.5 - ((rate - 0.0025) / 0.0025) * 0.1;
  const fromLeanness = ((clamp(bodyFatPercent, 3, 60) - 15) / 20) * 0.15;
  return clamp(fromRate - fromLeanness, 0.15, 0.7);
}

/** Daily surplus for a weekly gain rate at a body weight, kcal. */
export function dailySurplusForRate(weight: number, weeklyRate: number): number {
  return (Math.max(weight, 0) * weeklyRate * KCAL_PER_LB_GAINED) / 7;
}

export function clampGainRate(rate: number): number {
  return clamp(safeNumber(rate, GAIN_RATE_PRESETS.standard), MIN_GAIN_RATE, MAX_GAIN_RATE);
}

export function clampBulkWeeks(weeks: number): number {
  return Math.round(clamp(safeNumber(weeks, DEFAULT_BULK_WEEKS), MIN_BULK_WEEKS, MAX_BULK_WEEKS));
}

function note(week: number, weeks: number): string | null {
  if (week === 0) return "Baseline — log weight daily, average weekly";
  if (week === weeks) return "Bulk done — hold at maintenance";
  if (week % 4 === 0) return "Re-measure, check the rate of gain";
  return null;
}

/**
 * The lean bulk plan. `tdeeAt` is maintenance at a weight (fat-loss.ts's
 * tdeeAtWeight, passed in so the two modules don't import each other).
 */
export function calculateLeanBulkTimeline(
  profile: BiometricProfile,
  inputs: FatLossInputs,
  tdeeAt: (weight: number) => number,
): FatLossResult {
  const startWeight = Math.max(safeNumber(profile.weight, 0), 0);
  const startBodyFat = clamp(resolveBodyFat(profile), 1, 70);
  const rate = clampGainRate(inputs.gainRate);
  const weeks = clampBulkWeeks(inputs.bulkWeeks);
  const startDate = inputs.startDate || todayISO();
  const feasible = startWeight > 0;

  const projection: WeekProjection[] = [];
  let weight = startWeight;
  let fatMass = weight * (startBodyFat / 100);
  let leanMass = weight - fatMass;
  for (let week = 0; feasible && week <= weeks; week++) {
    const tdee = tdeeAt(weight);
    const surplus = dailySurplusForRate(weight, rate);
    projection.push({
      week,
      date: addWeeks(startDate, week),
      weight: round(weight, 1),
      bodyFat: round((fatMass / weight) * 100, 1),
      fatMass: round(fatMass, 1),
      leanMass: round(leanMass, 1),
      weeklyLoss: week === 0 ? 0 : round(projection[week - 1]!.weight - weight, 2),
      cumulativeLoss: round(startWeight - weight, 1),
      tdee: Math.round(tdee),
      targetCalories: Math.round(tdee + surplus),
      dailyDeficit: Math.round(tdee) - Math.round(tdee + surplus),
      deficitClamped: false,
      note: note(week, weeks),
    });
    const gain = weight * rate;
    const lean = gain * leanGainFraction(rate, (fatMass / weight) * 100);
    leanMass += lean;
    fatMass += gain - lean;
    weight = fatMass + leanMass;
  }

  const last = projection[projection.length - 1];
  const endWeight = last?.weight ?? startWeight;
  const endBodyFat = last?.bodyFat ?? startBodyFat;
  const totalLoss = round(startWeight - endWeight, 1);
  const fatLoss = round(startWeight * (startBodyFat / 100) - (last?.fatMass ?? 0), 1);
  // The weeks eaten on the plan: every row but the end one.
  const eating = projection.slice(0, Math.max(projection.length - 1, 1));
  const avg = (f: (w: WeekProjection) => number) => (eating.length ? Math.round(eating.reduce((s, w) => s + f(w), 0) / eating.length) : 0);
  const base: Omit<FatLossResult, "warnings"> = {
    phase: "bulk",
    projection,
    weeksRequired: feasible ? weeks : 0,
    preciseWeeks: feasible ? weeks : 0,
    finishDate: addWeeks(startDate, weeks),
    requiredStartDate: startDate,
    totalLoss,
    fatLoss,
    leanLoss: round(totalLoss - fatLoss, 1),
    endWeight,
    endBodyFat,
    averageDailyDeficit: avg((w) => w.dailyDeficit),
    averageTargetCalories: avg((w) => w.targetCalories),
    requiredRate: null,
    weeksAvailable: null,
    feasible,
  };
  return { ...base, warnings: bulkWarnings(profile, base, rate, startBodyFat) };
}

function bulkWarnings(profile: BiometricProfile, result: Omit<FatLossResult, "warnings">, rate: number, startBodyFat: number): TimelineWarning[] {
  const warnings: TimelineWarning[] = [];
  if (!result.feasible) {
    warnings.push({ level: "danger", title: "Enter your current weight", detail: "A lean bulk is planned from your current weight." });
    return warnings;
  }
  if (rate > FAST_GAIN_RATE) {
    warnings.push({
      level: "warning",
      title: `Gaining ${(rate * 100).toFixed(2)}% of body weight a week`,
      detail: "Faster than about 0.5% a week, most of the extra weight is fat. Slow the rate to keep the bulk lean.",
    });
  }
  const high = HIGH_START_BODY_FAT[profile.sex];
  if (startBodyFat > high) {
    warnings.push({
      level: "warning",
      title: `Starting at ${round(startBodyFat, 1)}% body fat`,
      detail: `Above about ${high}%, a cut first usually works better: more of a later bulk goes to muscle, and there's less fat to lose afterwards.`,
    });
  }
  if (result.weeksRequired > 24) {
    warnings.push({
      level: "info",
      title: "Bulk runs longer than 24 weeks",
      detail: "Plan a check on body fat partway through; a short cut or a few maintenance weeks keeps a long bulk lean.",
    });
  }
  warnings.push({
    level: "info",
    title: "The surplus is an estimate",
    detail: `About ${KCAL_PER_LB_GAINED.toLocaleString("en-US")} kcal per pound gained to start with. Weekly check-ins adjust it to your real rate of gain.`,
  });
  return warnings;
}
