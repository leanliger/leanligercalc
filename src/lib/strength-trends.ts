/**
 * Strength trends: for each lift a member still does, whether they're getting
 * stronger, holding or slipping. Training → Tools, a member's Training tab on
 * the coach dashboard, and the coach's "Strength slipping" flag.
 *
 * The measure is the session's best estimated one-rep max (weight × (1 + reps
 * ÷ 30)), or the most reps in a set for bodyweight exercises. A lift's trend
 * compares its best of the last two sessions with its best of the two
 * sessions around six weeks before (or the first two, when it's newer than
 * that). More than 2% up is Stronger, more than 2% down is Slipping, in
 * between is Holding — which during a cut is a win.
 */

import { addDays, daysBetween } from "./dates";
import { libraryExercise } from "./exercises";
import { exerciseHistory, type ExerciseSession, type Workout } from "./training";

export const TREND_WEEKS = 6;
/** Change, in percent, that counts as stronger or slipping. */
export const TREND_PCT = 2;
/** Lifts not done for this long drop off the list. */
export const TREND_ACTIVE_DAYS = 28;
/** Sessions needed before a lift gets a trend. */
const MIN_SESSIONS = 3;

export type TrendStatus = "up" | "hold" | "down" | "new";

export interface LiftTrend {
  exerciseId: string;
  /** The library name, or as logged most recently for their own exercises. */
  name: string;
  bodyweight: boolean;
  oneSide: boolean;
  /** Each session's value: estimated max in lb, or best reps for bodyweight lifts. */
  series: { date: string; value: number }[];
  /** The latest session's value. */
  current: number;
  /** Percent change over the window; null while there aren't enough sessions. */
  changePct: number | null;
  /** Percent change since the first session, and its date; null with a single session. */
  allTimePct: number | null;
  firstDate: string;
  status: TrendStatus;
  lastDate: string;
}

const valueOf = (s: ExerciseSession, bodyweight: boolean) => (bodyweight ? s.bestReps : s.e1rm);
const best = (xs: readonly number[]) => Math.max(...xs);

/** Every lift trained in the last four weeks, most recently trained first. */
export function strengthTrends(workouts: readonly Workout[], today: string): LiftTrend[] {
  const finished = workouts.filter((w) => w.finishedAt !== null && w.date <= today && Array.isArray(w.exercises));
  // Latest name, bodyweight and one-side flag per exercise, from the logs themselves.
  const meta = new Map<string, { name: string; bodyweight: boolean; oneSide: boolean; last: string }>();
  for (const w of finished) {
    for (const e of w.exercises) {
      if (typeof e?.exerciseId !== "string" || !Array.isArray(e.sets)) continue;
      const m = meta.get(e.exerciseId);
      // The library's name when it's a library exercise; the logged name for their own.
      const name = libraryExercise(e.exerciseId)?.name ?? (typeof e.name === "string" && e.name ? e.name : "Exercise");
      if (!m || w.date >= m.last) meta.set(e.exerciseId, { name, bodyweight: e.bodyweight, oneSide: e.oneSide === true, last: w.date });
    }
  }
  const out: LiftTrend[] = [];
  const windowStart = addDays(today, -TREND_WEEKS * 7);
  for (const [id, m] of meta) {
    if (daysBetween(m.last, today) > TREND_ACTIVE_DAYS) continue;
    const history = exerciseHistory(finished, id).filter((s) => valueOf(s, m.bodyweight) > 0);
    if (history.length === 0) continue;
    const series = history.map((s) => ({ date: s.date, value: valueOf(s, m.bodyweight) }));
    const values = series.map((p) => p.value);
    let changePct: number | null = null;
    if (history.length >= MIN_SESSIONS && daysBetween(series[0]!.date, today) >= 14) {
      const recent = best(values.slice(-2));
      // The two sessions around the start of the window, or the first two when the lift is newer.
      const beforeIdx = series.findIndex((p) => p.date >= windowStart);
      const start = beforeIdx <= 0 ? 0 : beforeIdx - 1;
      const earlier = best(values.slice(start, Math.min(start + 2, values.length - 2)));
      if (earlier > 0 && Number.isFinite(earlier)) changePct = (recent / earlier - 1) * 100;
    }
    out.push({
      exerciseId: id,
      name: m.name,
      bodyweight: m.bodyweight,
      oneSide: m.oneSide,
      series,
      current: values[values.length - 1]!,
      changePct,
      allTimePct: values.length > 1 && values[0]! > 0 ? (values[values.length - 1]! / values[0]! - 1) * 100 : null,
      firstDate: series[0]!.date,
      status: changePct === null ? "new" : changePct > TREND_PCT ? "up" : changePct < -TREND_PCT ? "down" : "hold",
      lastDate: m.last,
    });
  }
  return out.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

/** Names of the lifts slipping, for the coach's flag. */
export function slippingLifts(workouts: readonly Workout[], today: string): string[] {
  return strengthTrends(workouts, today)
    .filter((t) => t.status === "down")
    .map((t) => t.name);
}

/**
 * The heaviest weight lifted in each rep range, with its date: progress shows
 * even when the rep range changes between blocks.
 */
export const REP_RANGES = [
  [1, 5],
  [6, 8],
  [9, 12],
  [13, Infinity],
] as const;

export function repRecords(history: readonly ExerciseSession[]): { range: readonly [number, number]; weight: number; reps: number; date: string }[] {
  return REP_RANGES.flatMap((range) => {
    let top: { weight: number; reps: number; date: string } | null = null;
    for (const s of history) {
      for (const x of s.sets) {
        if (x.reps < range[0] || x.reps > range[1] || x.weight <= 0) continue;
        if (!top || x.weight > top.weight || (x.weight === top.weight && x.reps > top.reps)) top = { weight: x.weight, reps: x.reps, date: s.date };
      }
    }
    return top ? [{ range, ...top }] : [];
  });
}
