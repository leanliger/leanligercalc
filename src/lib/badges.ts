/**
 * Badges: milestones worked out from what a member already logs — workouts,
 * personal records, habit streaks, weigh-ins, weight lost, food logging, steps
 * and measurements. Nothing extra is stored; earning one is just the data
 * crossing a line, so they stay correct if old entries are edited or deleted.
 *
 * `earnedOn` is the day the line was crossed where that's knowable (counts and
 * weight lost); streak badges only say they're earned.
 */

import { trendSeries } from "./adaptive";
import { addDays } from "./dates";
import type { FoodLog } from "./food";
import { STEPS_KEY, type HabitDef, type HabitEntries, type HabitLog } from "./habits";
import type { Measurement } from "./measurements";
import { dailyStreak, greenWeekStreak } from "./streaks";
import { withPauses, type PausePeriod } from "./pause";
import { exerciseHistory, isRecordSession, type Workout } from "./training";
import type { WeighIn } from "./tracking";
import type { WeightUnit } from "./types";
import { kgToLb } from "./units";

export type BadgeGroup = "training" | "habits" | "weight" | "food" | "steps";

export interface Badge {
  id: string;
  group: BadgeGroup;
  title: string;
  description: string;
  earned: boolean;
  earnedOn: string | null;
  /** Progress towards it, e.g. 7 of 10 workouts. */
  current: number;
  target: number;
}

export interface BadgeInputs {
  today: string;
  unit: WeightUnit;
  habits: readonly HabitDef[];
  habitLogs: readonly HabitLog[];
  weighIns: readonly WeighIn[];
  foodLogs: readonly FoodLog[];
  workouts: readonly Workout[];
  measurements: readonly Measurement[];
  /** Pause mode periods: those days don't break a streak. */
  pauses?: readonly PausePeriod[];
}

/** A badge for reaching `n` of something, given the sorted dates each one happened. */
function countBadge(
  id: string,
  group: BadgeGroup,
  title: string,
  description: string,
  dates: readonly string[],
  n: number,
): Badge {
  return {
    id,
    group,
    title,
    description,
    earned: dates.length >= n,
    earnedOn: dates[n - 1] ?? null,
    current: Math.min(dates.length, n),
    target: n,
  };
}

function reachedBadge(id: string, group: BadgeGroup, title: string, description: string, best: number, n: number): Badge {
  return { id, group, title, description, earned: best >= n, earnedOn: null, current: Math.min(best, n), target: n };
}

/** Longest run of consecutive days, and the day each run length was first reached. */
function longestRun(sortedDates: readonly string[]): { best: number; reachedOn: Map<number, string> } {
  const reachedOn = new Map<number, string>();
  let run = 0;
  let best = 0;
  let prev: string | null = null;
  for (const d of sortedDates) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    prev = d;
    if (run > best) {
      best = run;
      reachedOn.set(best, d);
    }
  }
  return { best, reachedOn };
}

export function computeBadges(input: BadgeInputs): Badge[] {
  const { today, unit } = input;
  const badges: Badge[] = [];

  /* ------------------------------ training ------------------------------ */
  const finished = input.workouts
    .filter((w) => w.finishedAt !== null)
    .map((w) => w.date)
    .sort();
  badges.push(countBadge("workout-1", "training", "First workout", "Finish your first workout.", finished, 1));
  badges.push(countBadge("workout-10", "training", "10 workouts", "Finish 10 workouts.", finished, 10));
  badges.push(countBadge("workout-50", "training", "50 workouts", "Finish 50 workouts.", finished, 50));
  badges.push(countBadge("workout-100", "training", "100 workouts", "Finish 100 workouts.", finished, 100));

  const exercises = new Map<string, boolean>();
  for (const w of input.workouts) for (const e of w.exercises) exercises.set(e.exerciseId, e.bodyweight);
  const prDates: string[] = [];
  for (const [id, bodyweight] of exercises) {
    for (const s of exerciseHistory(input.workouts, id)) if (isRecordSession(s, bodyweight)) prDates.push(s.date);
  }
  prDates.sort();
  badges.push(countBadge("pr-1", "training", "First PR", "Beat your best on any lift.", prDates, 1));
  badges.push(countBadge("pr-10", "training", "10 PRs", "Set 10 personal records.", prDates, 10));
  badges.push(countBadge("pr-25", "training", "PR machine", "Set 25 personal records.", prDates, 25));

  /* ------------------------------- habits ------------------------------- */
  const logMap = withPauses(
    new Map<string, HabitEntries>(input.habitLogs.map((l) => [l.date, l.entries])),
    input.pauses ?? [],
    today,
  );
  const firstLog = input.habitLogs.length > 0 ? [...input.habitLogs].map((l) => l.date).sort()[0]! : null;
  const daily = dailyStreak([...input.habits], logMap, today, firstLog);
  const weeks = greenWeekStreak([...input.habits], logMap, today, firstLog);
  badges.push(reachedBadge("streak-7", "habits", "7-day streak", "Hit 80%+ of your habits 7 days in a row.", daily.best, 7));
  badges.push(reachedBadge("streak-30", "habits", "30-day streak", "Hit 80%+ of your habits 30 days in a row.", daily.best, 30));
  badges.push(reachedBadge("streak-100", "habits", "100-day streak", "Hit 80%+ of your habits 100 days in a row.", daily.best, 100));
  badges.push(reachedBadge("green-4", "habits", "Green Zone month", "Score 80%+ four weeks in a row.", weeks.best, 4));

  /* ------------------------------- weight ------------------------------- */
  const weighDates = input.weighIns.map((w) => w.date).sort();
  badges.push(countBadge("weigh-1", "weight", "First weigh-in", "Log your first weigh-in.", weighDates, 1));
  badges.push(countBadge("weigh-30", "weight", "30 weigh-ins", "Log 30 weigh-ins.", weighDates, 30));
  badges.push(countBadge("weigh-100", "weight", "100 weigh-ins", "Log 100 weigh-ins.", weighDates, 100));

  // Weight lost on the smoothed trend, so one light morning doesn't count.
  const trend = trendSeries([...input.weighIns]);
  const start = trend[0]?.trend ?? null;
  const steps = unit === "kg" ? [2, 5, 10] : [5, 10, 20];
  for (const amount of steps) {
    const lb = unit === "kg" ? kgToLb(amount) : amount;
    const hit = start === null ? undefined : trend.find((t) => start - t.trend >= lb - 1e-9);
    const lost = start === null || trend.length === 0 ? 0 : Math.max(0, start - Math.min(...trend.map((t) => t.trend)));
    badges.push({
      id: `lost-${amount}${unit}`,
      group: "weight",
      title: `${amount} ${unit} down`,
      description: `Lose ${amount} ${unit} on your weight trend.`,
      earned: Boolean(hit),
      earnedOn: hit?.date ?? null,
      current: Math.min(Math.floor((unit === "kg" ? lost / kgToLb(1) : lost) * 10) / 10, amount),
      target: amount,
    });
  }
  const measured = input.measurements.map((m) => m.date).sort();
  badges.push(countBadge("measure-1", "weight", "Tape measure out", "Log your first measurements.", measured, 1));

  /* -------------------------------- food -------------------------------- */
  const foodDays = input.foodLogs
    .filter((l) => l.entries.length > 0 && l.date <= today)
    .map((l) => l.date)
    .sort();
  badges.push(countBadge("food-1", "food", "First meal logged", "Log your first food.", foodDays, 1));
  const run = longestRun(foodDays);
  badges.push({
    ...reachedBadge("food-streak-7", "food", "7-day food log", "Log your food 7 days in a row.", run.best, 7),
    earnedOn: run.reachedOn.get(7) ?? null,
  });
  badges.push(countBadge("food-30", "food", "30 days logged", "Log your food on 30 days.", foodDays, 30));

  /* -------------------------------- steps -------------------------------- */
  const tenK = input.habitLogs
    .filter((l) => typeof l.entries[STEPS_KEY] === "number" && (l.entries[STEPS_KEY] as number) >= 10000)
    .map((l) => l.date)
    .sort();
  badges.push(countBadge("steps-10k", "steps", "First 10K day", "Log 10,000 steps in a day.", tenK, 1));
  badges.push(countBadge("steps-10k-30", "steps", "10K club", "Log 10,000+ steps on 30 days.", tenK, 30));

  return badges;
}

/** The unearned badges closest to done, for "up next". */
export function nextBadges(badges: readonly Badge[], count = 2): Badge[] {
  return badges
    .filter((b) => !b.earned && b.current > 0)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, count);
}
