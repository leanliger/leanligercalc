/**
 * The coach's daily digest (src/lib/messages.ts → digestMessage):
 *
 *   GET /api/coach/digest?company=…   coaches: is my digest on
 *   PUT /api/coach/digest             coaches: { company, enabled, timeZone }
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
import { sendWhopTeam, type ReminderEnv } from "./reminders";
import { accessLevel, hasWhopKey } from "./whop";

type Env = CoachEnv & ReminderEnv;
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

/** Digests worked out per run: each reads a whole overview. */
const DIGESTS_PER_RUN = 4;

async function adminCheck(env: Env, viewerId: string, companyId: string): Promise<Result | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  return null;
}

export async function getDigest(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
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

export async function sendCoachDigests(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  if (!hasWhopKey(env)) return { due: 0, sent: 0 };
  const { results } = await env.DB.prepare("SELECT company_id, user_id, time_zone, sent_on FROM coach_digests WHERE enabled = 1")
    .all<{ company_id: string; user_id: string; time_zone: string; sent_on: string | null }>();
  const due = results
    .map((r) => ({ ...r, clock: localClock(now, r.time_zone) }))
    .filter((r) => r.sent_on !== r.clock.date && r.clock.minute >= DIGEST_HOUR * 60 && r.clock.minute < (DIGEST_HOUR + 4) * 60)
    .slice(0, DIGESTS_PER_RUN);

  let sent = 0;
  for (const r of due) {
    // Marked first, so a failure doesn't send it again every 15 minutes.
    await env.DB.prepare("UPDATE coach_digests SET sent_on = ? WHERE company_id = ? AND user_id = ?").bind(r.clock.date, r.company_id, r.user_id).run();
    const overview = await coachOverview(env, r.user_id, r.company_id, now).catch((e: unknown) => {
      console.error("digest overview failed", e);
      return null;
    });
    if (!overview?.ok) continue;
    const body = overview.body as CoachOverview;
    const members = body.members.filter((m) => m.sharing.state === "shared").map((m) => summarizeMember(m, r.clock.date));
    const unread = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE company_id = ? AND from_coach = 0 AND read_at IS NULL")
      .bind(r.company_id)
      .first<{ n: number }>();
    const msg = digestMessage(members, unread?.n ?? 0);
    if (!msg) continue;
    const res = await sendWhopTeam(env, r.company_id, [r.user_id], msg);
    if (res.ok) sent++;
    else console.error("coach digest failed", { status: res.status, reason: res.reason });
  }
  return { due: due.length, sent };
}
