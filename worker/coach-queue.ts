/**
 * Today's queue, per coach (coach-today.tsx; table from migration 0039):
 *
 *   GET  /api/coach/snoozes?company=…    my hidden rows: { member, kind, until }[]
 *   POST /api/coach/snoozes              hide one until a day, or show it again { company, member, kind, until | null }
 *   POST /api/coach/messages/unread      mark a member's latest message unread again { company, member }
 *
 * "Done for today" hides a row until tomorrow, "Snooze 3 days" until then.
 * Kept per coach, member and reason, so a new reason still shows. Rows past
 * their day are cleared as they're read.
 */

import { isValidISODate } from "../src/lib/dates";
import { MEMBER_ID_PATTERN } from "../src/lib/program-edits";
import { adminCheck } from "./messages";

type Env = Parameters<typeof adminCheck>[0];
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const KIND_PATTERN = /^[a-z-]{2,20}$/;

export async function getSnoozes(env: Env, viewerId: string, companyId: string, today: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const day = isValidISODate(today) ? today : new Date().toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM coach_snoozes WHERE company_id = ? AND coach_id = ? AND until <= ?").bind(companyId, viewerId, day).run();
  const { results } = await env.DB.prepare("SELECT member_id, kind, until FROM coach_snoozes WHERE company_id = ? AND coach_id = ?")
    .bind(companyId, viewerId)
    .all<{ member_id: string; kind: string; until: string }>();
  return { ok: true, body: { snoozes: results.map((r) => ({ member: r.member_id, kind: r.kind, until: r.until })) } };
}

export async function setSnooze(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const member = typeof b.member === "string" ? b.member : "";
  const kind = typeof b.kind === "string" ? b.kind : "";
  if (!MEMBER_ID_PATTERN.test(member) || !KIND_PATTERN.test(kind)) return { ok: false, status: 422, error: "Bad request." };
  if (b.until === null) {
    await env.DB.prepare("DELETE FROM coach_snoozes WHERE company_id = ? AND coach_id = ? AND member_id = ? AND kind = ?").bind(companyId, viewerId, member, kind).run();
    return { ok: true, body: { ok: true } };
  }
  if (typeof b.until !== "string" || !isValidISODate(b.until)) return { ok: false, status: 422, error: "Bad request." };
  await env.DB.prepare(
    `INSERT INTO coach_snoozes (company_id, coach_id, member_id, kind, until) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (company_id, coach_id, member_id, kind) DO UPDATE SET until = excluded.until`,
  )
    .bind(companyId, viewerId, member, kind, b.until)
    .run();
  return { ok: true, body: { ok: true } };
}

/** The Inbox's "U": their latest message shows as unread again (for you and the other coaches). */
export async function markUnread(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const member = typeof b.member === "string" ? b.member : "";
  if (!MEMBER_ID_PATTERN.test(member)) return { ok: false, status: 422, error: "Bad request." };
  const r = await env.DB.prepare(
    `UPDATE coach_messages SET read_at = NULL WHERE id = (
       SELECT id FROM coach_messages WHERE company_id = ? AND member_id = ? AND from_coach = 0 AND pending = 0 ORDER BY created_at DESC LIMIT 1)`,
  )
    .bind(companyId, member)
    .run();
  if (!r.meta.changes) return { ok: false, status: 409, error: "They haven't sent you a message to mark unread." };
  return { ok: true, body: { ok: true } };
}
