/**
 * Intermittent fasting notifications, sent through Whop.
 *
 * A Cron Trigger runs `sendDueReminders` every minute. For each member who
 * switched notifications on, it works out their local time, and when their
 * eating window has just opened or closed it asks Whop's API to notify them
 * (Whop mobile app and web). Each notification goes out once per local day.
 *
 * Needs a Whop app API key with the `notification:create` permission, set as
 * the WHOP_API_KEY secret. Without it, nothing is sent and the app tells
 * members notifications aren't available yet.
 */

import {
  dueReminders,
  localClock,
  reminderMessage,
  reminderMinutes,
  type ReminderKind,
  type ReminderSchedule,
} from "../src/lib/fasting";
import { secretValue } from "./secrets";

export interface ReminderEnv {
  DB: D1Database;
  /** Whop app API key with the notification:create permission. Secret. */
  WHOP_API_KEY?: string;
  /** Override for tests only (a local mock of Whop's API). */
  WHOP_API_BASE?: string;
}

const WHOP_API = "https://api.whop.com";
const SEND_TIMEOUT_MS = 8000;
/**
 * Sends per scheduler run. The Workers free plan allows 50 outgoing requests
 * per invocation; anything over this waits for the next minute, still inside
 * the catch-up window.
 */
const MAX_SENDS_PER_RUN = 40;

interface ReminderRow {
  user_id: string;
  experience_id: string;
  time_zone: string;
  open_minute: number;
  close_minute: number;
  first_label: string;
  first_time: string;
  last_label: string;
  last_time: string;
  meal_count: number;
  open_sent_on: string | null;
  close_sent_on: string | null;
}

/* ------------------------------- storage ------------------------------- */

export async function saveReminder(env: ReminderEnv, userId: string, s: ReminderSchedule): Promise<void> {
  const { open, close } = reminderMinutes(s);
  // The "already sent today" markers are kept, so changing meal times can't
  // produce a second notification for the same day.
  await env.DB.prepare(
    `INSERT INTO fasting_reminders
       (user_id, experience_id, time_zone, open_minute, close_minute,
        first_label, first_time, last_label, last_time, meal_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       experience_id = excluded.experience_id,
       time_zone     = excluded.time_zone,
       open_minute   = excluded.open_minute,
       close_minute  = excluded.close_minute,
       first_label   = excluded.first_label,
       first_time    = excluded.first_time,
       last_label    = excluded.last_label,
       last_time     = excluded.last_time,
       meal_count    = excluded.meal_count,
       updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(userId, s.experienceId, s.timeZone, open, close, s.first.label, s.first.time, s.last.label, s.last.time, s.mealCount)
    .run();
}

export async function deleteReminder(env: ReminderEnv, userId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM fasting_reminders WHERE user_id = ?").bind(userId).run();
}

/* ------------------------------- sending ------------------------------- */

async function notify(
  env: ReminderEnv,
  row: ReminderRow,
  kind: ReminderKind,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const { title, content } = reminderMessage(kind, {
    first: { label: row.first_label, time: row.first_time },
    last: { label: row.last_label, time: row.last_time },
    mealCount: row.meal_count,
  });
  try {
    const res = await fetch(`${env.WHOP_API_BASE ?? WHOP_API}/api/v1/notifications`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")}`,
        "content-type": "application/json",
        accept: "application/json",
        // Workers send no User-Agent by default, and some APIs refuse that.
        "user-agent": "LeanLigerCalc/1.0 (+https://leanligercalc.lean-liger-fitness.workers.dev)",
      },
      body: JSON.stringify({ experience_id: row.experience_id, user_ids: [row.user_id], title, content }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, status: res.status };
    // Whop's error explains the rejection (e.g. a missing permission). It
    // never contains the API key.
    const text = (await res.text().catch(() => "")).slice(0, 2000);
    let reason = text.slice(0, 300);
    try {
      const body = JSON.parse(text) as { error?: { type?: string; code?: string; message?: string } | string; message?: string };
      const e = body.error;
      const parts = typeof e === "object" && e ? [e.type, e.code, e.message] : [e, body.message];
      reason = parts.filter(Boolean).join(" | ").slice(0, 300) || reason;
    } catch {
      /* not JSON: keep the raw text */
    }
    return { ok: false, status: res.status, reason };
  } catch (e) {
    return { ok: false, status: 0, reason: e instanceof Error ? e.message.slice(0, 200) : "request failed" };
  }
}

/** Send every notification that's due. Returns counts, for logs and tests. */
export async function sendDueReminders(env: ReminderEnv, now: Date): Promise<{ due: number; sent: number; failed: number }> {
  if (!secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")) return { due: 0, sent: 0, failed: 0 };

  const { results } = await env.DB.prepare(
    `SELECT user_id, experience_id, time_zone, open_minute, close_minute, first_label, first_time,
            last_label, last_time, meal_count, open_sent_on, close_sent_on
     FROM fasting_reminders`,
  ).all<ReminderRow>();

  const jobs: { row: ReminderRow; kind: ReminderKind; eventDate: string }[] = [];
  for (const row of results) {
    let clock;
    try {
      clock = localClock(now, row.time_zone);
    } catch {
      continue; // a time zone this runtime doesn't know; skip rather than fail everyone
    }
    for (const due of dueReminders(
      { openMinute: row.open_minute, closeMinute: row.close_minute, openSentOn: row.open_sent_on, closeSentOn: row.close_sent_on },
      clock,
    )) {
      jobs.push({ row, ...due });
    }
  }

  let sent = 0;
  let failed = 0;
  const marks: D1PreparedStatement[] = [];
  for (const job of jobs.slice(0, MAX_SENDS_PER_RUN)) {
    const result = await notify(env, job.row, job.kind);
    if (result.ok) {
      sent++;
      const column = job.kind === "open" ? "open_sent_on" : "close_sent_on";
      marks.push(
        env.DB.prepare(`UPDATE fasting_reminders SET ${column} = ? WHERE user_id = ?`).bind(job.eventDate, job.row.user_id),
      );
    } else {
      // Retried next minute while still inside the catch-up window. The status
      // is logged; the key and the member's details are not.
      failed++;
      console.error("fasting reminder failed", { status: result.status, reason: result.reason, kind: job.kind });
    }
  }
  if (marks.length > 0) await env.DB.batch(marks);
  return { due: jobs.length, sent, failed };
}
