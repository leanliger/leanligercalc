/**
 * iPhone step sync. A web app can't read Apple Health, so an Apple Shortcut
 * on the member's phone reads the day's steps and posts them here each
 * evening, signed with a personal key instead of a Whop session:
 *
 *   POST   /api/steps-sync          Authorization: Bearer lss_…   { steps, date }
 *
 * and, from inside the app (Whop session):
 *
 *   GET    /api/steps-sync/key      is it set up, and the last sync
 *   POST   /api/steps-sync/key      make a key (replaces any old one); shown once
 *   DELETE /api/steps-sync/key      turn it off
 *
 * The key can only do one thing: set that day's step count, exactly as typing
 * it on Today would (ticking the steps habit at the plan's target). Only its
 * SHA-256 hash is stored (migrations/0023_step_sync.sql).
 */

import { DEFAULT_STEP_TARGET, MAX_DAILY_STEPS, MAX_HABIT_LOGS, STEPS_KEY, validateHabitEntries, type HabitEntries } from "../src/lib/habits";
import { sanitizeAppState } from "../src/lib/persistence";
import { isAcceptableWeighInDate } from "../src/lib/tracking";

export interface StepSyncEnv {
  DB: D1Database;
  FOOD_LIMITER?: RateLimit;
}

type Result = { status: number; body: unknown };

const KEY_PATTERN = /^lss_[A-Za-z0-9_-]{40,64}$/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `lss_${b64}`;
}

/* ------------------------------ the Shortcut ------------------------------ */

export async function receiveSteps(env: StepSyncEnv, request: Request): Promise<Result> {
  if (request.method.toUpperCase() !== "POST") return { status: 405, body: { error: "Use POST." } };
  if (env.FOOD_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.FOOD_LIMITER.limit({ key: `steps:${ip}` });
    if (!success) return { status: 429, body: { error: "Too many syncs. Try again in a minute." } };
  }

  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!KEY_PATTERN.test(key)) return { status: 401, body: { error: "Missing or malformed step sync key." } };
  const owner = await env.DB.prepare("SELECT user_id FROM step_tokens WHERE token_hash = ?")
    .bind(await sha256(key))
    .first<{ user_id: string }>();
  // One message for "wrong" and "turned off", so a key can't be probed.
  if (!owner) return { status: 401, body: { error: "This step sync key isn't active. Make a new one in the app." } };
  const userId = owner.user_id;

  const text = await request.text();
  if (text.length > 2000) return { status: 413, body: { error: "Request body too large." } };
  let raw: { steps?: unknown; date?: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    return { status: 400, body: { error: "Body must be JSON: {\"steps\": 8421, \"date\": \"2026-10-13\"}." } };
  }
  // Shortcuts sends numbers as text ("8421" or "8421.0") depending on the action.
  const steps = Math.round(Number(String(raw?.steps ?? "").replace(/[,\s]/g, "")));
  if (!Number.isFinite(steps) || steps < 0 || steps > MAX_DAILY_STEPS) {
    return { status: 422, body: { error: `Steps must be a number from 0 to ${MAX_DAILY_STEPS.toLocaleString("en-US")}.` } };
  }
  const date = typeof raw?.date === "string" ? raw.date.trim().slice(0, 10) : "";
  if (!isAcceptableWeighInDate(date)) {
    return { status: 422, body: { error: "Date must be the day as yyyy-MM-dd, e.g. 2026-10-13." } };
  }

  // The plan says the target and which habit is the steps one.
  const planRow = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId).first<{ state: string }>();
  let target = DEFAULT_STEP_TARGET;
  let stepHabitId: string | null = null;
  if (planRow) {
    try {
      const plan = sanitizeAppState(JSON.parse(planRow.state));
      if (plan.fatLoss.activitySource === "steps") target = plan.fatLoss.dailySteps;
      stepHabitId = plan.tracking.habits.find((h) => h.link === "steps")?.id ?? null;
    } catch {
      /* a corrupt plan: still save the steps */
    }
  }

  const existing = await env.DB.prepare("SELECT entries FROM habit_logs WHERE user_id = ? AND date = ?")
    .bind(userId, date)
    .first<{ entries: string }>();
  let entries: HabitEntries = {};
  if (existing) {
    try {
      entries = JSON.parse(existing.entries) as HabitEntries;
    } catch {
      entries = {};
    }
  } else {
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM habit_logs WHERE user_id = ?").bind(userId).first<{ n: number }>();
    if (count && count.n >= MAX_HABIT_LOGS) return { status: 409, body: { error: "Habit storage is full." } };
  }
  // Same as typing the number on Today: the count, and the habit ticked at the target.
  entries = { ...entries, [STEPS_KEY]: steps };
  const hit = steps >= target;
  if (stepHabitId) {
    if (hit) entries[stepHabitId] = true;
    else delete entries[stepHabitId];
  }
  const valid = validateHabitEntries({ entries }, date);
  if (!valid.ok) return { status: 422, body: { error: valid.error } };

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO habit_logs (user_id, date, entries) VALUES (?, ?, ?)
       ON CONFLICT (user_id, date) DO UPDATE SET
         entries    = excluded.entries,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(userId, date, JSON.stringify(valid.value.entries)),
    env.DB.prepare(
      `UPDATE step_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_steps = ?, last_date = ?
       WHERE user_id = ?`,
    ).bind(steps, date, userId),
  ]);
  return { status: 200, body: { ok: true, date, steps, target, hit } };
}

/* ------------------------------ in the app ------------------------------ */

export async function stepSyncKey(env: StepSyncEnv, userId: string, method: string, requestUrl: string): Promise<Result> {
  // Where the Shortcut should post: this Worker as it sees itself, which inside
  // Whop is its own address rather than the proxy the page came through.
  const endpoint = `${new URL(requestUrl).origin}/api/steps-sync`;
  if (method === "GET") {
    const row = await env.DB.prepare(
      "SELECT created_at, last_used_at, last_steps, last_date FROM step_tokens WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ created_at: string; last_used_at: string | null; last_steps: number | null; last_date: string | null }>();
    return {
      status: 200,
      body: row
        ? { on: true, endpoint, createdAt: row.created_at, lastUsedAt: row.last_used_at, lastSteps: row.last_steps, lastDate: row.last_date }
        : { on: false, endpoint },
    };
  }
  if (method === "POST") {
    const key = newKey();
    await env.DB.prepare(
      `INSERT INTO step_tokens (user_id, token_hash) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         last_used_at = NULL, last_steps = NULL, last_date = NULL`,
    )
      .bind(userId, await sha256(key))
      .run();
    return { status: 201, body: { key, endpoint } };
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM step_tokens WHERE user_id = ?").bind(userId).run();
    return { status: 200, body: { on: false } };
  }
  return { status: 405, body: { error: "Method not allowed." } };
}
