/**
 * Habit vs results (Progress → Habits, "What's working"): finished Mon–Sun
 * weeks split by one habit, comparing the weight change in each group.
 * "In weeks you averaged 9,000+ steps, you lost 0.4 lb more a week."
 *
 * A week's weight change is the least-squares slope through its weigh-ins
 * (plus the day before it), times 7: a line through every reading, so one
 * salty dinner doesn't decide a week, and it belongs to that week rather
 * than lagging like the smoothed trend. A comparison needs MIN_WEEKS weeks on each
 * side and a difference of at least MIN_DIFF_LB to be shown. It's a pattern
 * in their own data, not proof, and the card says so.
 */

import { addDays, daysBetween } from "./dates";
import { STEPS_KEY, weekStartOf, weeklyScore, type HabitDef, type HabitEntries } from "./habits";

export const INSIGHT_WEEKS = 16;
export const MIN_WEEKS = 3;
export const MIN_DIFF_LB = 0.15;
const GREEN = 80;
const FOOD_DAYS = 6;
/** A week's average steps needs this many days with a count. */
const STEP_DAYS = 4;
/** A week needs this many weigh-ins, at least this many days apart end to end. */
const WEEK_POINTS = 4;
const WEEK_SPAN = 4;

export interface WeekResult {
  weekStart: string;
  /** Weight change over the week, lb (negative = lost). */
  changeLb: number;
  avgSteps: number | null;
  habitPercent: number | null;
  foodDays: number;
}

export interface Insight {
  id: "steps" | "habits" | "food";
  /** "In weeks you averaged 9,000+ steps" */
  condition: string;
  /** Average weekly change in those weeks and the others, lb (negative = lost). */
  withChange: number;
  withoutChange: number;
  withWeeks: number;
  withoutWeeks: number;
}

/** lb per week from the weigh-ins between two dates, or null with too few. */
function weeklySlope(weighIns: readonly { date: string; weightLb: number }[], from: string, to: string): number | null {
  const pts = weighIns.filter((w) => w.date >= from && w.date <= to);
  if (pts.length < WEEK_POINTS) return null;
  const dates = pts.map((w) => w.date).sort();
  if (daysBetween(dates[0]!, dates[dates.length - 1]!) < WEEK_SPAN) return null;
  const xs = pts.map((w) => daysBetween(from, w.date));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = pts.reduce((s, w) => s + w.weightLb, 0) / pts.length;
  let num = 0;
  let den = 0;
  pts.forEach((w, i) => {
    num += (xs[i]! - mx) * (w.weightLb - my);
    den += (xs[i]! - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

/** The finished weeks with a weight change, newest last. */
export function weekResults(input: {
  weighIns: readonly { date: string; weightLb: number }[];
  habits: HabitDef[];
  habitLogs: readonly { date: string; entries: HabitEntries }[];
  foodDates: readonly string[];
  today: string;
}): WeekResult[] {
  const logs = new Map(input.habitLogs.map((l) => [l.date, l.entries]));
  const first = input.habitLogs.reduce<string | null>((m, l) => (!m || l.date < m ? l.date : m), null);
  const food = new Set(input.foodDates);
  const thisWeek = weekStartOf(input.today);
  const out: WeekResult[] = [];
  for (let i = INSIGHT_WEEKS; i >= 1; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const change = weeklySlope(input.weighIns, addDays(start, -1), end);
    if (change === null) continue;
    const days = Array.from({ length: 7 }, (_, d) => addDays(start, d));
    const steps = days.map((d) => logs.get(d)?.[STEPS_KEY]).filter((v): v is number => typeof v === "number" && v > 0);
    const score = input.habits.length > 0 ? weeklyScore(input.habits, logs, start, input.today, first).percent : null;
    out.push({
      weekStart: start,
      changeLb: Math.round(change * 100) / 100,
      avgSteps: steps.length >= STEP_DAYS ? Math.round(steps.reduce((s, x) => s + x, 0) / steps.length) : null,
      habitPercent: score,
      foodDays: days.filter((d) => food.has(d)).length,
    });
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function compare(id: Insight["id"], condition: string, weeks: WeekResult[], test: (w: WeekResult) => boolean | null): Insight | null {
  const yes: number[] = [];
  const no: number[] = [];
  for (const w of weeks) {
    const t = test(w);
    if (t === null) continue;
    (t ? yes : no).push(w.changeLb);
  }
  if (yes.length < MIN_WEEKS || no.length < MIN_WEEKS) return null;
  const a = mean(yes);
  const b = mean(no);
  if (Math.abs(a - b) < MIN_DIFF_LB) return null;
  const r = (x: number) => Math.round(x * 100) / 100;
  return { id, condition, withChange: r(a), withoutChange: r(b), withWeeks: yes.length, withoutWeeks: no.length };
}

/** The comparisons with enough weeks and a real difference, biggest difference first. */
export function habitInsights(weeks: WeekResult[], stepTarget: number): Insight[] {
  const steps = Math.max(1000, Math.round(stepTarget / 1000) * 1000);
  return [
    compare("steps", `In weeks you averaged ${steps.toLocaleString()}+ steps`, weeks, (w) => (w.avgSteps === null ? null : w.avgSteps >= steps)),
    compare("habits", `In Green weeks (${GREEN}%+ on the scorecard)`, weeks, (w) => (w.habitPercent === null ? null : w.habitPercent >= GREEN)),
    compare("food", `In weeks you logged food ${FOOD_DAYS}+ days`, weeks, (w) => w.foodDays >= FOOD_DAYS),
  ]
    .filter((x): x is Insight => x !== null)
    .sort((x, y) => Math.abs(y.withChange - y.withoutChange) - Math.abs(x.withChange - x.withoutChange));
}
