/**
 * Program results (src/lib/program-results.ts):
 *
 *   GET /api/coach/program-results?company=…   coaches: each program sent in the last year, with how its members are doing
 *
 * For every program assignment of this whop (not cancelled), the members who
 * added it and share their progress: their workouts from that program since
 * they added it, their weigh-ins over the same time, and the calendar it came
 * with. Members who don't share are counted but not read.
 */

import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { addDays } from "../src/lib/dates";
import { assignedProgramId } from "../src/lib/assignments";
import { memberProgramResult, programResult, type ProgramResult } from "../src/lib/program-results";
import { sanitizeSchedule, scheduleSessions } from "../src/lib/program-schedule";
import type { WeighIn } from "../src/lib/tracking";
import type { Program, Workout } from "../src/lib/training";
import { accessLevel, hasWhopKey, type WhopEnv } from "./whop";

type Env = WhopEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const ID_CHUNK = 45;
const LOOKBACK_DAYS = 365;

export async function coachProgramResults(env: Env, viewerId: string, companyId: string, now = new Date()): Promise<Result> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };

  const today = now.toISOString().slice(0, 10);
  const { results: rows } = await env.DB.prepare(
    `SELECT a.id, a.title, a.payload, a.created_at, t.user_id, t.responded_at
       FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
      WHERE a.company_id = ? AND a.kind = 'program' AND a.cancelled_at IS NULL AND a.created_at >= ? AND t.status = 'accepted'`,
  )
    .bind(companyId, addDays(today, -LOOKBACK_DAYS))
    .all<{ id: string; title: string; payload: string; created_at: string; user_id: string; responded_at: string | null }>();

  // Programs, even those nobody has added yet.
  const { results: sent } = await env.DB.prepare(
    "SELECT id, title, payload, created_at FROM assignments WHERE company_id = ? AND kind = 'program' AND cancelled_at IS NULL AND created_at >= ? ORDER BY created_at DESC",
  )
    .bind(companyId, addDays(today, -LOOKBACK_DAYS))
    .all<{ id: string; title: string; payload: string; created_at: string }>();

  const memberIds = [...new Set(rows.map((r) => r.user_id))];
  const sharing = new Set<string>();
  const workouts = new Map<string, Workout[]>();
  const weighIns = new Map<string, WeighIn[]>();
  const from = addDays(today, -LOOKBACK_DAYS - 14);
  for (let i = 0; i < memberIds.length; i += ID_CHUNK) {
    const chunk = memberIds.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const [share] = await env.DB.batch([env.DB.prepare(`SELECT user_id FROM coach_sharing WHERE shared = 1 AND user_id IN (${marks})`).bind(...chunk)]);
    const shared = ((share!.results ?? []) as { user_id: string }[]).map((r) => r.user_id);
    for (const id of shared) sharing.add(id);
    if (shared.length === 0) continue;
    const m2 = shared.map(() => "?").join(",");
    const [w, wi] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id, date, data FROM workouts WHERE user_id IN (${m2}) AND date >= ? AND json_extract(data, '$.finishedAt') IS NOT NULL`).bind(
        ...shared,
        from,
      ),
      env.DB.prepare(`SELECT user_id, date, weight_lb, calories, note FROM weigh_ins WHERE user_id IN (${m2}) AND date >= ? ORDER BY date`).bind(...shared, from),
    ]);
    for (const r of (w!.results ?? []) as { user_id: string; date: string; data: string }[]) {
      try {
        workouts.set(r.user_id, [...(workouts.get(r.user_id) ?? []), { ...(JSON.parse(r.data) as Workout), date: r.date }]);
      } catch {
        /* skip a corrupt row */
      }
    }
    for (const r of (wi!.results ?? []) as { user_id: string; date: string; weight_lb: number; calories: number | null; note: string | null }[]) {
      weighIns.set(r.user_id, [...(weighIns.get(r.user_id) ?? []), { date: r.date, weightLb: r.weight_lb, calories: r.calories, note: r.note }]);
    }
  }

  const programs: (ProgramResult & { added: number })[] = sent.map((a) => {
    let planned: string[] | null = null;
    try {
      const p = JSON.parse(a.payload) as Program | null;
      const schedule = sanitizeSchedule(p?.schedule);
      if (p && schedule) planned = scheduleSessions({ ...p, schedule }).map((s) => s.date);
    } catch {
      planned = null;
    }
    const programId = assignedProgramId(a.id);
    const takers = rows.filter((r) => r.id === a.id);
    const members = takers
      .filter((r) => sharing.has(r.user_id))
      .map((r) => {
        const since = (r.responded_at ?? a.created_at).slice(0, 10);
        const theirs = (workouts.get(r.user_id) ?? []).filter((w) => w.programId === programId);
        return memberProgramResult(r.user_id, since, theirs, weighIns.get(r.user_id) ?? [], planned, today);
      });
    return { ...programResult(a.id, a.title, a.created_at, members), added: takers.length };
  });
  return { ok: true, body: { programs } };
}
