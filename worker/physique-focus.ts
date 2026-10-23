/**
 * A member's latest physique analysis, for their coach:
 *
 *   GET /api/coach/member-physique?company&member
 *   PUT /api/coach/comparison-comment            a note on their monthly comparison { company, member, id, comment } ("" removes it)
 *
 * The coach dashboard turns its "Target Areas for Growth" into drafted extra
 * sets (src/lib/physique-focus.ts) that the coach sends as an ordinary program
 * edit. The analysis is read from the member's progress photos, so it follows
 * the photos' rule exactly: an admin of the whop, a member of it, sharing
 * their progress and their photos with the coach, re-checked on every request.
 */

import { isSharingWithCoach, type PhotoEnv } from "./photos";
import { listComparisons } from "./physique";
import { parsePhysique } from "../src/lib/physique";
import { bodyFatSeries } from "../src/lib/physique-stats";
import { COMPARISON_COMMENT_MAX } from "../src/lib/physique";
import { sendWhop } from "./reminders";
import { coachCheck, experienceOf, isSharingProgress, type SharingEnv, type SharingResult } from "./sharing";

/**
 * The coach's comment under a member's monthly comparison. Same rule as
 * seeing it: they share their progress and their photos. A new or changed
 * comment notifies them.
 */
export async function saveComparisonComment(env: SharingEnv & PhotoEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === "string" && /^[0-9a-f]{32}$/.test(b.id) ? b.id : null;
  const comment = typeof b.comment === "string" ? b.comment.replace(/\r\n/g, "\n").trim() : null;
  if (!id || comment === null) return { ok: false, status: 422, error: "Bad request." };
  if (comment.length > COMPARISON_COMMENT_MAX) return { ok: false, status: 422, error: `Keep it under ${COMPARISON_COMMENT_MAX} characters.` };
  if (!(await isSharingProgress(env, c.memberId)) || !(await isSharingWithCoach(env, c.memberId))) {
    return { ok: false, status: 403, error: "They've stopped sharing their photos with you." };
  }
  const row = await env.DB.prepare("SELECT coach_comment FROM physique_analyses WHERE id = ? AND user_id = ? AND source = 'compare'")
    .bind(id, c.memberId)
    .first<{ coach_comment: string | null }>();
  if (!row) return { ok: false, status: 404, error: "That comparison isn't there any more." };
  await env.DB.prepare(
    "UPDATE physique_analyses SET coach_comment = ?, coach_comment_by = ?, coach_comment_at = CASE WHEN ? IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END WHERE id = ?",
  )
    .bind(comment || null, comment ? viewerId : null, comment || null, id)
    .run();

  let notified = false;
  if (comment && comment !== row.coach_comment) {
    const exp = await experienceOf(env, c.memberId);
    if (exp) {
      const sent = await sendWhop(env, exp, c.memberId, {
        title: "Your coach commented on your monthly comparison",
        content: comment.length > 140 ? `${comment.slice(0, 137)}…` : comment,
      });
      notified = sent.ok;
      if (!sent.ok) console.error("comparison comment notification failed", { status: sent.status, reason: sent.reason });
    }
  }
  return { ok: true, body: { comment: comment ? { text: comment, at: new Date().toISOString() } : null, notified } };
}

export async function coachMemberPhysique(env: SharingEnv & PhotoEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId)) || !(await isSharingWithCoach(env, c.memberId))) {
    return { ok: true, body: { shared: false, analysis: null, comparison: null, bodyFat: [] } };
  }
  const row = await env.DB.prepare(
    "SELECT id, photo_date, analysis, created_at FROM physique_analyses WHERE user_id = ? AND source != 'compare' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(c.memberId)
    .first<{ id: string; photo_date: string | null; analysis: string; created_at: string }>();
  return {
    ok: true,
    body: {
      shared: true,
      analysis: row ? { id: row.id, photoDate: row.photo_date, text: row.analysis, createdAt: row.created_at } : null,
      comparison: (await listComparisons(env, c.memberId, 1))[0] ?? null,
      bodyFat: await bodyFatHistory(env, c.memberId),
    },
  };
}

/** Body fat ranges from every analysis and comparison, for the chart (src/lib/physique-stats.ts). */
async function bodyFatHistory(env: SharingEnv, memberId: string) {
  const { results } = await env.DB.prepare(
    "SELECT source, photo_date, before_date, analysis, created_at FROM physique_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 60",
  )
    .bind(memberId)
    .all<{ source: string; photo_date: string | null; before_date: string | null; analysis: string; created_at: string }>();
  const analyses = results
    .filter((r) => r.source !== "compare")
    .map((r) => ({ photoDate: r.photo_date, createdAt: r.created_at, sections: parsePhysique(r.analysis).sections }));
  const comparisons = results
    .filter((r) => r.source === "compare")
    .map((r) => ({ beforeDate: r.before_date, afterDate: r.photo_date, createdAt: r.created_at, sections: parsePhysique(r.analysis).sections }));
  return bodyFatSeries(analyses, comparisons);
}
