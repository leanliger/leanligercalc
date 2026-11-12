/**
 * Coach dashboard → Members, the client roster's columns that need working
 * out: goal, coaching start, goal progress, nutrition / workout / habit
 * adherence, check-in state, last active and coach status. Worked out once
 * per member per overview (rosterInfo), then shown and sorted from that.
 * Next action comes from the Today queue (queueReason in coach-today.tsx).
 */

import type { MemberSummary } from "./coach";
import { addDays, daysBetween } from "./dates";
import { ON_TARGET_SHARE, memberTargetFinder } from "./nutrition-report";
import { weekdayIndex } from "./weekday-pattern";
import { needsHelp } from "./accountability";
import { restDaysOf } from "./plan-actual";

/** Adherence windows: the last 14 days to yesterday (today is still going). */
export const ROSTER_DAYS = 14;

export type GoalKind = "Fat loss" | "Muscle gain" | "Recomp" | "Maintenance" | "No plan";

export type CheckinState =
  | { kind: "review" }
  | { kind: "submitted"; on: string }
  | { kind: "due"; on: string }
  | { kind: "overdue"; days: number }
  | { kind: "none" };

export type CoachStatus = "attention" | "monitor" | "on-track";

export const STATUS_LABEL: Record<CoachStatus, string> = { attention: "Needs attention", monitor: "Monitor", "on-track": "On track" };
/** Sorts needs attention first. */
export const STATUS_RANK: Record<CoachStatus, number> = { attention: 2, monitor: 1, "on-track": 0 };

export interface RosterInfo {
  goal: GoalKind;
  /** When coaching began: when they started sharing with you, else when they joined. */
  start: string | null;
  /** Share of the way from their plan's start weight to its goal, 0–100; null without a weight goal. */
  progress: { pct: number; doneLb: number; totalLb: number } | null;
  /** Days on their calorie target out of ROSTER_DAYS (unlogged days count as missed); null without targets. */
  nutrition: number | null;
  /** Workouts done of planned over ROSTER_DAYS; null without an active program. */
  workouts: { pct: number; done: number; planned: number } | null;
  /** Their habit score over the last 14 days. */
  habits: number | null;
  checkin: CheckinState;
  /** The later of their last log and when they last opened the whop. */
  lastActive: string | null;
  status: CoachStatus;
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

export function goalKind(m: MemberSummary): GoalKind {
  if (!m.hasPlan) return "No plan";
  if (m.state.fatLoss.phase === "bulk") return "Muscle gain";
  const goal = m.state.carbs.goal;
  if (goal === "recomp") return "Recomp";
  if (goal === "maintenance") return "Maintenance";
  const target = m.state.fatLoss.goalType === "weight" ? m.state.fatLoss.targetWeight : (m.timeline?.endWeight ?? null);
  const now = m.progress?.trendWeight ?? m.latestWeightLb ?? m.state.profile.weight;
  return target !== null && target > now + 1 ? "Muscle gain" : "Fat loss";
}

function goalProgress(m: MemberSummary, kind: GoalKind): RosterInfo["progress"] {
  if (kind !== "Fat loss" && kind !== "Muscle gain") return null;
  const start = m.state.profile.weight;
  // A lean bulk's goal is where its projection ends.
  const goal =
    m.state.fatLoss.phase !== "bulk" && m.state.fatLoss.goalType === "weight" ? m.state.fatLoss.targetWeight : (m.timeline?.endWeight ?? null);
  const now = m.progress?.trendWeight ?? m.latestWeightLb;
  if (goal === null || now === null || Math.abs(start - goal) < 0.5) return null;
  const total = Math.abs(start - goal);
  const done = kind === "Fat loss" ? start - now : now - start;
  return { pct: pct(done / total), doneLb: Math.round(Math.max(0, done) * 10) / 10, totalLb: Math.round(total * 10) / 10 };
}

function nutritionShare(m: MemberSummary, today: string): number | null {
  const targetFor = memberTargetFinder(m, m.data.coachMacros ?? null, today);
  if (!targetFor) return null;
  const byDate = new Map(m.data.foodDays.map((d) => [d.date, d.kcal]));
  let on = 0;
  let days = 0;
  for (let i = 1; i <= ROSTER_DAYS; i++) {
    const date = addDays(today, -i);
    const t = targetFor(date);
    if (!t) continue;
    days++;
    const kcal = byDate.get(date) ?? 0;
    if (kcal > 0 && Math.abs(kcal - t.calories) / t.calories <= ON_TARGET_SHARE) on++;
  }
  return days ? pct(on / days) : null;
}

function workoutShare(m: MemberSummary, today: string): RosterInfo["workouts"] {
  const p = m.data.activeProgram;
  if (!p) return null;
  const from = addDays(today, -ROSTER_DAYS);
  const to = addDays(today, -1);
  let planned = 0;
  if (p.schedule) {
    const end = addDays(p.schedule.startDate, p.schedule.weeks * 7 - 1);
    // A rest day ticked on a planned day is excused (src/lib/plan-actual.ts).
    const rest = restDaysOf(m.data.habitLogs);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (d >= p.schedule.startDate && d <= end && p.schedule.weekdays.includes(weekdayIndex(d)) && !(rest.has(d) && !m.data.workoutDates.includes(d))) planned++;
    }
  } else {
    planned = Math.round((p.daysPerWeek * ROSTER_DAYS) / 7);
  }
  if (planned === 0) return null;
  const done = new Set(m.data.workoutDates.filter((d) => d >= from && d <= to)).size;
  return { pct: pct(Math.min(done, planned) / planned), done, planned };
}

/** Weekly check-ins: due 7 days after the last one (or after they started), overdue the day after that. */
export function checkinState(m: MemberSummary, start: string | null, today: string): CheckinState {
  if (m.flags.includes("reply")) return { kind: "review" };
  const last = m.lastCheckin?.submittedAt.slice(0, 10) ?? null;
  const from = last ?? start;
  if (!from) return { kind: "none" };
  const due = addDays(from, 7);
  if (today > due) return { kind: "overdue", days: daysBetween(due, today) };
  if (last && daysBetween(today, due) > 2) return { kind: "submitted", on: last };
  return { kind: "due", on: due };
}

export function coachStatus(m: MemberSummary): CoachStatus {
  const f = m.flags;
  // Asked for help on an accountability check, until you message them.
  const help = needsHelp(m.data.accountability, m.data.lastCoachContact);
  if (f.includes("too-fast") || f.includes("under-floor") || m.risk.level === "high" || (m.health !== null && m.health.score < 50) || help) return "attention";
  if (m.risk.level === "medium" || (m.health !== null && m.health.score < 75)) return "monitor";
  return "on-track";
}

export function rosterInfo(m: MemberSummary, today: string): RosterInfo {
  const goal = goalKind(m);
  const start = (m.data.sharing.since ?? m.data.joinedAt)?.slice(0, 10) ?? null;
  const opened = m.data.lastAccessedAt?.slice(0, 10) ?? null;
  const lastActive = [m.lastLog, opened].filter((x): x is string => x !== null).sort().pop() ?? null;
  return {
    goal,
    start,
    progress: goalProgress(m, goal),
    nutrition: nutritionShare(m, today),
    workouts: workoutShare(m, today),
    habits: m.habits14,
    checkin: checkinState(m, start, today),
    lastActive,
    status: coachStatus(m),
  };
}

/** "Due today", "Due Sun", "Overdue 3 days"… */
export function checkinLabel(c: CheckinState, today: string): string {
  switch (c.kind) {
    case "review":
      return "To review";
    case "submitted":
      return "Submitted";
    case "due":
      return c.on === today ? "Due today" : `Due ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayIndex(c.on)]}`;
    case "overdue":
      return `Overdue ${c.days} day${c.days === 1 ? "" : "s"}`;
    case "none":
      return "—";
  }
}

/** Sorts overdue first, then to review, due, submitted. */
export function checkinRank(c: CheckinState): number {
  return c.kind === "overdue" ? 1000 + c.days : c.kind === "review" ? 500 : c.kind === "due" ? 100 : c.kind === "submitted" ? 0 : -1;
}
