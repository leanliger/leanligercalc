/**
 * One Gemini call and a daily cap, for the AI features that came after meal
 * photos and physique analysis (check-in reply drafts, nutrition label
 * photos). Same GEMINI_API_KEY and credit balance as those; same handling of
 * the prepay credit running out (HTTP 402: the use is given back).
 */

import { secretValue } from "./secrets";

export interface GeminiEnv {
  DB: D1Database;
  GEMINI_API_KEY?: string;
  /** Override for tests only (a local stand-in for Google's API). */
  GEMINI_API_BASE?: string;
}

export type AiResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const MODEL = "gemini-3.8-flash";
const utcDay = () => new Date().toISOString().slice(0, 10);

export const geminiKey = (env: GeminiEnv) => secretValue(env.GEMINI_API_KEY, "GEMINI_API_KEY");

/** Count one use of `kind` today, or refuse when the day's `limit` is reached. */
export async function takeAiUse(env: GeminiEnv, userId: string, kind: string, limit: number): Promise<{ ok: boolean; left: number }> {
  const day = utcDay();
  const used = await env.DB.prepare("SELECT n FROM ai_usage WHERE user_id = ? AND kind = ? AND day = ?").bind(userId, kind, day).first<{ n: number }>();
  if ((used?.n ?? 0) >= limit) return { ok: false, left: 0 };
  await env.DB.prepare(
    "INSERT INTO ai_usage (user_id, kind, day, n) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, kind, day) DO UPDATE SET n = n + 1",
  )
    .bind(userId, kind, day)
    .run();
  return { ok: true, left: Math.max(0, limit - (used?.n ?? 0) - 1) };
}

async function giveBack(env: GeminiEnv, userId: string, kind: string): Promise<void> {
  await env.DB.prepare("UPDATE ai_usage SET n = MAX(n - 1, 0) WHERE user_id = ? AND kind = ? AND day = ?").bind(userId, kind, utcDay()).run();
}

/** Ask Gemini; returns the reply text. `kind` is only for logs and giving the use back on a credit stop. */
export async function askGemini(
  env: GeminiEnv,
  userId: string,
  kind: string,
  opts: { parts: unknown[]; system?: string; json?: boolean; maxTokens?: number; timeoutMs?: number },
): Promise<AiResult<string>> {
  const key = geminiKey(env);
  if (!key) return { ok: false, status: 503, error: "AI features aren't switched on for this app yet." };
  const base = env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";
  try {
    const res = await fetch(`${base}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: opts.parts }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 2048,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 402) {
        console.error(`${kind} paused: Gemini credit is used up — top up in AI Studio → Billing`, { detail });
        await giveBack(env, userId, kind);
        return { ok: false, status: 503, error: "This is paused right now. Check back soon." };
      }
      console.error(`${kind} failed`, { status: res.status, body: detail });
      return { ok: false, status: 502, error: "It didn't come back. Try again in a moment." };
    }
    const body = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (body.promptFeedback?.blockReason) {
      console.error(`${kind} refused`, { blocked: body.promptFeedback.blockReason });
      return { ok: false, status: 422, error: "That couldn't be read. Try again." };
    }
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) return { ok: false, status: 502, error: "It came back empty. Try again in a moment." };
    return { ok: true, value: text };
  } catch (e) {
    console.error(`${kind} error`, e instanceof Error ? e.message : String(e));
    return { ok: false, status: 502, error: "It didn't come back. Try again in a moment." };
  }
}
