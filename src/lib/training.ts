/**
 * Training: programs, workout logs and the numbers behind the progress charts.
 *
 * Two kinds of data, stored in different places:
 *
 *   TrainingSettings — the member's programs, their own exercises, which
 *     program is active and their default rest. Small definitions, kept in the
 *     plan document next to habits (persistence.ts).
 *   Workout — one session: what was lifted, set by set. Its own table / storage
 *     key, one record per workout, validated by validateWorkout() on both sides.
 *
 * Weights are always stored in pounds, like body weight; shown in kg when the
 * member uses kg. For bodyweight exercises the weight is *added* weight (a
 * belt or vest), and blank means none.
 *
 * Shared by the browser and the Worker.
 */

import { EQUIPMENT, LIBRARY, MUSCLES, libraryExercise, type Equipment, type Exercise, type Muscle } from "./exercises";
import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

/* --------------------------------- limits --------------------------------- */

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const WORKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const NAME_MAX = 60;
export const DAY_NAME_MAX = 40;
export const NOTE_MAX = 300;
export const CUE_MAX = 100;
export const VIDEO_URL_MAX = 300;
export const MAX_PROGRAMS = 8;
export const MAX_DAYS = 7;
export const MAX_DAY_EXERCISES = 12;
export const MAX_CUSTOM_EXERCISES = 150;
export const MAX_WORKOUTS = 2000;
export const MAX_WORKOUT_EXERCISES = 20;
export const MAX_SETS = 12;
export const MAX_REPS = 200;
export const MAX_WEIGHT_LB = 2000;
export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 600;
export const DEFAULT_REST_SEC = 150;
export const REST_PRESETS = [120, 150, 180] as const;
/** A workout is only ever a few kB; anything near this is not a real one. */
export const WORKOUT_MAX_BYTES = 16 * 1024;
/** A workout left open longer than this is treated as forgotten, not in progress. */
export const STALE_WORKOUT_MS = 12 * 60 * 60 * 1000;

/* ---------------------------------- types --------------------------------- */

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** Rest between sets; null = the member's default. */
  restSec: number | null;
}

export interface ProgramDay {
  id: string;
  name: string;
  exercises: ProgramExercise[];
}

export interface Program {
  id: string;
  name: string;
  days: ProgramDay[];
}

export interface TrainingSettings {
  programs: Program[];
  /** Exercises the member added themselves (`custom: true`). */
  customExercises: Exercise[];
  activeProgramId: string | null;
  /** Default rest between sets, seconds. */
  restSec: number;
}

export const DEFAULT_TRAINING: TrainingSettings = {
  programs: [],
  customExercises: [],
  activeProgramId: null,
  restSec: DEFAULT_REST_SEC,
};

export interface WorkoutSet {
  /** Pounds; for bodyweight exercises, added weight. null = not entered. */
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface SetTarget {
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  /** The name when logged, so history still reads if the exercise is deleted. */
  name: string;
  bodyweight: boolean;
  /** From the program day, when the workout came from one. */
  target: SetTarget | null;
  restSec: number | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  /** The member's local day the workout started, ISO yyyy-mm-dd. */
  date: string;
  name: string;
  programId: string | null;
  dayId: string | null;
  /** Epoch milliseconds. */
  startedAt: number;
  /** null while the workout is in progress. */
  finishedAt: number | null;
  exercises: WorkoutExercise[];
  note: string;
}

/* ------------------------------- validation ------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= max ? t : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function isValidVideoUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > VIDEO_URL_MAX) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function validTarget(v: unknown): SetTarget | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) return undefined;
  const { sets, repsMin, repsMax } = v;
  if (!isInt(sets, 1, MAX_SETS) || !isInt(repsMin, 1, MAX_REPS) || !isInt(repsMax, 1, MAX_REPS) || repsMax < repsMin) {
    return undefined;
  }
  return { sets, repsMin, repsMax };
}

const validRest = (v: unknown): number | null | undefined =>
  v === null || v === undefined ? null : isInt(v, REST_MIN_SEC, REST_MAX_SEC) ? v : undefined;

/** Validate an untrusted workout for an id. */
export function validateWorkout(raw: unknown, id: string, now: Date = new Date()): ValidationResult<Workout> {
  const bad = (error: string): ValidationResult<Workout> => ({ ok: false, error });
  if (!WORKOUT_ID_PATTERN.test(id)) return bad("Invalid workout id.");
  if (!isObj(raw)) return bad("Expected a workout.");
  if (JSON.stringify(raw).length > WORKOUT_MAX_BYTES) return bad("Workout is too large.");

  const date = raw.date;
  if (typeof date !== "string" || !isAcceptableWeighInDate(date, now)) {
    return bad("Date must be a real calendar day, not in the future.");
  }
  const name = cleanText(raw.name, NAME_MAX);
  if (!name) return bad(`Workout name must be 1–${NAME_MAX} characters.`);
  const programId = raw.programId ?? null;
  const dayId = raw.dayId ?? null;
  if (programId !== null && (typeof programId !== "string" || !ID_PATTERN.test(programId))) return bad("Invalid program.");
  if (dayId !== null && (typeof dayId !== "string" || !ID_PATTERN.test(dayId))) return bad("Invalid program day.");

  const latest = now.getTime() + 2 * 24 * 60 * 60 * 1000;
  const startedAt = raw.startedAt;
  if (!isInt(startedAt, Date.UTC(2000, 0, 1), latest)) return bad("Invalid start time.");
  const finishedAt = raw.finishedAt ?? null;
  if (finishedAt !== null && !isInt(finishedAt, startedAt, latest)) return bad("Invalid finish time.");

  const note = raw.note ?? "";
  if (typeof note !== "string" || note.length > NOTE_MAX) return bad(`Note must be ${NOTE_MAX} characters or fewer.`);

  if (!Array.isArray(raw.exercises) || raw.exercises.length > MAX_WORKOUT_EXERCISES) {
    return bad(`A workout holds up to ${MAX_WORKOUT_EXERCISES} exercises.`);
  }
  const exercises: WorkoutExercise[] = [];
  for (const e of raw.exercises as unknown[]) {
    if (!isObj(e)) return bad("Invalid exercise.");
    const exerciseId = e.exerciseId;
    if (typeof exerciseId !== "string" || !ID_PATTERN.test(exerciseId)) return bad("Invalid exercise.");
    const exName = cleanText(e.name, NAME_MAX);
    if (!exName) return bad("Each exercise needs a name.");
    const target = validTarget(e.target);
    if (target === undefined) return bad(`Invalid target for ${exName}.`);
    const restSec = validRest(e.restSec);
    if (restSec === undefined) return bad(`Rest must be ${REST_MIN_SEC}–${REST_MAX_SEC} seconds.`);
    if (!Array.isArray(e.sets) || e.sets.length > MAX_SETS) return bad(`Up to ${MAX_SETS} sets per exercise.`);
    const sets: WorkoutSet[] = [];
    for (const s of e.sets as unknown[]) {
      if (!isObj(s)) return bad("Invalid set.");
      const weight = s.weight ?? null;
      const reps = s.reps ?? null;
      if (weight !== null && !isNum(weight, 0, MAX_WEIGHT_LB)) return bad(`Weight must be 0–${MAX_WEIGHT_LB} lb.`);
      if (reps !== null && !isInt(reps, 0, MAX_REPS)) return bad(`Reps must be a whole number up to ${MAX_REPS}.`);
      if (typeof s.done !== "boolean") return bad("Invalid set.");
      if (s.done && (reps === null || reps < 1)) return bad("A completed set needs at least 1 rep.");
      sets.push({ weight: weight === null ? null : round2(weight), reps, done: s.done });
    }
    exercises.push({ exerciseId, name: exName, bodyweight: e.bodyweight === true, target, restSec, sets });
  }

  return {
    ok: true,
    value: { id, date, name, programId, dayId, startedAt, finishedAt, exercises, note: note.trim() },
  };
}

/* ------------------------ settings (the plan document) ------------------------ */

function sanitizeProgramExercise(v: unknown): ProgramExercise | null {
  if (!isObj(v)) return null;
  const { exerciseId, sets, repsMin, repsMax } = v;
  if (typeof exerciseId !== "string" || !ID_PATTERN.test(exerciseId)) return null;
  if (!isInt(sets, 1, MAX_SETS) || !isInt(repsMin, 1, MAX_REPS) || !isInt(repsMax, 1, MAX_REPS) || repsMax < repsMin) return null;
  const restSec = validRest(v.restSec);
  return { exerciseId, sets, repsMin, repsMax, restSec: restSec === undefined ? null : restSec };
}

function sanitizeProgram(v: unknown): Program | null {
  if (!isObj(v) || typeof v.id !== "string" || !ID_PATTERN.test(v.id)) return null;
  const days: ProgramDay[] = [];
  const dayIds = new Set<string>();
  for (const d of Array.isArray(v.days) ? v.days : []) {
    if (days.length >= MAX_DAYS) break;
    if (!isObj(d) || typeof d.id !== "string" || !ID_PATTERN.test(d.id) || dayIds.has(d.id)) continue;
    dayIds.add(d.id);
    const exercises = (Array.isArray(d.exercises) ? d.exercises : [])
      .map(sanitizeProgramExercise)
      .filter((e): e is ProgramExercise => e !== null)
      .slice(0, MAX_DAY_EXERCISES);
    days.push({ id: d.id, name: cleanText(d.name, DAY_NAME_MAX) ?? `Day ${days.length + 1}`, exercises });
  }
  return { id: v.id, name: cleanText(v.name, NAME_MAX) ?? "My program", days };
}

/** A member's own exercise, from anything. */
export function sanitizeCustomExercise(v: unknown): Exercise | null {
  if (!isObj(v) || typeof v.id !== "string" || !ID_PATTERN.test(v.id) || libraryExercise(v.id)) return null;
  const name = cleanText(v.name, NAME_MAX);
  if (!name) return null;
  const muscle = (MUSCLES as readonly string[]).includes(v.muscle as string) ? (v.muscle as Muscle) : "core";
  const equipment = (EQUIPMENT as readonly string[]).includes(v.equipment as string) ? (v.equipment as Equipment) : "other";
  const cues = (Array.isArray(v.cues) ? v.cues : [])
    .map((c) => cleanText(c, CUE_MAX))
    .filter((c): c is string => c !== null)
    .slice(0, 3);
  return {
    id: v.id,
    name,
    muscle,
    equipment,
    cues,
    bodyweight: v.bodyweight === true,
    video: isValidVideoUrl(v.video) ? v.video : null,
    custom: true,
  };
}

/** Rebuild trusted training settings from anything. Never throws. */
export function sanitizeTraining(raw: unknown): TrainingSettings {
  if (!isObj(raw)) return DEFAULT_TRAINING;
  const programs: Program[] = [];
  for (const p of Array.isArray(raw.programs) ? raw.programs : []) {
    if (programs.length >= MAX_PROGRAMS) break;
    const clean = sanitizeProgram(p);
    if (clean && !programs.some((x) => x.id === clean.id)) programs.push(clean);
  }
  const customExercises: Exercise[] = [];
  for (const e of Array.isArray(raw.customExercises) ? raw.customExercises : []) {
    if (customExercises.length >= MAX_CUSTOM_EXERCISES) break;
    const clean = sanitizeCustomExercise(e);
    if (clean && !customExercises.some((x) => x.id === clean.id)) customExercises.push(clean);
  }
  // A program can only refer to exercises that exist.
  for (const p of programs) {
    for (const d of p.days) d.exercises = d.exercises.filter((e) => findExercise(e.exerciseId, customExercises));
  }
  const active = typeof raw.activeProgramId === "string" && programs.some((p) => p.id === raw.activeProgramId)
    ? raw.activeProgramId
    : null;
  const restSec = isInt(raw.restSec, REST_MIN_SEC, REST_MAX_SEC) ? raw.restSec : DEFAULT_REST_SEC;
  return { programs, customExercises, activeProgramId: active, restSec };
}

/* -------------------------------- templates ------------------------------- */

type TemplateExercise = [exerciseId: string, sets: number, repsMin: number, repsMax: number, restSec: number | null];

export interface ProgramTemplate {
  id: string;
  name: string;
  summary: string;
  days: { name: string; exercises: TemplateExercise[] }[];
}

// Main lifts rest 3:00; everything else uses the member's default (2:30 unless changed).
export const TEMPLATES: readonly ProgramTemplate[] = [
  {
    id: "full-body",
    name: "Full body",
    summary: "2 workouts, alternated 3 days a week. Good for beginners or a busy schedule.",
    days: [
      {
        name: "Full body A",
        exercises: [
          ["back-squat", 3, 6, 8, 180],
          ["bench-press", 3, 6, 8, 180],
          ["barbell-row", 3, 8, 10, null],
          ["romanian-deadlift", 2, 8, 10, null],
          ["lateral-raise", 2, 12, 15, null],
          ["cable-crunch", 2, 12, 15, null],
        ],
      },
      {
        name: "Full body B",
        exercises: [
          ["leg-press", 3, 10, 12, null],
          ["overhead-press", 3, 6, 8, 180],
          ["lat-pulldown", 3, 8, 12, null],
          ["incline-db-press", 3, 8, 12, null],
          ["lying-leg-curl", 2, 10, 12, null],
          ["db-curl", 2, 10, 12, null],
          ["triceps-pushdown", 2, 10, 12, null],
        ],
      },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    summary: "4 days a week: each muscle trained twice, with one heavier and one lighter day.",
    days: [
      {
        name: "Upper A",
        exercises: [
          ["bench-press", 3, 6, 8, 180],
          ["barbell-row", 3, 6, 8, 180],
          ["db-shoulder-press", 3, 8, 10, null],
          ["lat-pulldown", 3, 8, 12, null],
          ["barbell-curl", 2, 10, 12, null],
          ["triceps-pushdown", 2, 10, 12, null],
        ],
      },
      {
        name: "Lower A",
        exercises: [
          ["back-squat", 3, 6, 8, 180],
          ["romanian-deadlift", 3, 8, 10, 180],
          ["leg-press", 2, 10, 12, null],
          ["lying-leg-curl", 3, 10, 12, null],
          ["standing-calf-raise", 3, 10, 15, null],
        ],
      },
      {
        name: "Upper B",
        exercises: [
          ["incline-db-press", 3, 8, 10, null],
          ["pull-up", 3, 6, 10, null],
          ["machine-chest-press", 2, 10, 12, null],
          ["seated-cable-row", 3, 10, 12, null],
          ["lateral-raise", 3, 12, 15, null],
          ["hammer-curl", 2, 10, 12, null],
          ["overhead-triceps-extension", 2, 10, 12, null],
        ],
      },
      {
        name: "Lower B",
        exercises: [
          ["deadlift", 2, 4, 6, 180],
          ["bulgarian-split-squat", 3, 8, 10, null],
          ["hip-thrust", 3, 8, 12, null],
          ["leg-extension", 3, 12, 15, null],
          ["seated-leg-curl", 3, 10, 12, null],
          ["seated-calf-raise", 3, 12, 15, null],
        ],
      },
    ],
  },
  {
    id: "push-pull-legs",
    name: "Push / Pull / Legs",
    summary: "3 days in rotation. Run it 3 days a week, or twice through for 6.",
    days: [
      {
        name: "Push",
        exercises: [
          ["bench-press", 3, 6, 8, 180],
          ["overhead-press", 3, 6, 8, 180],
          ["incline-db-press", 3, 8, 12, null],
          ["lateral-raise", 3, 12, 15, null],
          ["triceps-pushdown", 3, 10, 12, null],
          ["overhead-triceps-extension", 2, 10, 12, null],
        ],
      },
      {
        name: "Pull",
        exercises: [
          ["barbell-row", 3, 6, 8, 180],
          ["lat-pulldown", 3, 8, 12, null],
          ["seated-cable-row", 3, 10, 12, null],
          ["face-pull", 3, 12, 15, null],
          ["barbell-curl", 3, 8, 12, null],
          ["hammer-curl", 2, 10, 12, null],
        ],
      },
      {
        name: "Legs",
        exercises: [
          ["back-squat", 3, 6, 8, 180],
          ["romanian-deadlift", 3, 8, 10, 180],
          ["leg-press", 3, 10, 12, null],
          ["leg-extension", 2, 12, 15, null],
          ["lying-leg-curl", 3, 10, 12, null],
          ["standing-calf-raise", 3, 10, 15, null],
        ],
      },
    ],
  },
];

/** A new program from a template, with fresh ids. */
export function programFromTemplate(template: ProgramTemplate, newId: () => string): Program {
  return {
    id: newId(),
    name: template.name,
    days: template.days.map((d, i) => ({
      id: `d${i + 1}`,
      name: d.name,
      exercises: d.exercises.map(([exerciseId, sets, repsMin, repsMax, restSec]) => ({ exerciseId, sets, repsMin, repsMax, restSec })),
    })),
  };
}

/** A day id not used yet in a program. */
export function nextDayId(program: Program): string {
  let n = program.days.length + 1;
  while (program.days.some((d) => d.id === `d${n}`)) n++;
  return `d${n}`;
}

/* --------------------------------- lookups -------------------------------- */

/** An exercise by id: the member's own first, then the library. */
export function findExercise(id: string, custom: readonly Exercise[]): Exercise | undefined {
  return custom.find((e) => e.id === id) ?? libraryExercise(id);
}

/** Every exercise a member can pick: the library plus their own. */
export function allExercises(custom: readonly Exercise[]): Exercise[] {
  return [...custom, ...LIBRARY];
}

/* ------------------------------ the numbers ------------------------------ */

/** Estimated one-rep max (Epley). A single is its own max. */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export interface DoneSet {
  weight: number;
  reps: number;
}

export function doneSets(e: WorkoutExercise): DoneSet[] {
  return e.sets.filter((s) => s.done && s.reps !== null && s.reps > 0).map((s) => ({ weight: s.weight ?? 0, reps: s.reps! }));
}

const byTime = (a: Workout, b: Workout) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1);

export interface ExerciseSession {
  workoutId: string;
  date: string;
  sets: DoneSet[];
  /** Best estimated one-rep max of the session (weighted exercises). */
  e1rm: number;
  /** Heaviest weight lifted for at least one rep. */
  bestWeight: number;
  /** Most reps in one set. */
  bestReps: number;
  /** Weight × reps over all sets, pounds. */
  volume: number;
  totalReps: number;
  /** Which numbers beat every earlier session. */
  records: { e1rm: boolean; weight: boolean; reps: boolean; volume: boolean };
}

/** Every session of one exercise, oldest first, with personal records marked. */
export function exerciseHistory(workouts: readonly Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  const best = { e1rm: 0, weight: 0, reps: 0, volume: 0 };
  for (const w of [...workouts].sort(byTime)) {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(doneSets);
    if (sets.length === 0) continue;
    const s = {
      e1rm: Math.max(...sets.map((x) => e1rm(x.weight, x.reps))),
      weight: Math.max(...sets.map((x) => x.weight)),
      reps: Math.max(...sets.map((x) => x.reps)),
      volume: sets.reduce((sum, x) => sum + x.weight * x.reps, 0),
    };
    // The first session is the baseline, not a record.
    const first = out.length === 0;
    const records = {
      e1rm: !first && s.e1rm > best.e1rm,
      weight: !first && s.weight > best.weight,
      reps: !first && s.reps > best.reps,
      volume: !first && s.volume > best.volume,
    };
    best.e1rm = Math.max(best.e1rm, s.e1rm);
    best.weight = Math.max(best.weight, s.weight);
    best.reps = Math.max(best.reps, s.reps);
    best.volume = Math.max(best.volume, s.volume);
    out.push({
      workoutId: w.id,
      date: w.date,
      sets,
      e1rm: s.e1rm,
      bestWeight: s.weight,
      bestReps: s.reps,
      volume: s.volume,
      totalReps: sets.reduce((sum, x) => sum + x.reps, 0),
      records,
    });
  }
  return out;
}

/** Whether a session's records count for this kind of exercise. */
export function isRecordSession(s: ExerciseSession, bodyweight: boolean): boolean {
  return bodyweight ? s.records.reps : s.records.e1rm || s.records.weight;
}

/** The completed sets from the last time an exercise was done, other than in `excludeId`. */
export function lastPerformance(workouts: readonly Workout[], exerciseId: string, excludeId?: string): DoneSet[] {
  const sorted = [...workouts].sort(byTime).reverse();
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(doneSets);
    if (sets.length > 0) return sets;
  }
  return [];
}

/** Best numbers for an exercise before (not including) one workout. */
export function bestBefore(workouts: readonly Workout[], exerciseId: string, excludeId: string): { e1rm: number; reps: number } {
  let best = { e1rm: 0, reps: 0 };
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    for (const s of w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap(doneSets)) {
      best = { e1rm: Math.max(best.e1rm, e1rm(s.weight, s.reps)), reps: Math.max(best.reps, s.reps) };
    }
  }
  return best;
}

/** New set rows, filled in from last time so the member only changes what's different. */
export function prefillSets(count: number, last: readonly DoneSet[], bodyweight: boolean): WorkoutSet[] {
  return Array.from({ length: count }, (_, i) => {
    const prev = last[i] ?? last[last.length - 1];
    return {
      weight: prev ? (bodyweight && prev.weight === 0 ? null : prev.weight) : null,
      reps: prev ? prev.reps : null,
      done: false,
    };
  });
}

/** A nudge to add weight when every target set reached the top of the rep range last time. */
export function shouldAddWeight(target: SetTarget | null, last: readonly DoneSet[]): boolean {
  if (!target || last.length < target.sets) return false;
  return last.slice(0, target.sets).every((s) => s.reps >= target.repsMax);
}

/** A workout exercise for a program-day entry. */
export function workoutExerciseFor(
  pe: ProgramExercise,
  exercise: Exercise | undefined,
  workouts: readonly Workout[],
): WorkoutExercise {
  const bodyweight = exercise?.bodyweight ?? false;
  return {
    exerciseId: pe.exerciseId,
    name: exercise?.name ?? "Unknown exercise",
    bodyweight,
    target: { sets: pe.sets, repsMin: pe.repsMin, repsMax: pe.repsMax },
    restSec: pe.restSec,
    sets: prefillSets(pe.sets, lastPerformance(workouts, pe.exerciseId), bodyweight),
  };
}

/** The program day to do next: the one after the last finished workout from this program. */
export function nextProgramDay(program: Program, workouts: readonly Workout[]): ProgramDay | null {
  if (program.days.length === 0) return null;
  const last = [...workouts]
    .filter((w) => w.finishedAt !== null && w.programId === program.id && program.days.some((d) => d.id === w.dayId))
    .sort(byTime)
    .pop();
  if (!last) return program.days[0]!;
  const i = program.days.findIndex((d) => d.id === last.dayId);
  return program.days[(i + 1) % program.days.length]!;
}

/** The workout in progress, if any: unfinished and started within the last 12 hours. */
export function activeWorkout(workouts: readonly Workout[], now: number = Date.now()): Workout | null {
  const open = workouts.filter((w) => w.finishedAt === null && now - w.startedAt < STALE_WORKOUT_MS);
  return open.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

export interface WorkoutSummary {
  exercises: number;
  sets: number;
  reps: number;
  /** Pounds lifted (weight × reps). */
  volume: number;
  /** null while in progress. */
  durationMs: number | null;
}

export function summarizeWorkout(w: Workout): WorkoutSummary {
  const all = w.exercises.map(doneSets);
  const flat = all.flat();
  return {
    exercises: all.filter((s) => s.length > 0).length,
    sets: flat.length,
    reps: flat.reduce((n, s) => n + s.reps, 0),
    volume: flat.reduce((n, s) => n + s.weight * s.reps, 0),
    durationMs: w.finishedAt === null ? null : w.finishedAt - w.startedAt,
  };
}

/* -------------------------------- display -------------------------------- */

/** A weight for display in the member's unit: at most one decimal. */
export function formatLoad(lb: number, unit: WeightUnit): string {
  return String(Math.round(fromLb(lb, unit) * 10) / 10);
}

/** One set as text: "185 × 10", "BW × 12" or "BW+25 × 8". */
export function formatSet(s: DoneSet, unit: WeightUnit, bodyweight: boolean): string {
  if (bodyweight) return s.weight > 0 ? `BW+${formatLoad(s.weight, unit)} × ${s.reps}` : `BW × ${s.reps}`;
  return `${formatLoad(s.weight, unit)} × ${s.reps}`;
}

/** What a workout moved: "3,000 lb", or "24 reps" when it was all bodyweight. */
export function formatWork(s: WorkoutSummary, unit: WeightUnit): string {
  return s.volume > 0 ? `${Math.round(fromLb(s.volume, unit)).toLocaleString()} ${unit}` : `${s.reps} reps`;
}

/** Seconds as m:ss. */
export function formatRest(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A duration as "1 h 05 min" or "48 min". */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

export function formatTarget(t: SetTarget): string {
  return `${t.sets} × ${t.repsMin === t.repsMax ? t.repsMin : `${t.repsMin}–${t.repsMax}`}`;
}
