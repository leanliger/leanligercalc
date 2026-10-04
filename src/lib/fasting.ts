/**
 * Intermittent fasting: a member's daily meal times, the fasting protocol they
 * add up to, and where "now" sits between them.
 *
 * The eating window runs from the first meal of the day to the last; the fast
 * runs from the last meal to the next day's first. So meals at 12:00, 16:00
 * and 20:00 are an 8-hour window and a 16-hour fast — 16:8. A single meal is
 * OMAD (one meal a day).
 *
 * Everything works in the device's local time, since meal times are wall-clock
 * times. Windows that cross midnight aren't supported: times are ordered
 * within one day.
 *
 * Whop notifications ("window open" / "window closed") are sent by the Worker
 * on a one-minute schedule, in the member's own time zone; the shared logic
 * for that is at the bottom of this file.
 */

import { addDays } from "./dates";
import type { ValidationResult } from "./tracking";

export interface MealTime {
  id: string;
  /** e.g. "Meal 1", "Break fast", "Post-workout". */
  label: string;
  /** 24-hour "HH:MM". */
  time: string;
}

export interface FastingSettings {
  meals: MealTime[];
  /** Send a Whop notification when the eating window opens and closes. */
  notify: boolean;
}

export const DEFAULT_FASTING: FastingSettings = { meals: [], notify: false };

export const MAX_MEAL_TIMES = 8;
export const MEAL_LABEL_MAX = 30;
/** For this long after a meal time, the timer says "time to eat" instead of counting down. */
export const MEAL_NOW_MINUTES = 30;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MINUTE = 60_000;

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/** "16:30" → 990 */
export function minutesOf(time: string): number {
  const m = TIME_PATTERN.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** 990 → "16:30" */
export function timeOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Meals in time-of-day order, skipping any with an invalid time. */
export function sortedMeals(meals: readonly MealTime[]): MealTime[] {
  return meals.filter((m) => isValidTime(m.time)).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}

export function newMealId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `meal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Rebuild trusted settings from anything (local storage, the cloud plan). */
export function sanitizeFasting(raw: unknown): FastingSettings {
  const list = (raw as { meals?: unknown } | null)?.meals;
  if (!Array.isArray(list)) return { meals: [], notify: false };
  const meals: MealTime[] = [];
  const seenIds = new Set<string>();
  const seenTimes = new Set<string>();
  for (const item of list) {
    if (meals.length >= MAX_MEAL_TIMES) break;
    const m = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof m.time !== "string" || !isValidTime(m.time) || seenTimes.has(m.time)) continue;
    const id = typeof m.id === "string" && ID_PATTERN.test(m.id) && !seenIds.has(m.id) ? m.id : `meal_${meals.length + 1}`;
    const label =
      typeof m.label === "string" && m.label.trim()
        ? m.label.replace(/\s+/g, " ").trim().slice(0, MEAL_LABEL_MAX)
        : `Meal ${meals.length + 1}`;
    seenIds.add(id);
    seenTimes.add(m.time);
    meals.push({ id, label, time: m.time });
  }
  const notify = (raw as { notify?: unknown }).notify === true && meals.length > 0;
  return { meals, notify };
}

/* -------------------------------- protocol ------------------------------- */

export interface FastingSchedule {
  /** First meal to last meal, in minutes. */
  windowMinutes: number;
  /** Last meal to the next day's first, in minutes. */
  fastMinutes: number;
  /** "16:8", "OMAD", or e.g. "16.5:7.5". */
  protocol: string;
}

/** Hours to the nearest half hour: 480 → "8", 450 → "7.5". */
const hours = (minutes: number) => {
  const h = Math.round((minutes / 60) * 2) / 2;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

export function fastingSchedule(meals: readonly MealTime[]): FastingSchedule | null {
  const sorted = sortedMeals(meals);
  if (sorted.length === 0) return null;
  const windowMinutes = minutesOf(sorted[sorted.length - 1]!.time) - minutesOf(sorted[0]!.time);
  const fastMinutes = 1440 - windowMinutes;
  return {
    windowMinutes,
    fastMinutes,
    // Round the window, then take the fast from it, so the label always adds up to 24.
    protocol:
      sorted.length === 1
        ? "OMAD"
        : `${hours(1440 - Math.round(windowMinutes / 30) * 30)}:${hours(Math.round(windowMinutes / 30) * 30)}`,
  };
}

/** Ready-made schedules a member can start from and then adjust. */
export const FASTING_PRESETS: readonly { id: string; label: string; hint: string; times: string[] }[] = [
  { id: "16-8", label: "16:8", hint: "12 PM – 8 PM", times: ["12:00", "16:00", "20:00"] },
  { id: "18-6", label: "18:6", hint: "1 PM – 7 PM", times: ["13:00", "16:00", "19:00"] },
  { id: "20-4", label: "20:4", hint: "4 PM – 8 PM", times: ["16:00", "20:00"] },
  { id: "omad", label: "OMAD", hint: "one meal, 6 PM", times: ["18:00"] },
];

export function mealsFromPreset(times: readonly string[]): MealTime[] {
  return times.map((time, i) => ({ id: newMealId(), label: `Meal ${i + 1}`, time }));
}

/* --------------------------------- status -------------------------------- */

export interface MealAt {
  meal: MealTime;
  at: Date;
}

export type FastingStatus =
  | { phase: "none" }
  /** Between the last meal of one day and the first of the next. */
  | { phase: "fasting"; since: MealAt; next: MealAt }
  /** Inside the eating window, waiting for the next meal. */
  | { phase: "eating"; previous: MealAt; next: MealAt; windowEnds: MealAt }
  /** Within MEAL_NOW_MINUTES of a meal time. */
  | { phase: "meal-now"; current: MealAt; next: MealAt };

/** The meal times around `now`: yesterday's, today's and tomorrow's. */
function occurrences(sorted: readonly MealTime[], now: Date): MealAt[] {
  const out: MealAt[] = [];
  for (const offset of [-1, 0, 1]) {
    for (const meal of sorted) {
      const mins = minutesOf(meal.time);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, Math.floor(mins / 60), mins % 60);
      out.push({ meal, at });
    }
  }
  return out;
}

export function fastingStatus(meals: readonly MealTime[], now: Date): FastingStatus {
  const sorted = sortedMeals(meals);
  if (sorted.length === 0) return { phase: "none" };
  const all = occurrences(sorted, now);
  let lastIndex = -1;
  for (let i = 0; i < all.length; i++) if (all[i]!.at.getTime() <= now.getTime()) lastIndex = i;
  // There is always a meal within the last day and the next, since the list
  // covers yesterday through tomorrow.
  const previous = all[lastIndex]!;
  const next = all[lastIndex + 1]!;

  if (now.getTime() - previous.at.getTime() < MEAL_NOW_MINUTES * MINUTE) {
    return { phase: "meal-now", current: previous, next };
  }
  const lastOfDay = sorted[sorted.length - 1]!;
  if (previous.meal.id === lastOfDay.id) return { phase: "fasting", since: previous, next };
  // The last meal on the same day as the previous one closes the window.
  const windowEnds = all.find(
    (o) => o.meal.id === lastOfDay.id && o.at.toDateString() === previous.at.toDateString(),
  )!;
  return { phase: "eating", previous, next, windowEnds };
}

/** 3h 25m 9s → "3:25:09"; under an hour → "25:09". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** 205 minutes → "3h 25m". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* -------------------------- Whop notifications -------------------------- */

/**
 * What the Worker keeps to send one member's fasting notifications. Only the
 * first and last meal matter: the window opens at the first, and closes
 * MEAL_NOW_MINUTES after the last — the same moment the timer on screen
 * switches from "eat now" to "fasting".
 */
export interface ReminderSchedule {
  experienceId: string;
  timeZone: string;
  first: { label: string; time: string };
  last: { label: string; time: string };
  mealCount: number;
}

export const EXPERIENCE_ID_PATTERN = /^exp_[A-Za-z0-9]{1,40}$/;
/** A notification still goes out if the scheduler runs up to this late. */
export const REMINDER_CATCH_UP_MINUTES = 10;

/** The Whop experience id in an app URL like /experiences/exp_abc123/… */
export function experienceIdFromPath(path: string): string | null {
  const m = /^\/experiences\/(exp_[A-Za-z0-9]{1,40})(?:\/|$)/.exec(path);
  return m ? m[1]! : null;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validate an untrusted "turn on notifications" request. */
export function validateReminderRequest(raw: unknown): ValidationResult<ReminderSchedule> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof body.experienceId !== "string" || !EXPERIENCE_ID_PATTERN.test(body.experienceId)) {
    return { ok: false, error: "Open the app from your Whop community to turn on notifications." };
  }
  if (!isValidTimeZone(body.timeZone)) return { ok: false, error: "Unknown time zone." };
  if (!Array.isArray(body.meals) || body.meals.length > MAX_MEAL_TIMES * 2) {
    return { ok: false, error: "Expected a list of meal times." };
  }
  const meals = sortedMeals(sanitizeFasting({ meals: body.meals }).meals);
  const first = meals[0];
  const last = meals[meals.length - 1];
  if (!first || !last) return { ok: false, error: "Add at least one meal time." };
  return {
    ok: true,
    value: {
      experienceId: body.experienceId,
      timeZone: body.timeZone,
      first: { label: first.label, time: first.time },
      last: { label: last.label, time: last.time },
      mealCount: meals.length,
    },
  };
}

/** Minutes after local midnight that the window opens and closes. */
export function reminderMinutes(s: Pick<ReminderSchedule, "first" | "last">): { open: number; close: number } {
  return { open: minutesOf(s.first.time), close: (minutesOf(s.last.time) + MEAL_NOW_MINUTES) % 1440 };
}

export interface LocalClock {
  /** The member's local calendar day, yyyy-mm-dd. */
  date: string;
  /** Minutes after the member's local midnight. */
  minute: number;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock date and time in a time zone. */
export function localClock(now: Date, timeZone: string): LocalClock {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clockFormats.set(timeZone, format);
  }
  const parts: Record<string, string> = {};
  for (const p of format.formatToParts(now)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

export type ReminderKind = "open" | "close";

/**
 * Which notifications are due now. Each one is sent once per local day; the
 * catch-up window covers a late or skipped scheduler run, including across
 * midnight (an 11:55 PM event caught at 12:02 AM still belongs to yesterday).
 */
export function dueReminders(
  state: { openMinute: number; closeMinute: number; openSentOn: string | null; closeSentOn: string | null },
  clock: LocalClock,
): { kind: ReminderKind; eventDate: string }[] {
  const due: { kind: ReminderKind; eventDate: string }[] = [];
  const check = (kind: ReminderKind, eventMinute: number, sentOn: string | null) => {
    const since = (clock.minute - eventMinute + 1440) % 1440;
    if (since >= REMINDER_CATCH_UP_MINUTES) return;
    const eventDate = clock.minute >= eventMinute ? clock.date : addDays(clock.date, -1);
    if (sentOn !== eventDate) due.push({ kind, eventDate });
  };
  check("open", state.openMinute, state.openSentOn);
  check("close", state.closeMinute, state.closeSentOn);
  return due;
}

/** "16:00" → "4:00 PM" (notifications are written server-side, in US style). */
export function clock12(time: string): string {
  const m = minutesOf(time);
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function reminderMessage(
  kind: ReminderKind,
  s: Pick<ReminderSchedule, "first" | "last" | "mealCount">,
): { title: string; content: string } {
  if (kind === "open") {
    return {
      title: "Your eating window is open",
      content:
        s.mealCount === 1
          ? `Time for ${s.first.label} — your one meal today.`
          : `Time for ${s.first.label}. Last meal today: ${s.last.label} at ${clock12(s.last.time)}.`,
    };
  }
  return {
    title: "Your eating window is closed",
    content: `Fast started. Next meal: ${s.first.label} at ${clock12(s.first.time)}.`,
  };
}
