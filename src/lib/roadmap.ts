/**
 * Roadmap — the fat-loss timeline expanded into a day-by-day eating plan.
 *
 * Two sources are combined, each doing the job it is best at:
 *
 *   - The **timeline** decides how much to eat each week. Its targets step
 *     down as body weight and maintenance fall, so week 12 is not week 1.
 *   - The **carb-cycling engine** decides how that weekly budget is split
 *     across high / medium / low days, holding protein and the fat floor.
 *
 * The carb-cycling allocation is re-run for every week rather than once,
 * because both its inputs move: the calorie target drops, and protein and the
 * fat floor are set per pound of a body weight that is also dropping. Each
 * week therefore still averages exactly to that week's timeline target.
 */

import { calculateCarbCycling, DAY_DESCRIPTIONS, DAY_LABELS, STEADY_DAY_DESCRIPTION, STEADY_DAY_LABEL } from "./carb-cycling";
import { addDays, formatLong } from "./dates";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  DayType,
  FatLossResult,
  MacroTargets,
  RoadmapDay,
  RoadmapResult,
  RoadmapWeek,
  TimelineWarning,
  WeekProjection,
} from "./types";
import { round } from "./units";
import { intakeFloor } from "./fat-loss";
import { adjustmentOn, type CalorieAdjustment } from "./tracking";
import {
  countsFromPattern,
  resolveWeekdayPattern,
  scheduleNeedsNormalizing,
  weekdayIndex,
} from "./weekday-pattern";

const EMPTY_PLAN: MacroTargets = { protein: 0, carbs: 0, fat: 0, calories: 0 };

/**
 * A week's daily calorie target: the Timeline's, plus any check-in change in
 * force from that week, never below the intake floor. Macros shows the same
 * number for the current week (src/lib/plan-link.ts).
 */
export function weekCalorieTarget(
  row: WeekProjection,
  weekStart: string,
  adjustments: CalorieAdjustment[],
): { target: number; adjustment: number } {
  const adjustment = adjustmentOn(adjustments, weekStart);
  return { target: Math.max(intakeFloor(row.weight), row.targetCalories + adjustment), adjustment };
}

export function buildRoadmap(
  profile: BiometricProfile,
  carbInputs: CarbCyclingInputs,
  timeline: FatLossResult,
  /** Calorie changes accepted at check-ins; each applies from its week on. */
  adjustments: CalorieAdjustment[] = [],
): RoadmapResult {
  const pattern = resolveWeekdayPattern(carbInputs);
  const counts = countsFromPattern(pattern);
  const startDate = timeline.requiredStartDate;
  const dietWeeks = timeline.weeksRequired;
  const goalDate = addDays(startDate, dietWeeks * 7);
  const finalRow = timeline.projection[timeline.projection.length - 1];

  const warnings: TimelineWarning[] = [];

  if (!timeline.feasible || dietWeeks <= 0) {
    return {
      startDate,
      goalDate,
      totalDays: 0,
      days: [],
      weeks: [],
      pattern,
      goalWeight: finalRow?.weight ?? profile.weight,
      goalBodyFat: finalRow?.bodyFat ?? 0,
      warnings: [
        {
          level: "info",
          title: "No roadmap yet",
          detail:
            "Set a goal weight or body fat below your current numbers in Plan → Timeline, and the day-by-day plan will appear here.",
        },
      ],
      feasible: false,
    };
  }

  if (scheduleNeedsNormalizing(carbInputs)) {
    const total = carbInputs.highDays + carbInputs.mediumDays + carbInputs.lowDays;
    warnings.push({
      level: "info",
      title: `Carb cycling schedule covers ${total} days — adjusted to 7`,
      detail: `The roadmap is using ${counts.high} high, ${counts.medium} medium and ${counts.low} low. Fix the counts in Plan → Macros to choose your own split.`,
    });
  }

  const weeks: RoadmapWeek[] = [];
  const days: RoadmapDay[] = [];

  for (let w = 0; w < dietWeeks; w++) {
    const row = timeline.projection[w];
    if (!row) break;
    const weekStart = addDays(startDate, w * 7);
    // Check-in adjustments shift the whole week's target; the floor still holds.
    const { target: weekTarget, adjustment } = weekCalorieTarget(row, weekStart, adjustments);

    // Feed the carb-cycling engine this week's numbers: the timeline's calorie
    // target and maintenance, and the projected weight and body fat so protein
    // and the fat floor scale with the body the plan is actually feeding.
    const plan = calculateCarbCycling(
      { ...profile, weight: row.weight, bodyFatOverride: row.bodyFat },
      {
        ...carbInputs,
        tdee: row.tdee,
        dailyCalorieTarget: weekTarget,
        highDays: counts.high,
        mediumDays: counts.medium,
        lowDays: counts.low,
      },
    );

    const plans: Record<DayType, MacroTargets> = {
      high: { ...EMPTY_PLAN },
      medium: { ...EMPTY_PLAN },
      low: { ...EMPTY_PLAN },
    };
    for (const day of plan.days) {
      plans[day.type] = {
        protein: day.protein,
        carbs: day.carbs,
        fat: day.fat,
        calories: day.calories,
      };
    }

    const previous = weeks[w - 1];
    weeks.push({
      week: w,
      startDate: weekStart,
      targetCalories: plan.weekly.averageDailyCalories,
      adjustment,
      calorieChange: previous ? plan.weekly.averageDailyCalories - previous.targetCalories : 0,
      weight: row.weight,
      bodyFat: row.bodyFat,
      note: row.note,
      plans,
      feasible: plan.feasible,
      // Fat-floor notices repeat every single week and say nothing new.
      warnings: plan.warnings.filter((x) => !x.title.startsWith("Fat floor enforced")),
    });

    for (let d = 0; d < 7; d++) {
      const index = w * 7 + d;
      const date = addDays(startDate, index);
      const weekday = weekdayIndex(date);
      const type = pattern[weekday] ?? "medium";
      days.push({
        date,
        index,
        week: w,
        weekday,
        type,
        ...plans[type],
        isGoalDay: false,
        steady: !carbInputs.cycleCarbs,
      });
    }
  }

  // The goal day itself: the plan is complete. It keeps the final week's
  // numbers — nobody should jump straight back to maintenance overnight.
  const lastWeek = weeks[weeks.length - 1];
  if (lastWeek) {
    const weekday = weekdayIndex(goalDate);
    const type = pattern[weekday] ?? "medium";
    days.push({
      date: goalDate,
      index: dietWeeks * 7,
      week: dietWeeks,
      weekday,
      type,
      ...lastWeek.plans[type],
      isGoalDay: true,
      steady: !carbInputs.cycleCarbs,
    });
  }

  const brokenWeeks = weeks.filter((w) => !w.feasible).map((w) => w.week + 1);
  if (brokenWeeks.length > 0) {
    warnings.push({
      level: "danger",
      title: `${brokenWeeks.length} week${brokenWeeks.length === 1 ? "" : "s"} can't be fully allocated`,
      detail: `Week${brokenWeeks.length === 1 ? "" : "s"} ${describeRanges(brokenWeeks)}: the calorie target is too low to cover protein and the fat floor with any carbohydrate left. Slow the fat loss rate, or lower protein per pound or the fat floor.`,
    });
  }

  const cautionWeeks = weeks
    .filter((w) => w.feasible && w.warnings.some((x) => x.level !== "info"))
    .map((w) => w.week + 1);
  if (cautionWeeks.length > 0) {
    warnings.push({
      level: "warning",
      title: `Week${cautionWeeks.length === 1 ? "" : "s"} ${describeRanges(cautionWeeks)} need attention`,
      // Deliberately no guess at *when* this happens. If intake is pinned at the
      // calorie floor, carbs are tightest in the early weeks, when the
      // per-pound protein and fat floors are at their highest — not late on.
      detail:
        "Those weeks are marked with a dot on the calendar. Select one of their days to see the specific issue.",
    });
  }

  return {
    startDate,
    goalDate,
    totalDays: dietWeeks * 7,
    days,
    weeks,
    pattern,
    goalWeight: finalRow?.weight ?? profile.weight,
    goalBodyFat: finalRow?.bodyFat ?? 0,
    warnings,
    feasible: true,
  };
}

/** [3,4,5,9,11,12] → "3–5, 9, 11–12" */
export function describeRanges(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== undefined && prev !== undefined && current === prev + 1) {
      prev = current;
      continue;
    }
    if (start !== undefined && prev !== undefined) {
      parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    }
    start = current;
    prev = current;
  }
  return parts.join(", ");
}

/* ----------------------------- text export ----------------------------- */

export function formatDayText(day: RoadmapDay): string {
  return [
    `${formatLong(day.date)} — ${day.steady ? STEADY_DAY_LABEL : `${DAY_LABELS[day.type]} day`}${day.isGoalDay ? " (GOAL DAY)" : ""}`,
    `Week ${day.week + 1}, day ${day.index + 1}`,
    `${day.calories} kcal`,
    `  Protein ${day.protein}g | Carbs ${day.carbs}g | Fat ${day.fat}g`,
    day.steady ? STEADY_DAY_DESCRIPTION : DAY_DESCRIPTIONS[day.type],
  ].join("\n");
}

export function formatWeekText(
  week: RoadmapWeek,
  days: RoadmapDay[],
  convertWeight: (lb: number) => number,
  unitLabel: string,
): string {
  const lines = [
    `WEEK ${week.week + 1} — starting ${formatLong(week.startDate)}`,
    `Projected weight: ${round(convertWeight(week.weight), 1)} ${unitLabel} at ${week.bodyFat}% body fat`,
    `Average intake: ${week.targetCalories} kcal/day`,
    "",
  ];
  for (const day of days) {
    lines.push(
      `${formatLong(day.date).padEnd(18)} ${(day.steady ? "" : DAY_LABELS[day.type]).padEnd(12)} ${String(day.calories).padStart(5)} kcal   P ${day.protein}g  C ${day.carbs}g  F ${day.fat}g`,
    );
  }
  if (week.note) lines.push("", `Note: ${week.note}`);
  return lines.join("\n");
}
