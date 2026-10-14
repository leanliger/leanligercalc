/**
 * Weekly weigh-ins vs calories (Progress → Weigh-in; weekly-intake-chart.tsx):
 * for each Monday–Sunday week, the average day's calories split into
 * protein, fat and carbs (on the days food was logged), next to that week's
 * average weight. Seeing them side by side shows what each calorie level did
 * to the scale.
 */

import { addDays } from "./dates";
import { sumMacros, type FoodLog } from "./food";
import { weekStartOf } from "./habits";

export interface IntakeWeek {
  weekStart: string;
  /** Days with food logged that week. */
  foodDays: number;
  /** Average logged day, grams and calories; null without food logged. */
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  kcal: number | null;
  /** The same, as calories from each macro (4 / 9 / 4), for stacked bars. */
  proteinKcal: number | null;
  fatKcal: number | null;
  carbsKcal: number | null;
  /** Average of the week's weigh-ins, lb; null without any. */
  weightLb: number | null;
  weighIns: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r = (v: number | null) => (v === null ? null : Math.round(v));

/** The last `weeks` weeks up to and including the week of `today`, oldest first. */
export function weeklyIntake(
  foodLogs: readonly FoodLog[],
  weighIns: readonly { date: string; weightLb: number }[],
  weeks: number,
  today: string,
): IntakeWeek[] {
  const last = weekStartOf(today);
  const out: IntakeWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(last, -7 * i);
    const end = addDays(start, 6);
    const inWeek = (d: string) => d >= start && d <= end && d <= today;
    const days = foodLogs.filter((l) => inWeek(l.date) && l.entries.length > 0).map((l) => sumMacros(l.entries));
    const w = weighIns.filter((x) => inWeek(x.date)).map((x) => x.weightLb);
    const p = avg(days.map((d) => d.protein));
    const f = avg(days.map((d) => d.fat));
    const c = avg(days.map((d) => d.carbs));
    const k = avg(days.map((d) => d.kcal));
    const weight = avg(w);
    out.push({
      weekStart: start,
      foodDays: days.length,
      protein: r(p),
      fat: r(f),
      carbs: r(c),
      kcal: r(k),
      proteinKcal: p === null ? null : Math.round(p * 4),
      fatKcal: f === null ? null : Math.round(f * 9),
      carbsKcal: c === null ? null : Math.round(c * 4),
      weightLb: weight === null ? null : Math.round(weight * 10) / 10,
      weighIns: w.length,
    });
  }
  return out;
}
