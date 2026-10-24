/**
 * Lift goals (worker/lift-goals.ts, lift-goals-card.tsx): up to five per
 * member, set by the member or their coach, with progress worked out from the
 * workouts they log.
 *
 * Two kinds:
 *   - Hold: keep a lift at or above a number. The default while cutting,
 *     when keeping strength is the win (and the plainest sign of keeping
 *     muscle). On track at or above it, slipping under it.
 *   - Build: reach a number, optionally by a date. With a date, a marker shows
 *     where they'd need to be today, so they're ahead of pace or behind it.
 *     Reaching it is a goal hit (a milestone: the member gets a Whop
 *     notification and it shows under Wins on the coach's Today).
 *
 * The measure is the same as the strength trends: each session's best
 * estimated one-rep max (weight × (1 + reps ÷ 30)) in lb, or the most reps
 * in a set for bodyweight exercises. "Current" is the best of the last two
 * sessions, so one off day doesn't flip a goal.
 */

import { addDays, daysBetween, isValidISODate } from "./dates";
import { ID_PATTERN, exerciseHistory, type Workout } from "./training";
import type { FatLossResult, WeightUnit } from "./types";
import { fromLb } from "./units";

export const MAX_ACTIVE_GOALS = 5;
/** Hold goals suggest this far under the current estimated max. */
export const HOLD_MARGIN = 0.03;
/** Build goals suggest this far over it. */
export const BUILD_STEP = 0.05;
/** Weighted targets in lb; bodyweight targets in reps. */
const MAX_TARGET = { weight: 2000, reps: 500 };
/** How far back "Down 14 lb in 3 weeks" looks. */
const CHANGE_DAYS = 21;

export type LiftGoalKind = "hold" | "build";

export interface LiftGoal {
  id: string;
  exerciseId: string;
  /** The exercise's name when the goal was set (their own exercises have no library name). */
  name: string;
  bodyweight: boolean;
  kind: LiftGoalKind;
  /** Estimated max in lb, or reps for bodyweight exercises. */
  target: number;
  /** Their value when the goal was set, for Build progress and pace; null with no sessions yet. */
  start: number | null;
  /** Build only: reach it by this day. */
  deadline: string | null;
  createdOn: string;
  /** Set by their coach: only a coach can change or remove it. */
  setByCoach: boolean;
  /** Build only: the day a finished workout first reached the target. */
  achievedOn: string | null;
}

/** What a member or coach sends to create or change a goal. */
export interface LiftGoalInput {
  exerciseId: string;
  name: string;
  bodyweight: boolean;
  kind: LiftGoalKind;
  target: number;
  start: number | null;
  deadline: string | null;
}

export function validateGoalInput(raw: unknown, today: string): { ok: true; value: LiftGoalInput } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const bad = (error: string) => ({ ok: false as const, error });
  if (typeof b.exerciseId !== "string" || !ID_PATTERN.test(b.exerciseId)) return bad("Pick a lift.");
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return bad("Pick a lift.");
  const bodyweight = b.bodyweight === true;
  if (b.kind !== "hold" && b.kind !== "build") return bad("Pick Hold or Build.");
  const max = bodyweight ? MAX_TARGET.reps : MAX_TARGET.weight;
  const target = typeof b.target === "number" && Number.isFinite(b.target) ? Math.round(b.target * 10) / 10 : NaN;
  if (!(target > 0 && target <= max)) return bad(bodyweight ? "Enter the reps to aim for." : "Enter the weight to aim for.");
  const start = typeof b.start === "number" && Number.isFinite(b.start) && b.start > 0 && b.start <= max ? Math.round(b.start * 10) / 10 : null;
  let deadline: string | null = null;
  if (b.kind === "build" && b.deadline !== null && b.deadline !== undefined && b.deadline !== "") {
    if (typeof b.deadline !== "string" || !isValidISODate(b.deadline)) return bad("That date isn't valid.");
    if (b.deadline <= today) return bad("Pick a date after today.");
    if (daysBetween(today, b.deadline) > 730) return bad("Pick a date within two years.");
    deadline = b.deadline;
  }
  return { ok: true, value: { exerciseId: b.exerciseId, name, bodyweight, kind: b.kind, target, start, deadline } };
}

/** Each finished session's value for a lift, oldest first. */
export function goalSeries(workouts: readonly Workout[], exerciseId: string, bodyweight: boolean): { date: string; value: number }[] {
  const finished = workouts.filter((w) => w.finishedAt !== null && Array.isArray(w.exercises));
  return exerciseHistory(finished, exerciseId)
    .map((s) => ({ date: s.date, value: bodyweight ? s.bestReps : s.e1rm }))
    .filter((p) => p.value > 0);
}

/** The best of the last two sessions: one off day doesn't flip a goal. */
export function currentValue(series: readonly { date: string; value: number }[]): number | null {
  if (series.length === 0) return null;
  return Math.max(...series.slice(-2).map((p) => p.value));
}

export type GoalStatus = "on-track" | "slipping" | "ahead" | "behind" | "building" | "hit" | "no-data";

export interface GoalProgress {
  current: number | null;
  lastDate: string | null;
  status: GoalStatus;
  /** Bar fill, 0–100. */
  fillPct: number;
  /** Build with a date: where they'd need to be today, 0–100 along the bar. */
  pacePct: number | null;
  /** Change over about the last three weeks, in the goal's measure. */
  change: { amount: number; days: number } | null;
}

export function goalProgress(goal: LiftGoal, workouts: readonly Workout[], today: string): GoalProgress {
  const series = goalSeries(workouts, goal.exerciseId, goal.bodyweight).filter((p) => p.date <= today);
  const current = currentValue(series);
  const lastDate = series[series.length - 1]?.date ?? null;
  // Change: now against the best of the two sessions before about three weeks ago (or the goal's start).
  let change: GoalProgress["change"] = null;
  if (current !== null && lastDate) {
    const cutoff = addDays(lastDate, -CHANGE_DAYS);
    const before = series.filter((p) => p.date <= cutoff).slice(-2);
    if (before.length > 0) change = { amount: current - Math.max(...before.map((p) => p.value)), days: daysBetween(before[before.length - 1]!.date, lastDate) };
  }
  const fillPct = current === null ? 0 : Math.max(0, Math.min(100, (current / goal.target) * 100));
  if (goal.achievedOn) return { current, lastDate, status: "hit", fillPct: 100, pacePct: null, change };
  if (current === null) return { current, lastDate, status: "no-data", fillPct: 0, pacePct: null, change };
  if (goal.kind === "hold") return { current, lastDate, status: current >= goal.target ? "on-track" : "slipping", fillPct, pacePct: null, change };
  if (current >= goal.target) return { current, lastDate, status: "hit", fillPct: 100, pacePct: null, change };
  if (!goal.deadline) return { current, lastDate, status: "building", fillPct, pacePct: null, change };
  const start = goal.start ?? series[0]!.value;
  const total = Math.max(1, daysBetween(goal.createdOn, goal.deadline));
  const elapsed = Math.max(0, Math.min(total, daysBetween(goal.createdOn, today)));
  const expected = start + (goal.target - start) * (elapsed / total);
  return {
    current,
    lastDate,
    status: current >= expected ? "ahead" : "behind",
    fillPct,
    pacePct: Math.max(0, Math.min(100, (expected / goal.target) * 100)),
    change,
  };
}

/** A number in the goal's measure: "228 lb", "103.5 kg", "12 reps". */
export function goalAmount(value: number, bodyweight: boolean, unit: WeightUnit): string {
  if (bodyweight) return `${Math.round(value)} rep${Math.round(value) === 1 ? "" : "s"}`;
  return `${Math.round(fromLb(value, unit) * (unit === "kg" ? 2 : 1)) / (unit === "kg" ? 2 : 1)} ${unit}`;
}

/** "Deadlift 365 lb", "Pull-up 12 reps". */
export function goalLabel(g: Pick<LiftGoal, "name" | "target" | "bodyweight">, unit: WeightUnit): string {
  return `${g.name} ${goalAmount(g.target, g.bodyweight, unit)}`;
}

/** A suggested target: a little under now for Hold, a step over it for Build, rounded to plates (5 lb / 2.5 kg) or whole reps. */
export function suggestTarget(kind: LiftGoalKind, current: number, bodyweight: boolean, unit: WeightUnit): number {
  if (bodyweight) return Math.max(1, kind === "hold" ? Math.floor(current * (1 - HOLD_MARGIN * 3)) : Math.ceil(current * (1 + BUILD_STEP * 3)));
  const raw = current * (kind === "hold" ? 1 - HOLD_MARGIN : 1 + BUILD_STEP);
  const step = unit === "kg" ? 2.5 : 5;
  const inUnit = fromLb(raw, unit);
  const rounded = kind === "hold" ? Math.floor(inUnit / step) * step : Math.ceil(inUnit / step) * step;
  return unit === "kg" ? rounded / 0.45359237 : rounded;
}

/** Names of Hold goals now under their number, for the coach's "Lift goal slipping" flag. */
export function slippingGoals(goals: readonly LiftGoal[], workouts: readonly Workout[], today: string): string[] {
  return goals.filter((g) => g.kind === "hold" && goalProgress(g, workouts, today).status === "slipping").map((g) => g.name);
}

/** In the cut (between the plan's start and goal dates): new goals start as Hold. */
export function isCutting(timeline: Pick<FatLossResult, "feasible" | "requiredStartDate" | "finishDate"> | null, today: string): boolean {
  return Boolean(timeline?.feasible && today >= timeline.requiredStartDate && today <= timeline.finishDate);
}

/** The session value a single finished workout reached on a lift, or null. */
export function workoutValue(w: Workout, exerciseId: string, bodyweight: boolean): number | null {
  if (w.finishedAt === null) return null;
  const s = goalSeries([w], exerciseId, bodyweight)[0];
  return s ? s.value : null;
}
