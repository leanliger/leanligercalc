/** Builders for tests: small programs and workouts with only what a test cares about. */

import type { Program, ProgramDay, ProgramExercise, Workout, WorkoutExercise, WorkoutSet } from "./training";

export function planned(exerciseId: string, sets = 3): ProgramExercise {
  return { exerciseId, sets, repsMin: 8, repsMax: 10, restSec: null };
}

export function day(id: string, name: string, exercises: ProgramExercise[]): ProgramDay {
  return { id, name, exercises };
}

export function program(days: ProgramDay[], schedule?: Program["schedule"]): Program {
  return { id: "p1", name: "Test program", days, ...(schedule ? { schedule } : {}) };
}

export const doneSet = (weight = 100, reps = 8): WorkoutSet => ({ weight, reps, done: true });
export const openSet = (): WorkoutSet => ({ weight: null, reps: null, done: false });

export function logged(exerciseId: string, sets: WorkoutSet[], extra: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return { exerciseId, name: exerciseId, bodyweight: false, target: null, restSec: null, sets, ...extra };
}

let n = 0;
export function workout(date: string, dayId: string | null, exercises: WorkoutExercise[], extra: Partial<Workout> = {}): Workout {
  n += 1;
  return {
    id: `w${n}`,
    date,
    name: dayId ?? "Workout",
    programId: "p1",
    dayId,
    startedAt: n,
    finishedAt: n + 1,
    exercises,
    note: "",
    ...extra,
  };
}
