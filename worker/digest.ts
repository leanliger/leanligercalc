/**
 * The coach's daily digest (src/lib/messages.ts → digestMessage):
 *
 *   GET /api/coach/digest?company=…   coaches: is my digest on
 *   PUT /api/coach/digest             coaches: { company, enabled, timeZone }
 *   GET /api/coach/digest/preview?company=…   coaches: today's digest as it would arrive, nothing sent
 *   POST /api/coach/digest/send        coaches: send it to me now { company }
 *   GET /api/coach/digests?company=…   coaches: my past digests, newest first
 *
 * Each coach who turns it on gets one Whop notification a day, at 8am their
 * time, summing up their Today page: check-ins to reply to, members to reach
 * out to, slipping lifts, wins, and unread messages. Nothing goes out on a day
 * nothing needs them. Checked from the cron every 15 minutes; it reads the
 * same overview the dashboard does, as that coach (so it stops if they're no
 * longer an admin).
 */

import { summarizeMember, type CoachOverview } from "../src/lib/coach";
import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { isValidTimeZone, localClock } from "../src/lib/fasting";
import { DIGEST_HOUR, digestMessage } from "../src/lib/messages";
import { coachOverview, type CoachEnv } from "./coach";
import { sendWhop, sendWhopTeam, type ReminderEnv } from "./reminders";
import { accessLevel, hasWhopKey } from "./whop";

type Env = CoachEnv & ReminderEnv;
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

/** Digests worked out per run: each reads a whole overview. */
const DIGESTS_PER_RUN = 6;

async function adminCheck(env: Env, viewerId: string, companyId: string): Promise<Result | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  return null;
}

export async function getDigest(env: Env, viewerId: string, companyId: string, timeZone: string | null = null): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  // The dashboard keeps a daily digest for every coach who opens it, with the Whop notification off until they switch it on.
  if (timeZone && isValidTimeZone(timeZone)) {
    await env.DB.prepare("INSERT OR IGNORE INTO coach_digests (company_id, user_id, enabled, time_zone) VALUES (?, ?, 0, ?)")
      .bind(companyId, viewerId, timeZone)
      .run();
  }
  const r = await env.DB.prepare("SELECT enabled, sent_on FROM coach_digests WHERE company_id = ? AND user_id = ?")
    .bind(companyId, viewerId)
    .first<{ enabled: number; sent_on: string | null }>();
  return { ok: true, body: { enabled: r?.enabled === 1, lastSent: r?.sent_on ?? null, hour: DIGEST_HOUR } };
}

export async function saveDigest(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (typeof b.enabled !== "boolean" || !isValidTimeZone(b.timeZone)) return { ok: false, status: 422, error: "Bad request." };
  await env.DB.prepare(
    `INSERT INTO coach_digests (company_id, user_id, enabled, time_zone) VALUES (?, ?, ?, ?)
     ON CONFLICT (company_id, user_id) DO UPDATE SET enabled = excluded.enabled, time_zone = excluded.time_zone,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(companyId, viewerId, b.enabled ? 1 : 0, b.timeZone)
    .run();
  return getDigest(env, viewerId, companyId);
}

/** One coach's digest for a day (as that coach, so it stops if they're no longer an admin); null when nothing needs them. */
async function digestFor(env: Env, companyId: string, userId: string, date: string, now: Date): Promise<{ title: string; content: string } | null> {
  const overview = await coachOverview(env, userId, companyId, now).catch((e: unknown) => {
    console.error("digest overview failed", e);
    return null;
  });
  if (!overview?.ok) return null;
  const body = overview.body as CoachOverview;
  const members = body.members.filter((m) => m.sharing.state === "shared").map((m) => summarizeMember(m, date));
  const unread = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE company_id = ? AND from_coach = 0 AND read_at IS NULL")
    .bind(companyId)
    .first<{ n: number }>();
  return digestMessage(members, unread?.n ?? 0);
}

/** "Send my digest now": the preview, nothing sent. */
export async function previewDigest(env: Env, viewerId: string, companyId: string, now = new Date()): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  return { ok: true, body: { message: await digestFor(env, companyId, viewerId, now.toISOString().slice(0, 10), now) } };
}

/** Send today's digest to the coach asking, now (only to them). */
export async function sendDigestNow(env: Env, viewerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const msg = await digestFor(env, companyId, viewerId, now.toISOString().slice(0, 10), now);
  if (!msg) return { ok: false, status: 409, error: "Nothing needs you today, so there's no digest to send." };
  const status = await deliver(env, companyId, viewerId, msg);
  const row = await env.DB.prepare("SELECT time_zone FROM coach_digests WHERE company_id = ? AND user_id = ?").bind(companyId, viewerId).first<{ time_zone: string }>();
  await logDigest(env, companyId, viewerId, row ? localClock(now, row.time_zone).date : now.toISOString().slice(0, 10), msg, status);
  if (status.startsWith("failed")) return { ok: false, status: 502, error: `Whop didn't take it: ${status.slice("failed: ".length) || "no reason given"}.` };
  return { ok: true, body: { sent: true, route: status } };
}

/**
 * Send a digest to one coach: as a notification to the whop's team, narrowed
 * to them. If Whop refuses that, through the whop's community instead, still
 * to them only. Returns what happened, for the log.
 */
async function deliver(env: Env, companyId: string, userId: string, msg: { title: string; content: string }): Promise<string> {
  const team = await sendWhopTeam(env, companyId, [userId], msg);
  if (team.ok) return "sent";
  console.error("coach digest failed (team)", { status: team.status, reason: team.reason });
  const exp = await env.DB.prepare("SELECT experience_id FROM experience_companies WHERE company_id = ? LIMIT 1").bind(companyId).first<{ experience_id: string }>();
  if (exp) {
    const viaCommunity = await sendWhop(env, exp.experience_id, userId, msg);
    if (viaCommunity.ok) return "sent-community";
    console.error("coach digest failed (community)", { status: viaCommunity.status, reason: viaCommunity.reason });
  }
  return `failed: ${(team.reason ?? `status ${team.status}`).slice(0, 200)}`;
}

/** Keep the day's digest for the dashboard (the latest for that day wins). */
async function logDigest(env: Env, companyId: string, userId: string, date: string, msg: { title: string; content: string }, status: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO coach_digest_log (company_id, user_id, date, title, content, status) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (company_id, user_id, date) DO UPDATE SET title = excluded.title, content = excluded.content, status = excluded.status,
       created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(companyId, userId, date, msg.title, msg.content, status)
    .run();
}

/** Today → Daily digests: my past digests, newest first. */
export async function listDigests(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare("SELECT date, title, content, status FROM coach_digest_log WHERE company_id = ? AND user_id = ? ORDER BY date DESC LIMIT 60")
    .bind(companyId, viewerId)
    .all<{ date: string; title: string; content: string; status: string }>();
  return { ok: true, body: { digests: results } };
}

export async function sendCoachDigests(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  if (!hasWhopKey(env)) return { due: 0, sent: 0 };
  // Every coach with a row gets a digest on the dashboard; only those who switched it on get the Whop notification.
  const { results } = await env.DB.prepare("SELECT company_id, user_id, time_zone, sent_on, enabled FROM coach_digests")
    .all<{ company_id: string; user_id: string; time_zone: string; sent_on: string | null; enabled: number }>();
  const due = results
    .map((r) => ({ ...r, clock: localClock(now, r.time_zone) }))
    .filter((r) => r.sent_on !== r.clock.date && r.clock.minute >= DIGEST_HOUR * 60 && r.clock.minute < (DIGEST_HOUR + 4) * 60)
    .slice(0, DIGESTS_PER_RUN);

  let sent = 0;
  for (const r of due) {
    // Marked first, so a failure doesn't send it again every 15 minutes.
    await env.DB.prepare("UPDATE coach_digests SET sent_on = ? WHERE company_id = ? AND user_id = ?").bind(r.clock.date, r.company_id, r.user_id).run();
    const msg = await digestFor(env, r.company_id, r.user_id, r.clock.date, now);
    if (!msg) {
      await logDigest(env, r.company_id, r.user_id, r.clock.date, { title: "All caught up", content: "Nothing needed you this morning." }, "nothing");
      continue;
    }
    const status = r.enabled === 1 ? await deliver(env, r.company_id, r.user_id, msg) : "off";
    await logDigest(env, r.company_id, r.user_id, r.clock.date, msg, status);
    if (status === "sent" || status === "sent-community") sent++;
  }
  return { due: due.length, sent };
}
