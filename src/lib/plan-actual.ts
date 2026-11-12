/**
 * Plan vs actual: each day of a month, what the program planned against what
 * the member actually did (coach: a member → Training → Program & calendar;
 * member: Training → Tools).
 *
 *   done    the planned session (on its day, or moved: done within a few days),
 *           or another day of the program done in its place (swapped)
 *   part    the planned session, cut short: a planned exercise skipped or
 *           fewer sets than planned
 *   missed  planned, nothing logged and no rest day marked
 *   rest    a rest day ticked on a planned day: excused, so it doesn't count
 *           against workout adherence (see restExcused)
 *   off     nothing planned, nothing logged: a normal day off
 *   extra   a workout the plan didn't have
 *   today / planned   still to come
 *
 * Planned days come from the program's calendar (sessionStates, which matches
 * moved workouts), so only programs on a calendar have a plan here; without
 * one, every workout shows as done and rest days as rest.
 */

import { addDays } from "./dates";
import { REST_KEY } from "./habits";
import { sessionStates } from "./program-schedule";
import type { Exercise } from "./exercises";
import { doneSets, exerciseHistory, findExercise, isRecordSession, type Program, type ProgramDay, type Workout } from "./training";

export type DayKind = "done" | "part" | "missed" | "rest" | "off" | "extra" | "today" | "planned";

export interface PlanDay {
  date: string;
  kind: DayKind;
  /** The planned session's day (Upper A…), when one was planned. */
  plan: ProgramDay | null;
  /** The workout(s) that day: the one matched to the plan first. */
  workouts: Workout[];
  /** Done on another day than planned (the arrow): the date it was planned for, on the day it was done. */
  movedFrom: string | null;
  /** Planned here but done on another day. */
  movedTo: string | null;
  /** Another program day was done instead of the planned one: the planned day's name (`plan` is then the day done). */
  swappedFrom: string | null;
  /** A personal record in one of the day's workouts. */
  record: boolean;
}

export interface MonthSummary {
  done: number;
  part: number;
  missed: number;
  rest: number;
  extra: number;
}

/** The workout's entries that count for a planned exercise: it, and anything swapped in for it. */
const forPlanned = (w: Workout | null, id: string) =>
  (w?.exercises ?? []).filter((e) => e.exerciseId === id || e.swappedFrom === id);

/** Is a planned workout cut short: a planned exercise skipped, or fewer sets than planned? */
export function cutShort(plan: ProgramDay, w: Workout): boolean {
  return plan.exercises.some((pe) => forPlanned(w, pe.exerciseId).flatMap(doneSets).length < pe.sets);
}

/** Workouts with a personal record (the logger's own rule: e1RM or weight, or reps for bodyweight). */
export function recordWorkouts(workouts: readonly Workout[]): Set<string> {
  const finished = workouts.filter((w) => w.finishedAt !== null);
  const ids = new Set<string>();
  const lifts = new Map<string, boolean>();
  for (const w of finished) for (const e of w.exercises) if (!lifts.has(e.exerciseId)) lifts.set(e.exerciseId, e.bodyweight);
  for (const [id, bodyweight] of lifts) for (const s of exerciseHistory(finished, id)) if (isRecordSession(s, bodyweight)) ids.add(s.workoutId);
  return ids;
}

/**
 * Every day of the month holding `monthStart` (any day of it). `restDays`:
 * the dates they ticked "rest day" on.
 */
export function planVsActual(
  program: Program | null,
  workouts: readonly Workout[],
  restDays: ReadonlySet<string>,
  monthStart: string,
  today: string,
): { days: PlanDay[]; summary: MonthSummary } {
  const first = monthStart.slice(0, 8) + "01";
  const finished = workouts.filter((w) => w.finishedAt !== null);
  const records = recordWorkouts(finished);
  // The plan: sessions on the calendar, with the workout that counts for each.
  const states = program?.schedule ? sessionStates(program, finished, today) : [];
  const planned = new Map(states.map((s) => [s.date, s]));
  const matched = new Set(states.filter((s) => s.workout).map((s) => s.workout!.id));
  // The calendar's own dates: a workout outside them is just a workout, not extra to a plan.
  const sc = program?.schedule ?? null;
  const inPlan = (d: string) => !!sc && d >= sc.startDate && d <= addDays(sc.startDate, sc.weeks * 7 - 1);
  const doneOn = new Map<string, (typeof states)[number]>();
  for (const s of states) if (s.workout && s.moved) doneOn.set(s.workout.date, s);

  // A different program day done for a session (Lower A on Upper A's day) counts as done, not
  // cut short: it's shown as the day they did, swapped for the planned one.
  const doneAs = (planDay: ProgramDay, w: Workout) => {
    const other = w.dayId && w.dayId !== planDay.id ? program?.days.find((x) => x.id === w.dayId) : undefined;
    return other
      ? { plan: other, swappedFrom: planDay.name, kind: "done" as const }
      : { plan: planDay, swappedFrom: null, kind: cutShort(planDay, w) ? ("part" as const) : ("done" as const) };
  };

  const days: PlanDay[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) {
    const own = finished.filter((w) => w.date === d);
    const s = planned.get(d);
    const moved = doneOn.get(d);
    const base = { date: d, plan: s?.day ?? null, movedFrom: null as string | null, movedTo: null as string | null, swappedFrom: null as string | null, record: own.some((w) => records.has(w.id)) };
    let day: PlanDay;
    if (s) {
      if (s.workout && !s.moved) {
        day = { ...base, ...doneAs(s.day, s.workout), workouts: [s.workout, ...own.filter((w) => w.id !== s.workout!.id)] };
      } else if (s.workout && s.moved) {
        // Done another day: shown there; here it's the plan that moved.
        day = { ...base, kind: own.length ? "extra" : "off", workouts: own, movedTo: s.workout.date };
      } else if (restDays.has(d)) {
        day = { ...base, kind: "rest", workouts: own };
      } else {
        day = { ...base, kind: s.status === "missed" ? "missed" : s.status === "today" ? "today" : "planned", workouts: own };
      }
    } else if (moved) {
      const w = moved.workout!;
      day = { ...base, ...doneAs(moved.day, w), workouts: [w, ...own.filter((x) => x.id !== w.id)], movedFrom: moved.date };
    } else if (own.length) {
      // On the plan's calendar but not matched to a session, or no calendar at all.
      day = { ...base, kind: inPlan(d) && own.every((w) => !matched.has(w.id)) ? "extra" : "done", workouts: own };
    } else {
      day = { ...base, kind: restDays.has(d) ? "rest" : "off", workouts: [] };
    }
    days.push(day);
  }
  const count = (k: DayKind) => days.filter((x) => x.kind === k).length;
  return {
    days,
    summary: {
      // Against the plan only: a workout from before (or without) a calendar wasn't planned.
      done: days.filter((x) => x.kind === "done" && x.plan).length,
      part: count("part"),
      missed: count("missed"),
      // Rest taken on a day with a planned session (the excused ones).
      rest: days.filter((x) => x.kind === "rest" && x.plan).length,
      extra: count("extra"),
    },
  };
}

export interface ExerciseLine {
  exerciseId: string;
  name: string;
  /** "3×6–8", null for an exercise the plan didn't have. */
  target: string | null;
  sets: { weight: number; reps: number; side?: { lw: number; l: number; rw: number; r: number } }[];
  status: "hit" | "short" | "skipped" | "extra";
}

/** A planned day against a workout, exercise by exercise; exercises they added come last. */
export function dayLines(plan: ProgramDay | null, workout: Workout | null, custom: readonly Exercise[]): ExerciseLine[] {
  const nameOf = (id: string) => workout?.exercises.find((e) => e.exerciseId === id)?.name ?? findExercise(id, custom)?.name ?? "Exercise";
  const setsOf = (id: string, planned = false) =>
    (planned ? forPlanned(workout, id) : (workout?.exercises ?? []).filter((e) => e.exerciseId === id)).flatMap(doneSets)
      .map((s) => ({
        weight: s.weight,
        reps: s.reps,
        // A weight per side: both sides, for the day panel.
        ...(s.leftWeight !== undefined && s.rightWeight !== undefined ? { side: { lw: s.leftWeight, l: s.left ?? 0, rw: s.rightWeight, r: s.right ?? 0 } } : {}),
      }));
  const lines: ExerciseLine[] = (plan?.exercises ?? []).map((pe) => {
    const sets = setsOf(pe.exerciseId, true);
    // Swapped mid-workout: "Bench press → Machine chest press".
    const swaps = [...new Set((workout?.exercises ?? []).filter((e) => e.swappedFrom === pe.exerciseId && e.exerciseId !== pe.exerciseId).map((e) => e.name))];
    return {
      exerciseId: pe.exerciseId,
      name: swaps.length ? `${nameOf(pe.exerciseId)} → ${swaps.join(", ")}` : nameOf(pe.exerciseId),
      target: `${pe.sets}×${pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}`,
      sets,
      status: !workout ? "skipped" : sets.length === 0 ? "skipped" : sets.length < pe.sets ? "short" : "hit",
    };
  });
  for (const e of workout?.exercises ?? []) {
    if (plan?.exercises.some((pe) => pe.exerciseId === e.exerciseId || pe.exerciseId === e.swappedFrom) || lines.some((l) => l.exerciseId === e.exerciseId)) continue;
    const sets = setsOf(e.exerciseId);
    // "Added" only against a plan; without one it's simply what they did.
    if (sets.length) lines.push({ exerciseId: e.exerciseId, name: e.name, target: null, sets, status: plan ? "extra" : "hit" });
  }
  return lines;
}

/** Dates they ticked "rest day" on, from habit logs. */
export function restDaysOf(logs: readonly { date: string; entries: Record<string, unknown> }[]): Set<string> {
  return new Set(logs.filter((l) => l.entries[REST_KEY] === true).map((l) => l.date));
}
