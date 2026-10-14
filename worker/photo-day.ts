/**
 * "It's photo day" (Progress → Photos): a monthly Whop notification so
 * progress photos, and the monthly comparison, happen on schedule.
 *
 * Run from the cron every 15 minutes. A member is reminded once per gap when:
 *   - they take progress photos (newest within the last 120 days, so people
 *     who stopped aren't nagged forever) and haven't turned the reminder off
 *     (photo_settings.photo_day, on by default);
 *   - their newest photo is PHOTO_DAY_DAYS or more old;
 *   - it's about 9am where they are (their reminders' time zone), or 2pm UTC
 *     when we don't know it;
 *   - they aren't paused (sick or travelling).
 */

import { addDays, daysBetween } from "../src/lib/dates";
import { activePause } from "../src/lib/pause";
import { sanitizeAppState } from "../src/lib/persistence";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf, type SharingEnv } from "./sharing";

type Env = ReminderEnv & SharingEnv;

export const PHOTO_DAY_DAYS = 28;
const STOP_AFTER_DAYS = 120;
const LOCAL_HOUR = 9;
const UTC_HOUR_FALLBACK = 14;
const MAX_PER_RUN = 40;

function localNow(now: Date, timeZone: string): { date: string; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  } catch {
    return null;
  }
}

export async function sendPhotoDayReminders(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  const today = now.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT p.user_id, MAX(p.date) AS newest
     FROM progress_photos p LEFT JOIN photo_settings s ON s.user_id = p.user_id
     WHERE COALESCE(s.photo_day, 1) = 1
     GROUP BY p.user_id
     HAVING newest <= ? AND newest >= ?
     LIMIT 300`,
  )
    .bind(addDays(today, -PHOTO_DAY_DAYS), addDays(today, -STOP_AFTER_DAYS))
    .all<{ user_id: string; newest: string }>();

  let due = 0;
  let sent = 0;
  for (const r of results) {
    if (sent >= MAX_PER_RUN) break;
    const told = await env.DB.prepare("SELECT photo_date FROM photo_day_nudges WHERE user_id = ?").bind(r.user_id).first<{ photo_date: string }>();
    if (told && told.photo_date >= r.newest) continue;

    // About 9am their time, or 2pm UTC when we don't know their time zone.
    const tz = await env.DB.prepare("SELECT time_zone FROM reminders WHERE user_id = ?").bind(r.user_id).first<{ time_zone: string }>();
    const local = tz ? localNow(now, tz.time_zone) : null;
    if (local ? local.hour !== LOCAL_HOUR : now.getUTCHours() !== UTC_HOUR_FALLBACK) continue;
    const localDate = local?.date ?? today;

    // Not while paused; it goes out once they're back.
    const plan = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(r.user_id).first<{ state: string }>();
    if (plan) {
      try {
        if (activePause(sanitizeAppState(JSON.parse(plan.state)).tracking.pauses, localDate)) continue;
      } catch {
        /* unreadable plan: remind anyway */
      }
    }

    due++;
    // Record first, so a failed send isn't retried every 15 minutes.
    await env.DB.prepare(
      `INSERT INTO photo_day_nudges (user_id, photo_date) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET photo_date = excluded.photo_date, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(r.user_id, r.newest)
      .run();
    const exp = await experienceOf(env, r.user_id);
    if (!exp) continue;
    const weeks = Math.max(4, Math.floor(daysBetween(r.newest, localDate) / 7));
    const res = await sendWhop(env, exp, r.user_id, {
      title: "It's photo day",
      content: `${weeks} weeks since your last progress photos. Same spot, same light, same poses: Lean Stature System → Progress → Photos.`,
    });
    if (res.ok) sent++;
    else console.error("photo day reminder failed", { status: res.status, reason: res.reason });
  }
  return { due, sent };
}
