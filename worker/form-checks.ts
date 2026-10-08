/**
 * Form checks (see src/lib/form-checks.ts).
 *
 *   GET    /api/form-checks?experience=exp_…     my requests (+ the queue for admins)
 *   POST   /api/form-checks                      ask { experienceId, exerciseId, exerciseName, videoUrl, question }
 *   DELETE /api/form-checks/:id                  withdraw / delete one of mine
 *   PUT    /api/form-checks/:id/feedback         admins: { feedback }
 *
 * Every call checks the member's access to the community with Whop. Only the
 * member and admins of that community ever see a request.
 */

import {
  MAX_FORM_CHECKS,
  MAX_PENDING_FORM_CHECKS,
  feedbackMessage,
  validateFeedback,
  validateFormCheck,
  type FormCheck,
  type FormCheckStatus,
  type FormChecksResponse,
  type PendingFormCheck,
} from "../src/lib/form-checks";
import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import { sendWhop } from "./reminders";
import { accessLevel, hasWhopKey, whopGet, type WhopEnv } from "./whop";

export interface FormCheckEnv extends WhopEnv {
  DB: D1Database;
}

export type FormCheckResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const NAME_MAX = 60;

interface Row {
  id: string;
  experience_id: string;
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  video_url: string;
  question: string;
  status: FormCheckStatus;
  feedback: string | null;
  reviewed_at: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

const toMine = (r: Row): FormCheck => ({
  id: r.id,
  exerciseId: r.exercise_id,
  exerciseName: r.exercise_name,
  videoUrl: r.video_url,
  question: r.question,
  status: r.status,
  feedback: r.feedback,
  reviewedAt: r.reviewed_at,
  createdAt: r.created_at,
});

/** The viewer's access to the community, or the error to return. */
async function access(
  env: FormCheckEnv,
  userId: string,
  experienceId: string,
): Promise<{ level: "admin" | "customer" } | { error: FormCheckResult }> {
  if (!EXPERIENCE_ID_PATTERN.test(experienceId)) {
    return { error: { ok: false, status: 422, error: "Open the app from your Whop community to use form checks." } };
  }
  if (!hasWhopKey(env)) return { error: { ok: false, status: 503, error: "Form checks aren't switched on for this app yet." } };
  const level = await accessLevel(env, userId, experienceId);
  if (level === null) return { error: { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." } };
  if (level === "no_access") return { error: { ok: false, status: 403, error: "You don't have access to this community." } };
  return { level };
}

export async function getFormChecks(env: FormCheckEnv, userId: string, experienceId: string): Promise<FormCheckResult> {
  const a = await access(env, userId, experienceId);
  if ("error" in a) return a.error;
  const isAdmin = a.level === "admin";
  const [mine, pending] = await env.DB.batch<Row>([
    env.DB.prepare("SELECT * FROM form_checks WHERE experience_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50").bind(
      experienceId,
      userId,
    ),
    env.DB.prepare("SELECT * FROM form_checks WHERE experience_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 100").bind(
      experienceId,
    ),
  ]);
  const body: FormChecksResponse = {
    mine: (mine?.results ?? []).map(toMine),
    isAdmin,
    pending: isAdmin
      ? (pending?.results ?? []).map(
          (r): PendingFormCheck => ({ ...toMine(r), name: r.name ?? (r.username ? `@${r.username}` : "Member"), avatarUrl: r.avatar_url }),
        )
      : [],
  };
  return { ok: true, body };
}

export async function askFormCheck(env: FormCheckEnv, userId: string, raw: unknown): Promise<FormCheckResult> {
  const v = validateFormCheck(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const s = v.value;
  const a = await access(env, userId, s.experienceId);
  if ("error" in a) return a.error;

  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM form_checks WHERE user_id = ? AND experience_id = ?`,
  )
    .bind(userId, s.experienceId)
    .first<{ n: number; pending: number | null }>();
  if ((counts?.pending ?? 0) >= MAX_PENDING_FORM_CHECKS) {
    return { ok: false, status: 409, error: `You have ${MAX_PENDING_FORM_CHECKS} form checks waiting already. Wait for feedback, or withdraw one.` };
  }
  if (counts && counts.n >= MAX_FORM_CHECKS) {
    return { ok: false, status: 409, error: `You've reached ${MAX_FORM_CHECKS} form checks. Delete some old ones first.` };
  }

  // Their Whop profile, so the coach's queue shows who's asking.
  const profile = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`);
  const p = (profile.status === 200 ? profile.body : null) as
    | { name?: string | null; username?: string | null; profile_picture?: { url?: string } | null }
    | null;
  const clip = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, NAME_MAX) : null);
  const avatar = typeof p?.profile_picture?.url === "string" && /^https:\/\//.test(p.profile_picture.url) ? p.profile_picture.url : null;

  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare(
    `INSERT INTO form_checks
       (id, experience_id, user_id, exercise_id, exercise_name, video_url, question, name, username, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, s.experienceId, userId, s.exerciseId, s.exerciseName, s.videoUrl, s.question, clip(p?.name), clip(p?.username), avatar)
    .run();
  const row = await env.DB.prepare("SELECT * FROM form_checks WHERE id = ?").bind(id).first<Row>();
  return { ok: true, body: { formCheck: row ? toMine(row) : null } };
}

export async function deleteFormCheck(env: FormCheckEnv, userId: string, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM form_checks WHERE id = ? AND user_id = ?").bind(id, userId).run();
}

export async function answerFormCheck(env: FormCheckEnv, viewerId: string, id: string, raw: unknown): Promise<FormCheckResult> {
  const v = validateFeedback(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const row = await env.DB.prepare("SELECT * FROM form_checks WHERE id = ?").bind(id).first<Row>();
  if (!row) return { ok: false, status: 404, error: "That form check no longer exists." };

  const a = await access(env, viewerId, row.experience_id);
  if ("error" in a) return a.error;
  if (a.level !== "admin") return { ok: false, status: 403, error: "Only coaches can reply to form checks." };

  await env.DB.prepare(
    `UPDATE form_checks
     SET status = 'reviewed', feedback = ?, reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
  )
    .bind(v.value.feedback, viewerId, id)
    .run();

  const sent = await sendWhop(env, row.experience_id, row.user_id, feedbackMessage(row.exercise_name, v.value.feedback));
  if (!sent.ok) console.error("form check notification failed", { status: sent.status, reason: sent.reason });
  return { ok: true, body: { status: "reviewed", notified: sent.ok } };
}
