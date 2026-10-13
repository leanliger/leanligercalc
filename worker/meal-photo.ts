/**
 * Meal photo estimate: POST /api/meal-photo { image, mediaType }
 *
 * A member photographs a plate; Gemini (Google's API) looks at it and returns
 * its best guess at the foods, amounts and macros, which the member checks and
 * adjusts before anything is logged. The photo is sent to Google for this one
 * request and is never stored here.
 *
 * Needs the GEMINI_API_KEY secret — the same one physique analysis uses
 * (worker/physique.ts), so both draw on one Gemini credit balance. Without it
 * the feature is off and the app hides the Photo button. Each member gets
 * MEAL_PHOTO_DAILY_LIMIT estimates a day, to keep the cost predictable.
 */

import { cleanMealEstimate, MEAL_PHOTO_DAILY_LIMIT, MEAL_PHOTO_PROMPT, type MealEstimate } from "../src/lib/meal-photo";
import { secretValue } from "./secrets";

export interface MealPhotoEnv {
  DB: D1Database;
  /** Google AI Studio key. Secret; the feature is off without it. */
  GEMINI_API_KEY?: string;
  /** Optional model override, e.g. when Google retires the default. */
  MEAL_PHOTO_MODEL?: string;
  /** Override for tests only (a local stand-in for Google's API). */
  GEMINI_API_BASE?: string;
}

export type MealPhotoResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_IMAGE_CHARS = 450_000; // base64; the app sends ~100–250 KB
const TIMEOUT_MS = 30_000;

export const mealPhotosOn = (env: MealPhotoEnv) => Boolean(secretValue(env.GEMINI_API_KEY, "GEMINI_API_KEY"));

export async function estimateMealPhoto(env: MealPhotoEnv, userId: string, raw: unknown): Promise<MealPhotoResult> {
  const key = secretValue(env.GEMINI_API_KEY, "GEMINI_API_KEY");
  if (!key) return { ok: false, status: 503, error: "Photo estimates aren't switched on for this app yet." };
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const image = typeof b.image === "string" ? b.image : "";
  const mediaType = b.mediaType === "image/png" || b.mediaType === "image/webp" ? b.mediaType : "image/jpeg";
  if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return { ok: false, status: 422, error: "That photo couldn't be read. Try another one." };
  }

  // Daily cap, counted before calling out so retries can't run up the bill.
  const day = new Date().toISOString().slice(0, 10);
  const used = await env.DB.prepare("SELECT n FROM meal_photo_usage WHERE user_id = ? AND day = ?").bind(userId, day).first<{ n: number }>();
  if ((used?.n ?? 0) >= MEAL_PHOTO_DAILY_LIMIT) {
    return { ok: false, status: 429, error: `That's today's ${MEAL_PHOTO_DAILY_LIMIT} photo estimates. Search or quick-add instead, or try again tomorrow.` };
  }
  await env.DB.prepare(
    "INSERT INTO meal_photo_usage (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1",
  )
    .bind(userId, day)
    .run();

  const model = env.MEAL_PHOTO_MODEL?.trim() || DEFAULT_MODEL;
  const base = env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";

  let text = "";
  try {
    const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: mediaType, data: image } }, { text: MEAL_PHOTO_PROMPT }],
          },
        ],
        // JSON mode keeps the reply parseable; the budget leaves room for the
        // model's reasoning, which counts against it, ahead of the JSON itself.
        generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);

      // 402: the Gemini prepay credit is used up (shared with physique
      // analysis). Nothing was charged, so give the estimate back.
      if (res.status === 402) {
        console.error("meal photo estimate paused: Gemini credit is used up — top up in AI Studio → Billing", { detail });
        await env.DB.prepare("UPDATE meal_photo_usage SET n = MAX(n - 1, 0) WHERE user_id = ? AND day = ?").bind(userId, day).run();
        return { ok: false, status: 503, error: "Photo estimates are paused right now — search or quick-add instead, and check back soon." };
      }

      console.error("meal photo estimate failed", { status: res.status, body: detail });
      return { ok: false, status: 502, error: "The estimate didn't come back. Try again in a moment." };
    }
    const body = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (body.promptFeedback?.blockReason) {
      console.error("meal photo estimate refused", { blocked: body.promptFeedback.blockReason });
      return { ok: false, status: 422, error: "That photo couldn't be read. Try another one." };
    }
    text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  } catch (e) {
    console.error("meal photo estimate error", e instanceof Error ? e.message : String(e));
    return { ok: false, status: 502, error: "The estimate didn't come back. Try again in a moment." };
  }

  const estimate: MealEstimate | null = cleanMealEstimate(text);
  if (!estimate) return { ok: false, status: 502, error: "Couldn't make sense of that photo. Try another angle, or add it another way." };
  return { ok: true, body: { estimate, left: Math.max(0, MEAL_PHOTO_DAILY_LIMIT - (used?.n ?? 0) - 1) } };
}
