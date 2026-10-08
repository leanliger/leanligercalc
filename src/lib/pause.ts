/**
 * Pause mode: a member who's sick or travelling pauses for up to two weeks.
 * Paused days don't count for or against them — streaks freeze, the weekly
 * score leaves them out, and reminders stop — and anything they still log is
 * kept.
 *
 * Pauses live in the plan document (tracking.pauses), never in the habit
 * logs, so ending one early or cancelling it leaves nothing behind. Anything
 * that scores habits wraps the logs with `withPauses`, which marks paused days
 * with PAUSE_KEY on the fly; `counts()` then excuses every habit that day,
 * exactly as a rest day excuses the workout.
 *
 * Shared by the browser and the Worker.
 */

import { addDays, daysBetween, isValidISODate } from "./dates";
import { PAUSE_KEY, type HabitEntries } from "./habits";
import type { ValidationResult } from "./tracking";

export type PauseReason = "sick" | "travel" | "other";
export const PAUSE_REASONS: readonly PauseReason[] = ["sick", "travel", "other"];
export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  sick: "Sick",
  travel: "Travelling",
  other: "Other",
};

export interface PausePeriod {
  /** First paused day, ISO yyyy-mm-dd. */
  from: string;
  /** Last paused day, inclusive. */
  to: string;
  reason: PauseReason;
}

/** Longest single pause, in days. */
export const MAX_PAUSE_DAYS = 14;
/** How far back a pause may start ("I've been sick since yesterday"). */
export const MAX_BACKDATE_DAYS = 2;
/** How far ahead a trip can be scheduled. */
export const MAX_SCHEDULE_AHEAD_DAYS = 60;
/** Past pauses kept, so their days stay excused in the history. */
const MAX_PAUSES_KEPT = 50;

/** Inclusive length of a pause in days. */
export function pauseLength(p: Pick<PausePeriod, "from" | "to">): number {
  return daysBetween(p.from, p.to) + 1;
}

/** Re-validate stored pauses: real dates, at most MAX_PAUSE_DAYS long, sorted, no overlaps. */
export function sanitizePauses(raw: unknown): PausePeriod[] {
  if (!Array.isArray(raw)) return [];
  const valid: PausePeriod[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.from !== "string" || typeof p.to !== "string") continue;
    if (!isValidISODate(p.from) || !isValidISODate(p.to) || p.to < p.from) continue;
    const period: PausePeriod = {
      from: p.from,
      to: p.to,
      reason: PAUSE_REASONS.includes(p.reason as PauseReason) ? (p.reason as PauseReason) : "other",
    };
    if (pauseLength(period) > MAX_PAUSE_DAYS) continue;
    valid.push(period);
  }
  valid.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const out: PausePeriod[] = [];
  for (const p of valid) {
    const last = out[out.length - 1];
    if (last && p.from <= last.to) continue; // overlaps the one before: keep the earlier
    out.push(p);
  }
  return out.slice(-MAX_PAUSES_KEPT);
}

export function isPausedOn(pauses: readonly PausePeriod[], date: string): boolean {
  return pauses.some((p) => p.from <= date && date <= p.to);
}

/** The pause covering `today`, if any. */
export function activePause(pauses: readonly PausePeriod[], today: string): PausePeriod | null {
  return pauses.find((p) => p.from <= today && today <= p.to) ?? null;
}

/** A pause that hasn't started yet (a planned trip), if any. */
export function upcomingPause(pauses: readonly PausePeriod[], today: string): PausePeriod | null {
  return pauses.find((p) => p.from > today) ?? null;
}

/**
 * The logs with every paused day (from the first log up to `upTo`) marked
 * PAUSE_KEY, for scoring. Returns the same map when nothing is paused. Days
 * before the first log aren't added, so a pause can't move where a member's
 * history starts.
 */
export function withPauses(
  logs: Map<string, HabitEntries>,
  pauses: readonly PausePeriod[],
  upTo: string,
): Map<string, HabitEntries> {
  if (pauses.length === 0 || logs.size === 0) return logs;
  let first: string | null = null;
  for (const d of logs.keys()) if (!first || d < first) first = d;
  const out = new Map(logs);
  for (const p of pauses) {
    const start = p.from > first! ? p.from : first!;
    const end = p.to < upTo ? p.to : upTo;
    for (let d = start; d <= end; d = addDays(d, 1)) out.set(d, { ...(logs.get(d) ?? {}), [PAUSE_KEY]: true });
  }
  return out;
}

/* ------------------------------- changes ------------------------------- */

/** Start (or schedule) a pause. Only one active or upcoming pause at a time. */
export function addPause(
  pauses: readonly PausePeriod[],
  next: PausePeriod,
  today: string,
): ValidationResult<PausePeriod[]> {
  if (!isValidISODate(next.from) || !isValidISODate(next.to)) return { ok: false, error: "Pick a start and end date." };
  if (next.to < next.from) return { ok: false, error: "The pause has to end on or after the day it starts." };
  if (next.from < addDays(today, -MAX_BACKDATE_DAYS)) {
    return { ok: false, error: `A pause can start up to ${MAX_BACKDATE_DAYS} days ago.` };
  }
  if (next.from > addDays(today, MAX_SCHEDULE_AHEAD_DAYS)) {
    return { ok: false, error: `A pause can be planned up to ${MAX_SCHEDULE_AHEAD_DAYS} days ahead.` };
  }
  if (pauseLength(next) > MAX_PAUSE_DAYS) return { ok: false, error: `A pause can last up to ${MAX_PAUSE_DAYS} days.` };
  if (pauses.some((p) => p.to >= today)) return { ok: false, error: "You already have a pause on or planned." };
  if (pauses.some((p) => p.from <= next.to && next.from <= p.to)) {
    return { ok: false, error: "That overlaps an earlier pause." };
  }
  return { ok: true, value: sanitizePauses([...pauses, next]) };
}

/**
 * End the current pause now, or cancel a planned one. Today counts again;
 * days already paused stay excused.
 */
export function endPause(pauses: readonly PausePeriod[], today: string): PausePeriod[] {
  return pauses.flatMap((p) => {
    if (p.to < today) return [p]; // already over
    if (p.from >= today) return []; // starts today or later: nothing to keep
    return [{ ...p, to: addDays(today, -1) }];
  });
}

/** Move the end of the current or planned pause (still no longer than MAX_PAUSE_DAYS). */
export function changePauseEnd(
  pauses: readonly PausePeriod[],
  to: string,
  today: string,
): ValidationResult<PausePeriod[]> {
  const current = pauses.find((p) => p.to >= today);
  if (!current) return { ok: false, error: "There's no pause to change." };
  if (!isValidISODate(to)) return { ok: false, error: "Pick an end date." };
  if (to < today || to < current.from) return { ok: false, error: "Pick today or later (or resume now instead)." };
  const changed = { ...current, to };
  if (pauseLength(changed) > MAX_PAUSE_DAYS) return { ok: false, error: `A pause can last up to ${MAX_PAUSE_DAYS} days.` };
  return { ok: true, value: sanitizePauses(pauses.map((p) => (p === current ? changed : p))) };
}

/** A shared empty list, so components defaulting to "no pauses" keep a stable reference. */
export const NO_PAUSES: PausePeriod[] = [];
