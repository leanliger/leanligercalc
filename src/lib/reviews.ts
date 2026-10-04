/**
 * Weekly self-audit — page two of the Daily Self-Accountability Scorecard:
 *
 *   Top 3 wins this week
 *   The friction audit: what trigger caused your biggest slip-up?
 *   The adjustment rule for next week
 *
 * One review per Mon–Sun week, keyed by that week's Monday. Shared by the
 * browser and the Worker.
 */

import { isValidISODate, parseISODate } from "./dates";
import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";

export interface WeeklyReview {
  /** Monday of the week, ISO yyyy-mm-dd. */
  weekStart: string;
  wins: [string, string, string];
  friction: string;
  rule: string;
}

export const REVIEW_FIELD_MAX = 280;
export const MAX_REVIEWS = 520;

export function emptyReview(weekStart: string): WeeklyReview {
  return { weekStart, wins: ["", "", ""], friction: "", rule: "" };
}

export function isEmptyReview(r: WeeklyReview): boolean {
  return !r.wins.some((w) => w.trim()) && !r.friction.trim() && !r.rule.trim();
}

function isMonday(iso: string): boolean {
  return isValidISODate(iso) && parseISODate(iso).getUTCDay() === 1;
}

/** Validate an untrusted review payload for a week. */
export function validateReview(raw: unknown, weekStart: string, now?: Date): ValidationResult<WeeklyReview> {
  if (!isMonday(weekStart) || !isAcceptableWeighInDate(weekStart, now)) {
    return { ok: false, error: "Week must start on a Monday that isn't in the future." };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Expected a JSON object." };
  const body = raw as Record<string, unknown>;

  const text = (v: unknown, label: string): string | { error: string } => {
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") return { error: `${label} must be text.` };
    const t = v.trim();
    return t.length > REVIEW_FIELD_MAX ? { error: `${label} must be ${REVIEW_FIELD_MAX} characters or fewer.` } : t;
  };

  const winsRaw = body.wins === undefined ? [] : body.wins;
  if (!Array.isArray(winsRaw) || winsRaw.length > 3) return { ok: false, error: "Wins must be a list of up to 3." };
  const wins: string[] = [];
  for (let i = 0; i < 3; i++) {
    const w = text(winsRaw[i], `Win ${i + 1}`);
    if (typeof w !== "string") return { ok: false, error: w.error };
    wins.push(w);
  }
  const friction = text(body.friction, "Friction audit");
  if (typeof friction !== "string") return { ok: false, error: friction.error };
  const rule = text(body.rule, "Adjustment rule");
  if (typeof rule !== "string") return { ok: false, error: rule.error };

  return {
    ok: true,
    value: { weekStart, wins: [wins[0]!, wins[1]!, wins[2]!], friction, rule },
  };
}
