import type { WeightUnit } from "./types";

export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/** Energy density of adipose tissue (Wishnofsky / Hall). */
export const KCAL_PER_LB_FAT = 3500;

/**
 * Energy density of fat-free mass. Lean tissue is mostly water, so it carries
 * far less energy per pound than fat — using 3500 for all tissue is the classic
 * overestimate that makes naive calculators predict faster loss than reality.
 */
export const KCAL_PER_LB_LEAN = 824;

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Convert a pounds value into the display unit. */
export function fromLb(lb: number, unit: WeightUnit): number {
  return unit === "kg" ? lbToKg(lb) : lb;
}

/** Convert a value in the display unit back into pounds. */
export function toLb(value: number, unit: WeightUnit): number {
  return unit === "kg" ? kgToLb(value) : value;
}

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

/** Split a total height in inches into whole feet plus remaining inches. */
export function inchesToFeetInches(totalInches: number): {
  feet: number;
  inches: number;
} {
  const rounded = Math.round(totalInches);
  return {
    feet: Math.floor(rounded / INCHES_PER_FOOT),
    inches: rounded % INCHES_PER_FOOT,
  };
}

export function feetInchesToInches(feet: number, inches: number): number {
  return feet * INCHES_PER_FOOT + inches;
}

/** Round to a fixed number of decimals without floating-point drift. */
export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Guard against NaN/Infinity leaking out of user input into the math. */
export function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}
