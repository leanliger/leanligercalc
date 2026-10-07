/**
 * Community streak leaderboard: members opt in, and everyone who joined in the
 * same Whop community is ranked by their habit consistency.
 *
 * Only these stats are shared — all from the habit scorecard, so nothing about
 * weight or food ever appears:
 *
 *   streak      current run of days at 80%+ of that day's habits
 *   best        best such run in the last LEADERBOARD_LOOKBACK_DAYS
 *   week        this Mon–Sun scorecard %
 *   month       days at 80%+ so far this calendar month (the monthly challenge)
 *
 * Each member's "today" is their own local day, so someone who hasn't finished
 * today yet isn't shown as having broken their streak.
 *
 * Shared by the browser and the Worker.
 */

import { addDays } from "./dates";
import { weekStartOf, weeklyScore, type HabitDef, type HabitEntries } from "./habits";
import { dailyStreak, dayHitsTarget } from "./streaks";

/** How far back stats look (bounds the work per member). */
export const LEADERBOARD_LOOKBACK_DAYS = 120;
/** Most members shown on one leaderboard. */
export const LEADERBOARD_MAX = 300;

export type LeaderboardMetric = "streak" | "week" | "month";

export const METRIC_LABELS: Record<LeaderboardMetric, { tab: string; unit: (n: number) => string; help: string }> = {
  streak: {
    tab: "Streak",
    unit: (n) => `${n} day${n === 1 ? "" : "s"}`,
    help: "Days in a row at 80%+ of that day's habits.",
  },
  week: {
    tab: "This week",
    unit: (n) => `${n}%`,
    help: "This week's scorecard so far.",
  },
  month: {
    tab: "This month",
    unit: (n) => `${n} day${n === 1 ? "" : "s"}`,
    help: "Days at 80%+ so far this month — the monthly challenge.",
  },
};

export interface LeaderboardStats {
  streak: number;
  best: number;
  /** Null until a habit day has been scored this week. */
  week: number | null;
  month: number;
}

/** A member's stats as of their own local `today`. */
export function leaderboardStats(defs: HabitDef[], logs: Map<string, HabitEntries>, today: string): LeaderboardStats {
  let first: string | null = null;
  for (const d of logs.keys()) if (d <= today && (!first || d < first)) first = d;
  const streak = dailyStreak(defs, logs, today, first);
  const week = weeklyScore(defs, logs, weekStartOf(today), today, first).percent;
  let month = 0;
  for (let d = `${today.slice(0, 7)}-01`; d <= today; d = addDays(d, 1)) {
    if (dayHitsTarget(defs, logs.get(d)) === true) month++;
  }
  return { streak: streak.current, best: streak.best, week, month };
}

/** One row as the browser receives it. Other members' user ids aren't sent. */
export interface LeaderboardEntry extends LeaderboardStats {
  name: string;
  avatarUrl: string | null;
  isYou: boolean;
}

export interface LeaderboardResponse {
  joined: boolean;
  entries: LeaderboardEntry[];
}

function valueOf(e: LeaderboardStats, metric: LeaderboardMetric): number {
  return metric === "streak" ? e.streak : metric === "week" ? (e.week ?? -1) : e.month;
}

/**
 * Rank entries for a metric, highest first. Ties share a rank ("1, 2, 2, 4")
 * and are listed by current streak, then name.
 */
export function rankEntries<T extends LeaderboardStats & { name: string }>(
  entries: T[],
  metric: LeaderboardMetric,
): (T & { rank: number; value: number })[] {
  const sorted = [...entries].sort(
    (a, b) => valueOf(b, metric) - valueOf(a, metric) || b.streak - a.streak || a.name.localeCompare(b.name),
  );
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((e, i) => {
    const value = valueOf(e, metric);
    if (value !== previous) {
      rank = i + 1;
      previous = value;
    }
    return { ...e, rank, value };
  });
}
