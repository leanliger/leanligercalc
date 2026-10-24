/**
 * Muscle kept during a cut: weight change over the strength-trend window
 * (six weeks) next to how their lifts moved. Losing weight while most lifts
 * hold means muscle kept; losing it while several slip suggests muscle going
 * with it. Used for the "Losing muscle" flag (src/lib/coach.ts) and the
 * member's Insights tab (src/lib/member-insights.ts).
 */

import { addDays, daysBetween } from "./dates";
import { TREND_WEEKS } from "./strength-trends";

/** Weight change (lb, negative = down) over the last `weeks` weeks: a straight line through the weigh-ins, from the first to the last. */
export function weightChangeOver(weighIns: readonly { date: string; weightLb: number }[], today: string, weeks = TREND_WEEKS): number | null {
  const from = addDays(today, -weeks * 7);
  const pts = weighIns.filter((w) => w.date >= from && w.date <= today).map((w) => ({ x: daysBetween(from, w.date), y: w.weightLb }));
  if (pts.length < 4) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 21) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  return (pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx) * span;
}

/** Losing at least this much over the window counts as cutting. */
export const CUT_LB = 2;

/** Down at least CUT_LB, with at least 30% of their lifts slipping (and at least 2 when they track 4 or more). */
export function losingMuscle(weightChangeLb: number | null, slipping: number, tracked: number): boolean {
  if (weightChangeLb === null || weightChangeLb > -CUT_LB || tracked < 2) return false;
  return slipping / tracked >= 0.3 && (tracked < 4 || slipping >= 2);
}
