/**
 * A member's daily food totals for the coach's weekly calories chart:
 * GET /api/coach/member-food?company=…&member=…
 *
 * The overview only carries two weeks of food (it loads everyone at once);
 * this loads COACH_FOOD_DAYS for the one member open on the dashboard.
 * Totals (per day and per meal) only, never the foods themselves. Same checks as the other member
 * routes: the viewer is an admin of the company, the member belongs to it
 * and shares their progress.
 */

import { addDays } from "../src/lib/dates";
import { foodDayOf, type FoodDay } from "../src/lib/coach-api";
import { coachCheck, isSharingProgress, type SharingEnv } from "./sharing";

export const COACH_FOOD_DAYS = 182;

type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

export async function coachMemberFood(env: SharingEnv, viewerId: string, companyId: string, memberId: string, now = new Date()): Promise<Result> {
  const c = await coachCheck(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) {
    return { ok: false, status: 403, error: "This member isn't sharing their progress with you." };
  }
  const since = addDays(now.toISOString().slice(0, 10), -COACH_FOOD_DAYS);
  const { results } = await env.DB.prepare("SELECT date, entries FROM food_logs WHERE user_id = ? AND date >= ? ORDER BY date ASC")
    .bind(c.memberId, since)
    .all<{ date: string; entries: string }>();
  const days: FoodDay[] = [];
  for (const r of results) {
    try {
      const entries = JSON.parse(r.entries) as Parameters<typeof foodDayOf>[1];
      if (!Array.isArray(entries) || entries.length === 0) continue;
      days.push(foodDayOf(r.date, entries));
    } catch {
      /* skip a corrupt row */
    }
  }
  return { ok: true, body: { days } };
}
