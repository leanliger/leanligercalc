/**
 * Measured numbers for a monthly physique comparison, and the body fat ranges
 * the AI writes, for the chart.
 *
 * The comparison is anchored to data rather than only the AI's eye: weight
 * near each date, tape measurements near each date, the main lifts' best
 * estimated 1-rep max before and after, and how many days habits were logged.
 * They go to the model as facts (compareStatsText), and are kept with the
 * comparison (physique_analyses.stats) for the card and the share image.
 *
 * Shared by the browser and the Worker. Weights in lb, lengths in inches.
 */

import { daysBetween } from "./dates";
import type { PhysiqueSection } from "./physique";
import { MAIN_LIFTS } from "./progress-report";
import { doneSets, e1rm, findExercise, type Workout } from "./training";

export interface CompareStats {
  weight: { before: number; after: number } | null;
  measurements: { site: MeasureSite; before: number; after: number }[];
  lifts: { name: string; before: number; after: number }[];
  habits: { logged: number; days: number } | null;
}

export type MeasureSite = "waist" | "hips" | "chest" | "arms" | "thighs";
const SITES: readonly MeasureSite[] = ["waist", "hips", "chest", "arms", "thighs"];
const SITE_LABEL: Record<MeasureSite, string> = { waist: "Waist", hips: "Hips", chest: "Chest", arms: "Arms", thighs: "Thighs" };

export interface MeasurementRow {
  date: string;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  arms: number | null;
  thighs: number | null;
}

/** The row nearest a date, within `within` days either side. */
function nearest<T extends { date: string }>(rows: readonly T[], date: string, within: number): T | null {
  let best: T | null = null;
  let gap = Infinity;
  for (const r of rows) {
    const g = Math.abs(daysBetween(r.date, date));
    if (g <= within && g < gap) {
      best = r;
      gap = g;
    }
  }
  return best;
}

export function measurementChanges(rows: readonly MeasurementRow[], before: string, after: string): CompareStats["measurements"] {
  const a = nearest(rows, before, 10);
  const b = nearest(rows, after, 10);
  if (!a || !b || a.date === b.date) return [];
  return SITES.flatMap((site) => {
    const x = a[site];
    const y = b[site];
    return typeof x === "number" && typeof y === "number" && x > 0 && y > 0 ? [{ site, before: x, after: y }] : [];
  });
}

/**
 * The main compound lifts' best estimated 1RM in the month up to the older
 * photos versus the three weeks up to the newer ones (an isolation lift's
 * "1-rep max" says little). At most three, in MAIN_LIFTS order.
 */
export function liftChanges(workouts: readonly Workout[], before: string, after: string): CompareStats["lifts"] {
  const best = (from: number, to: number) => {
    const out = new Map<string, { name: string; e: number }>();
    for (const w of workouts) {
      if (w.finishedAt === null) continue;
      const d = daysBetween(before, w.date);
      if (d < from || d > to) continue;
      for (const ex of w.exercises) {
        if (ex.bodyweight || !MAIN_LIFTS.includes(ex.exerciseId)) continue;
        const top = Math.max(0, ...doneSets(ex).map((s) => e1rm(s.weight, s.reps)));
        if (top <= 0) continue;
        const prev = out.get(ex.exerciseId);
        if (!prev || top > prev.e) out.set(ex.exerciseId, { name: findExercise(ex.exerciseId, [])?.name ?? ex.name, e: top });
      }
    }
    return out;
  };
  const span = daysBetween(before, after);
  const was = best(-30, 3);
  const now = best(span - 21, span + 3);
  const rank = (id: string) => (MAIN_LIFTS.includes(id) ? MAIN_LIFTS.indexOf(id) : MAIN_LIFTS.length);
  return [...now.entries()]
    .filter(([id]) => was.has(id))
    .map(([id, n]) => ({ id, name: n.name, before: Math.round(was.get(id)!.e), after: Math.round(n.e) }))
    .sort((a, b) => rank(a.id) - rank(b.id) || Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
    .slice(0, 3)
    .map(({ name, before: b, after: a }) => ({ name, before: b, after: a }));
}

const sign = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(Math.round(v * 10 ** digits) / 10 ** digits)}`;

/** The facts as the model is told them. */
export function compareStatsText(s: CompareStats): string {
  const lines: string[] = [];
  if (s.weight) lines.push(`Scale weight ${s.weight.before.toFixed(1)} lb → ${s.weight.after.toFixed(1)} lb (${sign(s.weight.after - s.weight.before)} lb).`);
  for (const m of s.measurements) lines.push(`${SITE_LABEL[m.site]} ${m.before.toFixed(1)} in → ${m.after.toFixed(1)} in (${sign(m.after - m.before)} in).`);
  for (const l of s.lifts) lines.push(`${l.name} estimated 1-rep max ${l.before} lb → ${l.after} lb (${sign(l.after - l.before, 0)} lb).`);
  if (s.habits) lines.push(`Daily habits logged on ${s.habits.logged} of ${s.habits.days} days.`);
  return lines.length ? `Measured data for this period (trust these over visual guesses): ${lines.join(" ")}` : "";
}

/** Short chips for the card and the share image, in the member's units. */
export function compareStatChips(s: CompareStats | null, unit: "lb" | "kg"): string[] {
  if (!s) return [];
  const kg = unit === "kg";
  const w = (lb: number) => (kg ? lb * 0.45359237 : lb);
  const len = (inches: number) => (kg ? inches * 2.54 : inches);
  const lu = kg ? "cm" : "in";
  const out: string[] = [];
  if (s.weight) out.push(`${sign(w(s.weight.after - s.weight.before))} ${unit}`);
  for (const m of s.measurements.slice(0, 2)) out.push(`${SITE_LABEL[m.site]} ${sign(len(m.after - m.before))} ${lu}`);
  for (const l of s.lifts) {
    const d = w(l.after - l.before);
    const name = l.name.replace(/^Barbell /, "");
    if (Math.abs(d) >= 1) out.push(`${name.charAt(0).toUpperCase()}${name.slice(1)} ${sign(d, 0)} ${unit}`);
  }
  if (s.habits && s.habits.days > 0) out.push(`Habits ${s.habits.logged}/${s.habits.days} days`);
  return out;
}

/* ------------------------------ body fat ranges ------------------------------ */

/** "15-18%" style ranges in a block of text, in order. */
export function bodyFatRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(/(\d{1,2}(?:\.\d)?)\s*(?:-|–|to)\s*(\d{1,2}(?:\.\d)?)\s*%/g)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo >= 3 && hi <= 60 && lo < hi) out.push([lo, hi]);
  }
  return out;
}

export interface BodyFatPoint {
  date: string;
  low: number;
  high: number;
}

const bodyFatSection = (sections: readonly PhysiqueSection[]) =>
  sections.find((s) => /body ?fat/i.test(s.heading))?.lines.join(" ") ?? "";

/**
 * One point per date from analyses (their range on the photo date) and
 * comparisons ("then" on the older date, "now" on the newer). A later
 * reading for the same date replaces an earlier one.
 */
export function bodyFatSeries(
  analyses: readonly { photoDate: string | null; createdAt?: string; sections: PhysiqueSection[] }[],
  comparisons: readonly { beforeDate: string | null; afterDate: string | null; createdAt?: string; sections: PhysiqueSection[] }[],
): BodyFatPoint[] {
  const byDate = new Map<string, BodyFatPoint & { at: string }>();
  const put = (date: string | null, r: [number, number] | undefined, at: string) => {
    if (!date || !r) return;
    const prev = byDate.get(date);
    if (!prev || at > prev.at) byDate.set(date, { date, low: r[0], high: r[1], at });
  };
  for (const a of analyses) put(a.photoDate, bodyFatRanges(bodyFatSection(a.sections))[0], a.createdAt ?? "");
  for (const c of comparisons) {
    const r = bodyFatRanges(bodyFatSection(c.sections));
    put(c.beforeDate, r[0], c.createdAt ?? "");
    put(c.afterDate, r[1], c.createdAt ?? "");
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map(({ date, low, high }) => ({ date, low, high }));
}
