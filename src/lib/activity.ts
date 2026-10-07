/**
 * Maintenance calories from steps and training, instead of one activity-level
 * multiplier.
 *
 *   maintenance = BMR × 1.2            resting burn + daily life (digestion,
 *                                      moving about — about 3,000 steps)
 *               + steps above 3,000 × 0.4 kcal per kg per 1,000 steps
 *               + training days × 3 kcal per kg ÷ 7   (≈ an hour of lifting)
 *
 * Both rates are net of what the body burns anyway. Walking at ~5 km/h costs
 * ~2.5 kcal/kg/h above rest, ~0.5 kcal/kg/km, and a kilometre is ~1,300 steps,
 * so 1,000 steps ≈ 0.4 kcal/kg. At 200 lb, 10,000 steps a day adds ~250 kcal
 * and four training days ~155 kcal/day on average.
 *
 * Members who set their plan up before steps existed keep the activity-level
 * multiplier ("level") until they switch, so nobody's targets jump.
 */

import { estimateTdee, mifflinStJeorBmr } from "./body-composition";
import type { ActivityLevel, ActivitySource, BiometricProfile } from "./types";
import { lbToKg, safeNumber } from "./units";

/** Steps already covered by the ×1.2 "daily life" baseline. */
export const BASELINE_STEPS = 3000;
/** Net kcal per kg of body weight per 1,000 steps. */
export const STEP_KCAL_PER_KG_PER_1000 = 0.4;
/** Net kcal per kg of body weight per training session. */
export const TRAINING_KCAL_PER_KG = 3;
export const BASE_MULTIPLIER = 1.2;
export const STEP_LIMITS = { min: 0, max: 40000 } as const;
export const TRAINING_DAY_LIMITS = { min: 0, max: 7 } as const;
export const DEFAULT_DAILY_STEPS = 10000;
export const DEFAULT_TRAINING_DAYS = 4;

export interface ActivityInputs {
  activitySource: ActivitySource;
  activityLevel: ActivityLevel;
  dailySteps: number;
  trainingDays: number;
}

const kgOf = (weightLb: number) => lbToKg(Math.max(safeNumber(weightLb, 0), 0));

/** kcal burned by 1,000 extra daily steps at a body weight. */
export function kcalPerThousandSteps(weightLb: number): number {
  return STEP_KCAL_PER_KG_PER_1000 * kgOf(weightLb);
}

/** Daily kcal from a step count, above the everyday baseline. */
export function stepCalories(weightLb: number, steps: number): number {
  const above = Math.max(0, safeNumber(steps, 0) - BASELINE_STEPS);
  return (above / 1000) * kcalPerThousandSteps(weightLb);
}

/** Average daily kcal from training sessions per week. */
export function trainingCalories(weightLb: number, daysPerWeek: number): number {
  return (Math.max(0, safeNumber(daysPerWeek, 0)) * TRAINING_KCAL_PER_KG * kgOf(weightLb)) / 7;
}

export interface MaintenanceBreakdown {
  /** Resting burn plus daily life (or the whole activity-level estimate). */
  base: number;
  steps: number;
  training: number;
  total: number;
}

/** Maintenance calories, split into where they come from. */
export function maintenanceBreakdown(profile: BiometricProfile, a: ActivityInputs): MaintenanceBreakdown {
  if (a.activitySource === "level") {
    const total = estimateTdee(profile, a.activityLevel);
    return { base: total, steps: 0, training: 0, total };
  }
  const base = mifflinStJeorBmr(profile) * BASE_MULTIPLIER;
  const steps = stepCalories(profile.weight, a.dailySteps);
  const training = trainingCalories(profile.weight, a.trainingDays);
  return { base, steps, training, total: base + steps + training };
}

/** Steps needed each day to burn `kcal` more (rounded up to the nearest 100). */
export function stepsForCalories(weightLb: number, kcal: number): number {
  const per1000 = kcalPerThousandSteps(weightLb);
  if (per1000 <= 0 || kcal <= 0) return 0;
  return Math.ceil(((kcal / per1000) * 1000) / 100) * 100;
}
