/**
 * Saved replies (src/lib/messages.ts): reusable answers for check-in replies
 * and chat, shared by a whop's admins.
 *
 *   GET    /api/coach/saved-replies?company=…        the whop's saved replies, oldest first
 *   POST   /api/coach/saved-replies                  save one { company, title?, body }
 *   DELETE /api/coach/saved-replies/:id?company=…    remove one
 */

import { SAVED_REPLIES_MAX, validateSavedReply, type SavedReply } from "../src/lib/messages";
import { adminCheck } from "./messages";
import type { PhotoEnv } from "./photos";
import type { ReminderEnv } from "./reminders";
import type { WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & PhotoEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

async function list(env: Env, companyId: string): Promise<SavedReply[]> {
  const { results } = await env.DB.prepare("SELECT id, title, body FROM coach_saved_replies WHERE company_id = ? ORDER BY created_at LIMIT ?")
    .bind(companyId, SAVED_REPLIES_MAX)
    .all<SavedReply>();
  return results;
}

export async function getSavedReplies(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  return { ok: true, body: { replies: await list(env, companyId) } };
}

export async function saveSavedReply(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const v = validateSavedReply(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_saved_replies WHERE company_id = ?").bind(companyId).first<{ n: number }>();
  if ((count?.n ?? 0) >= SAVED_REPLIES_MAX) return { ok: false, status: 409, error: `You can keep up to ${SAVED_REPLIES_MAX} saved replies. Delete one first.` };
  await env.DB.prepare("INSERT INTO coach_saved_replies (id, company_id, title, body, created_by) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID().replace(/-/g, ""), companyId, v.title, v.body, viewerId)
    .run();
  return { ok: true, body: { replies: await list(env, companyId) } };
}

export async function deleteSavedReply(env: Env, viewerId: string, companyId: string, id: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  await env.DB.prepare("DELETE FROM coach_saved_replies WHERE id = ? AND company_id = ?").bind(id, companyId).run();
  return { ok: true, body: { replies: await list(env, companyId) } };
}
