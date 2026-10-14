/**
 * Hydration reminders (src/lib/water-reminders.ts):
 *
 *   GET    /api/water-reminders   my settings, or { on: false }
 *   PUT    /api/water-reminders   { experienceId, timeZone, every, start, end }: turn on / update
 *   DELETE /api/water-reminders   turn off
 *
 * Sent from the every-minute cron: each slot once, up to
 * REMINDER_CATCH_UP_MINUTES late, skipped once the day's six bottles are
 * ticked or while the member is paused.
 */

import { localClock, REMINDER_CATCH_UP_MINUTES } from "../src/lib/fasting";
import { WATER_KEY } from "../src/lib/habits";
import { activePause } from "../src/lib/pause";
import { sanitizeAppState } from "../src/lib/persistence";
import { WATER_GOAL_BOTTLES } from "../src/lib/water";
import { currentWaterSlot, validateWaterReminderRequest, waterSlots } from "../src/lib/water-reminders";
import { sendWhop, type ReminderEnv } from "./reminders";

type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function waterReminders(env: ReminderEnv, userId: string, method: string, raw: unknown): Promise<Result> {
  if (method === "GET") {
    const r = await env.DB.prepare("SELECT start_min, end_min, every_min FROM water_reminders WHERE user_id = ?")
      .bind(userId)
      .first<{ start_min: number; end_min: number; every_min: number }>();
    return { ok: true, body: r ? { on: true, every: r.every_min, start: hhmm(r.start_min), end: hhmm(r.end_min) } : { on: false } };
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM water_reminders WHERE user_id = ?").bind(userId).run();
    return { ok: true, body: { on: false } };
  }
  if (method !== "PUT") return { ok: false, status: 405, error: "Method not allowed." };
  const v = validateWaterReminderRequest(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const [sh, sm] = v.value.start.split(":").map(Number);
  const [eh, em] = v.value.end.split(":").map(Number);
  // Today's slots that have already passed count as sent, so turning it on
  // mid-afternoon doesn't fire a stale morning reminder.
  const now = localClock(new Date(), v.value.timeZone);
  const startMin = sh! * 60 + sm!;
  const endMin = eh! * 60 + em!;
  const slot = currentWaterSlot(now.minute, startMin, endMin, v.value.every);
  await env.DB.prepare(
    `INSERT INTO water_reminders (user_id, experience_id, time_zone, start_min, end_min, every_min, sent_date, sent_slot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET experience_id = excluded.experience_id, time_zone = excluded.time_zone,
       start_min = excluded.start_min, end_min = excluded.end_min, every_min = excluded.every_min,
       sent_date = excluded.sent_date, sent_slot = excluded.sent_slot,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(userId, v.value.experienceId, v.value.timeZone, startMin, endMin, v.value.every, slot === null ? null : now.date, slot)
    .run();
  return { ok: true, body: { on: true, every: v.value.every, start: v.value.start, end: v.value.end } };
}

interface Row {
  user_id: string;
  experience_id: string;
  time_zone: string;
  start_min: number;
  end_min: number;
  every_min: number;
  sent_date: string | null;
  sent_slot: number | null;
}

/** Every minute: the hydration reminders that are due. */
export async function sendDueWaterReminders(env: ReminderEnv, now: Date, limit = 100): Promise<{ due: number; sent: number }> {
  const { results } = await env.DB.prepare(
    "SELECT user_id, experience_id, time_zone, start_min, end_min, every_min, sent_date, sent_slot FROM water_reminders LIMIT 2000",
  ).all<Row>();
  let due = 0;
  let sent = 0;
  for (const r of results) {
    if (sent >= limit) break;
    let clock;
    try {
      clock = localClock(now, r.time_zone);
    } catch {
      continue;
    }
    const slot = currentWaterSlot(clock.minute, r.start_min, r.end_min, r.every_min);
    if (slot === null) continue;
    if (r.sent_date === clock.date && r.sent_slot !== null && r.sent_slot >= slot) continue;
    // Only if the scheduler is roughly on time; a long outage doesn't send a backlog.
    const slotMinute = waterSlots(r.start_min, r.end_min, r.every_min)[slot]!;
    const late = clock.minute - slotMinute;
    const mark = () =>
      env.DB.prepare("UPDATE water_reminders SET sent_date = ?, sent_slot = ? WHERE user_id = ?").bind(clock.date, slot, r.user_id).run();
    if (late > REMINDER_CATCH_UP_MINUTES) {
      await mark();
      continue;
    }

    // Done for the day, or paused: nothing to send (but the slot is used).
    const log = await env.DB.prepare("SELECT entries FROM habit_logs WHERE user_id = ? AND date = ?").bind(r.user_id, clock.date).first<{ entries: string }>();
    let bottles = 0;
    try {
      const n = log ? (JSON.parse(log.entries) as Record<string, unknown>)[WATER_KEY] : 0;
      bottles = typeof n === "number" ? n : 0;
    } catch {
      bottles = 0;
    }
    if (bottles >= WATER_GOAL_BOTTLES) {
      await mark();
      continue;
    }
    const plan = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(r.user_id).first<{ state: string }>();
    if (plan) {
      try {
        if (activePause(sanitizeAppState(JSON.parse(plan.state)).tracking.pauses, clock.date)) {
          await mark();
          continue;
        }
      } catch {
        /* unreadable plan: remind anyway */
      }
    }

    due++;
    await mark();
    const res = await sendWhop(env, r.experience_id, r.user_id, {
      title: "Time to hydrate",
      content:
        bottles === 0
          ? `No water logged yet today. Have a bottle now and tick it in Lean Stature System → Food → Water.`
          : `${bottles} of ${WATER_GOAL_BOTTLES} bottles so far today. Have another now.`,
    });
    if (res.ok) sent++;
    else console.error("water reminder failed", { status: res.status, reason: res.reason });
  }
  return { due, sent };
}
