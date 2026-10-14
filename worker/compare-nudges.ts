/**
 * "Your monthly comparison is ready" (Progress → Photos → Monthly comparison).
 *
 * Run from the cron every 15 minutes. A member is told once per new photo
 * set, when all of these hold:
 *   - physique analysis is switched on (GEMINI_API_KEY);
 *   - they uploaded photos in the last day, the latest at least 30 minutes ago
 *     (so a front, side and back added one after another is one message);
 *   - those photos are newer than anything they've compared, by at least
 *     COMPARE_MIN_DAYS, and an older photo exists to compare against;
 *   - we haven't already told them about this set (compare_nudges).
 * Nothing about the photos goes in the message.
 */

import { addDays, daysBetween } from "../src/lib/dates";
import { COMPARE_MIN_DAYS } from "../src/lib/physique";
import { physiqueOn, type PhysiqueEnv } from "./physique";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf, type SharingEnv } from "./sharing";

type Env = PhysiqueEnv & ReminderEnv & SharingEnv;

const MAX_PER_RUN = 25;
const ts = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, ".000Z");

export async function sendCompareNudges(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  if (!physiqueOn(env)) return { due: 0, sent: 0 };
  const { results } = await env.DB.prepare(
    `SELECT p.user_id, MAX(p.date) AS newest, MAX(p.created_at) AS last_upload
     FROM progress_photos p
     GROUP BY p.user_id
     HAVING last_upload >= ? AND last_upload <= ?
     LIMIT 200`,
  )
    .bind(ts(new Date(now.getTime() - 24 * 3600_000)), ts(new Date(now.getTime() - 30 * 60_000)))
    .all<{ user_id: string; newest: string; last_upload: string }>();

  let due = 0;
  let sent = 0;
  for (const r of results) {
    if (sent >= MAX_PER_RUN) break;
    const told = await env.DB.prepare("SELECT photo_date FROM compare_nudges WHERE user_id = ?").bind(r.user_id).first<{ photo_date: string }>();
    if (told && told.photo_date >= r.newest) continue;
    const last = await env.DB.prepare(
      "SELECT MAX(photo_date) AS d FROM physique_analyses WHERE user_id = ? AND source = 'compare'",
    )
      .bind(r.user_id)
      .first<{ d: string | null }>();
    if (last?.d && (last.d >= r.newest || daysBetween(last.d, r.newest) < COMPARE_MIN_DAYS)) continue;
    const older = await env.DB.prepare("SELECT MAX(date) AS d FROM progress_photos WHERE user_id = ? AND date <= ?")
      .bind(r.user_id, addDays(r.newest, -COMPARE_MIN_DAYS))
      .first<{ d: string | null }>();
    if (!older?.d) continue;

    due++;
    // Record first, so a failed send isn't retried every 15 minutes.
    await env.DB.prepare(
      `INSERT INTO compare_nudges (user_id, photo_date) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET photo_date = excluded.photo_date, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(r.user_id, r.newest)
      .run();
    const exp = await experienceOf(env, r.user_id);
    if (!exp) continue;
    const res = await sendWhop(env, exp, r.user_id, {
      title: "Your monthly comparison is ready",
      content: "Your new photos are in. Open Lean Stature System → Progress → Photos to see what changed this month.",
    });
    if (res.ok) sent++;
    else console.error("compare nudge failed", { status: res.status, reason: res.reason });
  }
  return { due, sent };
}
