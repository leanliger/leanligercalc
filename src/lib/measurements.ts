/**
 * Body measurements: a simple weekly log of waist, hips, chest, arms and
 * thighs, shown as a trend next to body weight.
 *
 * In prep the scale stalls while the waist keeps coming in (water, glycogen
 * and food volume mask fat loss), so measurements are the tie-breaker.
 *
 * Always stored in inches, like weight in pounds; shown in cm when the member
 * uses kg. Shared by the browser and the Worker.
 */

import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";
import type { WeightUnit } from "./types";

export const SITES = ["waist", "hips", "chest", "arms", "thighs"] as const;
export type Site = (typeof SITES)[number];

export const SITE_INFO: Record<Site, { label: string; how: string }> = {
  waist: { label: "Waist", how: "At the navel, relaxed, after breathing out" },
  hips: { label: "Hips", how: "Around the widest part of the glutes" },
  chest: { label: "Chest", how: "Across the nipples, arms by your sides" },
  arms: { label: "Arms", how: "Right upper arm, halfway, relaxed" },
  thighs: { label: "Thighs", how: "Right thigh, halfway between hip and knee" },
};

export interface Measurement {
  /** ISO yyyy-mm-dd. */
  date: string;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  arms: number | null;
  thighs: number | null;
}

export const MEASUREMENT_LIMITS_IN = { min: 4, max: 100 } as const;
export const MAX_MEASUREMENTS = 1000;
export const CM_PER_IN = 2.54;

/** Inches for lb users, centimetres for kg users. */
export function lengthUnit(unit: WeightUnit): "in" | "cm" {
  return unit === "kg" ? "cm" : "in";
}

export function toInches(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value / CM_PER_IN : value;
}

export function fromInches(inches: number, unit: WeightUnit): number {
  return unit === "kg" ? inches * CM_PER_IN : inches;
}

export function hasAnySite(m: Partial<Measurement>): boolean {
  return SITES.some((s) => typeof m[s] === "number");
}

/** Validate an untrusted measurement for a date. Blank sites are fine; at least one is needed. */
export function validateMeasurement(raw: unknown, date: string, now?: Date): ValidationResult<Measurement> {
  if (!isAcceptableWeighInDate(date, now)) {
    return { ok: false, error: "Date must be a real calendar day, not in the future." };
  }
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Measurement = { date, waist: null, hips: null, chest: null, arms: null, thighs: null };
  for (const site of SITES) {
    const v = body[site];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < MEASUREMENT_LIMITS_IN.min || v > MEASUREMENT_LIMITS_IN.max) {
      return { ok: false, error: `${SITE_INFO[site].label} must be between 4 and 100 inches (10–254 cm).` };
    }
    out[site] = Math.round(v * 100) / 100;
  }
  if (!hasAnySite(out)) return { ok: false, error: "Enter at least one measurement." };
  return { ok: true, value: out };
}

/** First and latest value for a site, and the change between them (inches). */
export function siteChange(list: Measurement[], site: Site): { first: number; latest: number; change: number; since: string } | null {
  const withSite = [...list].filter((m) => m[site] !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = withSite[0];
  const latest = withSite[withSite.length - 1];
  if (!first || !latest || first === latest) {
    return latest ? { first: latest[site]!, latest: latest[site]!, change: 0, since: latest.date } : null;
  }
  return { first: first[site]!, latest: latest[site]!, change: latest[site]! - first[site]!, since: first.date };
}
