/**
 * Client progress report: one page of before and after, for the member to keep
 * and share (testimonials). Built by the server from the member's whole history
 * (worker/coaching.ts), so the coach's copy and the member's always match.
 */

import { SITES, SITE_INFO, siteChange, type Measurement, type Site } from "./measurements";
import { exerciseHistory, type Workout } from "./training";
import { weekStartOf } from "./habits";
import { daysBetween } from "./dates";

export interface ReportPhoto {
  id: string;
  date: string;
  pose: string;
}

export interface ProgressReport {
  /** First and last day with anything logged. */
  from: string | null;
  to: string | null;
  weeks: number;
  weight: {
    startLb: number;
    startDate: string;
    latestLb: number;
    latestDate: string;
    lowestLb: number;
    changeLb: number;
    /** Weekly averages, oldest first, for the chart. */
    weekly: { week: string; lb: number }[];
  } | null;
  goalLb: number | null;
  measurements: { site: Site; label: string; firstIn: number; latestIn: number; changeIn: number }[];
  lifts: { exerciseId: string; name: string; firstLb: number; bestLb: number; sessions: number; since: string }[];
  workouts: number;
  weighIns: number;
  checkins: number;
  /** Earliest and latest photo of the same pose, when there are two dates. */
  photos: { before: ReportPhoto; after: ReportPhoto } | null;
}

const MAX_LIFTS = 6;

/** The big lifts lead, in this order; then the most trained. */
export const MAIN_LIFTS = [
  "back-squat", "bench-press", "deadlift", "overhead-press", "barbell-row",
  "romanian-deadlift", "incline-bench-press", "front-squat", "hip-thrust",
];
export const liftRank = (id: string) => (MAIN_LIFTS.includes(id) ? MAIN_LIFTS.indexOf(id) : MAIN_LIFTS.length);
const round1 = (v: number) => Math.round(v * 10) / 10;

export function buildProgressReport(data: {
  weighIns: { date: string; weightLb: number }[];
  measurements: Measurement[];
  workouts: Workout[];
  photos: ReportPhoto[] | null;
  checkins: number;
  goalLb: number | null;
}): ProgressReport {
  const weighIns = [...data.weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const finished = data.workouts.filter((w) => w.finishedAt !== null);

  let weight: ProgressReport["weight"] = null;
  if (weighIns.length > 0) {
    const first = weighIns[0]!;
    const last = weighIns[weighIns.length - 1]!;
    const byWeek = new Map<string, number[]>();
    for (const w of weighIns) byWeek.set(weekStartOf(w.date), [...(byWeek.get(weekStartOf(w.date)) ?? []), w.weightLb]);
    weight = {
      startLb: first.weightLb,
      startDate: first.date,
      latestLb: last.weightLb,
      latestDate: last.date,
      lowestLb: Math.min(...weighIns.map((w) => w.weightLb)),
      changeLb: round1(last.weightLb - first.weightLb),
      weekly: [...byWeek.entries()].map(([week, xs]) => ({ week, lb: round1(xs.reduce((s, x) => s + x, 0) / xs.length) })),
    };
  }

  // Sites measured at least twice: first against latest.
  const measurements = SITES.flatMap((site) => {
    const c = siteChange(data.measurements, site);
    return c && data.measurements.filter((m) => m[site] !== null).length > 1
      ? [{ site, label: SITE_INFO[site].label, firstIn: c.first, latestIn: c.latest, changeIn: round1(c.change) }]
      : [];
  });

  // Weighted lifts with at least two sessions, the most trained first.
  const ids = [...new Set(finished.flatMap((w) => w.exercises.filter((e) => !e.bodyweight).map((e) => e.exerciseId)))];
  const lifts = ids
    .map((id) => {
      const h = exerciseHistory(finished, id).filter((s) => s.e1rm > 0);
      const name = finished.flatMap((w) => w.exercises).find((e) => e.exerciseId === id)?.name ?? "Lift";
      return h.length >= 2
        ? { exerciseId: id, name, firstLb: round1(h[0]!.e1rm), bestLb: round1(Math.max(...h.map((s) => s.e1rm))), sessions: h.length, since: h[0]!.date }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => liftRank(a.exerciseId) - liftRank(b.exerciseId) || b.sessions - a.sessions || b.bestLb - b.firstLb - (a.bestLb - a.firstLb))
    .slice(0, MAX_LIFTS);

  let photos: ProgressReport["photos"] = null;
  if (data.photos && data.photos.length > 1) {
    const sorted = [...data.photos].sort((a, b) => (a.date < b.date ? -1 : 1));
    // Prefer front, then any pose that has two different dates.
    for (const pose of ["front", "side", "back"]) {
      const of = sorted.filter((p) => p.pose === pose);
      if (of.length > 1 && of[0]!.date !== of[of.length - 1]!.date) {
        photos = { before: of[0]!, after: of[of.length - 1]! };
        break;
      }
    }
  }

  const dates = [...weighIns.map((w) => w.date), ...finished.map((w) => w.date), ...data.measurements.map((m) => m.date)].sort();
  const from = dates[0] ?? null;
  const to = dates[dates.length - 1] ?? null;
  return {
    from,
    to,
    weeks: from && to ? Math.max(1, Math.round(daysBetween(from, to) / 7)) : 0,
    weight,
    goalLb: data.goalLb,
    measurements,
    lifts,
    workouts: finished.length,
    weighIns: weighIns.length,
    checkins: data.checkins,
    photos,
  };
}
