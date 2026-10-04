/**
 * Check-in reminders, sent as Whop notifications at times members choose:
 *
 *   weigh-in   every morning, unless today's weigh-in is already logged
 *   habits     every evening, unless today's habits are all done:
 *              "3 habits left today" + the current 80%+ day streak
 *   recap      Sunday evening: the week's scorecard, weight change and
 *              average protein
 *
 * Preferences live in the plan document (tracking.reminders); the Worker keeps
 * a copy in the `reminders` table to know when to send. Intermittent fasting
 * notifications are separate (src/lib/fasting.ts).
 *
 * Shared by the browser and the Worker; the Worker re-validates everything.
 */

import { addDays, parseISODate } from "./dates";
import {
  EXPERIENCE_ID_PATTERN,
  REMINDER_CATCH_UP_MINUTES,
  isValidTime,
  isValidTimeZone,
  minutesOf,
  type LocalClock,
} from "./fasting";
import { ZONES, counts, isDone, type HabitDef, type HabitEntries, type Zone } from "./habits";
import type { ValidationResult } from "./tracking";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

export type ReminderType = "weighIn" | "habits" | "recap";
export const REMINDER_TYPES: readonly ReminderType[] = ["weighIn", "habits", "recap"];

export interface ReminderPref {
  on: boolean;
  /** Local wall-clock "HH:MM". The recap is sent on Sundays at this time. */
  time: string;
}

export type ReminderPrefs = Record<ReminderType, ReminderPref>;

export const DEFAULT_REMINDERS: ReminderPrefs = {
  weighIn: { on: false, time: "07:00" },
  habits: { on: false, time: "20:00" },
  recap: { on: false, time: "18:00" },
};

export function sanitizeReminderPrefs(raw: unknown): ReminderPrefs {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = {} as ReminderPrefs;
  for (const type of REMINDER_TYPES) {
    const p = (typeof obj[type] === "object" && obj[type] !== null ? obj[type] : {}) as Record<string, unknown>;
    out[type] = {
      on: p.on === true,
      time: typeof p.time === "string" && isValidTime(p.time) ? p.time : DEFAULT_REMINDERS[type].time,
    };
  }
  return out;
}

export function anyReminderOn(p: ReminderPrefs): boolean {
  return REMINDER_TYPES.some((t) => p[t].on);
}

/* ----------------------------- server request ----------------------------- */

/** What the Worker stores: each reminder's local time, or null when it's off. */
export interface RemindersRequest {
  experienceId: string;
  timeZone: string;
  weighIn: string | null;
  habits: string | null;
  recap: string | null;
}

export function validateRemindersRequest(raw: unknown): ValidationResult<RemindersRequest> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof body.experienceId !== "string" || !EXPERIENCE_ID_PATTERN.test(body.experienceId)) {
    return { ok: false, error: "Open the app from your Whop community to turn on reminders." };
  }
  if (!isValidTimeZone(body.timeZone)) return { ok: false, error: "Unknown time zone." };
  const times = {} as Record<ReminderType, string | null>;
  for (const type of REMINDER_TYPES) {
    const v = body[type];
    if (v === null || v === undefined) times[type] = null;
    else if (typeof v === "string" && isValidTime(v)) times[type] = v;
    else return { ok: false, error: "Reminder times must be HH:MM." };
  }
  if (REMINDER_TYPES.every((t) => times[t] === null)) {
    return { ok: false, error: "Turn on at least one reminder (or delete them instead)." };
  }
  return { ok: true, value: { experienceId: body.experienceId, timeZone: body.timeZone, ...times } };
}

/** The server request for a member's preferences, or null when all are off. */
export function remindersRequest(p: ReminderPrefs, experienceId: string, timeZone: string): RemindersRequest | null {
  if (!anyReminderOn(p)) return null;
  return {
    experienceId,
    timeZone,
    weighIn: p.weighIn.on ? p.weighIn.time : null,
    habits: p.habits.on ? p.habits.time : null,
    recap: p.recap.on ? p.recap.time : null,
  };
}

/* --------------------------------- timing --------------------------------- */

/**
 * If a daily event at `eventMinute` is due now, the local date it belongs to;
 * otherwise null. Due means within the catch-up window and not yet sent for
 * that date (an 11:55 PM event caught at 12:02 AM belongs to yesterday).
 */
export function dueOn(eventMinute: number, sentOn: string | null, clock: LocalClock): string | null {
  const since = (clock.minute - eventMinute + 1440) % 1440;
  if (since >= REMINDER_CATCH_UP_MINUTES) return null;
  const eventDate = clock.minute >= eventMinute ? clock.date : addDays(clock.date, -1);
  return sentOn === eventDate ? null : eventDate;
}

export function isSunday(date: string): boolean {
  return parseISODate(date).getUTCDay() === 0;
}

export function minuteOrNull(time: string | null): number | null {
  return time === null ? null : minutesOf(time);
}

/* -------------------------------- messages -------------------------------- */

export interface Message {
  title: string;
  content: string;
}

export function weighInMessage(): Message {
  return {
    title: "Time for your weigh-in",
    content: "Step on the scale before you eat or drink, then log it in Check-in. It takes ten seconds.",
  };
}

/** Shorten a habit name for a notification: "Hit hydration goal (100+ oz)" → "Hit hydration goal". */
function shortName(name: string): string {
  const s = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return s.length > 32 ? `${s.slice(0, 31).trimEnd()}…` : s;
}

/**
 * The evening nudge, or null when every habit that counts today is done.
 * `streakDays` is the current 80%+ day streak (through yesterday, or today
 * once it qualifies).
 */
export function habitsMessage(defs: HabitDef[], entries: HabitEntries | undefined, streakDays: number): Message | null {
  const left = defs.filter((d) => counts(d, entries) && !isDone(d, entries?.[d.id]));
  if (left.length === 0) return null;
  const n = left.length;
  const names = left.slice(0, 3).map((d) => shortName(d.name));
  const list = n > 3 ? `${names.join(", ")} +${n - 3} more` : names.join(", ");
  return {
    title: `${n} habit${n === 1 ? "" : "s"} left today`,
    content:
      streakDays > 0
        ? `Keep your ${streakDays}-day streak going. Still to do: ${list}.`
        : `Finish today strong. Still to do: ${list}.`,
  };
}

export interface RecapInput {
  /** The week's scorecard, if any habits were scored. */
  percent: number | null;
  zone: Zone | null;
  /** This week's average weigh-in minus last week's, in pounds. */
  weightChangeLb: number | null;
  unit: WeightUnit;
  /** Average daily protein over days with a food log this week. */
  proteinAvg: number | null;
}

export function recapMessage(r: RecapInput): Message {
  const title =
    r.percent !== null && r.zone ? `Your week: ${r.percent}% · ${ZONES[r.zone].label}` : "Your week in review";
  const parts: string[] = [];
  if (r.weightChangeLb !== null) {
    const change = Math.round(fromLb(Math.abs(r.weightChangeLb), r.unit) * 10) / 10;
    parts.push(change === 0 ? "weight steady" : `${r.weightChangeLb < 0 ? "down" : "up"} ${change} ${r.unit}`);
  }
  if (r.proteinAvg !== null) parts.push(`protein avg ${Math.round(r.proteinAvg)} g`);
  if (r.percent !== null && r.zone) parts.push(ZONES[r.zone].advice);
  return {
    title,
    content: parts.length > 0 ? `${parts.join(" · ")}` : "Log your weigh-ins, food and habits to see your weekly numbers here.",
  };
}

/** Average of this week's weigh-ins minus the previous week's, or null without both. */
export function weeklyWeightChange(
  weighIns: { date: string; weightLb: number }[],
  weekStart: string,
  weekEnd: string,
): number | null {
  const prevStart = addDays(weekStart, -7);
  const avg = (list: number[]) => (list.length > 0 ? list.reduce((s, v) => s + v, 0) / list.length : null);
  const thisWeek = avg(weighIns.filter((w) => w.date >= weekStart && w.date <= weekEnd).map((w) => w.weightLb));
  const lastWeek = avg(weighIns.filter((w) => w.date >= prevStart && w.date < weekStart).map((w) => w.weightLb));
  return thisWeek === null || lastWeek === null ? null : thisWeek - lastWeek;
}
