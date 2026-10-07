/**
 * Progress photos (optional). Images live in the private R2 bucket bound as
 * PHOTOS, under u/<userId>/<id>.jpg — there are no public URLs; every image is
 * streamed through these routes after an identity check.
 *
 *   GET    /api/photos            my photo list + sharing setting
 *   POST   /api/photos?date&pose  upload one (image/jpeg body)
 *   GET    /api/photos/:id        one of my photos
 *   DELETE /api/photos/:id        delete one
 *   PUT    /api/photo-settings    { shareWithCoach }
 *
 * Coaches can see a member's photos only while that member's
 * share_with_coach is on (see coachPhoto).
 *
 * Until R2 is enabled and the bucket bound, every route answers "not
 * available" and the app says so.
 */

import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_ID_PATTERN, looksLikeJpeg, validatePhotoMeta, type PhotoMeta, type Pose } from "../src/lib/photos";

export interface PhotoEnv {
  DB: D1Database;
  /** R2 bucket for progress photos. Absent until R2 is enabled. */
  PHOTOS?: R2Bucket;
}

export type PhotoResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const objectKey = (userId: string, id: string) => `u/${userId}/${id}.jpg`;
const NOT_AVAILABLE: PhotoResult = { ok: false, status: 503, error: "Progress photos aren't switched on for this app yet." };

export async function isSharingWithCoach(env: PhotoEnv, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT share_with_coach FROM photo_settings WHERE user_id = ?").bind(userId).first<{ share_with_coach: number }>();
  return row?.share_with_coach === 1;
}

export async function photoList(env: PhotoEnv, userId: string): Promise<PhotoMeta[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, date, pose FROM progress_photos WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT ?",
  )
    .bind(userId, MAX_PHOTOS)
    .all<{ id: string; date: string; pose: Pose }>();
  return results;
}

export async function listPhotos(env: PhotoEnv, userId: string): Promise<PhotoResult> {
  return {
    ok: true,
    body: {
      available: Boolean(env.PHOTOS),
      shareWithCoach: await isSharingWithCoach(env, userId),
      photos: env.PHOTOS ? await photoList(env, userId) : [],
    },
  };
}

export async function uploadPhoto(env: PhotoEnv, userId: string, request: Request, url: URL): Promise<PhotoResult> {
  if (!env.PHOTOS) return NOT_AVAILABLE;
  const meta = validatePhotoMeta(url.searchParams.get("date") ?? "", url.searchParams.get("pose") ?? "");
  if (!meta.ok) return { ok: false, status: 422, error: meta.error };
  // Requiring image/jpeg also means a cross-site form can't post here without a
  // CORS preflight, which this API never grants.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("image/jpeg")) {
    return { ok: false, status: 415, error: "Upload a JPEG image." };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_PHOTO_BYTES) return { ok: false, status: 413, error: "That photo is too large." };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return { ok: false, status: 413, error: "That photo is too large." };
  if (!looksLikeJpeg(bytes)) return { ok: false, status: 415, error: "That file isn't a JPEG image." };

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM progress_photos WHERE user_id = ?").bind(userId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS) return { ok: false, status: 409, error: `You can keep up to ${MAX_PHOTOS} photos. Delete some older ones first.` };

  const id = crypto.randomUUID();
  await env.PHOTOS.put(objectKey(userId, id), bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await env.DB.prepare("INSERT INTO progress_photos (user_id, id, date, pose, bytes) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, id, meta.value.date, meta.value.pose, bytes.length)
    .run();
  const photo: PhotoMeta = { id, date: meta.value.date, pose: meta.value.pose };
  return { ok: true, body: { photo } };
}

/** Stream one photo belonging to `ownerId`, or null if there's no such photo. */
export async function streamPhoto(env: PhotoEnv, ownerId: string, id: string): Promise<Response | null> {
  if (!env.PHOTOS || !PHOTO_ID_PATTERN.test(id)) return null;
  const row = await env.DB.prepare("SELECT 1 AS x FROM progress_photos WHERE user_id = ? AND id = ?").bind(ownerId, id).first();
  if (!row) return null;
  const obj = await env.PHOTOS.get(objectKey(ownerId, id));
  if (!obj) return null;
  return new Response(obj.body, {
    headers: {
      "content-type": "image/jpeg",
      // Personal images: never cached by shared caches, and not kept by the browser either.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}

export async function deletePhoto(env: PhotoEnv, userId: string, id: string): Promise<void> {
  if (!PHOTO_ID_PATTERN.test(id)) return;
  await env.PHOTOS?.delete(objectKey(userId, id));
  await env.DB.prepare("DELETE FROM progress_photos WHERE user_id = ? AND id = ?").bind(userId, id).run();
}

export async function setSharing(env: PhotoEnv, userId: string, raw: unknown): Promise<PhotoResult> {
  const share = (raw as { shareWithCoach?: unknown } | null)?.shareWithCoach;
  if (typeof share !== "boolean") return { ok: false, status: 422, error: "Expected { shareWithCoach: true | false }." };
  await env.DB.prepare(
    `INSERT INTO photo_settings (user_id, share_with_coach) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET share_with_coach = excluded.share_with_coach`,
  )
    .bind(userId, share ? 1 : 0)
    .run();
  return { ok: true, body: { shareWithCoach: share } };
}

/** Remove every photo a member has (used by "Delete all my data"). */
export async function deleteAllPhotos(env: PhotoEnv, userId: string): Promise<void> {
  const { results } = await env.DB.prepare("SELECT id FROM progress_photos WHERE user_id = ?").bind(userId).all<{ id: string }>();
  if (env.PHOTOS && results.length > 0) {
    for (let i = 0; i < results.length; i += 1000) {
      await env.PHOTOS.delete(results.slice(i, i + 1000).map((r) => objectKey(userId, r.id)));
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM progress_photos WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM photo_settings WHERE user_id = ?").bind(userId),
  ]);
}
