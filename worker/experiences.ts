/**
 * Where members last opened the app (their whop's experience id), so a
 * notification sent from the server reaches them there.
 */

import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";

const ID_CHUNK = 45;

/** Each member's experience, for the ones we know; members without one are left out. */
export async function experiencesOf(env: { DB: D1Database }, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const results = await env.DB.batch<{ user_id: string; experience_id: string | null }>(
      ["coach_sharing", "reminders", "fasting_reminders", "leaderboard"].map((table) =>
        env.DB.prepare(`SELECT user_id, experience_id FROM ${table} WHERE user_id IN (${marks})`).bind(...chunk),
      ),
    );
    // Earlier tables win: coach_sharing records where they last opened the app.
    for (const r of results) {
      for (const row of r.results ?? []) {
        if (!out.has(row.user_id) && row.experience_id && EXPERIENCE_ID_PATTERN.test(row.experience_id)) out.set(row.user_id, row.experience_id);
      }
    }
  }
  return out;
}
