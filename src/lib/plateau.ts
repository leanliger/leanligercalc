/**
 * Plateau detector (Progress → Weigh-in; flagged on the coach dashboard too):
 * the weight hasn't really moved for two weeks or more during a diet.
 *
 * It looks at the least-squares slope of the raw weigh-ins over the last
 * PLATEAU_DAYS (and, if that's flat too, PLATEAU_LONG_DAYS). "Flat" means
 * losing less than FLAT_RATE of body weight a week, or gaining. It needs
 * enough weigh-ins spread across the window, so a few heavy mornings or a
 * gap in logging don't trigger it.
 */

import { addDays, daysBetween } from "./dates";

export const PLATEAU_DAYS = 14;
export const PLATEAU_LONG_DAYS = 21;
/** Weekly loss under this share of body weight counts as flat (0.1%). */
export const FLAT_RATE = 0.001;
const MIN_POINTS = 5;
const MIN_SPAN = 10;

export interface Plateau {
  /** How long it's been flat: 14 or 21 days. */
  days: number;
  /** Weekly change over that window, lb (negative = losing). */
  weeklyChangeLb: number;
  /** Average weight over the window, lb. */
  averageLb: number;
}

function slopePerDay(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function flatOver(weighIns: readonly { date: string; weightLb: number }[], today: string, days: number) {
  const from = addDays(today, -(days - 1));
  const inWindow = weighIns.filter((w) => w.date >= from && w.date <= today);
  if (inWindow.length < MIN_POINTS) return null;
  const dates = inWindow.map((w) => w.date).sort();
  if (daysBetween(dates[0]!, dates[dates.length - 1]!) < MIN_SPAN) return null;
  const slope = slopePerDay(inWindow.map((w) => ({ x: daysBetween(from, w.date), y: w.weightLb })));
  if (slope === null) return null;
  const averageLb = inWindow.reduce((s, w) => s + w.weightLb, 0) / inWindow.length;
  const weeklyChangeLb = slope * 7;
  return { flat: weeklyChangeLb > -FLAT_RATE * averageLb, weeklyChangeLb, averageLb };
}

/**
 * The plateau, or null. `dietStart` is the day the diet began when today
 * falls inside it (dietStartToday), else null: a steady weight is the point
 * outside a diet. Only weigh-ins from the diet's start count, so a flat
 * stretch before it began isn't a plateau.
 */
export function detectPlateau(weighIns: readonly { date: string; weightLb: number }[], today: string, dietStart: string | null): Plateau | null {
  if (!dietStart) return null;
  const inDiet = weighIns.filter((w) => w.date >= dietStart);
  const short = flatOver(inDiet, today, PLATEAU_DAYS);
  if (!short?.flat) return null;
  const long = flatOver(inDiet, today, PLATEAU_LONG_DAYS);
  const use = long?.flat ? { ...long, days: PLATEAU_LONG_DAYS } : { ...short, days: PLATEAU_DAYS };
  return { days: use.days, weeklyChangeLb: Math.round(use.weeklyChangeLb * 100) / 100, averageLb: Math.round(use.averageLb * 10) / 10 };
}

/** The diet's start when `today` is inside it (on or after its start, before the goal date), else null. */
export function dietStartToday(timeline: { requiredStartDate: string; finishDate: string } | null, today: string): string | null {
  return timeline !== null && today >= timeline.requiredStartDate && today < timeline.finishDate ? timeline.requiredStartDate : null;
}
