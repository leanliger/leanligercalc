/**
 * Training, week by week (member Training → Tools; a member's Training tab
 * for coaches):
 *
 *   - weeklyVolume: total weight moved (weight × reps, both sides of one-sided
 *     sets) and hard sets, Monday–Sunday, for the last LOAD_WEEKS.
 *   - workoutAdherence: workouts done against planned, per week. Planned is
 *     the active program's calendar when it has one, else its days a week;
 *     without an active program there is nothing to measure against.
 */

import { addDays } from "./dates";
import { weekStartOf } from "./habits";
import { scheduleSessions } from "./program-schedule";
import { doneSets, setVolume, type Program, type Workout } from "./training";

export const LOAD_WEEKS = 12;
export const ADHERENCE_WEEKS = 8;

export interface VolumeWeek {
  weekStart: string;
  /** lb moved (weight × reps). */
  volumeLb: number;
  sets: number;
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
    for (const w of done) {
      for (const e of w.exercises) {
        const ds = doneSets(e);
        sets += ds.length;
        volume += ds.reduce((s, x) => s + setVolume(x), 0);
      }
    }
    out.push({ weekStart: start, volumeLb: Math.round(volume), sets, workouts: done.length });
  }
  return out;
}

/** Last full week against the average of the four before it (as a share), when they trained then; this week is still going. */
export function volumeChange(weeks: readonly VolumeWeek[]): number | null {
  if (weeks.length < 6) return null;
  const prior = weeks.slice(-6, -2).filter((w) => w.volumeLb > 0);
  if (prior.length < 2) return null;
  const base = prior.reduce((s, w) => s + w.volumeLb, 0) / prior.length;
  return base > 0 ? (weeks[weeks.length - 2]!.volumeLb - base) / base : null;
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
  /** Full weeks with something planned, that the rate covers. */
  planWeeks: number;
  /** This week so far. */
  thisWeek: AdherenceWeek | null;
}

export function workoutAdherence(workouts: readonly Workout[], program: Program | null, today: string, weeks = ADHERENCE_WEEKS): WorkoutAdherence {
  const last = weekStartOf(today);
  const basis: WorkoutAdherence["basis"] = !program || program.days.length === 0 ? "none" : program.schedule ? "calendar" : "days";
  const sessions = program?.schedule ? scheduleSessions(program) : [];
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
  return {
    basis,
    program: basis === "none" ? null : program!.name,
    weeks: out,
    rate: planned > 0 ? done / planned : null,
    planWeeks: full.length,
    thisWeek: out[out.length - 1] ?? null,
  };
}
