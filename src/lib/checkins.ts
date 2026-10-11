/**
 * Weekly coach check-in (Progress → Weekly; worker/coaching.ts).
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
export const CHECKIN_REPLY_MAX = 2000;
/** Days a check-in looks back over, ending on the day it's sent. */
export const CHECKIN_DAYS = 7;

export interface CheckinAnswers {
  ratings: Record<CheckinScale, number>;
  wins: string;
  struggles: string;
  /** Anything they want to ask the coach. */
  question: string;
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
  return { ok: true, value: { ratings, wins: text(b.wins), struggles: text(b.struggles), question: text(b.question) } };
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
  return { title: "Your coach replied to your check-in", content: "Open Prep Calculator → Progress → Weekly to read it." };
}
