/**
 * Carb cycle follows the Timeline.
 *
 * While `followTimeline` is on (the default), Carb cycle's maintenance and
 * daily calorie target are the Timeline's: its estimated (or known)
 * maintenance and the intake that reaches the goal by the date, both for the
 * first week. They stay in step as the member edits their details or goal.
 * Typing either number on Carb cycle switches following off and keeps the
 * member's own; "Use Timeline's numbers" switches it back on.
 *
 * Not carb cycling (cycleCarbs off, the default) is a plan of seven identical
 * days: every day is the daily target, with no high or low days.
 *
 * Everything that reads the carb plan (Carb cycle, Roadmap, Food log targets,
 * Today) is given the effective inputs from effectiveCarbInputs(), so they
 * always agree. The member's own numbers stay saved underneath.
 */

import { maintenanceBreakdown } from "./activity";
import { calculateFatLossTimeline } from "./fat-loss";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs } from "./types";

/** The Timeline's first-week maintenance and daily target, or null while it has no plan. */
export function timelineCalories(profile: BiometricProfile, fatLoss: FatLossInputs): { tdee: number; dailyCalories: number } | null {
  const t = calculateFatLossTimeline(profile, fatLoss);
  const first = t.projection[0];
  if (!t.feasible || !first || !(first.tdee > 0) || !(first.targetCalories > 0)) return null;
  return { tdee: Math.round(first.tdee), dailyCalories: Math.round(first.targetCalories) };
}

/** Where the Timeline's maintenance comes from, in words: "2,248 base + 254 steps + 156 training". */
export function maintenanceSource(profile: BiometricProfile, fatLoss: FatLossInputs): string {
  if (fatLoss.tdeeOverride) return "your known maintenance";
  if (fatLoss.activitySource === "level") return "your activity level";
  const m = maintenanceBreakdown(profile, fatLoss);
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  return `${n(m.base)} base + ${n(m.steps)} steps + ${n(m.training)} training`;
}

/** The carb plan as every screen should use it: following the Timeline when that's on and it has a plan. */
export function effectiveCarbInputs(profile: BiometricProfile, fatLoss: FatLossInputs, carbs: CarbCyclingInputs): CarbCyclingInputs {
  let out = carbs;
  if (carbs.followTimeline) {
    const t = timelineCalories(profile, fatLoss);
    if (t) out = { ...out, tdee: t.tdee, dailyCalorieTarget: t.dailyCalories };
  }
  // Same every day: seven "medium" days, each exactly the daily target.
  if (!carbs.cycleCarbs) out = { ...out, highDays: 0, mediumDays: 7, lowDays: 0, weekdayPattern: null };
  return out;
}
