/**
 * Coach edits to a member's own workout program (coach dashboard → a member →
 * Training program).
 *
 * The coach never writes into the member's plan directly: the member's app
 * saves its whole plan in one piece, so a direct write could be overwritten by
 * the member's next save. Instead the edit waits on the server
 * (coach_program_edits) and the member's app applies it the next time it opens
 * (applyProgramEdit), then marks it applied.
 *
 * Only programs the member already has can be edited. The coach can change the
 * name, days and exercises; dates from a program calendar stay as they are.
 * New exercises come from the library; the member's own exercises already in
 * the program can stay.
 */

import { type Exercise } from "./exercises";
import { findExercise, sanitizeProgram, type Program, type TrainingSettings } from "./training";

export const MEMBER_ID_PATTERN = /^user_[A-Za-z0-9_]{1,40}$/;
export const PROGRAM_EDIT_ID_PATTERN = /^[a-f0-9]{32}$/;

/** What the coach sees of a member's training. */
export interface MemberTraining {
  programs: Program[];
  activeProgramId: string | null;
  /** The member's own exercises, so their names show in the editor. */
  customExercises: Exercise[];
  /** The member's default rest, seconds. */
  restSec: number;
  /** Programs with an edit the member's app hasn't picked up yet: program id → when it was saved. */
  pending: Record<string, string>;
}

/** An edit waiting for the member's app. */
export interface ProgramEdit {
  id: string;
  programId: string;
  program: Program;
  createdAt: string;
}

/** Check a coach's edit against the member's current training. */
export function validateProgramEdit(raw: unknown, training: TrainingSettings): { ok: true; program: Program } | { ok: false; error: string } {
  const clean = sanitizeProgram(raw);
  if (!clean) return { ok: false, error: "That program isn't valid." };
  const current = training.programs.find((p) => p.id === clean.id);
  if (!current) return { ok: false, error: "This member no longer has that program. Reload and try again." };
  if (clean.days.length === 0) return { ok: false, error: "Keep at least one day in the program." };
  for (const d of clean.days) {
    if (d.exercises.some((e) => !findExercise(e.exerciseId, training.customExercises))) {
      return { ok: false, error: "One of the exercises isn't available to this member." };
    }
  }
  // The calendar dates are the member's (or came with an assignment); an edit doesn't change them.
  const { schedule: _ignored, ...rest } = clean;
  return { ok: true, program: rest };
}

/**
 * The member's training with a coach's edit applied, or null when the program
 * is gone (deleted since) or the edit can't be used. Keeps the program's id,
 * whether it's active, and its calendar dates.
 */
export function applyProgramEdit(settings: TrainingSettings, edit: ProgramEdit): TrainingSettings | null {
  const current = settings.programs.find((p) => p.id === edit.programId);
  const clean = sanitizeProgram({ ...edit.program, id: edit.programId });
  if (!current || !clean) return null;
  const days = clean.days.map((d) => ({ ...d, exercises: d.exercises.filter((e) => findExercise(e.exerciseId, settings.customExercises)) }));
  const { schedule: _ignored, ...rest } = clean;
  const next: Program = { ...rest, days, ...(current.schedule ? { schedule: current.schedule } : {}) };
  return { ...settings, programs: settings.programs.map((p) => (p.id === current.id ? next : p)) };
}
