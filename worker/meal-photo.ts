/**
 * Meal photo estimate: POST /api/meal-photo { image, mediaType }
 *
 * A member photographs a plate; Claude (Anthropic's API) looks at it and
 * returns its best guess at the foods, amounts and macros, which the member
 * checks and adjusts before anything is logged. The photo is sent to Anthropic
 * for this one request and is never stored here.
 *
 * Needs the ANTHROPIC_API_KEY secret (set in the Cloudflare dashboard). Without
 * it the feature is off and the app hides the Photo button. Each member gets
 * MEAL_PHOTO_DAILY_LIMIT estimates a day, to keep the cost predictable.
 */

import { cleanMealEstimate, MEAL_PHOTO_DAILY_LIMIT, MEAL_PHOTO_PROMPT, type MealEstimate } from "../src/lib/meal-photo";
import { secretValue } from "./secrets";

export interface MealPhotoEnv {
  DB: D1Database;
  /** Anthropic API key. Secret; the feature is off without it. */
  ANTHROPIC_API_KEY?: string;
  /** Optional model override. */
  MEAL_PHOTO_MODEL?: string;
  /** Override for tests only (a local stand-in for Anthropic's API). */
  ANTHROPIC_API_BASE?: string;
}

export type MealPhotoResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_IMAGE_CHARS = 450_000; // base64; the app sends ~100–250 KB
const TIMEOUT_MS = 30_000;

export const mealPhotosOn = (env: MealPhotoEnv) => Boolean(secretValue(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"));

export async function estimateMealPhoto(env: MealPhotoEnv, userId: string, raw: unknown): Promise<MealPhotoResult> {
  const key = secretValue(env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY");
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

  let text = "";
  try {
    const res = await fetch(`${env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env.MEAL_PHOTO_MODEL?.trim() || DEFAULT_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
              { type: "text", text: MEAL_PHOTO_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("meal photo estimate failed", { status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return { ok: false, status: 502, error: "The estimate didn't come back. Try again in a moment." };
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  } catch (e) {
    console.error("meal photo estimate error", e instanceof Error ? e.message : String(e));
    return { ok: false, status: 502, error: "The estimate didn't come back. Try again in a moment." };
  }

  const estimate: MealEstimate | null = cleanMealEstimate(text);
  if (!estimate) return { ok: false, status: 502, error: "Couldn't make sense of that photo. Try another angle, or add it another way." };
  return { ok: true, body: { estimate, left: Math.max(0, MEAL_PHOTO_DAILY_LIMIT - (used?.n ?? 0) - 1) } };
}
