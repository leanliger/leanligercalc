/**
 * Lift goals (src/lib/lift-goals.ts; table from migration 0038):
 *
 *   GET    /api/lift-goals              mine, newest first
 *   POST   /api/lift-goals              add one { goal, today }
 *   PUT    /api/lift-goals/:id          change one I set { goal, today }
 *   DELETE /api/lift-goals/:id          remove one I set
 *
 *   GET    /api/coach/lift-goals?company&member      a member's goals (they must share their progress)
 *   POST   /api/coach/lift-goals                     add one for them { company, member, goal, today }
 *   PUT    /api/coach/lift-goals/:id                 change any of their goals { company, member, goal, today }
 *   DELETE /api/coach/lift-goals/:id?company&member  remove any of their goals
 *
 * Members change the goals they set; coaches change any of a member's goals
 * (goals a coach set are changed by coaches only). Up to MAX_ACTIVE_GOALS not yet hit. After every
 * finished workout (checkGoalHits) a Build goal it reached is marked hit and
 * the member gets a Whop notification; the coach sees it under Wins.
 */

import { daysBetween, isValidISODate, toISODate } from "../src/lib/dates";
import { MAX_ACTIVE_GOALS, goalLabel, validateGoalInput, workoutValue, type LiftGoal } from "../src/lib/lift-goals";
import type { Workout } from "../src/lib/training";
import { sendWhop, type ReminderEnv } from "./reminders";
import { coachCheck, experienceOf, isSharingProgress, type SharingEnv } from "./sharing";

type Env = SharingEnv & ReminderEnv;
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const GOAL_ID_PATTERN = /^[a-f0-9]{32}$/;

interface Row {
  id: string;
  exercise_id: string;
  name: string;
  bodyweight: number;
  kind: string;
  target: number;
  start_value: number | null;
  deadline: string | null;
  created_on: string;
  set_by_coach: number;
  achieved_on: string | null;
}

const COLUMNS = "id, exercise_id, name, bodyweight, kind, target, start_value, deadline, created_on, set_by_coach, achieved_on";

export function rowToGoal(r: Row): LiftGoal {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    name: r.name,
    bodyweight: r.bodyweight === 1,
    kind: r.kind === "build" ? "build" : "hold",
    target: r.target,
    start: r.start_value,
    deadline: r.deadline,
    createdOn: r.created_on,
    setByCoach: r.set_by_coach === 1,
    achievedOn: r.achieved_on,
  };
}

function newId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The member's day: what their device says, if it's within a day of now (time zones), else UTC. */
function dayOf(raw: unknown): string {
  const utc = toISODate(new Date());
  return typeof raw === "string" && isValidISODate(raw) && Math.abs(daysBetween(utc, raw)) <= 1 ? raw : utc;
}

export async function goalsOf(env: Env, userId: string): Promise<LiftGoal[]> {
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM lift_goals WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<Row>();
  return results.map(rowToGoal);
}

/** Add a goal, or change one, for a member: by them (setByCoach false) or a coach. */
async function upsert(env: Env, memberId: string, setBy: string, byCoach: boolean, companyId: string | null, id: string | null, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const today = dayOf(b.today);
  const v = validateGoalInput(b.goal, today);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const g = v.value;
  if (id) {
    const row = await env.DB.prepare("SELECT set_by_coach, achieved_on FROM lift_goals WHERE id = ? AND user_id = ?")
      .bind(id, memberId)
      .first<{ set_by_coach: number; achieved_on: string | null }>();
    if (!row) return { ok: false, status: 404, error: "That goal isn't there any more." };
    if (!byCoach && row.set_by_coach === 1) return { ok: false, status: 403, error: "Your coach set this goal, so only they can change it." };
    // A changed target is a new goal to reach: a hit is cleared when it's raised past what was reached.
    await env.DB.prepare(
      `UPDATE lift_goals SET exercise_id = ?, name = ?, bodyweight = ?, kind = ?, target = ?, deadline = ?,
         achieved_on = CASE WHEN achieved_value IS NOT NULL AND achieved_value >= ? AND ? = 'build' THEN achieved_on ELSE NULL END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(g.exerciseId, g.name, g.bodyweight ? 1 : 0, g.kind, g.target, g.deadline, g.target, g.kind, id, memberId)
      .run();
  } else {
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM lift_goals WHERE user_id = ? AND achieved_on IS NULL").bind(memberId).first<{ n: number }>();
    if ((active?.n ?? 0) >= MAX_ACTIVE_GOALS) return { ok: false, status: 409, error: `Up to ${MAX_ACTIVE_GOALS} goals at a time. Remove one first.` };
    await env.DB.prepare(
      `INSERT INTO lift_goals (id, user_id, exercise_id, name, bodyweight, kind, target, start_value, deadline, created_on, set_by, set_by_coach, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), memberId, g.exerciseId, g.name, g.bodyweight ? 1 : 0, g.kind, g.target, g.start, g.deadline, today, setBy, byCoach ? 1 : 0, companyId)
      .run();
  }
  return { ok: true, body: { goals: await goalsOf(env, memberId) } };
}

async function remove(env: Env, memberId: string, byCoach: boolean, id: string): Promise<Result> {
  const row = await env.DB.prepare("SELECT set_by_coach FROM lift_goals WHERE id = ? AND user_id = ?").bind(id, memberId).first<{ set_by_coach: number }>();
  if (!row) return { ok: true, body: { goals: await goalsOf(env, memberId) } };
  if (!byCoach && row.set_by_coach === 1) return { ok: false, status: 403, error: "Your coach set this goal, so only they can remove it." };
  await env.DB.prepare("DELETE FROM lift_goals WHERE id = ? AND user_id = ?").bind(id, memberId).run();
  return { ok: true, body: { goals: await goalsOf(env, memberId) } };
}

/* -------------------------------- members -------------------------------- */

export async function myGoals(env: Env, userId: string): Promise<Result> {
  return { ok: true, body: { goals: await goalsOf(env, userId) } };
}

export async function saveMyGoal(env: Env, userId: string, id: string | null, raw: unknown): Promise<Result> {
  if (id !== null && !GOAL_ID_PATTERN.test(id)) return { ok: false, status: 404, error: "Not found." };
  return upsert(env, userId, userId, false, null, id, raw);
}

export async function removeMyGoal(env: Env, userId: string, id: string): Promise<Result> {
  if (!GOAL_ID_PATTERN.test(id)) return { ok: false, status: 404, error: "Not found." };
  return remove(env, userId, false, id);
}

/* -------------------------------- coaches -------------------------------- */

const NOT_SHARING: Result = { ok: false, status: 403, error: "This member isn't sharing their progress with you right now." };

async function coachMember(env: Env, viewerId: string, raw: unknown): Promise<{ memberId: string; companyId: string } | { error: Result }> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return { error: c.error };
  if (!(await isSharingProgress(env, c.memberId))) return { error: NOT_SHARING };
  return { memberId: c.memberId, companyId: (raw as { company: string }).company };
}

export async function coachGoals(env: Env, viewerId: string, companyId: string, memberId: string): Promise<Result> {
  const c = await coachMember(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  return { ok: true, body: { goals: await goalsOf(env, c.memberId) } };
}

export async function coachSaveGoal(env: Env, viewerId: string, id: string | null, raw: unknown): Promise<Result> {
  if (id !== null && !GOAL_ID_PATTERN.test(id)) return { ok: false, status: 404, error: "Not found." };
  const c = await coachMember(env, viewerId, raw);
  if ("error" in c) return c.error;
  return upsert(env, c.memberId, viewerId, true, c.companyId, id, raw);
}

export async function coachRemoveGoal(env: Env, viewerId: string, id: string, companyId: string, memberId: string): Promise<Result> {
  if (!GOAL_ID_PATTERN.test(id)) return { ok: false, status: 404, error: "Not found." };
  const c = await coachMember(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  return remove(env, c.memberId, true, id);
}

/* ---------------------------------- hits ---------------------------------- */

/**
 * After a finished workout is saved: each Build goal it reached is marked hit
 * (once), and the member gets one Whop notification for them. Never throws:
 * a failure here mustn't fail the workout save.
 */
export async function checkGoalHits(env: Env, userId: string, w: Workout): Promise<void> {
  if (w.finishedAt === null) return;
  try {
    const ids = [...new Set(w.exercises.map((e) => e.exerciseId))];
    if (ids.length === 0) return;
    const marks = ids.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM lift_goals WHERE user_id = ? AND kind = 'build' AND achieved_on IS NULL AND exercise_id IN (${marks})`,
    )
      .bind(userId, ...ids)
      .all<Row>();
    const hit: LiftGoal[] = [];
    for (const r of results) {
      const g = rowToGoal(r);
      // Only workouts on or after the day it was set count (an old workout edited later doesn't).
      if (w.date < g.createdOn) continue;
      const value = workoutValue(w, g.exerciseId, g.bodyweight);
      if (value === null || value < g.target) continue;
      await env.DB.prepare("UPDATE lift_goals SET achieved_on = ?, achieved_value = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND achieved_on IS NULL")
        .bind(w.date, Math.round(value * 10) / 10, g.id)
        .run();
      hit.push(g);
    }
    if (hit.length === 0) return;
    const exp = await experienceOf(env, userId);
    if (!exp) return;
    // In the unit they use in the app.
    const plan = await env.DB.prepare("SELECT json_extract(state, '$.unit') AS unit FROM plans WHERE user_id = ?").bind(userId).first<{ unit: string | null }>();
    const unit = plan?.unit === "kg" ? "kg" : "lb";
    const what = hit.map((g) => goalLabel(g, unit)).join(" and ");
    const res = await sendWhop(env, exp, userId, {
      title: hit.length === 1 ? `Goal hit: ${what}!` : `${hit.length} goals hit!`,
      content: `You reached ${what}. That's the work paying off. Set your next goal on the Training tab.`,
    });
    if (!res.ok) console.error("goal hit notification failed", { status: res.status, reason: res.reason });
  } catch (e) {
    console.error("goal hit check failed", e instanceof Error ? e.message : String(e));
  }
}
