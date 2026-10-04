/**
 * Check-in data: weigh-ins and applied calorie adjustments.
 *
 * Shared by the browser and the Cloudflare Worker. Validation lives here so
 * the server and the client agree on exactly what a valid weigh-in is — the
 * server re-validates everything regardless of what the client sent.
 */

import { addDays, isValidISODate, toISODate } from "./dates";

export interface WeighIn {
  /** ISO yyyy-mm-dd, the user's local calendar day. */
  date: string;
  /** Always stored in pounds; converted for display. */
  weightLb: number;
  /** Optional: calories actually eaten that day. */
  calories: number | null;
  note: string | null;
}

/**
 * A calorie change applied after a check-in. It takes effect from the start of
 * a diet week so every week still averages exactly to its own target.
 */
export interface CalorieAdjustment {
  id: string;
  /** Day the user accepted the recommendation. */
  appliedOn: string;
  /** First day the new intake applies — the start of a diet week. */
  effectiveFrom: string;
  /** Change to daily intake in kcal; negative means eat less. */
  kcal: number;
  reason: string;
}

export const WEIGHT_LIMITS_LB = { min: 50, max: 1000 } as const;
export const CALORIE_LIMITS = { min: 0, max: 10000 } as const;
export const NOTE_MAX_LENGTH = 280;
/** Ceiling on a stored plan document, in bytes of JSON. */
export const PLAN_MAX_BYTES = 32 * 1024;
/** Ceiling on how many weigh-ins one user can store (~5 years of dailies). */
export const MAX_WEIGH_INS = 2000;

/**
 * Whether a weigh-in date is acceptable: a real calendar day, not absurdly
 * old, and not in the future. "Future" allows up to two days ahead of UTC,
 * because a user in UTC+14 is already a day ahead of the server.
 */
export function isAcceptableWeighInDate(date: string, now: Date = new Date()): boolean {
  if (!isValidISODate(date)) return false;
  const todayUtc = toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  return date >= "2000-01-01" && date <= addDays(todayUtc, 2);
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate an untrusted weigh-in payload for a given date. */
export function validateWeighIn(raw: unknown, date: string, now?: Date): ValidationResult<WeighIn> {
  if (!isAcceptableWeighInDate(date, now)) {
    return { ok: false, error: "Date must be a real calendar day, not in the future." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const body = raw as Record<string, unknown>;

  const weightLb = body.weightLb;
  if (
    typeof weightLb !== "number" ||
    !Number.isFinite(weightLb) ||
    weightLb < WEIGHT_LIMITS_LB.min ||
    weightLb > WEIGHT_LIMITS_LB.max
  ) {
    return {
      ok: false,
      error: `Weight must be between ${WEIGHT_LIMITS_LB.min} and ${WEIGHT_LIMITS_LB.max} lb.`,
    };
  }

  let calories: number | null = null;
  if (body.calories !== undefined && body.calories !== null && body.calories !== "") {
    const value = body.calories;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < CALORIE_LIMITS.min ||
      value > CALORIE_LIMITS.max
    ) {
      return {
        ok: false,
        error: `Calories must be a whole number between ${CALORIE_LIMITS.min} and ${CALORIE_LIMITS.max}.`,
      };
    }
    calories = value;
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return { ok: false, error: "Note must be text." };
    const trimmed = body.note.trim();
    if (trimmed.length > NOTE_MAX_LENGTH) {
      return { ok: false, error: `Note must be ${NOTE_MAX_LENGTH} characters or fewer.` };
    }
    note = trimmed.length > 0 ? trimmed : null;
  }

  return {
    ok: true,
    value: { date, weightLb: Math.round(weightLb * 100) / 100, calories, note },
  };
}

/** Sanitise a stored adjustment list; anything malformed is dropped. */
export function sanitizeAdjustments(raw: unknown): CalorieAdjustment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      id: typeof a.id === "string" ? a.id.slice(0, 64) : "",
      appliedOn: typeof a.appliedOn === "string" ? a.appliedOn : "",
      effectiveFrom: typeof a.effectiveFrom === "string" ? a.effectiveFrom : "",
      kcal: typeof a.kcal === "number" && Number.isFinite(a.kcal) ? Math.round(a.kcal) : 0,
      reason: typeof a.reason === "string" ? a.reason.slice(0, 200) : "",
    }))
    .filter(
      (a) =>
        a.id &&
        isValidISODate(a.appliedOn) &&
        isValidISODate(a.effectiveFrom) &&
        a.kcal !== 0 &&
        Math.abs(a.kcal) <= 1500,
    )
    .slice(0, 100);
}

/** Total adjustment in force on a given day. */
export function adjustmentOn(adjustments: CalorieAdjustment[], date: string): number {
  return adjustments.reduce((sum, a) => (a.effectiveFrom <= date ? sum + a.kcal : sum), 0);
}
