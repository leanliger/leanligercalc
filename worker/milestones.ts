/**
 * Milestone celebrations (src/lib/milestones.ts): every 15 minutes, members
 * who saved a weigh-in or measurement since the last run are checked; a new
 * highest level (5 lb lost, 10 lb…, 1 in off the waist…) is recorded and the
 * member gets a Whop notification. The coach's Today "Celebrate" list reads
 * the same table (recentMilestones) for CELEBRATE_DAYS.
 */

import { addDays } from "../src/lib/dates";
import { calculateFatLossTimeline } from "../src/lib/fat-loss";
import { milestoneMessage, waistLevel, weightLevel, type Milestone, type MilestoneKind } from "../src/lib/milestones";
import { sanitizeAppState } from "../src/lib/persistence";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf, type SharingEnv } from "./sharing";

type Env = ReminderEnv & SharingEnv;

/** Look back a little over two runs, so a skipped run doesn't lose anyone. */
const LOOKBACK_MINUTES = 35;
const MAX_PER_RUN = 200;

export async function checkMilestones(env: Env, now: Date): Promise<{ checked: number; reached: number; sent: number }> {
  const since = new Date(now.getTime() - LOOKBACK_MINUTES * 60_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT user_id FROM weigh_ins WHERE updated_at >= ?1
     UNION SELECT user_id FROM measurements WHERE updated_at >= ?1
     LIMIT ${MAX_PER_RUN}`,
  )
    .bind(since)
    .all<{ user_id: string }>();

  let reached = 0;
  let sent = 0;
  for (const { user_id: userId } of results) {
    const [plan, weighIns, waists, have] = await env.DB.batch([
      env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId),
      env.DB.prepare("SELECT date, weight_lb FROM weigh_ins WHERE user_id = ? ORDER BY date ASC LIMIT 3000").bind(userId),
      env.DB.prepare("SELECT date, waist FROM measurements WHERE user_id = ? AND waist IS NOT NULL ORDER BY date ASC").bind(userId),
      env.DB.prepare("SELECT kind, level FROM milestones WHERE user_id = ?").bind(userId),
    ]);
    const state = (() => {
      const row = (plan?.results ?? [])[0] as { state: string } | undefined;
      try {
        return sanitizeAppState(row ? JSON.parse(row.state) : {});
      } catch {
        return sanitizeAppState({});
      }
    })();
    let startDate: string | null = null;
    try {
      startDate = calculateFatLossTimeline(state.profile, state.fatLoss).requiredStartDate;
    } catch {
      startDate = null;
    }
    const w = ((weighIns?.results ?? []) as { date: string; weight_lb: number }[]).map((r) => ({ date: r.date, weightLb: r.weight_lb }));
    const m = (waists?.results ?? []) as { date: string; waist: number | null }[];
    const best = new Map(((have?.results ?? []) as { kind: MilestoneKind; level: number }[]).map((r) => [r.kind, r.level]));

    const found: Milestone[] = [];
    const wl = weightLevel(w, startDate);
    if (wl !== null && wl > (best.get("weight") ?? 0)) found.push({ kind: "weight", level: wl, reachedOn: w[w.length - 1]!.date });
    const ml = waistLevel(m);
    if (ml !== null && ml > (best.get("waist") ?? 0)) found.push({ kind: "waist", level: ml, reachedOn: m[m.length - 1]!.date });
    if (found.length === 0) continue;

    // Record first, so a failed send isn't repeated every run.
    await env.DB.batch(
      found.map((f) =>
        env.DB.prepare(
          `INSERT INTO milestones (user_id, kind, level, reached_on) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, kind) DO UPDATE SET level = excluded.level, reached_on = excluded.reached_on,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        ).bind(userId, f.kind, f.level, f.reachedOn),
      ),
    );
    reached += found.length;

    const exp = await experienceOf(env, userId);
    if (!exp) continue;
    for (const f of found) {
      const msg = milestoneMessage(f.kind, f.level, state.unit);
      const res = await sendWhop(env, exp, userId, msg);
      if (res.ok) sent++;
      else console.error("milestone notification failed", { status: res.status, reason: res.reason });
    }
  }
  return { checked: results.length, reached, sent };
}

/** Milestones reached since `sinceDate`, per member, for the coach overview. */
export async function recentMilestones(env: { DB: D1Database }, userIds: string[], sinceDate: string): Promise<Map<string, Milestone[]>> {
  const out = new Map<string, Milestone[]>();
  for (let i = 0; i < userIds.length; i += 50) {
    const chunk = userIds.slice(i, i + 50);
    const { results } = await env.DB.prepare(
      `SELECT user_id, kind, level, reached_on FROM milestones WHERE user_id IN (${chunk.map(() => "?").join(",")}) AND reached_on >= ?`,
    )
      .bind(...chunk, sinceDate)
      .all<{ user_id: string; kind: MilestoneKind; level: number; reached_on: string }>();
    for (const r of results) {
      const list = out.get(r.user_id) ?? [];
      list.push({ kind: r.kind, level: r.level, reachedOn: r.reached_on });
      out.set(r.user_id, list);
    }
  }
  return out;
}

export const celebrateSince = (today: string, days: number) => addDays(today, -(days - 1));
