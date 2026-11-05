/**
 * Training, week by week (member Training → Tools; a member's Training tab
 * for coaches):
 *
 *   - weeklyVolume: total weight moved (weight × reps, both sides of one-sided
 *     sets) and hard sets, Monday–Sunday, for the last LOAD_WEEKS.
 *   - workoutAdherence: workouts done against planned, per week. Planned is
 *     the active program's calendar when it has one (less sessions on days they
 *     ticked "rest day": excused, src/lib/plan-actual.ts), else its days a
 *     week; without an active program there is nothing to measure against.
 *   - recentRecords: personal records across every lift, newest first.
 */

import { addDays } from "./dates";
import { weekStartOf } from "./habits";
import { scheduleSessions } from "./program-schedule";
import { doneSets, exerciseHistory, isRecordSession, setReps, setVolume, type Program, type Workout } from "./training";

export const LOAD_WEEKS = 12;
export const ADHERENCE_WEEKS = 8;

export interface VolumeWeek {
  weekStart: string;
  /** lb moved (weight × reps). */
  volumeLb: number;
  sets: number;
  /** Every rep of every set (both sides of one-sided sets). */
  reps: number;
  workouts: number;
}

export function weeklyVolume(workouts: readonly Workout[], today: string, weeks = LOAD_WEEKS): VolumeWeek[] {
  const last = weekStartOf(today);
  const out: VolumeWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(last, -7 * i);
    const end = addDays(start, 6);
    const done = workouts.filter((w) => w.finishedAt !== null && w.date >= start && w.date <= end);
    let volume = 0;
    let sets = 0;
    let reps = 0;
    for (const w of done) {
      for (const e of w.exercises) {
        const ds = doneSets(e);
        sets += ds.length;
        reps += ds.reduce((s, x) => s + setReps(x), 0);
        volume += ds.reduce((s, x) => s + setVolume(x), 0);
      }
    }
    out.push({ weekStart: start, volumeLb: Math.round(volume), sets, reps, workouts: done.length });
  }
  return out;
}

export type VolumeMeasure = "volumeLb" | "reps" | "sets";

/** Last full week against the average of the four before it (as a share), when they trained then; this week is still going. */
export function volumeChange(weeks: readonly VolumeWeek[], measure: VolumeMeasure = "volumeLb"): number | null {
  if (weeks.length < 6) return null;
  const prior = weeks.slice(-6, -2).filter((w) => w[measure] > 0);
  if (prior.length < 2) return null;
  const base = prior.reduce((s, w) => s + w[measure], 0) / prior.length;
  return base > 0 ? (weeks[weeks.length - 2]![measure] - base) / base : null;
}

export interface AdherenceWeek {
  weekStart: string;
  planned: number;
  done: number;
}

export interface WorkoutAdherence {
  /** What planned means here. */
  basis: "calendar" | "days" | "none";
  program: string | null;
  weeks: AdherenceWeek[];
  /** Done over planned for the full weeks shown (this week left out until it ends); null without a plan. */
  rate: number | null;
  /** Over those full weeks: planned, done (up to planned each week) and missed. */
  scheduled: number;
  completed: number;
  missed: number;
  /** Workouts a week over the full weeks shown, planned or not. */
  perWeek: number;
  /** Full weeks with something planned, that the rate covers. */
  planWeeks: number;
  /** This week so far. */
  thisWeek: AdherenceWeek | null;
}

export function workoutAdherence(
  workouts: readonly Workout[],
  program: Program | null,
  today: string,
  weeks = ADHERENCE_WEEKS,
  /** Days they ticked "rest day": a session planned then is excused, unless they trained anyway. */
  restDays: ReadonlySet<string> = new Set(),
): WorkoutAdherence {
  const last = weekStartOf(today);
  const basis: WorkoutAdherence["basis"] = !program || program.days.length === 0 ? "none" : program.schedule ? "calendar" : "days";
  const trained = new Set(workouts.filter((w) => w.finishedAt !== null).map((w) => w.date));
  const sessions = (program?.schedule ? scheduleSessions(program) : []).filter((s) => !restDays.has(s.date) || trained.has(s.date));
  const out: AdherenceWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(last, -7 * i);
    const end = addDays(start, 6);
    const done = new Set(workouts.filter((w) => w.finishedAt !== null && w.date >= start && w.date <= end).map((w) => w.id)).size;
    const planned =
      basis === "calendar" ? sessions.filter((s) => s.date >= start && s.date <= end).length : basis === "days" ? program!.days.length : 0;
    out.push({ weekStart: start, planned, done });
  }
  const full = out.slice(0, -1).filter((w) => w.planned > 0);
  const planned = full.reduce((s, w) => s + w.planned, 0);
  const done = full.reduce((s, w) => s + Math.min(w.done, w.planned), 0);
  const past = out.slice(0, -1);
  return {
    basis,
    program: basis === "none" ? null : program!.name,
    weeks: out,
    rate: planned > 0 ? done / planned : null,
    scheduled: planned,
    completed: done,
    missed: planned - done,
    perWeek: past.length ? Math.round((past.reduce((s, w) => s + w.done, 0) / past.length) * 10) / 10 : 0,
    planWeeks: full.length,
    thisWeek: out[out.length - 1] ?? null,
  };
}

export const RECORD_WEEKS = 8;

export interface RecentRecord {
  exerciseId: string;
  name: string;
  date: string;
  bodyweight: boolean;
  /** What was beaten: the estimated max, the heaviest weight, or (bodyweight) the most reps. */
  kind: "e1rm" | "weight" | "reps";
  /** lb for e1rm and weight, reps for reps. */
  value: number;
  /** The set behind it, for weight records: weight × reps. */
  set: { weight: number; reps: number } | null;
}

/** Personal records in the last RECORD_WEEKS, newest first: each lift once, at its latest record. */
export function recentRecords(workouts: readonly Workout[], today: string, weeks = RECORD_WEEKS): RecentRecord[] {
  const since = addDays(today, -weeks * 7);
  const finished = workouts.filter((w) => w.finishedAt !== null);
  const lifts = new Map<string, { name: string; bodyweight: boolean }>();
  for (const w of finished) for (const e of w.exercises) if (!lifts.has(e.exerciseId)) lifts.set(e.exerciseId, { name: e.name, bodyweight: e.bodyweight });
  const out: RecentRecord[] = [];
  for (const [id, { name, bodyweight }] of lifts) {
    for (const s of exerciseHistory(finished, id)) {
      if (s.date < since || !isRecordSession(s, bodyweight)) continue;
      const top = s.sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a), s.sets[0]!);
      out.push(
        bodyweight
          ? { exerciseId: id, name, date: s.date, bodyweight, kind: "reps", value: s.bestReps, set: null }
          : s.records.e1rm
            ? { exerciseId: id, name, date: s.date, bodyweight, kind: "e1rm", value: Math.round(s.e1rm), set: { weight: top.weight, reps: top.reps } }
            : { exerciseId: id, name, date: s.date, bodyweight, kind: "weight", value: s.bestWeight, set: { weight: top.weight, reps: top.reps } },
      );
    }
  }
  const latest = new Map<string, RecentRecord>();
  for (const r of out) if (!latest.has(r.exerciseId) || latest.get(r.exerciseId)!.date < r.date) latest.set(r.exerciseId, r);
  return [...latest.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));
}
