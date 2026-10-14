/**
 * A member's latest physique analysis, for their coach:
 *
 *   GET /api/coach/member-physique?company&member
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
import { coachCheck, isSharingProgress, type SharingEnv, type SharingResult } from "./sharing";

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
