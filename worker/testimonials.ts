/**
 * Testimonials from monthly comparisons.
 *
 *   GET  /api/testimonial-consent           members: my choice
 *   PUT  /api/testimonial-consent { allowed }
 *   GET  /api/coach/testimonials?company    coaches: members who said yes, with their newest comparison
 *
 * A member is on the list only while they've said yes AND share their
 * progress and photos with the coach (the photos are in the comparison), and
 * only if they belong to the coach's whop. Turning either off takes them off
 * the list straight away.
 */

import { isSharingWithCoach, type PhotoEnv } from "./photos";
import { listComparisons } from "./physique";
import { accessLevel } from "./whop";
import { isSharingProgress, type SharingEnv, type SharingResult } from "./sharing";

type Env = SharingEnv & PhotoEnv;

const COMPANY_ID_PATTERN = /^biz_[A-Za-z0-9]{1,40}$/;
/** Most members checked per request (each is a Whop membership lookup). */
const MAX_LISTED = 60;

export async function getConsent(env: Env, userId: string): Promise<SharingResult> {
  const row = await env.DB.prepare("SELECT allowed FROM testimonial_consent WHERE user_id = ?").bind(userId).first<{ allowed: number }>();
  return { ok: true, body: { allowed: row?.allowed === 1 } };
}

export async function setConsent(env: Env, userId: string, raw: unknown): Promise<SharingResult> {
  const allowed = (raw as { allowed?: unknown } | null)?.allowed;
  if (typeof allowed !== "boolean") return { ok: false, status: 422, error: "Expected { allowed: true | false }." };
  await env.DB.prepare(
    `INSERT INTO testimonial_consent (user_id, allowed) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET allowed = excluded.allowed, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(userId, allowed ? 1 : 0)
    .run();
  return { ok: true, body: { allowed } };
}

export async function coachTestimonials(env: Env, viewerId: string, companyId: string): Promise<SharingResult> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Bad request." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can see testimonials." };

  const { results } = await env.DB.prepare(
    `SELECT t.user_id FROM testimonial_consent t
     WHERE t.allowed = 1 AND EXISTS (SELECT 1 FROM physique_analyses a WHERE a.user_id = t.user_id AND a.source = 'compare')
     ORDER BY t.updated_at DESC LIMIT ?`,
  )
    .bind(MAX_LISTED)
    .all<{ user_id: string }>();

  const items: { memberId: string; comparison: Awaited<ReturnType<typeof listComparisons>>[number] }[] = [];
  for (const { user_id } of results) {
    if (!(await isSharingProgress(env, user_id)) || !(await isSharingWithCoach(env, user_id))) continue;
    const memberLevel = await accessLevel(env, user_id, companyId);
    if (memberLevel !== "customer" && memberLevel !== "admin") continue;
    const newest = (await listComparisons(env, user_id, 1))[0];
    if (newest) items.push({ memberId: user_id, comparison: newest });
  }
  return { ok: true, body: { testimonials: items } };
}
