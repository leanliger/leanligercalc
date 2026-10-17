/**
 * Describe a meal: POST /api/food/describe { text }
 *
 * Gemini splits a typed or dictated meal into foods with grams and macros
 * (src/lib/meal-describe.ts), returned in the photo estimate's shape for the
 * member to check before anything is logged. Only the text is sent; nothing
 * is stored. MEAL_DESCRIBE_DAILY_LIMIT a day per member.
 */

import { cleanMealEstimate } from "../src/lib/meal-photo";
import { cleanMealText, MEAL_DESCRIBE_DAILY_LIMIT, MEAL_DESCRIBE_MAX_CHARS, MEAL_DESCRIBE_PROMPT } from "../src/lib/meal-describe";
import { askGemini, geminiKey, takeAiUse, type GeminiEnv } from "./gemini";

export async function describeMeal(
  env: GeminiEnv,
  userId: string,
  raw: unknown,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  if (!geminiKey(env)) return { ok: false, status: 503, error: "Describing meals isn't switched on for this app yet." };
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const text = cleanMealText(b.text);
  if (!text) return { ok: false, status: 422, error: `Describe the meal in up to ${MEAL_DESCRIBE_MAX_CHARS} characters.` };
  const use = await takeAiUse(env, userId, "meal-describe", MEAL_DESCRIBE_DAILY_LIMIT);
  if (!use.ok) return { ok: false, status: 429, error: `That's today's ${MEAL_DESCRIBE_DAILY_LIMIT} described meals. Search or scan for now.` };

  const reply = await askGemini(env, userId, "meal-describe", {
    parts: [{ text: MEAL_DESCRIBE_PROMPT + text }],
    json: true,
    maxTokens: 1500,
  });
  if (!reply.ok) return reply;
  const estimate = cleanMealEstimate(reply.value);
  if (!estimate) return { ok: false, status: 502, error: "That didn't come back right. Try again, or describe it a little differently." };
  return { ok: true, body: { estimate, left: use.left } };
}
