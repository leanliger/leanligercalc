/**
 * Weekly sets per muscle (Training; also on a member's page for the coach):
 * finished sets in a Mon–Sun week, counted per muscle, with muscles under
 * MIN_WEEKLY_SETS flagged.
 *
 * Each exercise has one main muscle. Compound lifts also work others, so a
 * set counts half for the usual helpers (a press for triceps and shoulders, a
 * row for biceps, a squat for glutes…). It's a guide, not a lab measurement.
 */

import { addDays } from "./dates";
import { libraryExercise, MUSCLES, type Exercise, type Muscle } from "./exercises";
import type { Workout } from "./training";

/** Hard sets a week usually recommended per muscle for growth (about 10–20). */
export const MIN_WEEKLY_SETS = 10;
/** The muscles flagged when under the minimum. Arms, calves and core get plenty from other lifts, or are optional. */
export const MAJOR_MUSCLES: readonly Muscle[] = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes"];

const HELPERS: Partial<Record<Muscle, Muscle[]>> = {
  chest: ["triceps", "shoulders"],
  back: ["biceps"],
  shoulders: ["triceps"],
  quads: ["glutes"],
  hamstrings: ["glutes"],
  glutes: ["hamstrings"],
};

export type MuscleSets = Record<Muscle, number>;

const empty = (): MuscleSets => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as MuscleSets;

/** A set counts once it's ticked done with some reps. */
const counted = (s: { done: boolean; reps: number | null }) => s.done && (s.reps ?? 0) > 0;

/** Sets per muscle for the week starting `weekStart` (Monday). */
export function weeklySets(workouts: readonly Workout[], weekStart: string, customExercises: readonly Exercise[] = []): MuscleSets {
  const end = addDays(weekStart, 6);
  const out = empty();
  const custom = new Map(customExercises.map((e) => [e.id, e]));
  for (const w of workouts) {
    if (w.date < weekStart || w.date > end) continue;
    for (const ex of w.exercises) {
      const muscle = (libraryExercise(ex.exerciseId) ?? custom.get(ex.exerciseId))?.muscle;
      if (!muscle) continue;
      const n = ex.sets.filter(counted).length;
      if (n === 0) continue;
      out[muscle] += n;
      for (const h of HELPERS[muscle] ?? []) out[h] += n / 2;
    }
  }
  for (const m of MUSCLES) out[m] = Math.round(out[m] * 2) / 2;
  return out;
}

/** Major muscles under the minimum in a finished week, lowest first. Empty when the week had no workouts. */
export function underTrained(sets: MuscleSets): Muscle[] {
  const total = MUSCLES.reduce((s, m) => s + sets[m], 0);
  if (total === 0) return [];
  return MAJOR_MUSCLES.filter((m) => sets[m] < MIN_WEEKLY_SETS).sort((a, b) => sets[a] - sets[b]);
}
