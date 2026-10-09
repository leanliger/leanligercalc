/**
 * Coach assignments: a coach (admin of the whop) sends a training program or
 * a set of daily habits to everyone, a saved group, or one member. Each
 * member gets a Whop notification and a card in the app, and taps to use it:
 * a program is added to their programs and made active; a habit set replaces
 * their daily non-negotiables (past ticks stay). They can also say Not now.
 *
 * Assigning never reads a member's data, so it doesn't need them to share
 * their progress; the coach sees only whether each one used it.
 * Shared by the browser and the Worker (worker/assignments.ts).
 */

import { EXPERIENCE_ID_PATTERN } from "./fasting";
import { MAX_HABITS, sanitizeHabitDefs, type HabitDef } from "./habits";
import { COMPANY_ID_PATTERN } from "./coach-api";
import { MAX_PROGRAMS, findExercise, sanitizeProgram, type Program, type TrainingSettings } from "./training";
import type { ValidationResult } from "./tracking";

export type AssignmentKind = "program" | "habits";
export type AssignmentStatus = "pending" | "accepted" | "declined";

export const ASSIGNMENT_NOTE_MAX = 300;
export const HABIT_SET_NAME_MAX = 40;
export const GROUP_NAME_MAX = 40;
export const MAX_GROUP_MEMBERS = 1000;
export const MAX_GROUPS = 50;
export const ASSIGNMENT_ID_PATTERN = /^[0-9a-f]{32}$/;
const MEMBER_ID_PATTERN = /^user_[A-Za-z0-9_]{1,40}$/;

export type AssignmentTarget = { type: "all" } | { type: "group"; groupId: string } | { type: "members"; memberIds: string[] };

export interface AssignmentInput {
  company: string;
  kind: AssignmentKind;
  title: string;
  program: Program | null;
  habits: HabitDef[] | null;
  note: string;
  target: AssignmentTarget;
}

/** What a member sees: the assignment to use, or say Not now. */
export interface MemberAssignment {
  id: string;
  kind: AssignmentKind;
  title: string;
  note: string;
  createdAt: string;
  program: Program | null;
  habits: HabitDef[] | null;
}

/** The coach's list. */
export interface CoachAssignment {
  id: string;
  kind: AssignmentKind;
  title: string;
  note: string;
  /** "Everyone", a group's name, or a member's name. */
  audience: string;
  createdAt: string;
  cancelled: boolean;
  counts: { sent: number; accepted: number; declined: number; pending: number };
}

export interface CoachGroup {
  id: string;
  name: string;
  memberIds: string[];
}

const tidy = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * A program for members: library exercises only (a coach's own exercises
 * don't exist in members' apps), no empty days, at least one exercise.
 */
export function cleanAssignedProgram(raw: unknown): Program | null {
  const p = sanitizeProgram(raw);
  if (!p) return null;
  const days = p.days
    .map((d) => ({ ...d, exercises: d.exercises.filter((e) => findExercise(e.exerciseId, [])) }))
    .filter((d) => d.exercises.length > 0);
  return days.length > 0 ? { ...p, days } : null;
}

export function validateAssignment(raw: unknown): ValidationResult<AssignmentInput> {
  const bad = (error: string): ValidationResult<AssignmentInput> => ({ ok: false, error });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad("Expected an assignment.");
  const b = raw as Record<string, unknown>;
  if (typeof b.company !== "string" || !COMPANY_ID_PATTERN.test(b.company)) return bad("Open the dashboard from your Whop.");
  if (b.kind !== "program" && b.kind !== "habits") return bad("Pick a program or a habit set.");
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > ASSIGNMENT_NOTE_MAX) return bad(`Keep the note to ${ASSIGNMENT_NOTE_MAX} characters.`);

  let program: Program | null = null;
  let habits: HabitDef[] | null = null;
  let title = "";
  if (b.kind === "program") {
    program = cleanAssignedProgram(b.program);
    if (!program) return bad("Add at least one exercise to the program.");
    title = program.name;
    // The note travels with the calendar, so members see it on their plan.
    if (program.schedule) program = { ...program, schedule: { ...program.schedule, note } };
  } else {
    if (!Array.isArray(b.habits) || b.habits.length === 0) return bad("Add at least one habit.");
    habits = sanitizeHabitDefs(b.habits).slice(0, MAX_HABITS);
    if (habits.length === 0) return bad("Add at least one habit.");
    title = tidy(b.title, HABIT_SET_NAME_MAX) || "Daily habits";
  }

  const t = (typeof b.target === "object" && b.target !== null ? b.target : {}) as Record<string, unknown>;
  let target: AssignmentTarget;
  if (t.type === "all") target = { type: "all" };
  else if (t.type === "group" && typeof t.groupId === "string" && ASSIGNMENT_ID_PATTERN.test(t.groupId)) target = { type: "group", groupId: t.groupId };
  else if (t.type === "members" && Array.isArray(t.memberIds)) {
    const ids = [...new Set(t.memberIds.filter((id): id is string => typeof id === "string" && MEMBER_ID_PATTERN.test(id)))];
    if (ids.length === 0) return bad("Pick at least one member.");
    if (ids.length > MAX_GROUP_MEMBERS) return bad(`Up to ${MAX_GROUP_MEMBERS} members at once.`);
    target = { type: "members", memberIds: ids };
  } else return bad("Choose who to send it to.");

  return { ok: true, value: { company: b.company, kind: b.kind, title, program, habits, note, target } };
}

export function validateGroup(raw: unknown): ValidationResult<{ company: string; name: string; memberIds: string[] }> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof b.company !== "string" || !COMPANY_ID_PATTERN.test(b.company)) return { ok: false, error: "Open the dashboard from your Whop." };
  const name = tidy(b.name, GROUP_NAME_MAX);
  if (!name) return { ok: false, error: "Name the group." };
  const ids = Array.isArray(b.memberIds)
    ? [...new Set(b.memberIds.filter((id): id is string => typeof id === "string" && MEMBER_ID_PATTERN.test(id)))]
    : [];
  if (ids.length === 0) return { ok: false, error: "Add at least one member." };
  if (ids.length > MAX_GROUP_MEMBERS) return { ok: false, error: `Up to ${MAX_GROUP_MEMBERS} members in a group.` };
  return { ok: true, value: { company: b.company, name, memberIds: ids } };
}

export function isExperienceId(v: unknown): v is string {
  return typeof v === "string" && EXPERIENCE_ID_PATTERN.test(v);
}

/** The Whop notification members get. */
export function assignmentMessage(kind: AssignmentKind, title: string): { title: string; content: string } {
  return kind === "program"
    ? {
        title: `Your coach sent you a program: ${title}`,
        content: "Open Prep Calculator to add it to your training. It becomes your active program; your own programs stay.",
      }
    : {
        title: `Your coach set new daily habits: ${title}`,
        content: "Open Prep Calculator to switch to them. Your past ticks and streaks stay.",
      };
}

/* ------------------------------ member side ------------------------------ */

/** The id an assigned program gets in a member's app, so using it twice doesn't duplicate it. */
export function assignedProgramId(assignmentId: string): string {
  return `coach_${assignmentId.slice(0, 16)}`;
}

/**
 * Add an assigned program to a member's programs and make it active, or the
 * reason it can't be added (their program list is full).
 */
export function applyAssignedProgram(
  settings: TrainingSettings,
  assignmentId: string,
  program: Program,
): { ok: true; settings: TrainingSettings } | { ok: false; error: string } {
  const id = assignedProgramId(assignmentId);
  const p = { ...program, id };
  const exists = settings.programs.some((x) => x.id === id);
  if (!exists && settings.programs.length >= MAX_PROGRAMS) {
    return { ok: false, error: `You have ${MAX_PROGRAMS} programs. Delete one in Training first, then add this one.` };
  }
  return {
    ok: true,
    settings: {
      ...settings,
      programs: exists ? settings.programs.map((x) => (x.id === id ? p : x)) : [...settings.programs, p],
      activeProgramId: id,
    },
  };
}

/* ---------------------------- coach program library ---------------------------- */

/** Programs a coach saves to reuse when assigning, per whop. */
export const MAX_SAVED_PROGRAMS = 50;

export interface SavedProgram {
  id: string;
  name: string;
  program: Program;
  /** The training days and length it usually runs for (pre-fill the schedule step). */
  weekdays: number[] | null;
  weeks: number | null;
  updatedAt: string;
}

/**
 * A program to keep: library exercises only, at least one exercise — but,
 * unlike one being sent, days still being filled in are kept.
 */
export function cleanSavedProgram(raw: unknown): Program | null {
  const p = sanitizeProgram(raw);
  if (!p || p.days.length === 0) return null;
  const days = p.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => findExercise(e.exerciseId, [])) }));
  if (!days.some((d) => d.exercises.length > 0)) return null;
  // Dates belong to an assignment, not the saved program.
  return { id: p.id, name: p.name, days };
}

export function validateSavedProgram(
  raw: unknown,
): ValidationResult<{ company: string; program: Program; weekdays: number[] | null; weeks: number | null }> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof b.company !== "string" || !COMPANY_ID_PATTERN.test(b.company)) return { ok: false, error: "Open the dashboard from your Whop." };
  const program = cleanSavedProgram(b.program);
  if (!program) return { ok: false, error: "Add at least one exercise before saving." };
  const weekdays = Array.isArray(b.weekdays)
    ? [...new Set(b.weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((x, y) => x - y)
    : [];
  const weeks = typeof b.weeks === "number" && Number.isInteger(b.weeks) && b.weeks >= 1 && b.weeks <= 26 ? b.weeks : null;
  return { ok: true, value: { company: b.company, program, weekdays: weekdays.length > 0 ? weekdays : null, weeks } };
}
