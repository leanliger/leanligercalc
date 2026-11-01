/**
 * A member's trend weight against a strength index (their main lifts'
 * estimated max, 100 = where each started in the window), week by week.
 * Weight down with strength near 100 is muscle kept. Shown on the coach's
 * Insights tab and in the progress report (src/lib/progress-report.ts).
 */

import { trendSeries } from "./adaptive";
import { addDays } from "./dates";
import { strengthTrends } from "./strength-trends";
import type { Workout } from "./training";
import type { WeighIn } from "./tracking";

export const MUSCLE_CHART_WEEKS = 12;
/** Lifts in the index: the most-trained ones. */
const INDEX_LIFTS = 6;
/** A trend weight older than this at a week's end doesn't count for it. */
const WEIGHT_STALE_DAYS = 14;

export interface MusclePoint {
  /** The week's last day. */
  date: string;
  weightLb: number | null;
  /** Average of each lift's estimated max over its start, × 100. */
  strength: number | null;
}

export function muscleKeptSeries(
  workouts: readonly Workout[],
  weighIns: readonly Pick<WeighIn, "date" | "weightLb">[],
  today: string,
  weeks = MUSCLE_CHART_WEEKS,
): { points: MusclePoint[]; lifts: string[]; weightChangeLb: number | null; strengthChange: number | null } {
  const start = addDays(today, -weeks * 7);
  const lifts = strengthTrends(workouts, today)
    .map((t) => ({ name: t.name, series: t.series, inWindow: t.series.filter((p) => p.date > start).length }))
    .filter((t) => t.inWindow >= 2)
    .sort((a, b) => b.inWindow - a.inWindow)
    .slice(0, INDEX_LIFTS)
    .map((t) => {
      // Where it started: its last session before the window, else its first in it.
      const before = t.series.filter((p) => p.date <= start);
      const base = (before[before.length - 1] ?? t.series.find((p) => p.date > start))!.value;
      return { ...t, base };
    })
    .filter((t) => t.base > 0);

  const trend = trendSeries(weighIns.map((w) => ({ date: w.date, weightLb: w.weightLb, calories: null, note: null })));
  const points: MusclePoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -w * 7);
    const t = [...trend].reverse().find((p) => p.date <= end);
    const weightLb = t && t.date >= addDays(end, -WEIGHT_STALE_DAYS) ? Math.round(t.trend * 10) / 10 : null;
    const ratios = lifts
      .map((l) => [...l.series].reverse().find((p) => p.date <= end))
      .map((p, i) => (p ? p.value / lifts[i]!.base : null))
      .filter((r): r is number => r !== null);
    const strength = ratios.length ? Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 1000) / 10 : null;
    points.push({ date: end, weightLb, strength });
  }
  const firstW = points.find((p) => p.weightLb !== null)?.weightLb ?? null;
  const lastW = [...points].reverse().find((p) => p.weightLb !== null)?.weightLb ?? null;
  const firstS = points.find((p) => p.strength !== null)?.strength ?? null;
  const lastS = [...points].reverse().find((p) => p.strength !== null)?.strength ?? null;
  return {
    points,
    lifts: lifts.map((l) => l.name),
    weightChangeLb: firstW !== null && lastW !== null ? Math.round((lastW - firstW) * 10) / 10 : null,
    strengthChange: firstS !== null && lastS !== null ? Math.round((lastS - firstS) * 10) / 10 : null,
  };
}
