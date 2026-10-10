/**
 * The Timeline sets the calories; Macros only splits them.
 *
 * Whenever the Timeline has a plan, Macros' maintenance and daily calorie
 * target are this week's numbers from it: the same week the Roadmap and the
 * Food log are on, with its projected weight and body fat (so protein and the
 * fat floor match too) and any check-in change. Before the plan starts that's
 * its first week; after it ends, its last. They can't be typed on Macros; the
 * rate, goal and maintenance are changed on the Timeline.
 *
 * Only while the Timeline has no plan does Macros use the member's own
 * maintenance and target (CarbCyclingInputs.tdee / dailyCalorieTarget).
 *
 * Not carb cycling (cycleCarbs off, the default) is a plan of seven identical
 * days: every day is the daily target, with no high or low days.
 *
 * Everything that reads the carb plan (Macros, Roadmap, Food log targets,
 * Today) is given the effective inputs from effectiveCarbInputs(), so they
 * always agree.
 */

import { maintenanceBreakdown } from "./activity";
import { addDays, daysBetween } from "./dates";
import { calculateFatLossTimeline } from "./fat-loss";
import { weekCalorieTarget } from "./roadmap";
import type { CalorieAdjustment } from "./tracking";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs } from "./types";

/** The week of the Timeline that Macros shows today. */
export interface PlanWeek {
  /** 0-based week of the plan. */
  index: number;
  /** Weeks of dieting in the plan. */
  count: number;
  /** Where today falls against the plan's dates. */
  when: "before" | "during" | "after";
  startDate: string;
  goalDate: string;
  /** Maintenance that week, kcal/day. */
  tdee: number;
  /** Daily calorie target that week, including any check-in change. */
  dailyCalories: number;
  /** Check-in change in force that week, kcal/day (0 when none). */
  adjustment: number;
  /** Projected weight (lb) and body fat (%) that week. */
  weight: number;
  bodyFat: number;
}

/** This week of the Timeline's plan (by `today`), or null while it has no plan. */
export function currentPlanWeek(
  profile: BiometricProfile,
  fatLoss: FatLossInputs,
  adjustments: CalorieAdjustment[],
  today: string,
): PlanWeek | null {
  const t = calculateFatLossTimeline(profile, fatLoss);
  const count = t.weeksRequired;
  if (!t.feasible || count <= 0) return null;
  const startDate = t.requiredStartDate;
  const offset = today ? daysBetween(startDate, today) : 0;
  const when = offset < 0 ? "before" : offset >= count * 7 ? "after" : "during";
  const index = Math.min(Math.max(Math.floor(offset / 7), 0), count - 1);
  const row = t.projection[index];
  if (!row || !(row.tdee > 0) || !(row.targetCalories > 0)) return null;
  const { target, adjustment } = weekCalorieTarget(row, addDays(startDate, index * 7), adjustments);
  return {
    index,
    count,
    when,
    startDate,
    goalDate: addDays(startDate, count * 7),
    tdee: row.tdee,
    dailyCalories: Math.round(target),
    adjustment,
    weight: row.weight,
    bodyFat: row.bodyFat,
  };
}

/** Where the Timeline's maintenance comes from, in words: "2,248 base + 254 steps + 156 training". */
export function maintenanceSource(profile: BiometricProfile, fatLoss: FatLossInputs): string {
  if (fatLoss.tdeeOverride) return "your known maintenance";
  if (fatLoss.activitySource === "level") return "your activity level";
  const m = maintenanceBreakdown(profile, fatLoss);
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  return `${n(m.base)} base + ${n(m.steps)} steps + ${n(m.training)} training`;
}

/** The body Macros plans for: that week's projected weight and body fat, as the Roadmap uses. */
export function planProfile(profile: BiometricProfile, week: PlanWeek | null): BiometricProfile {
  return week ? { ...profile, weight: week.weight, bodyFatOverride: week.bodyFat } : profile;
}

/** The carb plan as every screen should use it: this week of the Timeline when it has a plan. */
export function effectiveCarbInputs(carbs: CarbCyclingInputs, week: PlanWeek | null): CarbCyclingInputs {
  let out = carbs;
  if (week) out = { ...out, tdee: week.tdee, dailyCalorieTarget: week.dailyCalories };
  // Same every day: seven "medium" days, each exactly the daily target.
  if (!carbs.cycleCarbs) out = { ...out, highDays: 0, mediumDays: 7, lowDays: 0, weekdayPattern: null };
  return out;
}
