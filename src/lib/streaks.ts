/**
 * Streaks and consistency for the habit scorecard.
 *
 * Everything here is derived from the daily habit logs; nothing extra is
 * stored. The rules match the weekly scorecard's, so the numbers never
 * disagree with it:
 *
 *   - A rest day excuses only the workout habit: it neither extends nor breaks
 *     the workout streak.
 *   - Today isn't over: an unticked habit today doesn't break a streak (a
 *     ticked one extends it straight away).
 *   - Days before a member's first log don't count.
 *
 * The overall daily streak counts days at 80%+ of that day's habits — the
 * Green Zone threshold — rather than days with every single habit done, so one
 * missed glass of water doesn't wipe out weeks of work.
 */

import { addDays } from "./dates";
import {
  WEEKLY_TARGET_PERCENT,
  counts,
  dayProgress,
  isDone,
  weekStartOf,
  weeklyScore,
  zoneFor,
  type HabitDef,
  type HabitEntries,
  type Zone,
} from "./habits";

/** A day qualifies for the overall streak at this share of its habits. */
export const DAILY_STREAK_PERCENT = WEEKLY_TARGET_PERCENT;
export const CONSISTENCY_WINDOW_DAYS = 30;
export const TREND_WEEKS = 8;
/** Look back at most this far (about five and a half years of logs). */
const MAX_HISTORY_DAYS = 2000;

export interface Streak {
  current: number;
  best: number;
}

type DayResult = "hit" | "miss" | "skip";

/**
 * Walk forward from the first log to `asOf`, tracking the current run and the
 * best one. A "skip" day neither adds nor breaks; a miss on `today` is treated
 * as a skip because the day isn't over.
 */
function walk(firstLogDate: string | null, asOf: string, today: string, result: (day: string) => DayResult): Streak {
  if (!firstLogDate || firstLogDate > asOf) return { current: 0, best: 0 };
  const earliest = addDays(asOf, -MAX_HISTORY_DAYS);
  let day = firstLogDate > earliest ? firstLogDate : earliest;
  let run = 0;
  let best = 0;
  while (day <= asOf) {
    const r = result(day);
    if (r === "hit") {
      run++;
      if (run > best) best = run;
    } else if (r === "miss" && day !== today) {
      run = 0;
    }
    day = addDays(day, 1);
  }
  return { current: run, best };
}

/** Consecutive days a habit was done, up to `asOf`. */
export function habitStreak(
  def: HabitDef,
  logs: Map<string, HabitEntries>,
  asOf: string,
  today: string,
  firstLogDate: string | null,
): Streak {
  return walk(firstLogDate, asOf, today, (d) => {
    const entries = logs.get(d);
    if (!counts(def, entries)) return "skip";
    return isDone(def, entries?.[def.id]) ? "hit" : "miss";
  });
}

/** Whether a day reached DAILY_STREAK_PERCENT of the habits that counted that day. */
export function dayHitsTarget(defs: HabitDef[], entries: HabitEntries | undefined): boolean | null {
  const { done, total } = dayProgress(defs, entries);
  if (total === 0) return null;
  return (done / total) * 100 >= DAILY_STREAK_PERCENT;
}

/** Consecutive days at 80%+ of that day's habits. */
export function dailyStreak(
  defs: HabitDef[],
  logs: Map<string, HabitEntries>,
  today: string,
  firstLogDate: string | null,
): Streak {
  return walk(firstLogDate, today, today, (d) => {
    const hit = dayHitsTarget(defs, logs.get(d));
    return hit === null ? "skip" : hit ? "hit" : "miss";
  });
}

export interface Consistency {
  done: number;
  possible: number;
  /** Null when no day in the window counted yet. */
  percent: number | null;
  zone: Zone | null;
}

/**
 * Share of the last `days` days a habit was done. Rest-excused days and days
 * before the first log are left out; today counts only once it's ticked.
 */
export function habitConsistency(
  def: HabitDef,
  logs: Map<string, HabitEntries>,
  today: string,
  firstLogDate: string | null,
  days = CONSISTENCY_WINDOW_DAYS,
): Consistency {
  let done = 0;
  let possible = 0;
  if (firstLogDate) {
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      if (d < firstLogDate) continue;
      const entries = logs.get(d);
      if (!counts(def, entries)) continue;
      const hit = isDone(def, entries?.[def.id]);
      if (d === today && !hit) continue;
      possible++;
      if (hit) done++;
    }
  }
  const percent = possible > 0 ? Math.round((done / possible) * 100) : null;
  return { done, possible, percent, zone: percent === null ? null : zoneFor(percent) };
}

export interface WeekPoint {
  weekStart: string;
  percent: number | null;
  zone: Zone | null;
  complete: boolean;
}

/** Weekly scores for the last `weeks` weeks, oldest first (the last one is this week). */
export function weeklyTrend(
  defs: HabitDef[],
  logs: Map<string, HabitEntries>,
  today: string,
  firstLogDate: string | null,
  weeks = TREND_WEEKS,
): WeekPoint[] {
  const thisWeek = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (weeks - 1 - i));
    const s = weeklyScore(defs, logs, weekStart, today, firstLogDate);
    return { weekStart, percent: s.percent, zone: s.zone, complete: s.complete };
  });
}

/**
 * Consecutive completed weeks in the Green Zone (80%+). The week in progress
 * can't break the streak; it joins it once it finishes green.
 */
export function greenWeekStreak(
  defs: HabitDef[],
  logs: Map<string, HabitEntries>,
  today: string,
  firstLogDate: string | null,
): Streak {
  if (!firstLogDate) return { current: 0, best: 0 };
  const lastComplete = addDays(weekStartOf(today), -7);
  let week = weekStartOf(firstLogDate);
  const earliest = weekStartOf(addDays(today, -MAX_HISTORY_DAYS));
  if (week < earliest) week = earliest;
  let run = 0;
  let best = 0;
  while (week <= lastComplete) {
    const s = weeklyScore(defs, logs, week, today, firstLogDate);
    if (s.percent !== null) {
      if (s.percent >= WEEKLY_TARGET_PERCENT) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    week = addDays(week, 7);
  }
  return { current: run, best };
}
