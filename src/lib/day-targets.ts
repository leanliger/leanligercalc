/**
 * A day's calorie and macro targets: the roadmap's numbers for that date, or,
 * outside the roadmap's dates, its nearest week (the first before it starts,
 * the last after it ends) for that weekday, which is what Macros shows then.
 * Without a roadmap, the Macros weekly plan. Used by Nutrition and Today.
 */

import { calculateCarbCycling } from "./carb-cycling";
import { calculateFatLossTimeline } from "./fat-loss";
import { buildRoadmap } from "./roadmap";
import type { CalorieAdjustment } from "./tracking";
import type { BiometricProfile, CarbCyclingInputs, DayType, FatLossInputs } from "./types";
import type { CoachMacros } from "./coach-macros";
import { resolveWeekdayPattern, weekdayIndex } from "./weekday-pattern";

export interface DayTarget {
  type: DayType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** coach = macros the coach set (src/lib/coach-macros.ts), the same every day. */
  source: "roadmap" | "carbs" | "coach";
  /** Not carb cycling: every day the same, so no day type to show. */
  steady: boolean;
}

/** Build a lookup from date to that day's targets. */
export function dayTargetFinder(
  profile: BiometricProfile,
  fatLoss: FatLossInputs,
  carbs: CarbCyclingInputs,
  adjustments: readonly CalorieAdjustment[],
  /** Macros the coach set: while there are any, every day is these. */
  coachMacros: CoachMacros | null = null,
): (date: string) => DayTarget | null {
  if (coachMacros) {
    const t: DayTarget = {
      type: "medium",
      calories: coachMacros.kcal,
      protein: coachMacros.protein,
      carbs: coachMacros.carbs,
      fat: coachMacros.fat,
      source: "coach",
      steady: true,
    };
    return () => t;
  }
  const timeline = calculateFatLossTimeline(profile, fatLoss);
  const roadmap = buildRoadmap(profile, carbs, timeline, [...adjustments]);
  const roadmapDays = new Map(roadmap.days.map((d) => [d.date, d]));
  const firstWeek = roadmap.feasible ? roadmap.weeks[0] : undefined;
  const lastWeek = roadmap.feasible ? roadmap.weeks[roadmap.weeks.length - 1] : undefined;
  const carbPlan = calculateCarbCycling(profile, carbs);
  const pattern = resolveWeekdayPattern(carbs);
  return (date) => {
    const day = roadmapDays.get(date);
    if (day) return { type: day.type, calories: day.calories, protein: day.protein, carbs: day.carbs, fat: day.fat, source: "roadmap", steady: day.steady };
    const type = pattern[weekdayIndex(date)] ?? "medium";
    const nearest = date < roadmap.startDate ? firstWeek : lastWeek;
    const near = nearest?.plans[type];
    if (near && near.calories > 0) return { type, ...near, source: "carbs", steady: !carbs.cycleCarbs };
    if (!carbPlan.feasible) return null;
    const plan = carbPlan.days.find((p) => p.type === type && p.calories > 0);
    return plan ? { type, calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, source: "carbs", steady: !carbs.cycleCarbs } : null;
  };
}
