/**
 * Coach–member chat and announcements (src/lib/messages.ts):
 *
 *   GET  /api/messages?experience=…&open=1     members: my thread with my coach (open=1 marks theirs read)
 *   POST /api/messages                         members: send one { experience, body }
 *   POST /api/messages/attachment?experience&kind=photo|voice&seconds   members: send a photo (JPEG) or voice note
 *   GET  /api/messages/attachment/:id          members: a photo or voice note in my thread
 *   GET  /api/coach/messages?company&member    coaches: a member's thread (marks theirs read)
 *   POST /api/coach/messages                   coaches: send one { company, member, body, sendAt? } (sendAt schedules it)
 *   POST /api/coach/messages/bulk              coaches: the same message to many members { company, members, body, sendAt? }
 *   POST /api/coach/messages/attachment?company&member&kind&seconds     coaches: send a photo or voice note
 *   GET  /api/coach/messages/attachment/:id?company=…
 *   DELETE /api/coach/messages/:id?company=…   coaches: cancel a scheduled message
 *   GET  /api/coach/threads?company=…          coaches: every thread, newest first, with unread counts
 *   GET  /api/coach/announcements?company=…    coaches: announcements; POST to post one { company, title, body, tagId, sendAt? }
 *   DELETE /api/coach/announcements/:id?company=…
 *
 * One thread per member per whop. A member's whop comes from the community
 * they opened the app in (Whop's experience → company, cached). A new message
 * sends a Whop notification to the other side, unless they already have an
 * unread one from the last few minutes. Scheduled messages and announcements
 * wait (pending) until the cron delivers them. Photos and voice notes are kept
 * privately in R2 (the PHOTOS bucket), with no public URLs; photo metadata
 * (location, camera) is removed on the device and again here.
 */

import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { VOICE_TYPES } from "../src/lib/checkins";
import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import {
  BULK_MAX,
  CHAT_ATTACHMENTS_PER_DAY,
  CHAT_PHOTO_MAX_BYTES,
  CHAT_VOICE_MAX_BYTES,
  CHAT_VOICE_MAX_SECONDS,
  NOTIFY_QUIET_MIN,
  validateAnnouncement,
  validateMessage,
  validateSendAt,
  type Announcement,
  type ChatMessage,
  type ChatThread,
} from "../src/lib/messages";
import { PHOTO_STORAGE_CAP_BYTES, looksLikeJpeg } from "../src/lib/photos";
import { MEMBER_ID_PATTERN } from "../src/lib/program-edits";
import { companyMembers } from "./coach";
import { experiencesOf } from "./experiences";
import { photoStorageUsed, type PhotoEnv } from "./photos";
import { sendWhop, sendWhopTeam, type ReminderEnv } from "./reminders";
import { coachCheck, experienceOf } from "./sharing";
import { accessLevel, hasWhopKey, whopGet, whopReason, type WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & PhotoEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const THREAD_LIMIT = 200;
const THREADS_LIMIT = 200;
const ANNOUNCEMENTS_LIMIT = 50;
/** Whop sends per announcement or bulk message (100 members each). */
const NOTIFY_SENDS = 25;
const NOTIFY_CHUNK = 100;
/** Scheduled messages and announcements delivered per cron run. */
const DUE_MESSAGES_PER_RUN = 20;
const DUE_ANNOUNCEMENTS_PER_RUN = 2;
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
export async function adminCheck(env: Env, viewerId: string, companyId: string): Promise<Result | null> {
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
  pending: number;
  send_at: string | null;
  attachment: string | null;
  attachment_seconds: number | null;
}
const COLUMNS = "id, from_coach, body, created_at, read_at, pending, send_at, attachment, attachment_seconds";
const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  fromCoach: r.from_coach === 1,
  body: r.body,
  at: r.created_at,
  read: r.read_at !== null,
  attachment: r.attachment === "photo" || r.attachment === "voice" ? { kind: r.attachment, seconds: r.attachment_seconds } : null,
  scheduledFor: r.pending === 1 ? r.send_at : null,
});

/** The thread, oldest first. Members never see scheduled messages; coaches see them last, in send order. */
async function thread(env: Env, companyId: string, memberId: string, forCoach: boolean): Promise<ChatMessage[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM (
       SELECT * FROM coach_messages WHERE company_id = ? AND member_id = ? ${forCoach ? "" : "AND pending = 0"} ORDER BY created_at DESC LIMIT ?
     ) ORDER BY pending, CASE WHEN pending = 1 THEN send_at ELSE created_at END`,
  )
    .bind(companyId, memberId, THREAD_LIMIT)
    .all<MessageRow>();
  return results.map(toMessage);
}

/** Mark the other side's (delivered) messages read. */
async function markRead(env: Env, companyId: string, memberId: string, fromCoach: boolean): Promise<void> {
  await env.DB.prepare(
    `UPDATE coach_messages SET read_at = ${NOW_SQL} WHERE company_id = ? AND member_id = ? AND from_coach = ? AND pending = 0 AND read_at IS NULL`,
  )
    .bind(companyId, memberId, fromCoach ? 1 : 0)
    .run();
}

/** Whether the recipient already has an unread message from this side, sent in the last few minutes. */
async function recentlyNotified(env: Env, companyId: string, memberId: string, fromCoach: boolean, excludeId: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `SELECT 1 AS x FROM coach_messages WHERE company_id = ? AND member_id = ? AND from_coach = ? AND pending = 0 AND read_at IS NULL AND id != ?
       AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${NOTIFY_QUIET_MIN} minutes') LIMIT 1`,
  )
    .bind(companyId, memberId, fromCoach ? 1 : 0, excludeId)
    .first();
  return r !== null;
}

/** The member's name on Whop, for the coach's notification. */
export async function memberName(env: Env, userId: string): Promise<string> {
  const res = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`).catch(() => null);
  const u = (res?.status === 200 ? res.body : null) as { name?: string | null; username?: string | null } | null;
  return u?.name?.trim() || (u?.username ? `@${u.username}` : "A member");
}

const preview = (body: string) => (body.length > 140 ? `${body.slice(0, 137)}…` : body);
const attachmentText = (kind: string | null, fromCoach: boolean) =>
  kind === "photo" ? `${fromCoach ? "Your coach" : "They"} sent a photo.` : kind === "voice" ? `${fromCoach ? "Your coach" : "They"} sent a voice note.` : "";

/** Notify a member of a coach message (unless one they haven't read just went out). */
async function notifyMember(env: Env, companyId: string, memberId: string, id: string, body: string, attachment: string | null): Promise<boolean> {
  if (await recentlyNotified(env, companyId, memberId, true, id)) return false;
  const experienceId = await experienceOf(env, memberId);
  if (!experienceId) return false;
  const sent = await sendWhop(env, experienceId, memberId, { title: "Message from your coach", content: preview(body || attachmentText(attachment, true)) });
  if (!sent.ok) console.error("chat notification to member failed", { status: sent.status, reason: sent.reason });
  return sent.ok;
}

async function notifyCoach(env: Env, companyId: string, memberId: string, id: string, body: string, attachment: string | null): Promise<void> {
  if (await recentlyNotified(env, companyId, memberId, false, id)) return;
  const name = await memberName(env, memberId);
  const sent = await sendWhopTeam(env, companyId, null, {
    title: attachment && !body ? `${name} sent you a ${attachment === "photo" ? "photo" : "voice note"}` : `${name} sent you a message`,
    content: preview(body || attachmentText(attachment, false)),
  });
  if (!sent.ok) console.error("chat notification to coach failed", { status: sent.status, reason: sent.reason });
}

/** Notify many members of the same thing: one Whop request per community and 100 members. */
export async function notifyMany(env: Env, userIds: readonly string[], msg: { title: string; content: string }): Promise<number> {
  const experiences = await experiencesOf(env, userIds);
  const byExperience = new Map<string, string[]>();
  for (const [userId, exp] of experiences) byExperience.set(exp, [...(byExperience.get(exp) ?? []), userId]);
  let notified = 0;
  let sends = 0;
  for (const [exp, users] of byExperience) {
    for (let i = 0; i < users.length && sends < NOTIFY_SENDS; i += NOTIFY_CHUNK) {
      sends++;
      const chunk = users.slice(i, i + NOTIFY_CHUNK);
      const r = await sendWhop(env, exp, chunk, msg);
      if (r.ok) notified += chunk.length;
      else console.error("group notification failed", { status: r.status, reason: r.reason });
    }
  }
  return notified;
}

/**
 * Coach alerts: a Whop notification to the whop's team when something is
 * waiting for them (a lift video to approve, a form check to answer). Never
 * fails the member's request.
 */
export async function alertCoaches(env: Env, experienceId: string, msg: { title: string; content: string }): Promise<void> {
  try {
    const companyId = await companyOfExperience(env, experienceId);
    if (!companyId) return;
    const sent = await sendWhopTeam(env, companyId, null, { title: msg.title, content: preview(msg.content) });
    if (!sent.ok) console.error("coach alert failed", { status: sent.status, reason: sent.reason });
  } catch (e) {
    console.error("coach alert crashed", e);
  }
}

/* --------------------------------- members --------------------------------- */

export async function getMyMessages(env: Env, userId: string, experienceId: string | null, open: boolean): Promise<Result> {
  const companyId = await companyOfExperience(env, experienceId);
  if (!companyId) return { ok: true, body: { available: false, messages: [] } };
  if (open) await markRead(env, companyId, userId, true);
  return { ok: true, body: { available: true, messages: await thread(env, companyId, userId, false) } };
}

/** The member's whop for this community, after checking they belong to it. */
async function memberCompany(env: Env, userId: string, experienceId: string | null): Promise<{ companyId: string } | Result> {
  const companyId = await companyOfExperience(env, experienceId);
  if (!companyId) return { ok: false, status: 409, error: "Open the app from your coach's Whop to message them." };
  const level = await accessLevel(env, userId, experienceId!);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level === "no_access") return { ok: false, status: 403, error: "You're not a member of this whop." };
  return { companyId };
}

export async function sendMyMessage(env: Env, userId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const v = validateMessage(b.body);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const m = await memberCompany(env, userId, typeof b.experience === "string" ? b.experience : null);
  if (!("companyId" in m)) return m;

  const id = newId();
  await env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, m.companyId, userId, userId, v.body)
    .run();
  await notifyCoach(env, m.companyId, userId, id, v.body, null);
  return { ok: true, body: { messages: await thread(env, m.companyId, userId, false) } };
}

/* --------------------------------- coaches --------------------------------- */

export async function getMemberThread(env: Env, viewerId: string, companyId: string, memberId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!MEMBER_ID_PATTERN.test(memberId)) return { ok: false, status: 422, error: "Bad request." };
  await markRead(env, companyId, memberId, false);
  return { ok: true, body: { messages: await thread(env, companyId, memberId, true) } };
}

export async function sendCoachMessage(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = raw as Record<string, unknown>;
  const companyId = b.company as string;
  const v = validateMessage(b.body);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const when = validateSendAt(b.sendAt);
  if (!when.ok) return { ok: false, status: 422, error: when.error };

  const id = newId();
  await env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body, pending, send_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
    .bind(id, companyId, c.memberId, viewerId, v.body, when.sendAt ? 1 : 0, when.sendAt)
    .run();
  // Replying reads what they sent.
  await markRead(env, companyId, c.memberId, false);
  const notified = when.sendAt ? false : await notifyMember(env, companyId, c.memberId, id, v.body, null);
  return { ok: true, body: { messages: await thread(env, companyId, c.memberId, true), notified } };
}

/** The same message to many members (or scheduled for them): one thread entry each, one notification per community. */
export async function sendBulkMessage(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const v = validateMessage(b.body);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const when = validateSendAt(b.sendAt);
  if (!when.ok) return { ok: false, status: 422, error: when.error };
  const asked = Array.isArray(b.members) ? [...new Set(b.members.filter((x): x is string => typeof x === "string" && MEMBER_ID_PATTERN.test(x)))] : [];
  if (asked.length === 0) return { ok: false, status: 422, error: "Pick at least one member." };
  if (asked.length > BULK_MAX) return { ok: false, status: 422, error: `Up to ${BULK_MAX} members at once.` };

  // Only people Whop lists as current members.
  const listed = await companyMembers(env, companyId);
  if (!listed.ok) return { ok: false, status: 502, error: "Couldn't get your member list from Whop. Try again in a moment." };
  const members = asked.filter((id) => listed.profiles.has(id));
  if (members.length === 0) return { ok: false, status: 422, error: "None of them are current members." };

  for (let i = 0; i < members.length; i += 40) {
    await env.DB.batch(
      members
        .slice(i, i + 40)
        .map((m) =>
          env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body, pending, send_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)").bind(
            newId(),
            companyId,
            m,
            viewerId,
            v.body,
            when.sendAt ? 1 : 0,
            when.sendAt,
          ),
        ),
    );
  }
  const notified = when.sendAt ? 0 : await notifyMany(env, members, { title: "Message from your coach", content: preview(v.body) });
  return { ok: true, body: { sent: members.length, skipped: asked.length - members.length, notified, scheduledFor: when.sendAt } };
}

/** Cancel a message that hasn't gone out yet. */
export async function cancelScheduledMessage(env: Env, viewerId: string, companyId: string, id: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, status: 422, error: "Bad request." };
  const r = await env.DB.prepare("DELETE FROM coach_messages WHERE id = ? AND company_id = ? AND pending = 1").bind(id, companyId).run();
  if (!r.meta.changes) return { ok: false, status: 409, error: "That message has already gone out." };
  return { ok: true, body: { cancelled: id } };
}

export async function coachThreads(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare(
    `SELECT m.member_id, m.${COLUMNS.split(", ").join(", m.")},
            (SELECT COUNT(*) FROM coach_messages u WHERE u.company_id = m.company_id AND u.member_id = m.member_id AND u.from_coach = 0 AND u.read_at IS NULL) AS unread
       FROM coach_messages m
      WHERE m.company_id = ?1 AND m.pending = 0
        AND m.created_at = (SELECT MAX(created_at) FROM coach_messages x WHERE x.company_id = ?1 AND x.member_id = m.member_id AND x.pending = 0)
      ORDER BY m.created_at DESC LIMIT ?2`,
  )
    .bind(companyId, THREADS_LIMIT)
    .all<MessageRow & { member_id: string; unread: number }>();
  const threads: ChatThread[] = results.map((r) => ({ memberId: r.member_id, last: toMessage(r), unread: r.unread }));
  return { ok: true, body: { threads } };
}

/* ------------------------------- attachments ------------------------------- */

/**
 * A JPEG without its APP1–APP15 and comment segments (EXIF, GPS, XMP), or
 * null if it can't be read that far. The device already re-saves photos
 * without them; this makes sure.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // padding
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the rest is the image.
      parts.push(b.subarray(i));
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
      return out;
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    const end = i + 2 + len;
    if (len < 2 || end > b.length) return null;
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) parts.push(b.subarray(i, end));
    i = end;
  }
  return null;
}

type Sender = { member: string; experience: string | null } | { coach: string; company: string; member: string };

/** A photo or voice note as its own message. */
export async function sendAttachment(env: Env, sender: Sender, url: URL, request: Request): Promise<Result> {
  if (!env.PHOTOS) return { ok: false, status: 503, error: "Photos and voice notes need the app's file storage switched on." };
  let companyId: string;
  let memberId: string;
  let senderId: string;
  if ("coach" in sender) {
    const c = await coachCheck(env, sender.coach, { company: sender.company, member: sender.member });
    if ("error" in c) return c.error;
    companyId = sender.company;
    memberId = c.memberId;
    senderId = sender.coach;
  } else {
    const m = await memberCompany(env, sender.member, sender.experience);
    if (!("companyId" in m)) return m;
    companyId = m.companyId;
    memberId = sender.member;
    senderId = sender.member;
  }
  const fromCoach = "coach" in sender;

  const kind = url.searchParams.get("kind");
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  let seconds: number | null = null;
  let bytes: Uint8Array = new Uint8Array(await request.arrayBuffer());
  if (kind === "photo") {
    // Requiring image/jpeg also means a cross-site form can't post here without a preflight.
    if (type !== "image/jpeg") return { ok: false, status: 415, error: "Send the photo as a JPEG." };
    if (bytes.length === 0 || bytes.length > CHAT_PHOTO_MAX_BYTES) return { ok: false, status: 413, error: "That photo is too large." };
    const clean = looksLikeJpeg(bytes) ? stripJpegMetadata(bytes) : null;
    if (!clean) return { ok: false, status: 415, error: "That file isn't a photo we can read." };
    bytes = clean;
  } else if (kind === "voice") {
    if (!VOICE_TYPES.includes(type)) return { ok: false, status: 415, error: "That audio format isn't supported. Try an m4a, mp3, webm or ogg file." };
    seconds = Number(url.searchParams.get("seconds") ?? "0");
    if (!(seconds > 0) || seconds > CHAT_VOICE_MAX_SECONDS + 1) return { ok: false, status: 422, error: `Keep voice notes to ${CHAT_VOICE_MAX_SECONDS} seconds.` };
    if (bytes.length === 0 || bytes.length > CHAT_VOICE_MAX_BYTES) return { ok: false, status: 413, error: "That recording is too large." };
    seconds = Math.round(seconds * 10) / 10;
  } else {
    return { ok: false, status: 422, error: "Bad request." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE sender_id = ? AND attachment IS NOT NULL AND created_at >= ?")
    .bind(senderId, today)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= CHAT_ATTACHMENTS_PER_DAY) {
    return { ok: false, status: 429, error: `That's ${CHAT_ATTACHMENTS_PER_DAY} photos and voice notes today, the daily limit. You can send more tomorrow.` };
  }
  if ((await photoStorageUsed(env)) + bytes.length > PHOTO_STORAGE_CAP_BYTES) {
    return { ok: false, status: 507, error: "The app's file storage is full, so photos and voice notes can't be sent right now." };
  }

  const id = newId();
  const key = `chat/${memberId}/${id}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    `INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body, attachment, attachment_key, attachment_type, attachment_seconds, attachment_bytes)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
  )
    .bind(id, companyId, memberId, fromCoach ? 1 : 0, senderId, kind, key, type, seconds, bytes.length)
    .run();
  if (fromCoach) {
    await markRead(env, companyId, memberId, false);
    await notifyMember(env, companyId, memberId, id, "", kind);
  } else {
    await notifyCoach(env, companyId, memberId, id, "", kind);
  }
  return { ok: true, body: { messages: await thread(env, companyId, memberId, fromCoach) } };
}

async function streamAttachment(env: Env, where: string, binds: unknown[]): Promise<Response | null> {
  if (!env.PHOTOS) return null;
  const row = await env.DB.prepare(`SELECT attachment_key, attachment_type FROM coach_messages WHERE ${where} AND attachment_key IS NOT NULL`)
    .bind(...binds)
    .first<{ attachment_key: string; attachment_type: string }>();
  if (!row) return null;
  const obj = await env.PHOTOS.get(row.attachment_key);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": row.attachment_type,
      // Personal: never cached by shared caches, and not kept by the browser either.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const memberAttachment = (env: Env, userId: string, id: string) =>
  /^[0-9a-f]{32}$/.test(id) ? streamAttachment(env, "id = ? AND member_id = ? AND pending = 0", [id, userId]) : Promise.resolve(null);

export async function coachAttachment(env: Env, viewerId: string, companyId: string, id: string): Promise<Response | Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, status: 422, error: "Bad request." };
  return (await streamAttachment(env, "id = ? AND company_id = ?", [id, companyId])) ?? { ok: false, status: 404, error: "Not found." };
}

/** "Delete all my data": the photos and voice notes in a member's chats (the rows go with the messages). */
export async function deleteChatAttachments(env: Env, userId: string): Promise<void> {
  if (!env.PHOTOS) return;
  const { results } = await env.DB.prepare("SELECT attachment_key FROM coach_messages WHERE member_id = ? AND attachment_key IS NOT NULL")
    .bind(userId)
    .all<{ attachment_key: string }>();
  for (let i = 0; i < results.length; i += 500) await env.PHOTOS.delete(results.slice(i, i + 500).map((r) => r.attachment_key));
}

/* ------------------------------ announcements ------------------------------ */

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  tag_id: string | null;
  created_at: string;
  send_at: string | null;
  notified_at: string | null;
}
const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tagId: r.tag_id,
  at: r.send_at ?? r.created_at,
  scheduledFor: r.send_at && !r.notified_at ? r.send_at : null,
});

export async function getAnnouncements(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare(
    "SELECT id, title, body, tag_id, created_at, send_at, notified_at FROM announcements WHERE company_id = ? ORDER BY COALESCE(send_at, created_at) DESC LIMIT ?",
  )
    .bind(companyId, ANNOUNCEMENTS_LIMIT)
    .all<AnnouncementRow>();
  return { ok: true, body: { announcements: results.map(toAnnouncement) } };
}

/** The Whop notification for an announcement, to everyone it's for. */
async function notifyAnnouncement(env: Env, companyId: string, a: { title: string; body: string; tagId: string | null }): Promise<number> {
  const listed = await companyMembers(env, companyId);
  if (!listed.ok) return 0;
  let ids = [...listed.profiles.keys()];
  if (a.tagId) {
    const { results } = await env.DB.prepare("SELECT member_id, tag_ids FROM member_tags WHERE company_id = ?").bind(companyId).all<{ member_id: string; tag_ids: string }>();
    const tagged = new Set(
      results
        .filter((r) => {
          try {
            return (JSON.parse(r.tag_ids) as unknown[]).includes(a.tagId);
          } catch {
            return false;
          }
        })
        .map((r) => r.member_id),
    );
    ids = ids.filter((i) => tagged.has(i));
  }
  return notifyMany(env, ids, { title: a.title, content: preview(a.body) });
}

export async function postAnnouncement(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const v = validateAnnouncement(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO announcements (id, company_id, title, body, tag_id, created_by, send_at, notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN ${NOW_SQL} END)`,
  )
    .bind(id, companyId, v.title, v.body, v.tagId, viewerId, v.sendAt, v.sendAt)
    .run();
  // Scheduled ones are notified by the cron when they go out.
  const notified = v.sendAt ? 0 : await notifyAnnouncement(env, companyId, v);
  const row = await env.DB.prepare("SELECT id, title, body, tag_id, created_at, send_at, notified_at FROM announcements WHERE id = ?").bind(id).first<AnnouncementRow>();
  return { ok: true, body: { announcement: toAnnouncement(row!), notified } };
}

export async function deleteAnnouncement(env: Env, viewerId: string, companyId: string, id: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, status: 422, error: "Bad request." };
  await env.DB.prepare("DELETE FROM announcements WHERE id = ? AND company_id = ?").bind(id, companyId).run();
  return { ok: true, body: { deleted: id } };
}

/* -------------------------------- scheduled -------------------------------- */

/**
 * Every minute (cron): deliver scheduled messages whose time has come (they
 * take their send time as their time in the thread) and notify; send the
 * notifications for scheduled announcements that just went up.
 */
export async function deliverScheduled(env: Env, now: Date): Promise<{ messages: number; announcements: number }> {
  const at = now.toISOString();
  const { results: due } = await env.DB.prepare(
    "SELECT id, company_id, member_id, body, send_at FROM coach_messages WHERE pending = 1 AND send_at <= ? ORDER BY send_at LIMIT ?",
  )
    .bind(at, DUE_MESSAGES_PER_RUN)
    .all<{ id: string; company_id: string; member_id: string; body: string; send_at: string }>();
  for (const m of due) {
    // Marked delivered first, so a failed notification doesn't send it twice.
    await env.DB.prepare("UPDATE coach_messages SET pending = 0, created_at = send_at WHERE id = ? AND pending = 1").bind(m.id).run();
  }
  // One notification per community for everyone getting the same text at the same time (a bulk message).
  const groups = new Map<string, typeof due>();
  for (const m of due) groups.set(`${m.company_id}|${m.body}`, [...(groups.get(`${m.company_id}|${m.body}`) ?? []), m]);
  if (hasWhopKey(env)) {
    for (const list of groups.values()) {
      if (list.length === 1) await notifyMember(env, list[0]!.company_id, list[0]!.member_id, list[0]!.id, list[0]!.body, null);
      else await notifyMany(env, list.map((m) => m.member_id), { title: "Message from your coach", content: preview(list[0]!.body) });
    }
  }

  const { results: posts } = await env.DB.prepare(
    "SELECT id, company_id, title, body, tag_id FROM announcements WHERE send_at IS NOT NULL AND send_at <= ? AND notified_at IS NULL LIMIT ?",
  )
    .bind(at, DUE_ANNOUNCEMENTS_PER_RUN)
    .all<{ id: string; company_id: string; title: string; body: string; tag_id: string | null }>();
  for (const a of posts) {
    await env.DB.prepare(`UPDATE announcements SET notified_at = ${NOW_SQL} WHERE id = ?`).bind(a.id).run();
    if (hasWhopKey(env)) await notifyAnnouncement(env, a.company_id, { title: a.title, body: a.body, tagId: a.tag_id });
  }
  return { messages: due.length, announcements: posts.length };
}
