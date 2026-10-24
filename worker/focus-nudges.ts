/**
 * The mid-week check on a check-in's focus items (src/lib/checkin-report.ts).
 *
 * About three days after a coach replies with focus items (and left "Mid-week
 * check on these" ticked), the member gets one Whop notification with how
 * they're doing on the ones that can be counted from their logs since the
 * reply: "3 weigh-ins so far, 2 to go · food logged 2 of 3 days · protein
 * averaging 150 g (target 180)". Items that can't be counted (sleep, stress…)
 * get a general nudge. Checked every 15 minutes, 15:00–23:45 UTC (daytime in
 * the Americas, evening in Europe).
 */

import { daysBetween } from "../src/lib/dates";
import { dayTargetFinder } from "../src/lib/day-targets";
import { STEPS_KEY, type HabitEntries } from "../src/lib/habits";
import { sanitizeAppState } from "../src/lib/persistence";
import { currentPlanWeek, effectiveCarbInputs } from "../src/lib/plan-link";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf } from "./sharing";
import type { WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & { DB: D1Database };

/** Days after the reply before the check goes out, and after which it's too late to bother. */
const AFTER_DAYS = 3;
const TOO_LATE_DAYS = 6;
const PER_RUN = 20;
/** Weigh-ins a week the focus item asks for. */
const WEIGH_IN_GOAL = 5;

const n = (x: number) => Math.round(x).toLocaleString("en-US");

export async function sendFocusNudges(env: Env, now: Date): Promise<{ due: number; sent: number }> {
  const at = now.getTime();
  const { results } = await env.DB.prepare(
    `SELECT user_id, week_start, replied_at, coach_focus, coach_focus_kinds FROM checkins
      WHERE focus_nudge = 'pending' AND replied_at <= ? AND replied_at >= ? LIMIT ?`,
  )
    .bind(new Date(at - AFTER_DAYS * 86_400_000).toISOString(), new Date(at - TOO_LATE_DAYS * 86_400_000).toISOString(), PER_RUN)
    .all<{ user_id: string; week_start: string; replied_at: string; coach_focus: string | null; coach_focus_kinds: string | null }>();

  let sent = 0;
  for (const r of results) {
    // Marked first, so a failed notification isn't retried every 15 minutes.
    await env.DB.prepare("UPDATE checkins SET focus_nudge = ? WHERE user_id = ? AND week_start = ?").bind(now.toISOString(), r.user_id, r.week_start).run();
    let kinds: string[] = [];
    try {
      kinds = r.coach_focus_kinds ? (JSON.parse(r.coach_focus_kinds) as string[]) : [];
    } catch {
      kinds = [];
    }
    const content = await progressLine(env, r.user_id, r.replied_at.slice(0, 10), now.toISOString().slice(0, 10), kinds);
    const exp = await experienceOf(env, r.user_id);
    if (!exp) continue;
    const res = await sendWhop(env, exp, r.user_id, { title: "Halfway check on your focus", content });
    if (res.ok) sent++;
    else console.error("focus nudge failed", { status: res.status, reason: res.reason });
  }
  return { due: results.length, sent };
}

/** How they're doing since the reply on the focus items that can be counted. */
async function progressLine(env: Env, userId: string, from: string, to: string, kinds: readonly string[]): Promise<string> {
  const days = daysBetween(from, to) + 1;
  const [weighIns, food, workouts, habits, plan, macros] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM weigh_ins WHERE user_id = ? AND date BETWEEN ? AND ?").bind(userId, from, to),
    env.DB.prepare("SELECT date, entries FROM food_logs WHERE user_id = ? AND date BETWEEN ? AND ?").bind(userId, from, to),
    env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE user_id = ? AND date BETWEEN ? AND ? AND json_extract(data, '$.finishedAt') IS NOT NULL").bind(
      userId,
      from,
      to,
    ),
    env.DB.prepare("SELECT entries FROM habit_logs WHERE user_id = ? AND date BETWEEN ? AND ?").bind(userId, from, to),
    env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId),
    env.DB.prepare("SELECT kcal, protein, carbs, fat, note, set_at FROM coach_macros WHERE user_id = ?").bind(userId),
  ]);
  const count = (r: D1Result | undefined) => Number(((r?.results ?? [])[0] as { n?: number } | undefined)?.n ?? 0);

  const foodDays = ((food!.results ?? []) as { date: string; entries: string }[])
    .map((f) => {
      try {
        const e = JSON.parse(f.entries) as { kcal?: number; protein?: number }[];
        return { kcal: e.reduce((s, x) => s + (Number(x.kcal) || 0), 0), protein: e.reduce((s, x) => s + (Number(x.protein) || 0), 0) };
      } catch {
        return { kcal: 0, protein: 0 };
      }
    })
    .filter((d) => d.kcal > 0);
  const steps = ((habits!.results ?? []) as { entries: string }[])
    .map((h) => {
      try {
        return (JSON.parse(h.entries) as HabitEntries)[STEPS_KEY];
      } catch {
        return undefined;
      }
    })
    .filter((v): v is number => typeof v === "number" && v > 0);

  // Their targets, as their Food log shows them (coach macros win).
  let target: { calories: number; protein: number; steps: number | null } | null = null;
  const planRow = ((plan!.results ?? [])[0] ?? null) as { state: string } | null;
  const m = ((macros!.results ?? [])[0] ?? null) as { kcal: number; protein: number; carbs: number; fat: number; note: string; set_at: string } | null;
  if (planRow) {
    try {
      const p = sanitizeAppState(JSON.parse(planRow.state));
      const week = currentPlanWeek(p.profile, p.fatLoss, p.tracking.adjustments, to);
      const coach = m ? { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat, note: m.note, setAt: m.set_at } : null;
      const t = dayTargetFinder(p.profile, p.fatLoss, effectiveCarbInputs(p.carbs, week), p.tracking.adjustments, coach)(to);
      if (t) target = { calories: t.calories, protein: t.protein, steps: p.fatLoss.activitySource === "steps" ? p.fatLoss.dailySteps : null };
    } catch {
      target = null;
    }
  }

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const parts: string[] = [];
  for (const k of kinds) {
    if (k === "weigh-ins") {
      const w = count(weighIns);
      parts.push(w >= WEIGH_IN_GOAL ? `${w} weigh-ins done, nice` : `${w} weigh-in${w === 1 ? "" : "s"} so far, ${WEIGH_IN_GOAL - w} to go`);
    } else if (k === "food-days") {
      parts.push(`food logged ${foodDays.length} of ${days} days`);
    } else if (k === "protein" && foodDays.length > 0) {
      parts.push(`protein averaging ${n(avg(foodDays.map((d) => d.protein)))} g${target ? ` (target ${n(target.protein)})` : ""}`);
    } else if (k === "calories-over" && foodDays.length > 0) {
      parts.push(`calories averaging ${n(avg(foodDays.map((d) => d.kcal)))}${target ? ` (target ${n(target.calories)})` : ""}`);
    } else if (k === "steps" && steps.length > 0) {
      parts.push(`steps averaging ${n(avg(steps))}${target?.steps ? ` (target ${n(target.steps)})` : ""}`);
    } else if (k === "workouts") {
      const w = count(workouts);
      parts.push(`${w} workout${w === 1 ? "" : "s"} so far`);
    }
  }
  if (parts.length === 0) return "Halfway through your week: keep at the focus your coach gave you. It's on your Today page.";
  const line = parts.join(" · ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}. Your focus list is on your Today page.`.slice(0, 480);
}
