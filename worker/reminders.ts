/**
 * Notifications sent through Whop by a one-minute Cron Trigger:
 *
 *   fasting     the eating window opening and closing (src/lib/fasting.ts)
 *   reminders   morning weigh-in, evening habits, bedtime downtime,
 *               Sunday recap (src/lib/reminders.ts)
 *
 * For each member who switched them on, the scheduler works out their local
 * time and asks Whop's API to notify them when something is due. Each one goes
 * out at most once per local day. The weigh-in and habit reminders are skipped
 * when there's nothing left to do, and nothing is sent on a day the member has
 * paused (sick or travelling — src/lib/pause.ts).
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
  timeOf,
  type ReminderKind,
  type ReminderSchedule,
} from "../src/lib/fasting";
import { addDays } from "../src/lib/dates";
import { sanitizeHabitDefs, weekStartOf, weeklyScore, type HabitDef, type HabitEntries } from "../src/lib/habits";
import {
  DEFAULT_DOWNTIME_LEAD,
  downtimeMessage,
  downtimeMinute,
  dueOn,
  habitsMessage,
  isSunday,
  minuteOrNull,
  recapMessage,
  weeklyWeightChange,
  weighInMessage,
  type Message,
  type ReminderType,
  type RemindersRequest,
} from "../src/lib/reminders";
import { dailyStreak } from "../src/lib/streaks";
import { isPausedOn, sanitizePauses, withPauses, type PausePeriod } from "../src/lib/pause";
import type { WeightUnit } from "../src/lib/types";
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
 * Sends per scheduler run, across all kinds. The Workers free plan allows 50
 * outgoing requests per invocation; anything over this waits for the next
 * minute, still inside the catch-up window.
 */
const MAX_SENDS_PER_RUN = 40;
/** How far back the habit streak in the evening reminder looks. */
const STREAK_LOOKBACK_DAYS = 400;

interface RunCounts {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
}

/* ------------------------------ Whop sending ------------------------------ */

export async function sendWhop(
  env: ReminderEnv,
  experienceId: string,
  userId: string,
  msg: Message,
): Promise<{ ok: boolean; status: number; reason?: string }> {
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
      body: JSON.stringify({ experience_id: experienceId, user_ids: [userId], title: msg.title, content: msg.content }),
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

/** A member's pause periods, from their plan. */
async function memberPauses(env: ReminderEnv, userId: string): Promise<PausePeriod[]> {
  const plan = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId).first<{ state: string }>();
  if (!plan) return [];
  try {
    return sanitizePauses((JSON.parse(plan.state) as { tracking?: { pauses?: unknown } } | null)?.tracking?.pauses);
  } catch {
    return [];
  }
}

/* ============================ fasting reminders ============================ */

interface FastingRow {
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

async function sendDueFasting(env: ReminderEnv, now: Date, budget: number): Promise<RunCounts> {
  const { results } = await env.DB.prepare(
    `SELECT user_id, experience_id, time_zone, open_minute, close_minute, first_label, first_time,
            last_label, last_time, meal_count, open_sent_on, close_sent_on
     FROM fasting_reminders`,
  ).all<FastingRow>();

  const jobs: { row: FastingRow; kind: ReminderKind; eventDate: string }[] = [];
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

  const counts: RunCounts = { due: jobs.length, sent: 0, failed: 0, skipped: 0 };
  const marks: D1PreparedStatement[] = [];
  for (const job of jobs.slice(0, budget)) {
    const column = job.kind === "open" ? "open_sent_on" : "close_sent_on";
    const markSent = () =>
      marks.push(env.DB.prepare(`UPDATE fasting_reminders SET ${column} = ? WHERE user_id = ?`).bind(job.eventDate, job.row.user_id));
    let paused = false;
    try {
      paused = isPausedOn(await memberPauses(env, job.row.user_id), job.eventDate);
    } catch {
      paused = false; // can't tell: send as usual
    }
    if (paused) {
      counts.skipped++;
      markSent();
      continue;
    }
    const msg = reminderMessage(job.kind, {
      first: { label: job.row.first_label, time: job.row.first_time },
      last: { label: job.row.last_label, time: job.row.last_time },
      mealCount: job.row.meal_count,
    });
    const result = await sendWhop(env, job.row.experience_id, job.row.user_id, msg);
    if (result.ok) {
      counts.sent++;
      markSent();
    } else {
      // Retried next minute while still inside the catch-up window. The status
      // is logged; the key and the member's details are not.
      counts.failed++;
      console.error("fasting reminder failed", { status: result.status, reason: result.reason, kind: job.kind });
    }
  }
  if (marks.length > 0) await env.DB.batch(marks);
  return counts;
}

/* ============================ check-in reminders ============================ */

interface ReminderRow {
  user_id: string;
  experience_id: string;
  time_zone: string;
  weighin_minute: number | null;
  habits_minute: number | null;
  recap_minute: number | null;
  /** Bedtime; the reminder goes out downtime_lead minutes before. */
  downtime_minute: number | null;
  downtime_lead: number | null;
  weighin_sent_on: string | null;
  habits_sent_on: string | null;
  recap_sent_on: string | null;
  downtime_sent_on: string | null;
}

const SENT_COLUMN: Record<ReminderType, string> = {
  weighIn: "weighin_sent_on",
  habits: "habits_sent_on",
  downtime: "downtime_sent_on",
  recap: "recap_sent_on",
};

export async function saveReminders(env: ReminderEnv, userId: string, r: RemindersRequest): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reminders
       (user_id, experience_id, time_zone, weighin_minute, habits_minute, recap_minute, downtime_minute, downtime_lead)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       experience_id   = excluded.experience_id,
       time_zone       = excluded.time_zone,
       weighin_minute  = excluded.weighin_minute,
       habits_minute   = excluded.habits_minute,
       recap_minute    = excluded.recap_minute,
       downtime_minute = excluded.downtime_minute,
       downtime_lead   = excluded.downtime_lead,
       updated_at      = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(
      userId,
      r.experienceId,
      r.timeZone,
      minuteOrNull(r.weighIn),
      minuteOrNull(r.habits),
      minuteOrNull(r.recap),
      minuteOrNull(r.downtime),
      r.downtimeLead,
    )
    .run();
}

export async function deleteReminders(env: ReminderEnv, userId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM reminders WHERE user_id = ?").bind(userId).run();
}

interface MemberHabits {
  defs: HabitDef[];
  unit: WeightUnit;
  logs: Map<string, HabitEntries>;
  firstLog: string | null;
}

/** A member's habit setup and recent habit logs, read when a reminder needs them. */
async function loadHabits(env: ReminderEnv, userId: string, upTo: string): Promise<MemberHabits> {
  const [plan, habitRows] = await Promise.all([
    env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId).first<{ state: string }>(),
    env.DB.prepare("SELECT date, entries FROM habit_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC")
      .bind(userId, addDays(upTo, -STREAK_LOOKBACK_DAYS), upTo)
      .all<{ date: string; entries: string }>(),
  ]);
  type PlanState = { unit?: unknown; tracking?: { habits?: unknown; pauses?: unknown } };
  let state: PlanState | null = null;
  try {
    state = plan ? (JSON.parse(plan.state) as PlanState) : null;
  } catch {
    state = null;
  }
  const logs = new Map<string, HabitEntries>();
  for (const row of habitRows.results) {
    try {
      logs.set(row.date, JSON.parse(row.entries) as HabitEntries);
    } catch {
      /* skip a corrupt row */
    }
  }
  return {
    defs: sanitizeHabitDefs(state?.tracking?.habits),
    unit: state?.unit === "kg" ? "kg" : "lb",
    // Paused days neither extend nor break the streak quoted in the reminder.
    logs: withPauses(logs, sanitizePauses(state?.tracking?.pauses), upTo),
    firstLog: habitRows.results[0]?.date ?? null,
  };
}

/**
 * What to send for a due reminder, or null when there's nothing to remind
 * about (paused, already weighed in, or every habit done). Reads only that
 * member's data, only when needed.
 */
async function composeReminder(env: ReminderEnv, row: ReminderRow, type: ReminderType, date: string): Promise<Message | null> {
  const userId = row.user_id;
  if (isPausedOn(await memberPauses(env, userId), date)) return null;
  if (type === "downtime") {
    if (row.downtime_minute === null) return null;
    return downtimeMessage(
      timeOf(row.downtime_minute),
      row.downtime_lead ?? DEFAULT_DOWNTIME_LEAD,
      row.weighin_minute === null ? null : timeOf(row.weighin_minute),
    );
  }
  if (type === "weighIn") {
    const logged = await env.DB.prepare("SELECT 1 AS x FROM weigh_ins WHERE user_id = ? AND date = ?").bind(userId, date).first();
    return logged ? null : weighInMessage();
  }

  const h = await loadHabits(env, userId, date);
  if (type === "habits") {
    const streak = dailyStreak(h.defs, h.logs, date, h.firstLog).current;
    return habitsMessage(h.defs, h.logs.get(date), streak);
  }

  // Sunday recap: this Monday–Sunday.
  const weekStart = weekStartOf(date);
  const score = weeklyScore(h.defs, h.logs, weekStart, date, h.firstLog);
  const [weighIns, foodRows] = await Promise.all([
    env.DB.prepare("SELECT date, weight_lb FROM weigh_ins WHERE user_id = ? AND date >= ? AND date <= ?")
      .bind(userId, addDays(weekStart, -7), date)
      .all<{ date: string; weight_lb: number }>(),
    env.DB.prepare("SELECT entries FROM food_logs WHERE user_id = ? AND date >= ? AND date <= ?")
      .bind(userId, weekStart, date)
      .all<{ entries: string }>(),
  ]);
  const dailyProtein: number[] = [];
  for (const r of foodRows.results) {
    try {
      const entries = JSON.parse(r.entries) as { protein?: number }[];
      if (entries.length > 0) dailyProtein.push(entries.reduce((s, e) => s + (Number(e.protein) || 0), 0));
    } catch {
      /* skip a corrupt row */
    }
  }
  return recapMessage({
    percent: score.percent,
    zone: score.zone,
    weightChangeLb: weeklyWeightChange(
      weighIns.results.map((w) => ({ date: w.date, weightLb: w.weight_lb })),
      weekStart,
      date,
    ),
    unit: h.unit,
    proteinAvg: dailyProtein.length > 0 ? dailyProtein.reduce((s, v) => s + v, 0) / dailyProtein.length : null,
  });
}

async function sendDueCheckinReminders(env: ReminderEnv, now: Date, budget: number): Promise<RunCounts> {
  const { results } = await env.DB.prepare(
    `SELECT user_id, experience_id, time_zone, weighin_minute, habits_minute, recap_minute,
            downtime_minute, downtime_lead, weighin_sent_on, habits_sent_on, recap_sent_on, downtime_sent_on
     FROM reminders`,
  ).all<ReminderRow>();

  const jobs: { row: ReminderRow; type: ReminderType; date: string }[] = [];
  for (const row of results) {
    let clock;
    try {
      clock = localClock(now, row.time_zone);
    } catch {
      continue;
    }
    const check = (type: ReminderType, minute: number | null, sentOn: string | null) => {
      if (minute === null) return;
      const date = dueOn(minute, sentOn, clock);
      if (date && (type !== "recap" || isSunday(date))) jobs.push({ row, type, date });
    };
    check("weighIn", row.weighin_minute, row.weighin_sent_on);
    check("habits", row.habits_minute, row.habits_sent_on);
    check("recap", row.recap_minute, row.recap_sent_on);
    check(
      "downtime",
      row.downtime_minute === null ? null : downtimeMinute(row.downtime_minute, row.downtime_lead ?? DEFAULT_DOWNTIME_LEAD),
      row.downtime_sent_on,
    );
  }

  const counts: RunCounts = { due: jobs.length, sent: 0, failed: 0, skipped: 0 };
  const marks: D1PreparedStatement[] = [];
  const mark = (job: (typeof jobs)[number]) =>
    marks.push(env.DB.prepare(`UPDATE reminders SET ${SENT_COLUMN[job.type]} = ? WHERE user_id = ?`).bind(job.date, job.row.user_id));

  let attempts = 0;
  for (const job of jobs) {
    if (attempts >= budget) break;
    let msg: Message | null;
    try {
      msg = await composeReminder(env, job.row, job.type, job.date);
    } catch (e) {
      counts.failed++;
      console.error("reminder compose failed", { type: job.type, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (!msg) {
      // Nothing to remind about today: mark it done so it isn't rechecked.
      counts.skipped++;
      mark(job);
      continue;
    }
    attempts++;
    const result = await sendWhop(env, job.row.experience_id, job.row.user_id, msg);
    if (result.ok) {
      counts.sent++;
      mark(job);
    } else {
      counts.failed++;
      console.error("reminder failed", { status: result.status, reason: result.reason, type: job.type });
    }
  }
  if (marks.length > 0) await env.DB.batch(marks);
  return counts;
}

/* --------------------------------- runner --------------------------------- */

/** Everything the minute scheduler does. Returns counts, for logs and tests. */
export async function sendDueReminders(env: ReminderEnv, now: Date): Promise<{ fasting: RunCounts; checkin: RunCounts }> {
  const none: RunCounts = { due: 0, sent: 0, failed: 0, skipped: 0 };
  if (!secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")) return { fasting: none, checkin: none };
  const fasting = await sendDueFasting(env, now, MAX_SENDS_PER_RUN);
  const left = MAX_SENDS_PER_RUN - Math.min(fasting.due, MAX_SENDS_PER_RUN);
  const checkin = left > 0 ? await sendDueCheckinReminders(env, now, left) : { ...none };
  return { fasting, checkin };
}
