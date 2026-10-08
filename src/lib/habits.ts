/**
 * Daily habit tracking — modelled on the Daily Self-Accountability Scorecard.
 *
 * The scorecard is seven daily non-negotiables, ticked Mon–Sun, scored weekly:
 *
 *   Weekly consistency = ticks completed ÷ (habits × 7 − rest days) × 100
 *
 * Rest days excuse only the workout habit. The printed sheet shows this: every
 * row totals "/7" except "Completed Workout", whose total is left blank. (Its
 * printed formula, "(checks / 49) − (rest days) × 100", subtracts days from a
 * fraction and can't be computed literally; this is the intent it encodes.)
 *
 * Zones: 80–100% green, 60–79% yellow, under 60% red.
 *
 * Two kinds of habit are supported, for members who add their own:
 *   check — done or not
 *   count — a number against a target; done when the target is reached
 *
 * Habit *definitions* live in the plan document. Daily *logs* live in their own
 * table / storage key, one record per day. Shared by the browser and the
 * Worker; validation here is the single source of truth.
 */

import { addDays, parseISODate } from "./dates";
import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";

export type HabitKind = "check" | "count";

/**
 * Ties a habit to app data: protein and calories show the day's targets from
 * the roadmap; workout is the habit a rest day excuses; steps takes the day's
 * step count and ticks itself at the plan's step target.
 */
export type HabitLink = "protein" | "calories" | "workout" | "steps";
const HABIT_LINKS: readonly HabitLink[] = ["protein", "calories", "workout", "steps"];

export interface HabitDef {
  id: string;
  name: string;
  kind: HabitKind;
  /** Count habits only: the daily target. */
  target: number | null;
  /** Count habits only: display unit, e.g. "L", "steps", "h". */
  unit: string | null;
  link: HabitLink | null;
}

/** One day's values keyed by habit id, plus the reserved rest-day flag. */
export type HabitEntries = Record<string, boolean | number>;

export interface HabitLog {
  date: string;
  entries: HabitEntries;
}

/** Reserved entry key marking a day as a rest day. */
export const REST_KEY = "_rest";
/** Reserved entry key holding the day's step count, when the member logs it. */
export const STEPS_KEY = "_steps";
/**
 * Marks a paused day while scoring (see src/lib/pause.ts). Never stored: the
 * pause periods live in the plan, and saved logs drop this key.
 */
export const PAUSE_KEY = "_paused";
export const MAX_DAILY_STEPS = 100_000;
/** Step target when the plan doesn't set one (it uses an activity level). */
export const DEFAULT_STEP_TARGET = 10_000;
export const MAX_REST_DAYS_PER_WEEK = 3;
export const MAX_HABITS = 15;
export const HABIT_NAME_MAX = 48;
export const HABIT_UNIT_MAX = 12;
export const MAX_COUNT_VALUE = 1_000_000;
export const MAX_HABIT_LOGS = 2000;
export const WEEKLY_TARGET_PERCENT = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** The scorecard's seven daily non-negotiables, in its order. */
export const DEFAULT_HABITS: HabitDef[] = [
  { id: "protein", name: "Hit daily protein target (±10 g)", kind: "check", target: null, unit: null, link: "protein" },
  { id: "calories", name: "Hit calorie target", kind: "check", target: null, unit: null, link: "calories" },
  { id: "prelog", name: "Pre-logged meals before eating", kind: "check", target: null, unit: null, link: null },
  { id: "steps", name: "Hit daily step target", kind: "check", target: null, unit: null, link: "steps" },
  { id: "hydration", name: "Hit hydration goal (100+ oz)", kind: "check", target: null, unit: null, link: null },
  { id: "sleep", name: "Slept 7+ hours", kind: "check", target: null, unit: null, link: null },
  { id: "workout", name: "Completed workout", kind: "check", target: null, unit: null, link: "workout" },
];

export const ZONES = {
  green: { min: 80, label: "Green Zone", headline: "Elite Execution.", advice: "Keep driving forward." },
  yellow: { min: 60, label: "Yellow Zone", headline: "Minor Friction.", advice: "Refine your habit stacks." },
  red: { min: 0, label: "Red Zone", headline: "High Friction.", advice: "Execute low-energy backup plan." },
} as const;
export type Zone = keyof typeof ZONES;

export function zoneFor(percent: number): Zone {
  return percent >= ZONES.green.min ? "green" : percent >= ZONES.yellow.min ? "yellow" : "red";
}

export function newHabitId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `h_${random}`;
}

/* ------------------------------ definitions ------------------------------ */

/**
 * Sanitise stored habit definitions. Missing (never configured) gives the
 * scorecard defaults; an explicit empty list stays empty.
 */
export function sanitizeHabitDefs(raw: unknown): HabitDef[] {
  if (!Array.isArray(raw)) return DEFAULT_HABITS.map((h) => ({ ...h }));
  const seen = new Set<string>();
  const usedLinks = new Set<HabitLink>();
  const out: HabitDef[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const h = item as Record<string, unknown>;
    const id =
      typeof h.id === "string" && ID_PATTERN.test(h.id) && h.id !== REST_KEY && h.id !== STEPS_KEY && h.id !== PAUSE_KEY ? h.id : null;
    const name = typeof h.name === "string" ? h.name.trim().slice(0, HABIT_NAME_MAX) : "";
    const kind: HabitKind = h.kind === "count" ? "count" : "check";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const target =
      kind === "count" && typeof h.target === "number" && Number.isFinite(h.target) && h.target > 0
        ? Math.min(h.target, MAX_COUNT_VALUE)
        : null;
    const unit =
      kind === "count" && typeof h.unit === "string" && h.unit.trim()
        ? h.unit.trim().slice(0, HABIT_UNIT_MAX)
        : null;
    // Each link may belong to one habit only.
    let link: HabitLink | null = (HABIT_LINKS as readonly unknown[]).includes(h.link) ? (h.link as HabitLink) : null;
    // The default step habit, saved before step logging existed.
    if (!link && id === "steps" && kind === "check") link = "steps";
    if (link && usedLinks.has(link)) link = null;
    if (link) usedLinks.add(link);
    out.push({ id, name, kind, target: kind === "count" ? (target ?? 1) : null, unit, link });
    if (out.length >= MAX_HABITS) break;
  }
  return out;
}

/* --------------------------------- logs --------------------------------- */

/** Validate an untrusted habit-log payload for one day. */
export function validateHabitEntries(
  raw: unknown,
  date: string,
  now?: Date,
): ValidationResult<HabitLog> {
  if (!isAcceptableWeighInDate(date, now)) {
    return { ok: false, error: "Date must be a real calendar day, not in the future." };
  }
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    return { ok: false, error: "Expected { entries: { habitId: value } }." };
  }
  const clean: HabitEntries = {};
  const keys = Object.keys(entries);
  if (keys.length > 30) return { ok: false, error: "Too many habits in one day." };
  for (const key of keys) {
    if (!ID_PATTERN.test(key)) return { ok: false, error: "Invalid habit id." };
    const value = (entries as Record<string, unknown>)[key];
    if (key === PAUSE_KEY) continue; // pauses are kept in the plan, not the day's log
    if (key === REST_KEY) {
      if (typeof value !== "boolean") return { ok: false, error: "Rest day must be true or false." };
      if (value) clean[key] = true;
    } else if (key === STEPS_KEY) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_DAILY_STEPS) {
        return { ok: false, error: "Steps must be a whole number up to 100,000." };
      }
      if (value > 0) clean[key] = value;
    } else if (typeof value === "boolean") {
      if (value) clean[key] = true; // false is the same as not logged
    } else if (typeof value === "number" && Number.isFinite(value)) {
      if (value < 0 || value > MAX_COUNT_VALUE) {
        return { ok: false, error: "Habit values must be between 0 and 1,000,000." };
      }
      if (value > 0) clean[key] = Math.round(value * 100) / 100;
    } else {
      return { ok: false, error: "Habit values must be true/false or a number." };
    }
  }
  return { ok: true, value: { date, entries: clean } };
}

/* ------------------------------- scoring -------------------------------- */

export function isDone(def: HabitDef, value: boolean | number | undefined): boolean {
  if (value === undefined) return false;
  if (def.kind === "check") return value === true;
  return typeof value === "number" && value >= (def.target ?? 1);
}

export function isRestDay(entries: HabitEntries | undefined): boolean {
  return entries?.[REST_KEY] === true;
}

export function isPausedDay(entries: HabitEntries | undefined): boolean {
  return entries?.[PAUSE_KEY] === true;
}

/** Whether a habit counts on a day: a rest day excuses only the workout; a paused day excuses everything. */
export function counts(def: HabitDef, entries: HabitEntries | undefined): boolean {
  return !isPausedDay(entries) && !(def.link === "workout" && isRestDay(entries));
}

export function dayProgress(defs: HabitDef[], entries: HabitEntries | undefined) {
  const scored = defs.filter((d) => counts(d, entries));
  const done = scored.filter((d) => isDone(d, entries?.[d.id])).length;
  return { done, total: scored.length };
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const mondayIndex = (parseISODate(date).getUTCDay() + 6) % 7;
  return addDays(date, -mondayIndex);
}

export function restDaysInWeek(logs: Map<string, HabitEntries>, weekStart: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isRestDay(logs.get(addDays(weekStart, i)))) n++;
  return n;
}

export type Cell = "done" | "missed" | "rest" | "paused" | "upcoming" | "before";

export interface WeekScore {
  weekStart: string;
  days: string[];
  rows: { def: HabitDef; cells: Cell[]; done: number; possible: number }[];
  restDays: number;
  done: number;
  possible: number;
  /** Null until at least one scored day has passed. */
  percent: number | null;
  zone: Zone | null;
  /** True once Sunday has passed. */
  complete: boolean;
}

/**
 * The scorecard for one Mon–Sun week. Days after today are "upcoming" and
 * days before the member's first log are "before"; neither counts, so a new
 * member or a week in progress is scored only on days that have happened.
 */
export function weeklyScore(
  defs: HabitDef[],
  logs: Map<string, HabitEntries>,
  weekStart: string,
  today: string,
  firstLogDate: string | null,
): WeekScore {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  let restDays = 0;
  for (const d of days) if (d <= today && isRestDay(logs.get(d))) restDays++;

  const rows = defs.map((def) => {
    let done = 0;
    let possible = 0;
    const cells = days.map((d): Cell => {
      if (d > today) return "upcoming";
      if (firstLogDate === null || d < firstLogDate) return "before";
      const entries = logs.get(d);
      if (isPausedDay(entries)) return "paused";
      if (!counts(def, entries)) return "rest";
      possible++;
      if (isDone(def, entries?.[def.id])) {
        done++;
        return "done";
      }
      // Today isn't over: an unticked box today isn't a miss yet.
      if (d === today) {
        possible--;
        return "upcoming";
      }
      return "missed";
    });
    return { def, cells, done, possible };
  });

  const done = rows.reduce((s, r) => s + r.done, 0);
  const possible = rows.reduce((s, r) => s + r.possible, 0);
  const percent = possible > 0 ? Math.round((done / possible) * 100) : null;
  return {
    weekStart,
    days,
    rows,
    restDays,
    done,
    possible,
    percent,
    zone: percent === null ? null : zoneFor(percent),
    complete: addDays(weekStart, 6) < today,
  };
}

/** Format a count value for display: 10000 → "10,000", 2.5 → "2.5". */
export function formatHabitValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : String(Math.round(value * 100) / 100);
}
