/**
 * "What made yesterday's calorie target difficult?": after a day logged in
 * full (PARTIAL_DAY_KCAL or more) that missed its calories by more than
 * ON_TARGET_SHARE, the member's Today asks once, the next day, with a few
 * one-tap reasons and an optional note. The answer goes to their coach
 * (worker/miss-reasons.ts; a member's Insights tab and Members → Nutrition),
 * so a red day comes with context.
 */

import type { FoodDay } from "./coach-api";
import { addDays, isValidISODate } from "./dates";
import type { DayTarget } from "./day-targets";
import { ON_TARGET_SHARE, PARTIAL_DAY_KCAL } from "./nutrition-report";

export const MISS_REASONS = [
  { id: "busy", label: "Busy schedule" },
  { id: "hunger", label: "Hunger" },
  { id: "energy", label: "Low energy" },
  { id: "travel", label: "Travel" },
  { id: "social", label: "Social events" },
  { id: "forgot", label: "Forgot to track" },
  { id: "other", label: "Other" },
] as const;

export type MissReasonId = (typeof MISS_REASONS)[number]["id"];
export const MISS_NOTE_MAX = 200;
/** Answers older than this can't be sent (the question is only asked the next day). */
export const MISS_ANSWER_DAYS = 3;
/** How far back the coach sees them. */
export const MISS_REASON_DAYS = 28;

export const reasonLabel = (id: string | null) => MISS_REASONS.find((r) => r.id === id)?.label ?? "Skipped";

export interface MissReason {
  date: string;
  kind: "calories";
  /** null: skipped. */
  reason: MissReasonId | null;
  note: string;
  kcal: number;
  target: number;
}

/** Yesterday, if it was logged in full and off its calories; null otherwise or once answered. */
export function missToAsk(
  foodDays: readonly Pick<FoodDay, "date" | "kcal">[],
  targetFor: (date: string) => DayTarget | null,
  today: string,
  answered: ReadonlySet<string>,
): { date: string; kcal: number; target: number } | null {
  const date = addDays(today, -1);
  if (answered.has(date)) return null;
  const day = foodDays.find((d) => d.date === date);
  const t = targetFor(date);
  if (!day || !t || day.kcal < PARTIAL_DAY_KCAL) return null;
  if (Math.abs(day.kcal - t.calories) / t.calories <= ON_TARGET_SHARE) return null;
  return { date, kcal: Math.round(day.kcal), target: t.calories };
}

export function validateMissReason(raw: unknown, today: string): { ok: true; value: MissReason } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const date = typeof b.date === "string" && isValidISODate(b.date) ? b.date : null;
  if (!date || date >= today || date < addDays(today, -MISS_ANSWER_DAYS)) return { ok: false, error: "That day can't be answered any more." };
  if (b.kind !== "calories") return { ok: false, error: "Unknown target." };
  const reason = b.reason === null ? null : MISS_REASONS.find((r) => r.id === b.reason)?.id;
  if (reason === undefined) return { ok: false, error: "Pick one of the reasons." };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 20000 ? Math.round(v) : null);
  const kcal = num(b.kcal);
  const target = num(b.target);
  if (kcal === null || target === null || target === 0) return { ok: false, error: "Missing the day's numbers." };
  const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, MISS_NOTE_MAX) : "";
  return { ok: true, value: { date, kind: "calories", reason, note: reason === null ? "" : note, kcal, target } };
}

/** The reasons given (skips left out), most first, for the coach's tally. */
export function tallyReasons(rows: readonly MissReason[]): { id: MissReasonId; label: string; count: number }[] {
  const n = new Map<MissReasonId, number>();
  for (const r of rows) if (r.reason) n.set(r.reason, (n.get(r.reason) ?? 0) + 1);
  return MISS_REASONS.map((r) => ({ id: r.id, label: r.label, count: n.get(r.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}
