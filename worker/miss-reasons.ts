/**
 * "What made yesterday's calorie target difficult?" (src/lib/miss-reasons.ts;
 * table from migration 0042):
 *
 *   GET  /api/miss-reasons   members: my answers (and skips) from the last MISS_REASON_DAYS
 *   POST /api/miss-reasons   members: answer or skip one { date, kind, reason | null, note, kcal, target }
 *
 * Coaches see them in the overview (worker/coach.ts), for members sharing
 * their progress.
 */

import { addDays } from "../src/lib/dates";
import { MISS_REASON_DAYS, validateMissReason, type MissReason } from "../src/lib/miss-reasons";

type Env = { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const utcToday = () => new Date().toISOString().slice(0, 10);

export interface MissRow {
  date: string;
  kind: string;
  reason: string | null;
  note: string;
  kcal: number;
  target: number;
}

export const rowToMiss = (r: MissRow): MissReason => ({
  date: r.date,
  kind: "calories",
  reason: r.reason as MissReason["reason"],
  note: r.note,
  kcal: r.kcal,
  target: r.target,
});

export async function myMissReasons(env: Env, userId: string): Promise<Result> {
  const { results } = await env.DB.prepare("SELECT date, kind, reason, note, kcal, target FROM miss_reasons WHERE user_id = ? AND date >= ? ORDER BY date DESC")
    .bind(userId, addDays(utcToday(), -MISS_REASON_DAYS))
    .all<MissRow>();
  return { ok: true, body: { reasons: results.map(rowToMiss) } };
}

export async function saveMissReason(env: Env, userId: string, raw: unknown): Promise<Result> {
  // The member's day can be a day ahead of UTC.
  const v = validateMissReason(raw, addDays(utcToday(), 1));
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const m = v.value;
  await env.DB.prepare(
    `INSERT INTO miss_reasons (user_id, date, kind, reason, note, kcal, target) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date, kind) DO UPDATE SET reason = excluded.reason, note = excluded.note, kcal = excluded.kcal, target = excluded.target,
       answered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(userId, m.date, m.kind, m.reason, m.note, m.kcal, m.target)
    .run();
  return { ok: true, body: { saved: m } };
}
