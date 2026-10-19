/**
 * Coach edits to a member's workout program (src/lib/program-edits.ts).
 *
 *   GET  /api/coach/member-training?company&member   coaches: the member's programs, with any waiting edit applied
 *   PUT  /api/coach/member-training                  coaches: save an edit { company, member, program, dates? }
 *                                                    (dates: the calendar, null to take it off, absent to keep it)
 *   GET  /api/program-edits                          members: edits waiting for my app
 *   POST /api/program-edits/:id/applied              members: my app applied it
 *
 * Coaches must be an admin of the whop, the person a member of it, and the
 * member must be sharing with their coach (Coach access on) — the same rule as
 * seeing their progress. The member is sent a Whop notification so the edit
 * reaches their app soon.
 */

import { sanitizeProgram, sanitizeTraining, type Program, type TrainingSettings, type Workout } from "../src/lib/training";
import { scheduleAfterEdit, validateProgramEdit, type MemberTraining, type ProgramEdit } from "../src/lib/program-edits";
import { sanitizeSchedule } from "../src/lib/program-schedule";
import { assignedProgramId } from "../src/lib/assignments";
import { coachCheck, experienceOf, isSharingProgress, type SharingEnv } from "./sharing";
import { sendWhop } from "./reminders";

export type ProgramEditResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const NOT_SHARING: ProgramEditResult = {
  ok: false,
  status: 403,
  error: "This member isn't sharing with you right now, so you can't see or edit their program.",
};
const newId = () => crypto.randomUUID().replace(/-/g, "");

async function trainingOf(env: SharingEnv, memberId: string): Promise<TrainingSettings> {
  const row = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(memberId).first<{ state: string }>();
  try {
    const plan = JSON.parse(row?.state ?? "null") as { tracking?: { training?: unknown } } | null;
    return sanitizeTraining(plan?.tracking?.training);
  } catch {
    return sanitizeTraining(null);
  }
}

interface EditRow {
  id: string;
  program_id: string;
  program: string;
  created_at: string;
}

async function waitingEdits(env: SharingEnv, memberId: string): Promise<ProgramEdit[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, program_id, program, created_at FROM coach_program_edits WHERE member_id = ? AND applied_at IS NULL ORDER BY created_at",
  )
    .bind(memberId)
    .all<EditRow>();
  const out: ProgramEdit[] = [];
  for (const r of results) {
    try {
      const raw = JSON.parse(r.program) as { datesChanged?: unknown; schedule?: unknown };
      const clean = sanitizeProgram(raw);
      if (!clean) continue;
      const { schedule: _dates, ...program } = clean;
      // Edits saved with `datesChanged` set the calendar (or take it off); older ones keep the member's.
      const edit: ProgramEdit = { id: r.id, programId: r.program_id, program, createdAt: r.created_at };
      if (raw.datesChanged === true) edit.schedule = sanitizeSchedule(raw.schedule) ?? null;
      out.push(edit);
    } catch {
      /* skip a corrupt row */
    }
  }
  return out;
}

export async function coachMemberTraining(env: SharingEnv, viewerId: string, companyId: string, memberId: string): Promise<ProgramEditResult> {
  const c = await coachCheck(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) return NOT_SHARING;
  const training = await trainingOf(env, c.memberId);
  // Show the coach the latest version: their waiting edit in place of what the member's app still has.
  const pending: Record<string, string> = {};
  let programs: Program[] = training.programs;
  for (const e of await waitingEdits(env, c.memberId)) {
    if (!programs.some((p) => p.id === e.programId)) continue;
    programs = programs.map((p) => {
      if (p.id !== e.programId) return p;
      const schedule = scheduleAfterEdit(p.schedule, e);
      return { ...e.program, id: p.id, ...(schedule ? { schedule } : {}) };
    });
    pending[e.programId] = e.createdAt;
  }
  // Programs that came from one of this company's challenges.
  const { results: challengeRows } = await env.DB.prepare("SELECT id FROM assignments WHERE company_id = ? AND challenge = 1")
    .bind(companyId)
    .all<{ id: string }>();
  const challengeIds = new Set(challengeRows.map((r) => assignedProgramId(r.id)));
  const body: MemberTraining = {
    programs,
    activeProgramId: training.activeProgramId,
    customExercises: training.customExercises,
    restSec: training.restSec,
    pending,
    challenges: programs.filter((p) => challengeIds.has(p.id)).map((p) => p.id),
  };
  return { ok: true, body: { training: body } };
}

/** How many of a member's most recent workouts the coach sees. */
const COACH_WORKOUT_LIMIT = 500;

/**
 * A member's workouts for their coach (newest first, finished and in
 * progress), with their own exercises so names and charts resolve. Same rule
 * as their program: only while they share their progress with the coach.
 */
export async function coachMemberWorkouts(env: SharingEnv, viewerId: string, companyId: string, memberId: string): Promise<ProgramEditResult> {
  const c = await coachCheck(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) return NOT_SHARING;
  const [training, rows] = await Promise.all([
    trainingOf(env, c.memberId),
    env.DB.prepare("SELECT id, data FROM workouts WHERE user_id = ? ORDER BY date DESC, updated_at DESC LIMIT ?")
      .bind(c.memberId, COACH_WORKOUT_LIMIT)
      .all<{ id: string; data: string }>(),
  ]);
  const workouts: Workout[] = [];
  for (const row of rows.results) {
    try {
      workouts.push({ ...(JSON.parse(row.data) as Workout), id: row.id });
    } catch {
      /* skip a corrupt row */
    }
  }
  return { ok: true, body: { workouts, customExercises: training.customExercises } };
}

export async function saveMemberProgram(env: SharingEnv, viewerId: string, raw: unknown): Promise<ProgramEditResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) return NOT_SHARING;
  const b = raw as { company: string; program?: unknown; dates?: unknown };
  const v = validateProgramEdit(b.program, await trainingOf(env, c.memberId), b.dates);
  if (!v.ok) return { ok: false, status: 422, error: v.error };

  await env.DB.batch([
    env.DB.prepare("DELETE FROM coach_program_edits WHERE member_id = ? AND program_id = ? AND applied_at IS NULL").bind(
      c.memberId,
      v.program.id,
    ),
    env.DB.prepare(
      "INSERT INTO coach_program_edits (id, company_id, member_id, program_id, program, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(
      newId(),
      b.company,
      c.memberId,
      v.program.id,
      JSON.stringify(v.schedule === undefined ? v.program : { ...v.program, datesChanged: true, schedule: v.schedule }),
      viewerId,
    ),
  ]);

  let notified = false;
  const experienceId = await experienceOf(env, c.memberId);
  if (experienceId) {
    const sent = await sendWhop(env, experienceId, c.memberId, {
      title: "Your coach updated your program",
      content: `Open Lean Stature System to see the changes to ${v.program.name}.`,
    });
    notified = sent.ok;
    if (!sent.ok) console.error("program edit notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { saved: true, notified } };
}

export async function myProgramEdits(env: SharingEnv, userId: string): Promise<ProgramEdit[]> {
  return waitingEdits(env, userId);
}

export async function markProgramEditApplied(env: SharingEnv, userId: string, id: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE coach_program_edits SET applied_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND member_id = ? AND applied_at IS NULL",
  )
    .bind(id, userId)
    .run();
}
