/**
 * Community stats (src/lib/community-stats.ts):
 *
 *   GET /api/coach/community-stats?company=…&period=this-month|last-month|30d
 *
 * Totals across the whop's current members who share their progress: weight
 * and waist lost, workouts and volume, check-ins and milestones. Members who
 * don't share are never read. No names or per-member numbers leave here, and
 * nothing is returned until STATS_MIN_MEMBERS are counted.
 */

import {
  STATS_MIN_MEMBERS,
  periodRange,
  weightChangeLb,
  type CommunityStats,
  type StatsPeriod,
} from "../src/lib/community-stats";
import { doneSets, setVolume, type Workout } from "../src/lib/training";
import { companyMembers } from "./coach";
import { adminCheck } from "./messages";
import type { PhotoEnv } from "./photos";
import type { ReminderEnv } from "./reminders";
import type { WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & PhotoEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const ID_CHUNK = 45;

export async function communityStats(env: Env, viewerId: string, companyId: string, periodRaw: string, now = new Date()): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const period: StatsPeriod = periodRaw === "last-month" || periodRaw === "30d" ? periodRaw : "this-month";
  const today = now.toISOString().slice(0, 10);
  const { from, to, label } = periodRange(period, today);
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const listed = await companyMembers(env, companyId);
  if (!listed.ok) return { ok: false, status: 502, error: "Couldn't get your member list from Whop. Try again in a moment." };
  const ids = [...listed.profiles.keys()];

  const stats: CommunityStats = {
    period,
    from,
    to,
    label,
    members: 0,
    active: 0,
    lbLost: 0,
    membersDown: 0,
    waistInLost: 0,
    workouts: 0,
    volumeLb: 0,
    checkins: 0,
    milestones: 0,
    enough: false,
  };
  const active = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const [share] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id FROM coach_sharing WHERE shared = 1 AND user_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk),
    ]);
    const shared = ((share!.results ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (shared.length === 0) continue;
    stats.members += shared.length;
    const m = shared.map(() => "?").join(",");
    const [weighIns, workouts, checkins, milestones, waist, food] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id, date, weight_lb FROM weigh_ins WHERE user_id IN (${m}) AND date BETWEEN ? AND ?`).bind(...shared, from, to),
      env.DB.prepare(
        `SELECT user_id, data FROM workouts WHERE user_id IN (${m}) AND date BETWEEN ? AND ? AND json_extract(data, '$.finishedAt') IS NOT NULL`,
      ).bind(...shared, from, to),
      env.DB.prepare(`SELECT user_id FROM checkins WHERE user_id IN (${m}) AND submitted_at BETWEEN ? AND ?`).bind(...shared, fromTs, toTs),
      env.DB.prepare(`SELECT user_id FROM milestones WHERE user_id IN (${m}) AND reached_on BETWEEN ? AND ?`).bind(...shared, from, to),
      env.DB.prepare(`SELECT user_id, date, waist FROM measurements WHERE user_id IN (${m}) AND date BETWEEN ? AND ? AND waist IS NOT NULL ORDER BY date`).bind(
        ...shared,
        from,
        to,
      ),
      env.DB.prepare(`SELECT DISTINCT user_id FROM food_logs WHERE user_id IN (${m}) AND date BETWEEN ? AND ?`).bind(...shared, from, to),
    ]);

    const byMember = new Map<string, { date: string; weightLb: number }[]>();
    for (const r of (weighIns!.results ?? []) as { user_id: string; date: string; weight_lb: number }[]) {
      active.add(r.user_id);
      byMember.set(r.user_id, [...(byMember.get(r.user_id) ?? []), { date: r.date, weightLb: r.weight_lb }]);
    }
    for (const list of byMember.values()) {
      const change = weightChangeLb(list);
      if (change !== null && change < -0.5) {
        stats.lbLost += -change;
        stats.membersDown++;
      }
    }
    for (const r of (workouts!.results ?? []) as { user_id: string; data: string }[]) {
      active.add(r.user_id);
      stats.workouts++;
      try {
        const w = JSON.parse(r.data) as Workout;
        for (const e of Array.isArray(w.exercises) ? w.exercises : []) for (const s of doneSets(e)) stats.volumeLb += setVolume(s);
      } catch {
        /* a corrupt row still counts as a workout */
      }
    }
    for (const r of (checkins!.results ?? []) as { user_id: string }[]) {
      active.add(r.user_id);
      stats.checkins++;
    }
    stats.milestones += (milestones!.results ?? []).length;
    const waists = new Map<string, number[]>();
    for (const r of (waist!.results ?? []) as { user_id: string; waist: number }[]) waists.set(r.user_id, [...(waists.get(r.user_id) ?? []), r.waist]);
    for (const list of waists.values()) {
      const lost = list[0]! - list[list.length - 1]!;
      if (list.length >= 2 && lost > 0) stats.waistInLost += lost;
    }
    for (const r of (food!.results ?? []) as { user_id: string }[]) active.add(r.user_id);
  }
  stats.active = active.size;
  stats.enough = stats.members >= STATS_MIN_MEMBERS;
  if (!stats.enough) {
    // Too few to keep anyone's numbers from standing out: counts only.
    return { ok: true, body: { stats: { ...stats, lbLost: 0, membersDown: 0, waistInLost: 0, workouts: 0, volumeLb: 0, checkins: 0, milestones: 0, active: 0 } } };
  }
  return { ok: true, body: { stats } };
}
