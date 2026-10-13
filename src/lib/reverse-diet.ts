/**
 * After the goal: what a member eats once the Timeline's diet is over.
 *
 *   reverse   add calories back a little each week, from the last diet week's
 *             intake up to maintenance at the new weight, then hold there
 *   maintain  straight to maintenance at the new weight
 *   stay      keep eating the last diet week's calories (the old behaviour)
 *
 * Maintenance here is the model's estimate at the end weight *without*
 * metabolic adaptation: the reverse is how metabolism is given the room to
 * climb back, so it aims at where maintenance should settle, not at the
 * suppressed number the last diet week ran on.
 *
 * The schedule starts the day after the diet's last week (PlanWeek.goalDate in
 * plan-link.ts), so it picks up exactly where the Roadmap ends. Check-in
 * calorie changes stop at that point; a coach can still set macros directly.
 */

import { addDays, daysBetween } from "./dates";
import { tdeeAtWeight } from "./fat-loss";
import { weekCalorieTarget } from "./roadmap";
import type { CalorieAdjustment } from "./tracking";
import type { BiometricProfile, FatLossInputs, FatLossResult } from "./types";

export type AfterGoal = "reverse" | "maintain" | "stay";

export const AFTER_GOAL_OPTIONS: readonly { value: AfterGoal; label: string; hint: string }[] = [
  { value: "reverse", label: "Reverse", hint: "Add calories back each week" },
  { value: "maintain", label: "Maintain", hint: "Straight to maintenance" },
  { value: "stay", label: "Keep deficit", hint: "Keep the last week's calories" },
];

/** Calories added per day, each week of a reverse. */
export const REVERSE_STEP_OPTIONS = [50, 100, 150] as const;
export const REVERSE_STEP_LIMITS = { min: 25, max: 250 } as const;
export const DEFAULT_REVERSE_STEP = 100;
/** A reverse never runs longer than this; whatever is left after it jumps to maintenance. */
export const MAX_REVERSE_WEEKS = 26;

export interface ReverseWeek {
  /** 0-based week of the reverse. */
  index: number;
  startDate: string;
  calories: number;
}

export interface AfterGoalPlan {
  mode: Exclude<AfterGoal, "stay">;
  /** First day after the diet. */
  startDate: string;
  /** The last diet week's daily target (with any check-in change), kcal. */
  fromCalories: number;
  /** Maintenance at the end weight, kcal. */
  maintenance: number;
  /** Projected end of the diet. */
  weight: number;
  bodyFat: number;
  /** kcal/day added each reverse week. */
  step: number;
  /** The reverse's weeks below maintenance; empty when going straight there. */
  weeks: ReverseWeek[];
  /** The day eating at maintenance begins. */
  maintenanceDate: string;
}

export interface AfterGoalDay {
  phase: "reverse" | "maintenance";
  calories: number;
  /** 0-based reverse week, during the reverse. */
  week: number | null;
}

/** The plan for after the goal, or null when there's no diet plan or the member stays on plan calories. */
export function afterGoalPlan(
  profile: BiometricProfile,
  fatLoss: FatLossInputs,
  timeline: FatLossResult,
  adjustments: readonly CalorieAdjustment[],
): AfterGoalPlan | null {
  if (fatLoss.afterGoal === "stay") return null;
  const count = timeline.weeksRequired;
  if (!timeline.feasible || count <= 0) return null;
  const last = timeline.projection[count - 1];
  if (!last || !(last.targetCalories > 0)) return null;

  const dietStart = timeline.requiredStartDate;
  const startDate = addDays(dietStart, count * 7);
  const fromCalories = Math.round(weekCalorieTarget(last, addDays(dietStart, (count - 1) * 7), [...adjustments]).target);
  const weight = timeline.endWeight;
  const maintenance = Math.round(tdeeAtWeight(profile, weight, fatLoss, fatLoss.tdeeOverride));
  const step = Math.min(Math.max(Math.round(fatLoss.reverseStep), REVERSE_STEP_LIMITS.min), REVERSE_STEP_LIMITS.max);

  const weeks: ReverseWeek[] = [];
  if (fatLoss.afterGoal === "reverse") {
    for (let i = 0; i < MAX_REVERSE_WEEKS; i++) {
      const calories = fromCalories + step * (i + 1);
      if (calories >= maintenance) break;
      weeks.push({ index: i, startDate: addDays(startDate, i * 7), calories });
    }
  }
  return {
    mode: fatLoss.afterGoal,
    startDate,
    fromCalories,
    maintenance,
    weight,
    bodyFat: timeline.endBodyFat,
    step,
    weeks,
    maintenanceDate: addDays(startDate, weeks.length * 7),
  };
}

/** What to eat on a date after the goal, or null before the diet ends. */
export function afterGoalDay(plan: AfterGoalPlan, date: string): AfterGoalDay | null {
  const offset = daysBetween(plan.startDate, date);
  if (offset < 0) return null;
  const week = Math.floor(offset / 7);
  const w = plan.weeks[week];
  return w ? { phase: "reverse", calories: w.calories, week } : { phase: "maintenance", calories: plan.maintenance, week: null };
}

/** "Reverse diet week 3 of 8" / "Maintenance": for the lines under targets. */
export function afterGoalLabel(plan: AfterGoalPlan, day: AfterGoalDay): string {
  return day.phase === "reverse" && day.week !== null
    ? `Reverse diet week ${day.week + 1} of ${plan.weeks.length}`
    : "Maintenance";
}
