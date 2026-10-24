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
import { calculateFatLossTimeline, intakeFloor } from "./fat-loss";
import { detectPlateau, dietStartToday } from "./plateau";
import type { FatLossResult } from "./types";
import { weekStartOf, weeklyScore, type Zone } from "./habits";
import { sanitizeAppState, type AppState } from "./persistence";
import { dailyStreak } from "./streaks";
import { activePause, withPauses, type PausePeriod } from "./pause";
import { losingMuscle, weightChangeOver } from "./muscle-check";
import { dropOffRisk, type DropOffRisk } from "./dropoff";

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

export type Flag =
  | "reply"
  | "too-fast"
  | "under-floor"
  | "behind"
  | "plateau"
  | "red"
  | "no-weigh-in"
  | "no-workouts"
  | "slipping"
  | "goal-slipping"
  | "muscle-loss"
  | "drop-off"
  | "checkin"
  | "inactive"
  | "no-plan";

/** Safety: losing more than this share of body weight a week (1.25%). */
export const TOO_FAST_RATE = 0.0125;
/** Safety: this many of the last 7 days logged under the intake floor. */
export const UNDER_FLOOR_DAYS = 3;
/** Days logged under this look unfinished, so they don't count as eating too little. */
const PARTIAL_DAY_KCAL = 500;

/** Days without a weigh-in before it counts as missed. */
export const WEIGH_IN_GAP_DAYS = 4;

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
  daysSinceWeighIn: number | null;
  /** Days with a finished workout in the last 7. */
  workouts7: number;
  /** Their latest check-in, if any. */
  lastCheckin: { weekStart: string; submittedAt: string; replied: boolean } | null;
  /** Sent a check-in in the last 7 days. */
  checkedIn: boolean;
  /** Client health score 0–100 (healthScore); null while paused. */
  health: HealthScore | null;
  flags: Flag[];
  /** How likely they are to go quiet and quit (src/lib/dropoff.ts). */
  risk: DropOffRisk;
}

/**
 * One number per member for sorting the list: logging (any log on each of the
 * last 7 days, 40), adherence (this week's habit scorecard, 35; logging again
 * when they track no habits) and trend vs plan (25).
 */
export interface HealthScore {
  score: number;
  logging: number;
  adherence: number;
  trend: number;
}

export const HEALTH_PARTS = { logging: 40, adherence: 35, trend: 25 } as const;

const TREND_POINTS: Record<string, number> = {
  "on-track": 25,
  collecting: 18,
  waiting: 18,
  "not-started": 18,
  ahead: 15,
  behind: 8,
  "no-data": 5,
};

export function healthScore(daysLogged7: number, weekPercent: number | null, progressStatus: string | null): HealthScore {
  const logging = Math.round((Math.min(daysLogged7, 7) / 7) * HEALTH_PARTS.logging);
  const adherence = Math.round(((weekPercent ?? (Math.min(daysLogged7, 7) / 7) * 100) / 100) * HEALTH_PARTS.adherence);
  // No plan yet: neither on nor off track.
  const trend = progressStatus === null ? 12 : (TREND_POINTS[progressStatus] ?? 12);
  return { score: Math.min(100, logging + adherence + trend), logging, adherence, trend };
}

/** Green 75+, yellow 50–74, red under 50. */
export function healthZone(score: number): Zone {
  return score >= 75 ? "green" : score >= 50 ? "yellow" : "red";
}

export const FLAG_LABELS: Record<Flag, string> = {
  reply: "Check-in to review",
  "too-fast": "Losing too fast",
  "under-floor": "Eating under the minimum",
  behind: "Behind plan",
  plateau: "Plateau 2+ weeks",
  red: "Habits slipping",
  "no-weigh-in": `No weigh-in ${WEIGH_IN_GAP_DAYS}+ days`,
  "no-workouts": "No workouts this week",
  slipping: "Strength slipping",
  "goal-slipping": "Lift goal slipping",
  "muscle-loss": "Losing muscle",
  "drop-off": "At risk of quitting",
  checkin: "No check-in this week",
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

  const daysSinceWeighIn = latest ? Math.max(0, daysBetween(latest.date, today)) : null;
  const weekAgo = addDays(today, -6);
  const workouts7 = new Set(data.workoutDates.filter((d) => d >= weekAgo && d <= today)).size;
  const lastCheckin = data.checkins[0] ?? null;
  const checkedIn = lastCheckin !== null && lastCheckin.submittedAt.slice(0, 10) >= weekAgo;
  const inWeek = (d: string) => d >= weekAgo && d <= today;
  const daysLogged7 = new Set([
    ...weighIns.filter((w) => inWeek(w.date)).map((w) => w.date),
    ...data.habitLogs.filter((l) => inWeek(l.date) && Object.keys(l.entries).length > 0).map((l) => l.date),
    ...data.foodDays.filter((d) => inWeek(d.date) && d.kcal > 0).map((d) => d.date),
    ...data.workoutDates.filter(inWeek),
  ]).size;
  const health = paused ? null : healthScore(daysLogged7, score.percent, hasPlan ? (progress?.status ?? "no-data") : null);

  const flags: Flag[] = [];
  const behindPlan = progress?.status === "behind";
  if (lastCheckin && !lastCheckin.replied) flags.push("reply");
  if (!hasPlan) flags.push("no-plan");
  // Safety first: these sit at the top of the list.
  const bodyWeight = latest?.weightLb ?? state.profile.weight;
  if (progress?.observedRate != null && progress.observedRate > TOO_FAST_RATE * bodyWeight) flags.push("too-fast");
  const floor = intakeFloor(bodyWeight);
  if (recentFood.filter((d) => d.kcal >= PARTIAL_DAY_KCAL && d.kcal < floor).length >= UNDER_FLOOR_DAYS) flags.push("under-floor");
  if (progress?.status === "behind") flags.push("behind");
  if (!paused && detectPlateau(weighIns, today, dietStartToday(timeline, today))) flags.push("plateau");
  if (score.zone === "red") flags.push("red");
  if (!paused) {
    if (hasPlan && (daysSinceWeighIn === null || daysSinceWeighIn >= WEIGH_IN_GAP_DAYS)) flags.push("no-weigh-in");
    // Only for members who train with the app: some workouts this month, none this week.
    if (data.workoutDates.length > 0 && workouts7 === 0) flags.push("no-workouts");
    // A lift whose estimated max fell more than 2% over six weeks.
    if ((data.slipping?.length ?? 0) > 0) flags.push("slipping");
    // A Hold lift goal now under its number (src/lib/lift-goals.ts).
    if ((data.goalsSlipping?.length ?? 0) > 0) flags.push("goal-slipping");
    // Cutting while several lifts slip (src/lib/muscle-check.ts).
    if (losingMuscle(weightChangeOver(weighIns, today), data.slipping?.length ?? 0, data.liftsTracked ?? 0)) flags.push("muscle-loss");
    if (!checkedIn) flags.push("checkin");
  }
  // A paused member isn't expected to log.
  if (!paused && (daysSinceLog === null || daysSinceLog >= INACTIVE_DAYS)) flags.push("inactive");
  // Likely to go quiet and quit (src/lib/dropoff.ts).
  const risk = dropOffRisk(data, { daysSinceLog, healthScore: health?.score ?? null, behind: behindPlan, paused: paused !== null }, today);
  if (risk.level === "high") flags.push("drop-off");

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
    daysSinceWeighIn,
    workouts7,
    lastCheckin,
    checkedIn,
    health,
    flags,
    risk,
  };
}

/** Members needing attention first (more flags, then longest without a log), then by name. */
export function sortForAttention(list: MemberSummary[]): MemberSummary[] {
  const W: Record<Flag, number> = {
    "too-fast": 8,
    "under-floor": 8,
    reply: 6,
    behind: 5,
    plateau: 4,
    red: 4,
    "no-weigh-in": 3,
    "no-workouts": 3,
    slipping: 3,
    "goal-slipping": 3,
    "muscle-loss": 4,
    "drop-off": 6,
    inactive: 2,
    checkin: 1,
    "no-plan": 1,
  };
  const weight = (m: MemberSummary) => m.flags.reduce((s, f) => s + W[f], 0);
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
