/**
 * A day's calorie and macro targets: the roadmap's numbers for that date, or,
 * outside the roadmap's dates, the Carb Cycling weekly plan for that weekday,
 * so there's always something to aim at. Used by Nutrition and Today.
 */

import { calculateCarbCycling } from "./carb-cycling";
import { calculateFatLossTimeline } from "./fat-loss";
import { buildRoadmap } from "./roadmap";
import type { CalorieAdjustment } from "./tracking";
import type { BiometricProfile, CarbCyclingInputs, DayType, FatLossInputs } from "./types";
import { resolveWeekdayPattern, weekdayIndex } from "./weekday-pattern";

export interface DayTarget {
  type: DayType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "roadmap" | "carbs";
}

/** Build a lookup from date to that day's targets. */
export function dayTargetFinder(
  profile: BiometricProfile,
  fatLoss: FatLossInputs,
  carbs: CarbCyclingInputs,
  adjustments: readonly CalorieAdjustment[],
): (date: string) => DayTarget | null {
  const timeline = calculateFatLossTimeline(profile, fatLoss);
  const roadmapDays = new Map(buildRoadmap(profile, carbs, timeline, [...adjustments]).days.map((d) => [d.date, d]));
  const carbPlan = calculateCarbCycling(profile, carbs);
  const pattern = resolveWeekdayPattern(carbs);
  return (date) => {
    const day = roadmapDays.get(date);
    if (day) return { type: day.type, calories: day.calories, protein: day.protein, carbs: day.carbs, fat: day.fat, source: "roadmap" };
    if (!carbPlan.feasible) return null;
    const type = pattern[weekdayIndex(date)] ?? "medium";
    const plan = carbPlan.days.find((p) => p.type === type && p.calories > 0);
    return plan ? { type, calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, source: "carbs" } : null;
  };
}
