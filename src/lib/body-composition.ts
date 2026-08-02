/**
 * Deriving body composition and energy expenditure from basic biometrics.
 *
 * The point of this module is that a user should only have to supply things
 * they actually know — height, weight, age, sex — and never be blocked by a
 * body fat percentage they have no way to measure. Everything downstream that
 * needs composition routes through `resolveBodyFat`.
 */

import type { ActivityLevel, BiometricProfile, Sex } from "./types";
import { clamp, cmToInches, inchesToCm, lbToKg, safeNumber } from "./units";

/**
 * Physical Activity Level multipliers applied to BMR. These are the standard
 * Harris-Benedict/Mifflin factors, and they replace the older "kcal per pound"
 * shortcut — that heuristic silently assumes an average height and badly
 * misestimates very tall or very short people.
 */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary — desk job, little or no training",
  light: "Light — training 1–3×/week",
  moderate: "Moderate — training 3–5×/week",
  active: "Active — training 6–7×/week",
  veryActive: "Very active — 2-a-days or physical job",
};

export const ACTIVITY_SHORT: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  veryActive: "Very active",
};

export const SEX_LABELS: Record<Sex, string> = {
  male: "Male",
  female: "Female",
};

/** Body Mass Index from imperial inputs. */
export function calculateBmi(weightLb: number, heightInches: number): number {
  if (heightInches <= 0) return 0;
  return (703 * weightLb) / (heightInches * heightInches);
}

/**
 * Basal metabolic rate — Mifflin-St Jeor, the equation that validates best
 * against indirect calorimetry in non-obese and obese adults alike.
 *
 *   BMR = 10·kg + 6.25·cm − 5·age + s,  where s = +5 (male) / −161 (female)
 */
export function mifflinStJeorBmr(profile: BiometricProfile): number {
  const kg = lbToKg(Math.max(safeNumber(profile.weight, 0), 0));
  const cm = inchesToCm(Math.max(safeNumber(profile.heightInches, 0), 0));
  const age = clamp(safeNumber(profile.age, 30), 14, 100);
  const sexOffset = profile.sex === "male" ? 5 : -161;
  return Math.max(10 * kg + 6.25 * cm - 5 * age + sexOffset, 0);
}

/** Maintenance calories: BMR scaled by activity. */
export function estimateTdee(
  profile: BiometricProfile,
  activityLevel: ActivityLevel,
): number {
  return mifflinStJeorBmr(profile) * ACTIVITY_MULTIPLIERS[activityLevel];
}

/**
 * Body fat percentage estimated from BMI, age, and sex (Deurenberg, 1991):
 *
 *   BF% = 1.20·BMI + 0.23·age − 10.8·sex − 5.4,  sex = 1 (male) / 0 (female)
 *
 * IMPORTANT CAVEAT: this is a population regression against BMI, and BMI cannot
 * distinguish muscle from fat. A trained lifter carrying well above-average lean
 * mass will read several points high — which matters here, because that is
 * exactly this app's audience. `bodyFatIsLikelyOverestimated` flags the cases,
 * and users with a real measurement can override the estimate entirely.
 */
export function estimateBodyFatPercent(profile: BiometricProfile): number {
  const bmi = calculateBmi(
    Math.max(safeNumber(profile.weight, 0), 0),
    Math.max(safeNumber(profile.heightInches, 0), 0),
  );
  if (bmi <= 0) return 0;
  const age = clamp(safeNumber(profile.age, 30), 14, 100);
  const sexTerm = profile.sex === "male" ? 1 : 0;
  const estimate = 1.2 * bmi + 0.23 * age - 10.8 * sexTerm - 5.4;
  return clamp(estimate, 3, 70);
}

/**
 * The body fat percentage the rest of the app should use: a measured value when
 * the user has one, otherwise the estimate.
 */
export function resolveBodyFat(profile: BiometricProfile): number {
  if (profile.bodyFatOverride !== null && profile.bodyFatOverride > 0) {
    return clamp(profile.bodyFatOverride, 3, 70);
  }
  return estimateBodyFatPercent(profile);
}

export function isEstimatedBodyFat(profile: BiometricProfile): boolean {
  return profile.bodyFatOverride === null || profile.bodyFatOverride <= 0;
}

export function leanMass(profile: BiometricProfile): number {
  const weight = Math.max(safeNumber(profile.weight, 0), 0);
  return weight * (1 - resolveBodyFat(profile) / 100);
}

export function fatMass(profile: BiometricProfile): number {
  return Math.max(safeNumber(profile.weight, 0), 0) - leanMass(profile);
}

/**
 * True when the BMI-derived estimate is likely inflated by muscle mass: a high
 * BMI that the user is relying on an estimate for. Drives an inline nudge to
 * enter a measured value.
 */
export function bodyFatIsLikelyOverestimated(profile: BiometricProfile): boolean {
  if (!isEstimatedBodyFat(profile)) return false;
  const bmi = calculateBmi(profile.weight, profile.heightInches);
  return bmi >= 27;
}

/** Descriptive band for the resolved body fat percentage. */
export function bodyFatCategory(bodyFat: number, sex: Sex): string {
  const bands =
    sex === "male"
      ? [
          { max: 6, label: "Stage condition" },
          { max: 10, label: "Very lean" },
          { max: 15, label: "Lean / athletic" },
          { max: 20, label: "Fit" },
          { max: 25, label: "Average" },
          { max: Infinity, label: "Above average" },
        ]
      : [
          { max: 14, label: "Stage condition" },
          { max: 18, label: "Very lean" },
          { max: 23, label: "Lean / athletic" },
          { max: 28, label: "Fit" },
          { max: 33, label: "Average" },
          { max: Infinity, label: "Above average" },
        ];
  return bands.find((band) => bodyFat < band.max)?.label ?? "Above average";
}

/**
 * Lowest body fat percentage that is reasonable to target. Essential fat is
 * substantially higher in women, and the app should never quietly plan a diet
 * below it.
 */
export function minimumSafeBodyFat(sex: Sex): number {
  return sex === "male" ? 5 : 12;
}

/** Height in centimetres, for display in metric mode. */
export function heightInCm(heightInches: number): number {
  return inchesToCm(heightInches);
}

export function heightFromCm(cm: number): number {
  return cmToInches(cm);
}
