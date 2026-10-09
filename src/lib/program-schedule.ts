/**
 * Program calendars: a coach can put an assigned program on dates — a start
 * date, training weekdays and a number of weeks. Each training day in that
 * window is a session, taking the program's days in order (Upper A, Lower A,
 * Upper B, Lower B, Upper A, …), so the member sees exactly which workout is
 * planned for which day.
 *
 * Logged workouts from the program are matched to sessions: on the planned
 * day, or moved a few days either way (did Monday's on Tuesday) — so a moved
 * workout counts as done, not as one missed and one extra.
 *
 * Weekdays are 0 = Monday … 6 = Sunday, like the rest of the app.
 */

import { addDays, daysBetween, isValidISODate, parseISODate } from "./dates";
import type { Program, ProgramDay, Workout } from "./training";

export interface ProgramSchedule {
  startDate: string;
  /** Training weekdays, 0 = Monday … 6 = Sunday, ascending. */
  weekdays: number[];
  weeks: number;
  /** The coach's note when they sent it. */
  note: string;
}

export const MAX_SCHEDULE_WEEKS = 26;
export const SCHEDULE_NOTE_MAX = 300;
/** How far a workout can move from its planned day and still count for it. */
const MOVE_WINDOW_DAYS = 3;

export const weekdayOf = (iso: string) => (parseISODate(iso).getUTCDay() + 6) % 7;

export function sanitizeSchedule(raw: unknown): ProgramSchedule | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.startDate !== "string" || !isValidISODate(s.startDate)) return undefined;
  const weekdays = Array.isArray(s.weekdays)
    ? [...new Set(s.weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b)
    : [];
  if (weekdays.length === 0) return undefined;
  const weeks = typeof s.weeks === "number" && Number.isInteger(s.weeks) && s.weeks >= 1 && s.weeks <= MAX_SCHEDULE_WEEKS ? s.weeks : null;
  if (weeks === null) return undefined;
  const note = typeof s.note === "string" ? s.note.trim().slice(0, SCHEDULE_NOTE_MAX) : "";
  return { startDate: s.startDate, weekdays, weeks, note };
}

/** Sensible training days for a program with this many days. */
export function defaultWeekdays(days: number): number[] {
  switch (Math.max(1, Math.min(7, days))) {
    case 1:
      return [0];
    case 2:
      return [0, 3];
    case 3:
      return [0, 2, 4];
    case 4:
      return [0, 1, 3, 4];
    case 5:
      return [0, 1, 2, 3, 4];
    case 6:
      return [0, 1, 2, 3, 4, 5];
    default:
      return [0, 1, 2, 3, 4, 5, 6];
  }
}

/** The coming Monday (today if it is one). */
export function nextMonday(today: string): string {
  return addDays(today, (7 - weekdayOf(today)) % 7);
}

export interface Session {
  date: string;
  /** 0-based, in date order. */
  index: number;
  day: ProgramDay;
}

/** Every planned session, in date order. */
export function scheduleSessions(program: Program): Session[] {
  const s = program.schedule;
  if (!s || program.days.length === 0) return [];
  const out: Session[] = [];
  const days = s.weeks * 7;
  for (let i = 0; i < days; i++) {
    const date = addDays(s.startDate, i);
    if (!s.weekdays.includes(weekdayOf(date))) continue;
    out.push({ date, index: out.length, day: program.days[out.length % program.days.length]! });
  }
  return out;
}

/** The last day of the plan. */
export function scheduleEnd(program: Program): string | null {
  return program.schedule ? addDays(program.schedule.startDate, program.schedule.weeks * 7 - 1) : null;
}

export type SessionStatus = "done" | "missed" | "today" | "upcoming";

export interface SessionState extends Session {
  status: SessionStatus;
  /** The workout that counts for it, when done. */
  workout: Workout | null;
  /** Done on a different day than planned. */
  moved: boolean;
}

/**
 * Each session's state. A finished workout from this program counts for the
 * session on its date; otherwise for the nearest open session within a few
 * days (preferring one with the same program day).
 */
export function sessionStates(program: Program, workouts: readonly Workout[], today: string): SessionState[] {
  const sessions = scheduleSessions(program);
  const done = workouts
    .filter((w) => w.finishedAt !== null && w.programId === program.id)
    .sort((a, b) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1));
  const byIndex = new Map<number, { workout: Workout; moved: boolean }>();
  const leftover: Workout[] = [];
  for (const w of done) {
    const exact = sessions.find((s) => s.date === w.date && !byIndex.has(s.index));
    if (exact) byIndex.set(exact.index, { workout: w, moved: false });
    else leftover.push(w);
  }
  for (const w of leftover) {
    const open = sessions.filter((s) => !byIndex.has(s.index) && Math.abs(daysBetween(s.date, w.date)) <= MOVE_WINDOW_DAYS);
    if (open.length === 0) continue;
    const sameDay = open.filter((s) => s.day.id === w.dayId);
    const pick = (sameDay.length > 0 ? sameDay : open).sort(
      (a, b) => Math.abs(daysBetween(a.date, w.date)) - Math.abs(daysBetween(b.date, w.date)) || a.index - b.index,
    )[0]!;
    byIndex.set(pick.index, { workout: w, moved: true });
  }
  return sessions.map((s) => {
    const hit = byIndex.get(s.index);
    const status: SessionStatus = hit ? "done" : s.date < today ? "missed" : s.date === today ? "today" : "upcoming";
    return { ...s, status, workout: hit?.workout ?? null, moved: hit?.moved ?? false };
  });
}

export type PlanToday =
  | { kind: "not-started"; next: SessionState }
  | { kind: "today"; session: SessionState }
  | { kind: "done-today"; session: SessionState; next: SessionState | null }
  | { kind: "rest"; next: SessionState | null }
  | { kind: "finished"; end: string };

/** What the plan says about today, or null for a program without a calendar. */
export function planToday(program: Program, workouts: readonly Workout[], today: string): PlanToday | null {
  if (!program.schedule) return null;
  const states = sessionStates(program, workouts, today);
  if (states.length === 0) return null;
  const end = scheduleEnd(program)!;
  if (today < program.schedule.startDate) return { kind: "not-started", next: states[0]! };
  const upcoming = states.find((s) => s.date > today && s.status === "upcoming") ?? null;
  const todays = states.find((s) => s.date === today);
  if (todays?.status === "today") return { kind: "today", session: todays };
  if (todays?.status === "done") return { kind: "done-today", session: todays, next: upcoming };
  // A workout from the plan done today on a rest day (moved) counts as done today.
  const movedToday = states.find((s) => s.workout?.date === today);
  if (movedToday) return { kind: "done-today", session: movedToday, next: upcoming };
  if (today > end) return { kind: "finished", end };
  return { kind: "rest", next: upcoming };
}

export function scheduleSummary(program: Program, workouts: readonly Workout[], today: string) {
  const states = sessionStates(program, workouts, today);
  return {
    total: states.length,
    done: states.filter((s) => s.status === "done").length,
    missed: states.filter((s) => s.status === "missed").length,
  };
}
