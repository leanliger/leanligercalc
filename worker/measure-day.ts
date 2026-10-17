/**
 * "Time to measure" (Progress → Check-in → Measurements): a monthly Whop notification
 * to take tape measurements, like photo day (photo-day.ts).
 *
 *   GET /api/measurement-settings   { reminder }
 *   PUT /api/measurement-settings   { reminder: boolean }
 *
 * Run from the cron every 15 minutes. A member is reminded once per gap when:
 *   - they measure (newest within the last 120 days, so people who stopped
 *     aren't nagged forever) and haven't turned the reminder off;
 *   - their newest measurement is MEASURE_DAY_DAYS or more old;
 *   - it's about 9am where they are, or 2pm UTC when we don't know;
 *   - they aren't paused, and didn't get a photo-day reminder in the last
 *     20 hours (then it waits a day, so the two don't arrive together).
 */

import { addDays, daysBetween } from "../src/lib/dates";
import { activePause } from "../src/lib/pause";
import { sanitizeAppState } from "../src/lib/persistence";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf, type SharingEnv } from "./sharing";

type Env = ReminderEnv & SharingEnv;
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

export const MEASURE_DAY_DAYS = 28;
const STOP_AFTER_DAYS = 120;
const LOCAL_HOUR = 9;
const UTC_HOUR_FALLBACK = 14;
const MAX_PER_RUN = 40;
const PHOTO_DAY_GAP_HOURS = 20;

export async function measurementSettings(env: Env, userId: string, method: string, raw: unknown): Promise<Result> {
  if (method === "GET") {
    const r = await env.DB.prepare("SELECT reminder FROM measurement_settings WHERE user_id = ?").bind(userId).first<{ reminder: number }>();
    return { ok: true, body: { reminder: (r?.reminder ?? 1) === 1 } };
  }
  if (method !== "PUT") return { ok: false, status: 405, error: "Method not allowed." };
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof b.reminder !== "boolean") return { ok: false, status: 422, error: "reminder must be true or false." };
  await env.DB.prepare(
    "INSERT INTO measurement_settings (user_id, reminder) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET reminder = excluded.reminder",
  )
    .bind(userId, b.reminder ? 1 : 0)
    .run();
  return { ok: true, body: { reminder: b.reminder } };
}

function localNow(now: Date, timeZone: string): { date: string; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  } catch {
    return null;
  }
}

export async function sendMeasureDayReminders(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  const today = now.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT m.user_id, MAX(m.date) AS newest
     FROM measurements m LEFT JOIN measurement_settings s ON s.user_id = m.user_id
     WHERE COALESCE(s.reminder, 1) = 1
     GROUP BY m.user_id
     HAVING newest <= ? AND newest >= ?
     LIMIT 300`,
  )
    .bind(addDays(today, -MEASURE_DAY_DAYS), addDays(today, -STOP_AFTER_DAYS))
    .all<{ user_id: string; newest: string }>();

  let due = 0;
  let sent = 0;
  const photoCutoff = new Date(now.getTime() - PHOTO_DAY_GAP_HOURS * 3_600_000).toISOString();
  for (const r of results) {
    if (sent >= MAX_PER_RUN) break;
    const told = await env.DB.prepare("SELECT measured_date FROM measure_day_nudges WHERE user_id = ?").bind(r.user_id).first<{ measured_date: string }>();
    if (told && told.measured_date >= r.newest) continue;

    const tz = await env.DB.prepare("SELECT time_zone FROM reminders WHERE user_id = ?").bind(r.user_id).first<{ time_zone: string }>();
    const local = tz ? localNow(now, tz.time_zone) : null;
    if (local ? local.hour !== LOCAL_HOUR : now.getUTCHours() !== UTC_HOUR_FALLBACK) continue;
    const localDate = local?.date ?? today;

    const photo = await env.DB.prepare("SELECT sent_at FROM photo_day_nudges WHERE user_id = ?").bind(r.user_id).first<{ sent_at: string }>();
    if (photo && photo.sent_at >= photoCutoff) continue;

    const plan = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(r.user_id).first<{ state: string }>();
    if (plan) {
      try {
        if (activePause(sanitizeAppState(JSON.parse(plan.state)).tracking.pauses, localDate)) continue;
      } catch {
        /* unreadable plan: remind anyway */
      }
    }

    due++;
    await env.DB.prepare(
      `INSERT INTO measure_day_nudges (user_id, measured_date) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET measured_date = excluded.measured_date, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(r.user_id, r.newest)
      .run();
    const exp = await experienceOf(env, r.user_id);
    if (!exp) continue;
    const weeks = Math.max(4, Math.floor(daysBetween(r.newest, localDate) / 7));
    const res = await sendWhop(env, exp, r.user_id, {
      title: "Time to measure",
      content: `${weeks} weeks since your last tape measurements. Same spots, first thing in the morning: Lean Stature System → Progress → Check-in → Measurements.`,
    });
    if (res.ok) sent++;
    else console.error("measure day reminder failed", { status: res.status, reason: res.reason });
  }
  return { due, sent };
}
