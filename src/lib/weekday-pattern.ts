/**
 * Mapping carb-cycling day types onto real weekdays.
 *
 * The carb cycling engine only needs counts ("2 high, 3 medium, 2 low"). A
 * calendar needs more: it has to know that Monday is a high day and Sunday a
 * low one, so high days can be lined up with the hardest training sessions.
 *
 * Patterns are always Monday-first, 7 entries.
 */

import { parseISODate } from "./dates";
import type { CarbCyclingInputs, DayType } from "./types";
import { clamp } from "./units";

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"] as const;

const LETTER: Record<DayType, string> = { high: "H", medium: "M", low: "L" };
const FROM_LETTER: Record<string, DayType> = { H: "high", M: "medium", L: "low" };

export interface DayCounts {
  high: number;
  medium: number;
  low: number;
}

/** Monday = 0 … Sunday = 6, for an ISO date. */
export function weekdayIndex(iso: string): number {
  return (parseISODate(iso).getUTCDay() + 6) % 7;
}

export function countsFromPattern(pattern: readonly DayType[]): DayCounts {
  return pattern.reduce<DayCounts>(
    (acc, type) => ({ ...acc, [type]: acc[type] + 1 }),
    { high: 0, medium: 0, low: 0 },
  );
}

/**
 * Force counts to cover exactly 7 days. High days are kept first, then low,
 * and medium absorbs the remainder — medium is the neutral day, so it is the
 * right one to grow or shrink when the schedule does not add up.
 */
export function normalizeCounts(counts: DayCounts): DayCounts {
  const high = clamp(Math.round(counts.high), 0, 7);
  const low = clamp(Math.round(counts.low), 0, 7 - high);
  return { high, medium: 7 - high - low, low };
}

/** Next free slot at or after `start`, wrapping around the week. */
function nextFree(slots: (DayType | null)[], start: number): number {
  for (let offset = 0; offset < 7; offset++) {
    const index = (start + offset) % 7;
    if (slots[index] === null) return index;
  }
  return -1;
}

/**
 * Default placement for a set of counts.
 *
 * High days are spread as evenly as the week allows, starting Monday. Low days
 * are offset half a gap from them so they fall between hard sessions rather
 * than next to each other. Medium fills whatever is left.
 *
 *   2/3/2  →  H M L M H L M
 *   3/2/2  →  H M H L M H L
 *   1/3/3  →  H L M M L M L
 */
export function autoPattern(counts: DayCounts): DayType[] {
  const { high, low } = normalizeCounts(counts);
  const slots: (DayType | null)[] = Array(7).fill(null);

  for (let i = 0; i < high; i++) {
    const index = nextFree(slots, Math.round((i * 7) / high));
    if (index >= 0) slots[index] = "high";
  }
  for (let i = 0; i < low; i++) {
    const index = nextFree(slots, Math.round(((i + 0.5) * 7) / low) % 7);
    if (index >= 0) slots[index] = "low";
  }
  return slots.map((slot) => slot ?? "medium");
}

function isValidPattern(pattern: unknown): pattern is DayType[] {
  return (
    Array.isArray(pattern) &&
    pattern.length === 7 &&
    pattern.every((d) => d === "high" || d === "medium" || d === "low")
  );
}

/**
 * The pattern to actually use. A stored custom pattern wins only while its
 * counts still match the schedule counts; once the counts change elsewhere it
 * is stale, and an automatic pattern for the new counts takes over.
 */
export function resolveWeekdayPattern(inputs: CarbCyclingInputs): DayType[] {
  const target = normalizeCounts({
    high: inputs.highDays,
    medium: inputs.mediumDays,
    low: inputs.lowDays,
  });
  const custom = inputs.weekdayPattern;
  if (isValidPattern(custom)) {
    const counts = countsFromPattern(custom);
    if (
      counts.high === target.high &&
      counts.medium === target.medium &&
      counts.low === target.low
    ) {
      return [...custom];
    }
  }
  return autoPattern(target);
}

/** True when the schedule counts had to be adjusted to fit a 7-day week. */
export function scheduleNeedsNormalizing(inputs: CarbCyclingInputs): boolean {
  return inputs.highDays + inputs.mediumDays + inputs.lowDays !== 7;
}

/** high → medium → low → high, for click-to-cycle editing. */
export function cycleDayType(type: DayType): DayType {
  return type === "high" ? "medium" : type === "medium" ? "low" : "high";
}

export function patternToString(pattern: readonly DayType[]): string {
  return pattern.map((d) => LETTER[d]).join("");
}

/** Parse a compact "HMLMHLM" string. Returns null for anything malformed. */
export function patternFromString(value: unknown): DayType[] | null {
  if (Array.isArray(value)) return isValidPattern(value) ? [...value] : null;
  if (typeof value !== "string") return null;
  const letters = value.trim().toUpperCase();
  if (!/^[HML]{7}$/.test(letters)) return null;
  return letters.split("").map((c) => FROM_LETTER[c]!);
}
