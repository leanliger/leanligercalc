/**
 * Hydration reminders (Food → Water; worker/water-reminders.ts): a Whop
 * notification every so often between two times of day, in the member's time
 * zone, until the day's six bottles are ticked.
 *
 * Reminders go out at the start time, then every `every` minutes, up to and
 * including the end time ("slots"). Shared by the browser (the countdown) and
 * the Worker (sending).
 */

import { EXPERIENCE_ID_PATTERN, isValidTime, isValidTimeZone, minutesOf } from "./fasting";

export const WATER_INTERVALS = [60, 90, 120, 180] as const;
export type WaterInterval = (typeof WATER_INTERVALS)[number];

export interface WaterReminderPrefs {
  on: boolean;
  every: WaterInterval;
  /** Local "HH:MM". */
  start: string;
  end: string;
}

export const DEFAULT_WATER_REMINDERS: WaterReminderPrefs = { on: false, every: 120, start: "08:00", end: "20:00" };

export interface WaterReminderRequest {
  experienceId: string;
  timeZone: string;
  every: WaterInterval;
  start: string;
  end: string;
}

export function validateWaterReminderRequest(raw: unknown): { ok: true; value: WaterReminderRequest } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof b.experienceId !== "string" || !EXPERIENCE_ID_PATTERN.test(b.experienceId)) {
    return { ok: false, error: "Open the app inside your Whop to get reminders." };
  }
  if (!isValidTimeZone(b.timeZone)) return { ok: false, error: "Your phone's time zone couldn't be read." };
  if (!WATER_INTERVALS.includes(b.every as WaterInterval)) return { ok: false, error: "Pick how often to be reminded." };
  if (typeof b.start !== "string" || !isValidTime(b.start) || typeof b.end !== "string" || !isValidTime(b.end)) {
    return { ok: false, error: "Pick a start and end time." };
  }
  if (minutesOf(b.end) - minutesOf(b.start) < 60) return { ok: false, error: "The end time needs to be at least an hour after the start." };
  return { ok: true, value: { experienceId: b.experienceId, timeZone: b.timeZone, every: b.every as WaterInterval, start: b.start, end: b.end } };
}

/** Minutes after midnight of each reminder in a day. */
export function waterSlots(startMin: number, endMin: number, every: number): number[] {
  const out: number[] = [];
  for (let m = startMin; m <= endMin && out.length < 48; m += every) out.push(m);
  return out;
}

/** The latest slot at or before `minute` (its index), or null before the first. */
export function currentWaterSlot(minute: number, startMin: number, endMin: number, every: number): number | null {
  if (minute < startMin || every <= 0) return null;
  const slots = waterSlots(startMin, endMin, every);
  let index: number | null = null;
  slots.forEach((s, i) => {
    if (s <= minute) index = i;
  });
  return index;
}

/** When the next reminder is, from `minute` today: minutes from now and whether it's tomorrow. */
export function nextWaterReminder(minute: number, prefs: WaterReminderPrefs): { inMinutes: number; at: string; tomorrow: boolean } {
  const start = minutesOf(prefs.start);
  const next = waterSlots(start, minutesOf(prefs.end), prefs.every).find((s) => s > minute);
  const at = next ?? start;
  const tomorrow = next === undefined;
  const hh = String(Math.floor(at / 60)).padStart(2, "0");
  const mm = String(at % 60).padStart(2, "0");
  return { inMinutes: tomorrow ? 24 * 60 - minute + start : at - minute, at: `${hh}:${mm}`, tomorrow };
}
