/**
 * Voice replies to weekly check-ins.
 *
 *   POST /api/coach/checkins/voice?company&member&weekStart&seconds   audio body (≤ 30 s)
 *   GET  /api/coach/checkins/voice?company&member&weekStart           the coach plays it back
 *   GET  /api/checkins/voice/:weekStart                               the member plays it
 *
 * Stored privately in the PHOTOS R2 bucket; there are no public URLs. Sending
 * one counts as replying (the member gets a notification); a text reply can
 * go with it.
 */

import { isValidISODate } from "../src/lib/dates";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS, VOICE_TYPES } from "../src/lib/checkins";
import type { PhotoEnv } from "./photos";
import { sendWhop } from "./reminders";
import { coachCheck, experienceOf, type SharingEnv, type SharingResult } from "./sharing";

type Env = SharingEnv & PhotoEnv;

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export async function uploadVoiceReply(env: Env, viewerId: string, url: URL, request: Request): Promise<SharingResult> {
  const company = url.searchParams.get("company") ?? "";
  const c = await coachCheck(env, viewerId, { company, member: url.searchParams.get("member") ?? "" });
  if ("error" in c) return c.error;
  if (!env.PHOTOS) return { ok: false, status: 503, error: "Voice replies need the app's file storage switched on." };
  const weekStart = url.searchParams.get("weekStart") ?? "";
  if (!isValidISODate(weekStart)) return { ok: false, status: 422, error: "Bad request." };
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!VOICE_TYPES.includes(type)) {
    return { ok: false, status: 415, error: "That audio format isn't supported. Try an m4a, mp3, webm or ogg file." };
  }
  const seconds = Number(url.searchParams.get("seconds") ?? "0");
  if (!(seconds > 0) || seconds > VOICE_MAX_SECONDS + 1) {
    return { ok: false, status: 422, error: `Keep voice replies to ${VOICE_MAX_SECONDS} seconds.` };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > VOICE_MAX_BYTES) {
    return { ok: false, status: 413, error: "That recording is too large. Keep it to 30 seconds." };
  }

  const row = await env.DB.prepare("SELECT reply_audio FROM checkins WHERE user_id = ? AND week_start = ?")
    .bind(c.memberId, weekStart)
    .first<{ reply_audio: string | null }>();
  if (!row) return { ok: false, status: 404, error: "That check-in isn't there any more." };

  const key = `voice/${c.memberId}/${weekStart}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    `UPDATE checkins SET reply_audio = ?, reply_audio_type = ?, reply_audio_seconds = ?,
       reply = COALESCE(reply, ''), replied_by = ?, replied_at = ${NOW_SQL}
     WHERE user_id = ? AND week_start = ?`,
  )
    .bind(key, type, Math.round(seconds * 10) / 10, viewerId, c.memberId, weekStart)
    .run();
  if (row.reply_audio) await env.PHOTOS.delete(row.reply_audio);

  let notified = false;
  const exp = await experienceOf(env, c.memberId);
  if (exp) {
    const sent = await sendWhop(env, exp, c.memberId, {
      title: "Your coach sent you a voice reply",
      content: "Listen in Prep Calculator → Progress → Check-in.",
    });
    notified = sent.ok;
    if (!sent.ok) console.error("voice reply notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { notified } };
}

async function streamVoice(env: Env, userId: string, weekStart: string): Promise<Response | null> {
  if (!env.PHOTOS || !isValidISODate(weekStart)) return null;
  const row = await env.DB.prepare("SELECT reply_audio, reply_audio_type FROM checkins WHERE user_id = ? AND week_start = ?")
    .bind(userId, weekStart)
    .first<{ reply_audio: string | null; reply_audio_type: string | null }>();
  if (!row?.reply_audio) return null;
  const obj = await env.PHOTOS.get(row.reply_audio);
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": row.reply_audio_type ?? "audio/mp4",
      // Personal: never cached by shared caches, and not kept by the browser either.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const memberVoice = (env: Env, userId: string, weekStart: string) => streamVoice(env, userId, weekStart);

export async function coachVoice(env: Env, viewerId: string, url: URL): Promise<Response | SharingResult> {
  const c = await coachCheck(env, viewerId, { company: url.searchParams.get("company") ?? "", member: url.searchParams.get("member") ?? "" });
  if ("error" in c) return c.error;
  return (await streamVoice(env, c.memberId, url.searchParams.get("weekStart") ?? "")) ?? { ok: false, status: 404, error: "No voice reply." };
}

/** "Delete all my data": a member's voice replies. */
export async function deleteVoiceReplies(env: Env, userId: string): Promise<void> {
  if (!env.PHOTOS) return;
  const { results } = await env.DB.prepare("SELECT reply_audio FROM checkins WHERE user_id = ? AND reply_audio IS NOT NULL")
    .bind(userId)
    .all<{ reply_audio: string }>();
  if (results.length > 0) await env.PHOTOS.delete(results.map((r) => r.reply_audio));
}
