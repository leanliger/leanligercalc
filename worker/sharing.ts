/**
 * Coach access (see src/lib/sharing.ts).
 *
 *   GET  /api/sharing?experience=exp_…        my choice and any pending request
 *   PUT  /api/sharing  { shared }             share, stop sharing, or "Not now"
 *   POST /api/coach/sharing/request  { company, member }   coaches: ask a member
 *   POST /api/coach/sharing/stop     { company, member }   coaches: stop viewing
 *
 * Coach calls check with Whop that the viewer is an admin of the company and
 * that the member belongs to it.
 */

import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import {
  canRequest,
  memberSharing,
  mySharing,
  requestMessage,
  type MemberSharing,
  type MySharing,
  type SharingRow,
} from "../src/lib/sharing";
import { sendWhop } from "./reminders";
import { accessLevel, hasWhopKey, type WhopEnv } from "./whop";

export interface SharingEnv extends WhopEnv {
  DB: D1Database;
}

export type SharingResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const MEMBER_ID_PATTERN = /^user_[A-Za-z0-9_]{1,40}$/;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

async function row(env: SharingEnv, userId: string): Promise<SharingRow | null> {
  return env.DB.prepare("SELECT shared, shared_at, requested_at, declined_at FROM coach_sharing WHERE user_id = ?")
    .bind(userId)
    .first<SharingRow>();
}

/** Whether a member currently shares their progress with coaches. */
export async function isSharingProgress(env: SharingEnv, userId: string): Promise<boolean> {
  return (await row(env, userId))?.shared === 1;
}

/** Each member's choice, for the coach overview. Members without a row aren't sharing. */
export async function sharingFor(env: SharingEnv, ids: readonly string[]): Promise<Map<string, MemberSharing>> {
  const out = new Map<string, MemberSharing>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT user_id, shared, shared_at, requested_at, declined_at FROM coach_sharing WHERE user_id IN (${chunk.map(() => "?").join(",")})`,
    )
      .bind(...chunk)
      .all<SharingRow & { user_id: string }>();
    for (const r of results) out.set(r.user_id, memberSharing(r));
  }
  for (const id of ids) if (!out.has(id)) out.set(id, memberSharing(null));
  return out;
}

/* --------------------------------- member --------------------------------- */

export async function getMySharing(env: SharingEnv, userId: string, experienceId: string | null): Promise<MySharing> {
  // Remember where they open the app, so a coach's request can reach them.
  if (experienceId && EXPERIENCE_ID_PATTERN.test(experienceId)) {
    await env.DB.prepare(
      `INSERT INTO coach_sharing (user_id, experience_id) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET experience_id = excluded.experience_id`,
    )
      .bind(userId, experienceId)
      .run();
  }
  return mySharing(await row(env, userId));
}

export async function setMySharing(env: SharingEnv, userId: string, raw: unknown): Promise<SharingResult> {
  const shared = (raw as { shared?: unknown } | null)?.shared;
  if (typeof shared !== "boolean") return { ok: false, status: 422, error: "Expected { shared: true | false }." };
  if (shared) {
    await env.DB.prepare(
      `INSERT INTO coach_sharing (user_id, shared, shared_at, updated_at) VALUES (?, 1, ${NOW_SQL}, ${NOW_SQL})
       ON CONFLICT (user_id) DO UPDATE SET
         shared = 1, shared_at = ${NOW_SQL}, requested_at = NULL, requested_by = NULL, declined_at = NULL, updated_at = ${NOW_SQL}`,
    )
      .bind(userId)
      .run();
  } else {
    // Answering a request with "Not now" starts the coach's wait before asking again.
    await env.DB.prepare(
      `INSERT INTO coach_sharing (user_id, shared, updated_at) VALUES (?, 0, ${NOW_SQL})
       ON CONFLICT (user_id) DO UPDATE SET
         declined_at = CASE WHEN requested_at IS NOT NULL THEN ${NOW_SQL} ELSE declined_at END,
         shared = 0, shared_at = NULL, requested_at = NULL, requested_by = NULL, updated_at = ${NOW_SQL}`,
    )
      .bind(userId)
      .run();
  }
  return { ok: true, body: mySharing(await row(env, userId)) };
}

/* ---------------------------------- coach ---------------------------------- */

/** The viewer is an admin of the whop and the member belongs to it. Also used for coach edits to a member's program. */
export async function coachCheck(env: SharingEnv, viewerId: string, raw: unknown): Promise<{ memberId: string } | { error: SharingResult }> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const memberId = typeof b.member === "string" ? b.member : "";
  if (!COMPANY_ID_PATTERN.test(companyId) || !MEMBER_ID_PATTERN.test(memberId)) {
    return { error: { ok: false, status: 422, error: "Bad request." } };
  }
  if (!hasWhopKey(env)) return { error: { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." } };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { error: { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." } };
  if (level !== "admin") return { error: { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." } };
  const memberLevel = await accessLevel(env, memberId, companyId);
  if (memberLevel !== "customer" && memberLevel !== "admin") return { error: { ok: false, status: 404, error: "That person isn't a member of your whop." } };
  return { memberId };
}

/** The community to notify a member in: where they last opened the app, else any we know. */
export async function experienceOf(env: SharingEnv, userId: string): Promise<string | null> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(
       (SELECT experience_id FROM coach_sharing WHERE user_id = ?1),
       (SELECT experience_id FROM reminders WHERE user_id = ?1),
       (SELECT experience_id FROM fasting_reminders WHERE user_id = ?1),
       (SELECT experience_id FROM leaderboard WHERE user_id = ?1 LIMIT 1),
       (SELECT experience_id FROM form_checks WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1),
       (SELECT experience_id FROM lift_submissions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 1)
     ) AS exp`,
  )
    .bind(userId)
    .first<{ exp: string | null }>();
  return r?.exp && EXPERIENCE_ID_PATTERN.test(r.exp) ? r.exp : null;
}

export async function requestSharing(env: SharingEnv, viewerId: string, raw: unknown, now = new Date()): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const current = memberSharing(await row(env, c.memberId));
  const allowed = canRequest(current, now.toISOString().slice(0, 10));
  if (!allowed.ok) return { ok: false, status: 409, error: allowed.error };

  await env.DB.prepare(
    `INSERT INTO coach_sharing (user_id, requested_at, requested_by, updated_at) VALUES (?, ${NOW_SQL}, ?, ${NOW_SQL})
     ON CONFLICT (user_id) DO UPDATE SET requested_at = ${NOW_SQL}, requested_by = excluded.requested_by, updated_at = ${NOW_SQL}`,
  )
    .bind(c.memberId, viewerId)
    .run();

  let notified = false;
  const experienceId = await experienceOf(env, c.memberId);
  if (experienceId) {
    const sent = await sendWhop(env, experienceId, c.memberId, requestMessage());
    notified = sent.ok;
    if (!sent.ok) console.error("sharing request notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { sharing: memberSharing(await row(env, c.memberId)), notified } };
}

export async function stopSharing(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  // Also withdraws a request that hasn't been answered.
  await env.DB.prepare(
    `UPDATE coach_sharing SET shared = 0, shared_at = NULL, requested_at = NULL, requested_by = NULL, updated_at = ${NOW_SQL}
     WHERE user_id = ?`,
  )
    .bind(c.memberId)
    .run();
  return { ok: true, body: { sharing: memberSharing(await row(env, c.memberId)) } };
}
