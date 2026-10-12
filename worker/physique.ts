/**
 * Physique analysis: POST /api/physique, GET /api/physique
 *
 * A member's front, side and back photos go to a vision model, which returns
 * the coaching breakdown in src/lib/physique.ts. Two sources:
 *
 *   { "source": "saved" }     the newest front, side and back already in R2
 *   { "source": "upload", "images": [{ "pose": "front", "data": "<base64>" }, …] }
 *                             a one-off set that is never saved to the gallery
 *
 * Needs the GEMINI_API_KEY secret. Without it the feature is off and the app
 * hides the button, the same way meal photos work. Each member gets
 * PHYSIQUE_DAILY_LIMIT analyses a day, counted before the model is called so
 * retries cannot run up the bill.
 *
 * The photos are sent to Google for this one request. Nothing but the reply
 * text is kept here.
 */

import {
  PHYSIQUE_DAILY_LIMIT,
  PHYSIQUE_PROMPT,
  PHYSIQUE_USER_PROMPT,
  parsePhysique,
  usablePhysique,
} from "../src/lib/physique";
import { POSES, POSE_LABELS, type Pose } from "../src/lib/photos";
import { photoList, type PhotoEnv } from "./photos";
import { secretValue } from "./secrets";

export interface PhysiqueEnv extends PhotoEnv {
  DB: D1Database;
  /** Google AI Studio key. Secret; the feature is off without it. */
  GEMINI_API_KEY?: string;
  /** Optional model override, e.g. when Google retires the default. */
  PHYSIQUE_MODEL?: string;
  /** Override for tests only (a local stand-in for Google's API). */
  GEMINI_API_BASE?: string;
}

export type PhysiqueResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Base64 characters per image. The browser resizes to ~150–400 KB (≈550k chars). */
const MAX_IMAGE_CHARS = 700_000;
/** Whole request body. Three images plus JSON overhead. */
const MAX_BODY_CHARS = 2_300_000;
const TIMEOUT_MS = 45_000;
const MAX_HISTORY = 20;

const NOT_AVAILABLE: PhysiqueResult = {
  ok: false,
  status: 503,
  error: "Physique analysis isn't switched on for this app yet.",
};

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export const physiqueOn = (env: PhysiqueEnv) => Boolean(secretValue(env.GEMINI_API_KEY, "GEMINI_API_KEY"));

/** R2 gives bytes; the API wants base64. btoa needs chunking to avoid a huge argument list. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

const objectKey = (userId: string, id: string) => `u/${userId}/${id}.jpg`;

interface PosedImage {
  pose: Pose;
  data: string;
}

/** The newest photo of each pose, or a list of the poses that are missing. */
async function savedImages(
  env: PhysiqueEnv,
  userId: string,
): Promise<{ ok: true; images: PosedImage[]; date: string } | { ok: false; status: number; error: string }> {
  if (!env.PHOTOS) return { ok: false, status: 503, error: "Progress photos aren't switched on for this app yet." };

  const all = await photoList(env, userId); // newest first
  const newest = POSES.map((pose) => ({ pose, meta: all.find((p) => p.pose === pose) }));
  const missing = newest.filter((n) => !n.meta).map((n) => POSE_LABELS[n.pose].toLowerCase());

  if (missing.length) {
    return {
      ok: false,
      status: 409,
      error: `Add a ${missing.join(", ")} photo first — the analysis needs all three angles.`,
    };
  }

  const images: PosedImage[] = [];
  for (const { pose, meta } of newest) {
    const obj = await env.PHOTOS.get(objectKey(userId, meta!.id));
    if (!obj) return { ok: false, status: 409, error: "One of your photos couldn't be read. Try uploading it again." };
    images.push({ pose, data: toBase64(new Uint8Array(await obj.arrayBuffer())) });
  }

  // The set is dated by its most recent photo.
  const date = newest.map((n) => n.meta!.date).sort().at(-1)!;
  return { ok: true, images, date };
}

/** Validate a one-off set sent in the request body. */
function uploadedImages(raw: unknown): { ok: true; images: PosedImage[] } | { ok: false; status: number; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(b.images) ? b.images : [];
  const byPose = new Map<Pose, string>();

  for (const item of list.slice(0, 3)) {
    const i = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const pose = i.pose;
    const data = typeof i.data === "string" ? i.data : "";
    if (!(POSES as readonly unknown[]).includes(pose)) continue;
    if (!data || data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return { ok: false, status: 422, error: "One of those photos couldn't be read. Try another." };
    }
    byPose.set(pose as Pose, data);
  }

  const missing = POSES.filter((p) => !byPose.has(p)).map((p) => POSE_LABELS[p].toLowerCase());
  if (missing.length) {
    return { ok: false, status: 422, error: `Add a ${missing.join(", ")} photo — the analysis needs all three angles.` };
  }

  return { ok: true, images: POSES.map((pose) => ({ pose, data: byPose.get(pose)! })) };
}

/** Past analyses, newest first. */
export async function listPhysique(env: PhysiqueEnv, userId: string): Promise<PhysiqueResult> {
  if (!physiqueOn(env)) return NOT_AVAILABLE;
  const { results } = await env.DB.prepare(
    "SELECT id, source, photo_date, analysis, created_at FROM physique_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(userId, MAX_HISTORY)
    .all<{ id: string; source: string; photo_date: string | null; analysis: string; created_at: string }>();

  const used = await env.DB.prepare("SELECT n FROM physique_usage WHERE user_id = ? AND day = ?")
    .bind(userId, utcDay())
    .first<{ n: number }>();

  return {
    ok: true,
    body: {
      analyses: results.map((r) => ({
        id: r.id,
        source: r.source,
        photoDate: r.photo_date,
        createdAt: r.created_at,
        ...parsePhysique(r.analysis),
      })),
      left: Math.max(0, PHYSIQUE_DAILY_LIMIT - (used?.n ?? 0)),
    },
  };
}

export async function analyzePhysique(env: PhysiqueEnv, userId: string, request: Request): Promise<PhysiqueResult> {
  const key = secretValue(env.GEMINI_API_KEY, "GEMINI_API_KEY");
  if (!key) return NOT_AVAILABLE;

  // Read the body here rather than through index.ts's readJson: three photos
  // are far larger than the shared cap that protects every other route.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, error: "Content-Type must be application/json." };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: "Those photos are too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "Body is not valid JSON." };
  }

  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const source = body.source === "upload" ? "upload" : "saved";

  const found = source === "upload" ? uploadedImages(body) : await savedImages(env, userId);
  if (!found.ok) return found;
  const photoDate = source === "saved" && "date" in found ? found.date : null;

  // Daily cap, counted before calling out so retries can't run up the bill.
  const day = utcDay();
  const used = await env.DB.prepare("SELECT n FROM physique_usage WHERE user_id = ? AND day = ?")
    .bind(userId, day)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= PHYSIQUE_DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      error: `That's today's ${PHYSIQUE_DAILY_LIMIT} analyses. Your physique won't change overnight — try again tomorrow.`,
    };
  }
  await env.DB.prepare(
    "INSERT INTO physique_usage (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1",
  )
    .bind(userId, day)
    .run();

  // Label each photo so the model knows which angle it is looking at.
  const parts: unknown[] = [];
  for (const image of found.images) {
    parts.push({ text: `${POSE_LABELS[image.pose]} view:` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: image.data } });
  }
  parts.push({ text: PHYSIQUE_USER_PROMPT });

  const model = env.PHYSIQUE_MODEL?.trim() || DEFAULT_MODEL;
  const base = env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";

  let reply = "";
  try {
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: PHYSIQUE_PROMPT }] },
        generationConfig: { maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("physique analysis failed", {
        status: res.status,
        body: (await res.text().catch(() => "")).slice(0, 300),
      });
      return { ok: false, status: 502, error: "The analysis didn't come back. Try again in a moment." };
    }

    const json = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };

    // Safety filters can reject the photos outright, or cut generation short.
    const blocked = json.promptFeedback?.blockReason;
    const finish = json.candidates?.[0]?.finishReason;
    if (blocked || (finish && finish !== "STOP" && finish !== "MAX_TOKENS")) {
      console.error("physique analysis refused", { blocked, finish });
      return {
        ok: false,
        status: 422,
        error:
          "The model wouldn't assess those photos. Gym shorts or posing trunks in even lighting work best — avoid very dark or very revealing shots.",
      };
    }

    reply = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  } catch (e) {
    console.error("physique analysis error", e instanceof Error ? e.message : String(e));
    return { ok: false, status: 502, error: "The analysis didn't come back. Try again in a moment." };
  }

  const analysis = parsePhysique(reply);
  if (!usablePhysique(analysis)) {
    return { ok: false, status: 502, error: "Couldn't make sense of that reply. Try again in a moment." };
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO physique_analyses (id, user_id, source, photo_date, analysis) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, source, photoDate, analysis.raw)
    .run();

  return {
    ok: true,
    body: {
      id,
      source,
      photoDate,
      ...analysis,
      left: Math.max(0, PHYSIQUE_DAILY_LIMIT - (used?.n ?? 0) - 1),
    },
  };
}
