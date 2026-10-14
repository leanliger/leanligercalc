/**
 * Nutrition label photo: POST /api/food/label { image, mediaType }
 *
 * When a barcode isn't in USDA, the member photographs the label and Gemini
 * reads the per-serving numbers, which pre-fill the type-it-in form for them
 * to check (src/lib/label-photo.ts). The photo is sent to Google for this one
 * request and never stored. LABEL_PHOTO_DAILY_LIMIT a day per member.
 */

import { cleanLabelReading, LABEL_PHOTO_DAILY_LIMIT, LABEL_PHOTO_PROMPT } from "../src/lib/label-photo";
import { askGemini, geminiKey, takeAiUse, type GeminiEnv } from "./gemini";

const MAX_IMAGE_CHARS = 900_000; // base64; the app sends up to ~1280 px JPEGs

export async function readLabelPhoto(
  env: GeminiEnv,
  userId: string,
  raw: unknown,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  if (!geminiKey(env)) return { ok: false, status: 503, error: "Label photos aren't switched on for this app yet." };
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const image = typeof b.image === "string" ? b.image : "";
  const mediaType = b.mediaType === "image/png" || b.mediaType === "image/webp" ? b.mediaType : "image/jpeg";
  if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return { ok: false, status: 422, error: "That photo couldn't be read. Try another one." };
  }
  const use = await takeAiUse(env, userId, "label-photo", LABEL_PHOTO_DAILY_LIMIT);
  if (!use.ok) return { ok: false, status: 429, error: `That's today's ${LABEL_PHOTO_DAILY_LIMIT} label photos. Type the numbers in for now.` };

  const reply = await askGemini(env, userId, "label-photo", {
    parts: [{ inlineData: { mimeType: mediaType, data: image } }, { text: LABEL_PHOTO_PROMPT }],
    json: true,
    maxTokens: 1024,
  });
  if (!reply.ok) return reply;
  const reading = cleanLabelReading(reply.value);
  if (!reading) {
    return { ok: false, status: 422, error: "Couldn't read the numbers on that label. Try a sharper, straight-on photo, or type them in." };
  }
  return { ok: true, body: { reading, left: use.left } };
}
