/**
 * Milestones (worker/milestones.ts): a Whop notification to the member at
 * every WEIGHT_STEP_LB lost since they started, and every WAIST_STEP_IN off
 * their waist, and a line on the coach's Today "Celebrate" list for a week.
 *
 * Each kind only ever goes up: a regain and re-loss doesn't celebrate the
 * same level twice.
 */

import { fromLb } from "./units";
import type { WeightUnit } from "./types";

export const WEIGHT_STEP_LB = 5;
export const WAIST_STEP_IN = 1;
/** How long a milestone stays on the coach's Celebrate list. */
export const CELEBRATE_DAYS = 7;

export type MilestoneKind = "weight" | "waist";

export interface Milestone {
  kind: MilestoneKind;
  /** Pounds lost (weight) or inches off (waist), in whole steps. */
  level: number;
  /** The day of the weigh-in or measurement that reached it. */
  reachedOn: string;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Pounds down since the start, in whole WEIGHT_STEP_LB steps, or null below
 * one step. The start is the average of the first three weigh-ins on or after
 * the plan's start (or of the first three at all); now is the average of the
 * weigh-ins in the latest week (up to three), so one light morning doesn't
 * decide it.
 */
export function weightLevel(weighIns: readonly { date: string; weightLb: number }[], startDate: string | null): number | null {
  const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : 1));
  const fromStart = startDate ? sorted.filter((w) => w.date >= startDate) : [];
  const base = (fromStart.length >= 3 ? fromStart : sorted).slice(0, 3);
  const latest = sorted[sorted.length - 1];
  if (base.length < 3 || !latest || sorted.length < 5) return null;
  const weekAgo = new Date(Date.parse(`${latest.date}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const recent = sorted.filter((w) => w.date >= weekAgo).slice(-3);
  // The recent readings must come after the starting ones.
  if (recent[0]!.date <= base[base.length - 1]!.date) return null;
  const lost = avg(base.map((w) => w.weightLb)) - avg(recent.map((w) => w.weightLb));
  const level = Math.floor(lost / WEIGHT_STEP_LB) * WEIGHT_STEP_LB;
  return level >= WEIGHT_STEP_LB ? level : null;
}

/** Inches off the waist since the first measurement, in whole steps, or null. */
export function waistLevel(measurements: readonly { date: string; waist: number | null }[]): number | null {
  const waists = measurements.filter((m) => typeof m.waist === "number" && m.waist > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (waists.length < 2) return null;
  const lost = waists[0]!.waist! - waists[waists.length - 1]!.waist!;
  const level = Math.floor(lost / WAIST_STEP_IN + 1e-9) * WAIST_STEP_IN;
  return level >= WAIST_STEP_IN ? level : null;
}

/** "10 lb" / "4.5 kg", "2 in" / "5 cm". */
export function milestoneAmount(kind: MilestoneKind, level: number, unit: WeightUnit): string {
  if (kind === "weight") return unit === "kg" ? `${Math.round(fromLb(level, "kg") * 10) / 10} kg` : `${level} lb`;
  return unit === "kg" ? `${Math.round(level * 2.54)} cm` : `${level} in`;
}

/** For the coach's Celebrate list: "Down 10 lb since starting". */
export function milestoneLabel(m: Pick<Milestone, "kind" | "level">, unit: WeightUnit): string {
  const amount = milestoneAmount(m.kind, m.level, unit);
  return m.kind === "weight" ? `Down ${amount} since starting` : `Waist down ${amount}`;
}

/** The member's notification. */
export function milestoneMessage(kind: MilestoneKind, level: number, unit: WeightUnit): { title: string; content: string } {
  const amount = milestoneAmount(kind, level, unit);
  if (kind === "weight") {
    return {
      title: `Down ${amount}!`,
      content: `You're ${amount} lighter than when you started. That's real, steady work. Keep stacking the days.`,
    };
  }
  return {
    title: `Waist down ${amount}!`,
    content: `Your waist is ${amount} smaller than your first measurement. The tape doesn't lie: keep going.`,
  };
}
