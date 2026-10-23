/**
 * Weekly coach check-in (Progress → Check-in; worker/coaching.ts).
 *
 * Once a week a member rates five things from 1 (bad) to 5 (good), writes
 * their wins and struggles, and can ask their coach a question. The numbers
 * for the 7 days up to that day are filled in from their logs by the server
 * when they send it (computeCheckinStats), so the coach sees one page instead
 * of five tabs. One check-in per calendar week (Monday start); sending again
 * that week replaces it, until the coach has replied.
 */

import { addDays } from "./dates";
import { weekStartOf, weeklyScore, type HabitDef, type HabitEntries } from "./habits";
import { STEPS_KEY } from "./habits";

export const CHECKIN_SCALES = [
  { key: "energy", label: "Energy", low: "Drained", high: "Great" },
  { key: "hunger", label: "Hunger", low: "Starving", high: "No problem" },
  { key: "sleep", label: "Sleep", low: "Poor", high: "Great" },
  { key: "stress", label: "Stress", low: "Very high", high: "Low" },
  { key: "training", label: "Training", low: "Rough", high: "Strong" },
] as const;

export type CheckinScale = (typeof CHECKIN_SCALES)[number]["key"];

export const CHECKIN_TEXT_MAX = 600;
/** Voice replies (worker/voice-replies.ts). */
export const VOICE_MAX_SECONDS = 30;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];
export const CHECKIN_REPLY_MAX = 2000;
/** Days a check-in looks back over, ending on the day it's sent. */
export const CHECKIN_DAYS = 7;

export interface CheckinAnswers {
  ratings: Record<CheckinScale, number>;
  wins: string;
  struggles: string;
  /** Anything they want to ask the coach. */
  question: string;
  /** One focus or rule for next week (was the weekly self-review). */
  focus?: string;
}

/** Filled in from the member's logs for the 7 days to `to`. */
export interface CheckinStats {
  from: string;
  to: string;
  /** Average of the week's weigh-ins, and of the 7 days before, pounds. */
  avgWeightLb: number | null;
  prevAvgWeightLb: number | null;
  weighIns: number;
  /** Average logged steps on days with a count. */
  avgSteps: number | null;
  /** Finished workouts. */
  workouts: number;
  /** Average calories and protein on days with food logged. */
  foodDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** Habit scorecard for the calendar week, 0–100. */
  habitPercent: number | null;
  /** Progress photos taken. */
  photos: number;
}

export interface Checkin {
  weekStart: string;
  submittedAt: string;
  answers: CheckinAnswers;
  stats: CheckinStats;
  reply: string | null;
  repliedAt: string | null;
  /** The coach's voice reply, if any (played from /api/checkins/voice/:weekStart). */
  replyAudio: { seconds: number } | null;
  /** Things to do this week the coach sent with the reply (src/lib/checkin-report.ts). */
  coachFocus?: string[] | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, CHECKIN_TEXT_MAX) : "");

export function validateCheckinAnswers(raw: unknown): { ok: true; value: CheckinAnswers } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const r = (typeof b.ratings === "object" && b.ratings !== null ? b.ratings : {}) as Record<string, unknown>;
  const ratings = {} as Record<CheckinScale, number>;
  for (const s of CHECKIN_SCALES) {
    const v = r[s.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return { ok: false, error: `Rate your ${s.label.toLowerCase()} from 1 to 5.` };
    ratings[s.key] = v;
  }
  return { ok: true, value: { ratings, wins: text(b.wins), struggles: text(b.struggles), question: text(b.question), focus: text(b.focus) } };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** The week's numbers from a member's logs, for the 7 days ending `to`. */
export function computeCheckinStats(
  data: {
    weighIns: { date: string; weightLb: number }[];
    habitLogs: { date: string; entries: HabitEntries }[];
    habits: HabitDef[];
    workouts: { date: string; finished: boolean }[];
    foodDays: { date: string; kcal: number; protein: number }[];
    photoDates: string[];
  },
  to: string,
): CheckinStats {
  const from = addDays(to, -(CHECKIN_DAYS - 1));
  const prevFrom = addDays(from, -CHECKIN_DAYS);
  const inWeek = (d: string) => d >= from && d <= to;
  const week = data.weighIns.filter((w) => inWeek(w.date)).map((w) => w.weightLb);
  const prev = data.weighIns.filter((w) => w.date >= prevFrom && w.date < from).map((w) => w.weightLb);
  const steps = data.habitLogs
    .filter((l) => inWeek(l.date))
    .map((l) => l.entries[STEPS_KEY])
    .filter((v): v is number => typeof v === "number" && v > 0);
  const food = data.foodDays.filter((d) => inWeek(d.date) && d.kcal > 0);
  const logs = new Map(data.habitLogs.map((l) => [l.date, l.entries]));
  const firstLog = data.habitLogs.reduce<string | null>((m, l) => (!m || l.date < m ? l.date : m), null);
  const score = data.habits.length > 0 ? weeklyScore(data.habits, logs, weekStartOf(to), to, firstLog).percent : null;
  const a = avg(week);
  const p = avg(prev);
  const s = avg(steps);
  const k = avg(food.map((d) => d.kcal));
  const pr = avg(food.map((d) => d.protein));
  return {
    from,
    to,
    avgWeightLb: a === null ? null : round1(a),
    prevAvgWeightLb: p === null ? null : round1(p),
    weighIns: week.length,
    avgSteps: s === null ? null : Math.round(s),
    workouts: data.workouts.filter((w) => w.finished && inWeek(w.date)).length,
    foodDays: food.length,
    avgKcal: k === null ? null : Math.round(k),
    avgProtein: pr === null ? null : Math.round(pr),
    habitPercent: score,
    photos: data.photoDates.filter(inWeek).length,
  };
}

/** Whop notification when the coach replies. */
export function checkinReplyMessage(): { title: string; content: string } {
  return { title: "Your coach replied to your check-in", content: "Open Lean Stature System → Progress → Check-in to read it." };
}

/* --------------------------------- drafts --------------------------------- */

/** What the week was meant to look like, for the draft. */
export interface CheckinPlan {
  /** Which way the scale should move. */
  direction: "lose" | "gain" | "maintain";
  /** The week's average daily targets, when there's a plan. */
  kcal: number | null;
  protein: number | null;
  /** Daily steps aimed for, and training sessions a week. */
  steps: number | null;
  trainingDays: number | null;
}

/** Calories within this of target count as on target (as the scorecard's ±100). */
const KCAL_NEAR = 150;
const PROTEIN_NEAR = 10;
const STEPS_NEAR = 1000;

/**
 * Wins, struggles and one focus for next week, written from the week's
 * numbers so the member only adds how it felt (the ratings, and anything to
 * change). Plain sentences, most important first; empty when there's nothing
 * to say. Never sent as it is: it fills the form, and the member edits it.
 */
export function draftCheckin(
  stats: CheckinStats,
  plan: CheckinPlan,
  unit: "lb" | "kg",
): { wins: string; struggles: string; focus: string } {
  const wins: string[] = [];
  const struggles: string[] = [];
  const focus: string[] = [];
  const w = (lb: number) => `${Math.round((unit === "kg" ? lb / 2.2046226218 : lb) * 10) / 10} ${unit}`;
  const n = (v: number) => Math.round(v).toLocaleString("en-US");

  // Weight, against last week's average.
  if (stats.avgWeightLb !== null && stats.prevAvgWeightLb !== null) {
    const change = stats.avgWeightLb - stats.prevAvgWeightLb;
    const moved = Math.abs(change) >= 0.2;
    const text = `${change < 0 ? "Down" : "Up"} ${w(Math.abs(change))} on last week's average (now ${w(stats.avgWeightLb)}).`;
    const good = plan.direction === "lose" ? change < 0 : plan.direction === "gain" ? change > 0 : Math.abs(change) < 0.5;
    if (!moved) (plan.direction === "maintain" ? wins : struggles).push(`Weight held steady at ${w(stats.avgWeightLb)}.`);
    else (good ? wins : struggles).push(text);
  }
  if (stats.weighIns >= 6) wins.push(`Weighed in ${stats.weighIns} of 7 mornings.`);
  else if (stats.weighIns < 3) {
    struggles.push(stats.weighIns === 0 ? "No weigh-ins this week." : `Only ${stats.weighIns} weigh-in${stats.weighIns === 1 ? "" : "s"} this week.`);
    focus.push("Weigh in every morning, after the bathroom and before eating.");
  }

  // Food.
  if (stats.foodDays >= 6) wins.push(`Logged food ${stats.foodDays} of 7 days.`);
  else if (stats.foodDays <= 3) {
    struggles.push(stats.foodDays === 0 ? "Didn't log food this week." : `Logged food only ${stats.foodDays} of 7 days.`);
    focus.push("Log food every day, even the off-plan days.");
  }
  if (stats.avgKcal !== null && plan.kcal !== null && stats.foodDays >= 4) {
    const gap = stats.avgKcal - plan.kcal;
    if (Math.abs(gap) <= KCAL_NEAR) wins.push(`Calories on target: ${n(stats.avgKcal)} a day against ${n(plan.kcal)}.`);
    else if (gap > 0) {
      struggles.push(`Calories ${n(gap)} over target on average (${n(stats.avgKcal)} against ${n(plan.kcal)}).`);
      focus.push(`Bring calories back to ${n(plan.kcal)} a day: plan the meals that ran over.`);
    } else struggles.push(`Calories ${n(-gap)} under target on average (${n(stats.avgKcal)} against ${n(plan.kcal)}).`);
  }
  if (stats.avgProtein !== null && plan.protein !== null && stats.foodDays >= 4) {
    if (stats.avgProtein >= plan.protein - PROTEIN_NEAR) wins.push(`Protein on target: ${n(stats.avgProtein)} g a day.`);
    else {
      struggles.push(`Protein short: ${n(stats.avgProtein)} g a day against ${n(plan.protein)} g.`);
      focus.push(`Hit ${n(plan.protein)} g protein a day: a protein source at every meal.`);
    }
  }

  // Training and steps.
  if (plan.trainingDays !== null && plan.trainingDays > 0) {
    if (stats.workouts >= plan.trainingDays) wins.push(`All ${plan.trainingDays} workouts done${stats.workouts > plan.trainingDays ? ` (${stats.workouts} in all)` : ""}.`);
    else {
      struggles.push(`${stats.workouts} of ${plan.trainingDays} workouts done.`);
      focus.push(`Get all ${plan.trainingDays} workouts in: put them in the calendar.`);
    }
  } else if (stats.workouts > 0) wins.push(`${stats.workouts} workout${stats.workouts === 1 ? "" : "s"} done.`);
  if (stats.avgSteps !== null && plan.steps !== null) {
    if (stats.avgSteps >= plan.steps - STEPS_NEAR / 2) wins.push(`${n(stats.avgSteps)} steps a day (goal ${n(plan.steps)}).`);
    else if (stats.avgSteps < plan.steps - STEPS_NEAR) {
      struggles.push(`Steps at ${n(stats.avgSteps)} a day, under the ${n(plan.steps)} goal.`);
      focus.push(`Get to ${n(plan.steps)} steps a day: a walk after the biggest meal.`);
    }
  }

  // Habits and photos.
  if (stats.habitPercent !== null) {
    if (stats.habitPercent >= 80) wins.push(`Habits at ${stats.habitPercent}%, a green week.`);
    else if (stats.habitPercent < 60) struggles.push(`Habits at ${stats.habitPercent}%.`);
  }
  if (stats.photos > 0) wins.push("Took progress photos.");

  return { wins: wins.join("\n"), struggles: struggles.join("\n"), focus: focus[0] ?? "" };
}
