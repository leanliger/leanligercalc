/**
 * Coach dashboard: one row per member, computed from the same data and the
 * same maths the member sees in their own app.
 *
 * The Worker returns each member's plan and recent logs (GET
 * /api/coach/overview); this module turns that into the numbers on the
 * dashboard. Shared types live here so the Worker and browser agree.
 */

import { analyzeProgress, type ProgressAnalysis } from "./adaptive";
import { addDays, daysBetween } from "./dates";
import { calculateFatLossTimeline } from "./fat-loss";
import type { FatLossResult } from "./types";
import { weekStartOf, weeklyScore, type Zone } from "./habits";
import { sanitizeAppState, type AppState } from "./persistence";
import { dailyStreak } from "./streaks";
import { activePause, withPauses, type PausePeriod } from "./pause";

export {
  COMPANY_ID_PATTERN,
  INACTIVE_DAYS,
  OVERVIEW_DAYS,
  companyIdFromPath,
  type CoachMemberData,
  type CoachOverview,
  type FoodDay,
} from "./coach-api";
import { INACTIVE_DAYS, type CoachMemberData } from "./coach-api";

/* -------------------------------- summary -------------------------------- */

export type Flag = "behind" | "red" | "inactive" | "no-plan";

export interface MemberSummary {
  data: CoachMemberData;
  displayName: string;
  /** Their plan, re-validated (defaults when they have none). */
  state: AppState;
  hasPlan: boolean;
  /** Most recent day with any log (weigh-in, habits or food). */
  lastLog: string | null;
  daysSinceLog: number | null;
  week: { percent: number | null; zone: Zone | null };
  streak: number;
  progress: ProgressAnalysis | null;
  /** Their fat-loss timeline, for the plan line on the weight chart. */
  timeline: FatLossResult | null;
  latestWeightLb: number | null;
  /** Change in trend weight over the last 7 days, lb (negative = down). */
  weekChangeLb: number | null;
  /** Average daily calories and protein over the last 7 days with food logged. */
  food7: { days: number; kcal: number; protein: number } | null;
  /** Their pause (sick, travelling) covering today, if any. */
  paused: PausePeriod | null;
  flags: Flag[];
}

export const FLAG_LABELS: Record<Flag, string> = {
  behind: "Behind plan",
  red: "Red Zone",
  inactive: `No logs ${INACTIVE_DAYS}+ days`,
  "no-plan": "No plan yet",
};

function latestDate(...lists: { date: string }[][]): string | null {
  let best: string | null = null;
  for (const list of lists) for (const x of list) if (!best || x.date > best) best = x.date;
  return best;
}

export function summarizeMember(data: CoachMemberData, today: string): MemberSummary {
  const hasPlan = data.plan !== null && typeof data.plan === "object";
  const state = sanitizeAppState(data.plan ?? {});
  const weighIns = [...data.weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const logMap = withPauses(new Map(data.habitLogs.map((l) => [l.date, l.entries])), state.tracking.pauses, today);
  const paused = activePause(state.tracking.pauses, today);
  const firstHabit = data.habitLogs.reduce<string | null>((m, l) => (!m || l.date < m ? l.date : m), null);
  const habits = state.tracking.habits;

  const score = weeklyScore(habits, logMap, weekStartOf(today), today, firstHabit);
  const streak = dailyStreak(habits, logMap, today, firstHabit).current;

  let progress: ProgressAnalysis | null = null;
  let timeline: FatLossResult | null = null;
  if (hasPlan) {
    try {
      timeline = calculateFatLossTimeline(state.profile, state.fatLoss);
      progress = analyzeProgress(state.profile, timeline, weighIns, state.tracking.adjustments, today);
    } catch {
      progress = null;
    }
  }

  // Weekly change from the weigh-ins themselves: the latest weigh-in against
  // the average of those 6–8 days earlier, so one heavy morning doesn't decide it.
  const latest = weighIns[weighIns.length - 1] ?? null;
  let weekChangeLb: number | null = null;
  if (latest) {
    const from = addDays(latest.date, -8);
    const to = addDays(latest.date, -6);
    const earlier = weighIns.filter((w) => w.date >= from && w.date <= to);
    if (earlier.length > 0) {
      weekChangeLb = latest.weightLb - earlier.reduce((s, w) => s + w.weightLb, 0) / earlier.length;
    }
  }

  const since = addDays(today, -6);
  const recentFood = data.foodDays.filter((d) => d.date >= since && d.date <= today && d.kcal > 0);
  const food7 =
    recentFood.length > 0
      ? {
          days: recentFood.length,
          kcal: recentFood.reduce((s, d) => s + d.kcal, 0) / recentFood.length,
          protein: recentFood.reduce((s, d) => s + d.protein, 0) / recentFood.length,
        }
      : null;

  const lastLog = latestDate(weighIns, data.habitLogs, data.foodDays.filter((d) => d.kcal > 0));
  const daysSinceLog = lastLog ? Math.max(0, daysBetween(lastLog, today)) : null;

  const flags: Flag[] = [];
  if (!hasPlan) flags.push("no-plan");
  if (progress?.status === "behind") flags.push("behind");
  if (score.zone === "red") flags.push("red");
  // A paused member isn't expected to log.
  if (!paused && (daysSinceLog === null || daysSinceLog >= INACTIVE_DAYS)) flags.push("inactive");

  return {
    data,
    displayName: data.name?.trim() || (data.username ? `@${data.username}` : "Member"),
    state,
    hasPlan,
    lastLog,
    daysSinceLog,
    week: { percent: score.percent, zone: score.zone },
    streak,
    progress,
    timeline,
    latestWeightLb: latest?.weightLb ?? null,
    weekChangeLb,
    food7,
    paused,
    flags,
  };
}

/** Members needing attention first (more flags, then longest without a log), then by name. */
export function sortForAttention(list: MemberSummary[]): MemberSummary[] {
  const weight = (m: MemberSummary) =>
    (m.flags.includes("behind") ? 4 : 0) +
    (m.flags.includes("red") ? 3 : 0) +
    (m.flags.includes("inactive") ? 2 : 0) +
    (m.flags.includes("no-plan") ? 1 : 0);
  return [...list].sort(
    (a, b) =>
      weight(b) - weight(a) ||
      (b.daysSinceLog ?? 9999) - (a.daysSinceLog ?? 9999) ||
      a.displayName.localeCompare(b.displayName),
  );
}

/** "today", "yesterday", "3 days ago", "never". */
export function describeDaysAgo(days: number | null): string {
  if (days === null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
