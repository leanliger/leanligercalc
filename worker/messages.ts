/**
 * Coach–member chat and announcements (src/lib/messages.ts):
 *
 *   GET  /api/messages?experience=…&open=1     members: my thread with my coach (open=1 marks theirs read)
 *   POST /api/messages                         members: send one { experience, body }
 *   GET  /api/coach/messages?company&member    coaches: a member's thread (marks theirs read)
 *   POST /api/coach/messages                   coaches: send one { company, member, body }
 *   GET  /api/coach/threads?company=…          coaches: every thread, newest first, with unread counts
 *   GET  /api/coach/announcements?company=…    coaches: announcements posted; POST to post one { company, title, body, tagId }
 *   DELETE /api/coach/announcements/:id?company=…
 *
 * One thread per member per whop. A member's whop comes from the community
 * they opened the app in (Whop's experience → company, cached). A new message
 * sends a Whop notification to the other side, unless they already have an
 * unread one from the last few minutes.
 */

import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import {
  NOTIFY_QUIET_MIN,
  validateAnnouncement,
  validateMessage,
  type Announcement,
  type ChatMessage,
  type ChatThread,
} from "../src/lib/messages";
import { MEMBER_ID_PATTERN } from "../src/lib/program-edits";
import { companyMembers } from "./coach";
import { experiencesOf } from "./experiences";
import { sendWhop, sendWhopTeam, type ReminderEnv } from "./reminders";
import { coachCheck, experienceOf } from "./sharing";
import { accessLevel, hasWhopKey, whopGet, whopReason, type WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const THREAD_LIMIT = 200;
const THREADS_LIMIT = 200;
const ANNOUNCEMENTS_LIMIT = 50;
/** Whop sends per announcement (100 members each). */
const ANNOUNCE_SENDS = 25;
const NOTIFY_CHUNK = 100;
/** Re-check an experience's whop after this long. */
const EXPERIENCE_TTL_DAYS = 30;
/** An admin check is reused this long, so an open chat's polling doesn't ask Whop every time. */
const ADMIN_CACHE_MS = 60_000;

const newId = () => crypto.randomUUID().replace(/-/g, "");
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/* --------------------------------- helpers --------------------------------- */

/** The whop a community belongs to: cached, else asked of Whop. Null if Whop doesn't say. */
export async function companyOfExperience(env: Env, experienceId: string | null): Promise<string | null> {
  if (!experienceId || !EXPERIENCE_ID_PATTERN.test(experienceId)) return null;
  const cached = await env.DB.prepare(
    `SELECT company_id FROM experience_companies WHERE experience_id = ? AND checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${EXPERIENCE_TTL_DAYS} days')`,
  )
    .bind(experienceId)
    .first<{ company_id: string }>();
  if (cached) return cached.company_id;
  if (!hasWhopKey(env)) return null;
  const res = await whopGet(env, `/api/v1/experiences/${encodeURIComponent(experienceId)}`).catch(() => null);
  const companyId = (res?.body as { company?: { id?: string } } | null)?.company?.id;
  if (!res || res.status !== 200 || !companyId || !COMPANY_ID_PATTERN.test(companyId)) {
    if (res) console.error("experience lookup failed", { status: res.status, reason: whopReason(res.body) });
    return null;
  }
  await env.DB.prepare(
    `INSERT INTO experience_companies (experience_id, company_id) VALUES (?, ?)
     ON CONFLICT (experience_id) DO UPDATE SET company_id = excluded.company_id, checked_at = ${NOW_SQL}`,
  )
    .bind(experienceId, companyId)
    .run();
  return companyId;
}

const adminSeen = new Map<string, number>();

/** The viewer is an admin of the whop (remembered for a minute on this isolate). */
async function adminCheck(env: Env, viewerId: string, companyId: string): Promise<Result | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const key = `${viewerId}|${companyId}`;
  if ((adminSeen.get(key) ?? 0) > Date.now()) return null;
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  adminSeen.set(key, Date.now() + ADMIN_CACHE_MS);
  return null;
}

interface MessageRow {
  id: string;
  from_coach: number;
  body: string;
  created_at: string;
  read_at: string | null;
}
const toMessage = (r: MessageRow): ChatMessage => ({ id: r.id, fromCoach: r.from_coach === 1, body: r.body, at: r.created_at, read: r.read_at !== null });

async function thread(env: Env, companyId: string, memberId: string): Promise<ChatMessage[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, from_coach, body, created_at, read_at FROM (
       SELECT * FROM coach_messages WHERE company_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT ?
     ) ORDER BY created_at`,
  )
    .bind(companyId, memberId, THREAD_LIMIT)
    .all<MessageRow>();
  return results.map(toMessage);
}

/** Mark the other side's messages read. */
async function markRead(env: Env, companyId: string, memberId: string, fromCoach: boolean): Promise<void> {
  await env.DB.prepare(`UPDATE coach_messages SET read_at = ${NOW_SQL} WHERE company_id = ? AND member_id = ? AND from_coach = ? AND read_at IS NULL`)
    .bind(companyId, memberId, fromCoach ? 1 : 0)
    .run();
}

/** Whether the recipient already has an unread message from this side, sent in the last few minutes. */
async function recentlyNotified(env: Env, companyId: string, memberId: string, fromCoach: boolean, excludeId: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `SELECT 1 AS x FROM coach_messages WHERE company_id = ? AND member_id = ? AND from_coach = ? AND read_at IS NULL AND id != ?
       AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${NOTIFY_QUIET_MIN} minutes') LIMIT 1`,
  )
    .bind(companyId, memberId, fromCoach ? 1 : 0, excludeId)
    .first();
  return r !== null;
}

/** The member's name on Whop, for the coach's notification. */
async function memberName(env: Env, userId: string): Promise<string> {
  const res = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`).catch(() => null);
  const u = (res?.status === 200 ? res.body : null) as { name?: string | null; username?: string | null } | null;
  return u?.name?.trim() || (u?.username ? `@${u.username}` : "A member");
}

const preview = (body: string) => (body.length > 140 ? `${body.slice(0, 137)}…` : body);

/* --------------------------------- members --------------------------------- */

export async function getMyMessages(env: Env, userId: string, experienceId: string | null, open: boolean): Promise<Result> {
  const companyId = await companyOfExperience(env, experienceId);
  if (!companyId) return { ok: true, body: { available: false, messages: [] } };
  if (open) await markRead(env, companyId, userId, true);
  return { ok: true, body: { available: true, messages: await thread(env, companyId, userId) } };
}

export async function sendMyMessage(env: Env, userId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const experienceId = typeof b.experience === "string" ? b.experience : null;
  const v = validateMessage(b.body);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const companyId = await companyOfExperience(env, experienceId);
  if (!companyId) return { ok: false, status: 409, error: "Open the app from your coach's Whop to message them." };
  const level = await accessLevel(env, userId, experienceId!);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level === "no_access") return { ok: false, status: 403, error: "You're not a member of this whop." };

  const id = newId();
  await env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, companyId, userId, userId, v.body)
    .run();
  if (!(await recentlyNotified(env, companyId, userId, false, id))) {
    const sent = await sendWhopTeam(env, companyId, null, { title: `${await memberName(env, userId)} sent you a message`, content: preview(v.body) });
    if (!sent.ok) console.error("chat notification to coach failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { messages: await thread(env, companyId, userId) } };
}

/* --------------------------------- coaches --------------------------------- */

export async function getMemberThread(env: Env, viewerId: string, companyId: string, memberId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!MEMBER_ID_PATTERN.test(memberId)) return { ok: false, status: 422, error: "Bad request." };
  await markRead(env, companyId, memberId, false);
  return { ok: true, body: { messages: await thread(env, companyId, memberId) } };
}

export async function sendCoachMessage(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = raw as Record<string, unknown>;
  const companyId = b.company as string;
  const v = validateMessage(b.body);
  if (!v.ok) return { ok: false, status: 422, error: v.error };

  const id = newId();
  await env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body) VALUES (?, ?, ?, 1, ?, ?)")
    .bind(id, companyId, c.memberId, viewerId, v.body)
    .run();
  // Replying reads what they sent.
  await markRead(env, companyId, c.memberId, false);
  let notified = false;
  if (!(await recentlyNotified(env, companyId, c.memberId, true, id))) {
    const experienceId = await experienceOf(env, c.memberId);
    if (experienceId) {
      const sent = await sendWhop(env, experienceId, c.memberId, { title: "Message from your coach", content: preview(v.body) });
      notified = sent.ok;
      if (!sent.ok) console.error("chat notification to member failed", { status: sent.status, reason: sent.reason });
    }
  }
  return { ok: true, body: { messages: await thread(env, companyId, c.memberId), notified } };
}

export async function coachThreads(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare(
    `SELECT m.member_id, m.id, m.from_coach, m.body, m.created_at, m.read_at,
            (SELECT COUNT(*) FROM coach_messages u WHERE u.company_id = m.company_id AND u.member_id = m.member_id AND u.from_coach = 0 AND u.read_at IS NULL) AS unread
       FROM coach_messages m
      WHERE m.company_id = ?1 AND m.created_at = (SELECT MAX(created_at) FROM coach_messages x WHERE x.company_id = ?1 AND x.member_id = m.member_id)
      ORDER BY m.created_at DESC LIMIT ?2`,
  )
    .bind(companyId, THREADS_LIMIT)
    .all<MessageRow & { member_id: string; unread: number }>();
  const threads: ChatThread[] = results.map((r) => ({ memberId: r.member_id, last: toMessage(r), unread: r.unread }));
  return { ok: true, body: { threads } };
}

/* ------------------------------ announcements ------------------------------ */

export async function getAnnouncements(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare("SELECT id, title, body, tag_id, created_at FROM announcements WHERE company_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(companyId, ANNOUNCEMENTS_LIMIT)
    .all<{ id: string; title: string; body: string; tag_id: string | null; created_at: string }>();
  const announcements: Announcement[] = results.map((r) => ({ id: r.id, title: r.title, body: r.body, tagId: r.tag_id, at: r.created_at }));
  return { ok: true, body: { announcements } };
}

export async function postAnnouncement(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const v = validateAnnouncement(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };

  const id = newId();
  await env.DB.prepare("INSERT INTO announcements (id, company_id, title, body, tag_id, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, companyId, v.title, v.body, v.tagId, viewerId)
    .run();

  // A Whop notification to everyone it's for, one request per community and 100 members.
  let notified = 0;
  const listed = await companyMembers(env, companyId);
  if (listed.ok) {
    let ids = [...listed.profiles.keys()];
    if (v.tagId) {
      const { results } = await env.DB.prepare("SELECT member_id, tag_ids FROM member_tags WHERE company_id = ?").bind(companyId).all<{ member_id: string; tag_ids: string }>();
      const tagged = new Set(
        results
          .filter((r) => {
            try {
              return (JSON.parse(r.tag_ids) as unknown[]).includes(v.tagId);
            } catch {
              return false;
            }
          })
          .map((r) => r.member_id),
      );
      ids = ids.filter((i) => tagged.has(i));
    }
    const experiences = await experiencesOf(env, ids);
    const byExperience = new Map<string, string[]>();
    for (const [userId, exp] of experiences) byExperience.set(exp, [...(byExperience.get(exp) ?? []), userId]);
    let sends = 0;
    for (const [exp, users] of byExperience) {
      for (let i = 0; i < users.length && sends < ANNOUNCE_SENDS; i += NOTIFY_CHUNK) {
        sends++;
        const chunk = users.slice(i, i + NOTIFY_CHUNK);
        const r = await sendWhop(env, exp, chunk, { title: v.title, content: preview(v.body) });
        if (r.ok) notified += chunk.length;
        else console.error("announcement notification failed", { status: r.status, reason: r.reason });
      }
    }
  }
  return { ok: true, body: { announcement: { id, title: v.title, body: v.body, tagId: v.tagId, at: new Date().toISOString() } satisfies Announcement, notified } };
}

export async function deleteAnnouncement(env: Env, viewerId: string, companyId: string, id: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, status: 422, error: "Bad request." };
  await env.DB.prepare("DELETE FROM announcements WHERE id = ? AND company_id = ?").bind(id, companyId).run();
  return { ok: true, body: { deleted: id } };
}
