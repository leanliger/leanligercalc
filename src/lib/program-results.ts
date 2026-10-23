/**
 * Program results (coach dashboard → Library → Program results): for each
 * program a coach sent, how the members who added it are doing on it —
 * strength change on its lifts, weight change a week, and workouts finished
 * against the calendar. Worked out per member here; worker/program-results.ts
 * reads the rows (members sharing their progress only) and adds them up.
 */

import { daysBetween } from "./dates";
import { exerciseHistory, type Workout } from "./training";
import type { WeighIn } from "./tracking";

export interface MemberProgramResult {
  userId: string;
  /** The day they added the program. */
  since: string;
  workouts: number;
  /** Sessions planned up to today, when the program came with a calendar. */
  planned: number | null;
  /** Average change in estimated max over the program's lifts with 3+ sessions, %. */
  strengthPct: number | null;
  /** Weight change a week since they added it (a straight line through their weigh-ins), lb; negative = down. */
  weightPerWeekLb: number | null;
}

export interface ProgramResult {
  assignmentId: string;
  title: string;
  sentAt: string;
  /** Members who added it and share their progress. */
  members: MemberProgramResult[];
  avgStrengthPct: number | null;
  avgWeightPerWeekLb: number | null;
  /** Workouts finished ÷ planned across members with a calendar, %. */
  adherencePct: number | null;
}

const avg = (xs: readonly number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** One member on one program. `workouts` are theirs from this program only. */
export function memberProgramResult(
  userId: string,
  since: string,
  workouts: readonly Workout[],
  weighIns: readonly WeighIn[],
  plannedDates: readonly string[] | null,
  today: string,
): MemberProgramResult {
  const done = workouts.filter((w) => w.finishedAt !== null && w.date >= since && w.date <= today);
  // Strength: each lift's best of its last two sessions against its first two.
  const ids = [...new Set(done.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
  const changes: number[] = [];
  for (const id of ids) {
    const h = exerciseHistory(done, id).filter((s) => s.e1rm > 0);
    if (h.length < 3) continue;
    const first = Math.max(...h.slice(0, 2).map((s) => s.e1rm));
    const last = Math.max(...h.slice(-2).map((s) => s.e1rm));
    if (first > 0) changes.push((last / first - 1) * 100);
  }
  // Weight: the slope of a straight line through their weigh-ins since they
  // added it (3+ weigh-ins over a week or more). A smoothed trend lags too
  // far behind to read a rate from over a few weeks.
  const pts = weighIns.filter((w) => w.date >= since && w.date <= today).map((w) => ({ x: daysBetween(since, w.date), y: w.weightLb }));
  const span = pts.length > 0 ? Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) : 0;
  let perDay: number | null = null;
  if (pts.length >= 3 && span >= 7) {
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    perDay = sxx > 0 ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : null;
  }
  return {
    userId,
    since,
    workouts: done.length,
    planned: plannedDates ? plannedDates.filter((d) => d >= since && d <= today).length : null,
    strengthPct: avg(changes),
    weightPerWeekLb: perDay === null ? null : perDay * 7,
  };
}

export function programResult(assignmentId: string, title: string, sentAt: string, members: MemberProgramResult[]): ProgramResult {
  const withPlan = members.filter((m) => m.planned !== null && m.planned > 0);
  const planned = withPlan.reduce((n, m) => n + m.planned!, 0);
  const done = withPlan.reduce((n, m) => n + Math.min(m.workouts, m.planned!), 0);
  return {
    assignmentId,
    title,
    sentAt,
    members,
    avgStrengthPct: avg(members.flatMap((m) => (m.strengthPct === null ? [] : [m.strengthPct]))),
    avgWeightPerWeekLb: avg(members.flatMap((m) => (m.weightPerWeekLb === null ? [] : [m.weightPerWeekLb]))),
    adherencePct: planned > 0 ? (done / planned) * 100 : null,
  };
}
