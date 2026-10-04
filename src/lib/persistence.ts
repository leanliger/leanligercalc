/**
 * Client setup persistence.
 *
 * Two layers, both optional and both non-fatal on failure:
 *  - LocalStorage keeps the last-used setup so a returning user lands back where
 *    they left off.
 *  - The URL query string encodes the same state, so a coach can send a client a
 *    link that opens with their numbers already filled in.
 *
 * Every read runs through `sanitize`, because a query string is user-editable
 * and must never be trusted to contain well-formed state.
 */

import { isValidISODate, todayISO } from "./dates";
import {
  DEFAULT_CARB_INPUTS,
  DEFAULT_FAT_LOSS_INPUTS,
  DEFAULT_PROFILE,
  DEFAULT_UNIT,
} from "./defaults";
import type {
  ActivityLevel,
  BiometricProfile,
  CarbCyclingInputs,
  CarbGoal,
  FatLossInputs,
  GoalType,
  ProteinBasis,
  Sex,
  TimelineMode,
  WeightUnit,
} from "./types";
import { clamp } from "./units";
import { patternFromString, patternToString } from "./weekday-pattern";
import { sanitizeAdjustments, type CalorieAdjustment } from "./tracking";
import { DEFAULT_HABITS, sanitizeHabitDefs, type HabitDef } from "./habits";
import { DEFAULT_FASTING, sanitizeFasting, type FastingSettings } from "./fasting";

// Bumped from v1: biometrics moved out of the two input objects and into a
// shared profile, so old payloads no longer deserialise correctly.
const STORAGE_KEY = "prep-calculator:v2";

export type AppTab = "timeline" | "carbs" | "roadmap" | "macros" | "checkin";
const APP_TABS: readonly AppTab[] = ["timeline", "carbs", "roadmap", "macros", "checkin"];

/** Personal progress state. Never put in shareable URLs. */
export interface TrackingState {
  adjustments: CalorieAdjustment[];
  /** Which habits this member tracks. Daily logs are stored separately. */
  habits: HabitDef[];
  /** Intermittent fasting meal times (Macros tab). */
  fasting: FastingSettings;
}

export interface AppState {
  unit: WeightUnit;
  activeTab: AppTab;
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  tracking: TrackingState;
}

export const DEFAULT_APP_STATE: AppState = {
  unit: DEFAULT_UNIT,
  activeTab: "timeline",
  profile: DEFAULT_PROFILE,
  fatLoss: DEFAULT_FAT_LOSS_INPUTS,
  carbs: DEFAULT_CARB_INPUTS,
  tracking: { adjustments: [], habits: DEFAULT_HABITS, fasting: DEFAULT_FASTING },
};

/* --------------------------- sanitisation --------------------------- */

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function nullableNum(
  value: unknown,
  fallback: number | null,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? clamp(parsed, min, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function date(value: unknown, fallback: string): string {
  return typeof value === "string" && isValidISODate(value) ? value : fallback;
}

const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "veryActive",
];

export function sanitizeProfile(
  raw: Partial<Record<keyof BiometricProfile, unknown>>,
): BiometricProfile {
  const d = DEFAULT_PROFILE;
  return {
    weight: num(raw.weight, d.weight, 50, 1000),
    // 36–96 inches spans 3'0" to 8'0", comfortably beyond real extremes.
    heightInches: num(raw.heightInches, d.heightInches, 36, 96),
    age: num(raw.age, d.age, 14, 100),
    sex: oneOf<Sex>(raw.sex, ["male", "female"], d.sex),
    bodyFatOverride: nullableNum(raw.bodyFatOverride, d.bodyFatOverride, 3, 70),
  };
}

export function sanitizeFatLoss(raw: Partial<Record<keyof FatLossInputs, unknown>>): FatLossInputs {
  const d = DEFAULT_FAT_LOSS_INPUTS;
  return {
    goalType: oneOf<GoalType>(raw.goalType, ["weight", "bodyFat"], d.goalType),
    targetWeight: num(raw.targetWeight, d.targetWeight, 50, 1000),
    targetBodyFat: num(raw.targetBodyFat, d.targetBodyFat, 3, 60),
    weeklyRate: num(raw.weeklyRate, d.weeklyRate, 0.001, 0.03),
    mode: oneOf<TimelineMode>(raw.mode, ["startDate", "eventDate"], d.mode),
    startDate: date(raw.startDate, todayISO()),
    eventDate: date(raw.eventDate, d.eventDate),
    activityLevel: oneOf<ActivityLevel>(raw.activityLevel, ACTIVITY_LEVELS, d.activityLevel),
    tdeeOverride: nullableNum(raw.tdeeOverride, d.tdeeOverride, 800, 8000),
    includeMetabolicAdaptation: bool(
      raw.includeMetabolicAdaptation,
      d.includeMetabolicAdaptation,
    ),
  };
}

export function sanitizeCarbs(
  raw: Partial<Record<keyof CarbCyclingInputs, unknown>>,
): CarbCyclingInputs {
  const d = DEFAULT_CARB_INPUTS;
  return {
    tdee: num(raw.tdee, d.tdee, 800, 8000),
    goal: oneOf<CarbGoal>(raw.goal, ["fatLoss", "recomp", "maintenance"], d.goal),
    dailyCalorieTarget: nullableNum(raw.dailyCalorieTarget, d.dailyCalorieTarget, 800, 8000),
    proteinBasis: oneOf<ProteinBasis>(
      raw.proteinBasis,
      ["bodyWeight", "leanMass"],
      d.proteinBasis,
    ),
    proteinPerLb: num(raw.proteinPerLb, d.proteinPerLb, 0.4, 2),
    fatFloorPercent: num(raw.fatFloorPercent, d.fatFloorPercent, 0.1, 0.5),
    fatFloorGramsPerLb: num(raw.fatFloorGramsPerLb, d.fatFloorGramsPerLb, 0.1, 1),
    highDays: num(raw.highDays, d.highDays, 0, 7),
    mediumDays: num(raw.mediumDays, d.mediumDays, 0, 7),
    lowDays: num(raw.lowDays, d.lowDays, 0, 7),
    highCarbBoost: num(raw.highCarbBoost, d.highCarbBoost, 0, 0.6),
    lowCarbCut: num(raw.lowCarbCut, d.lowCarbCut, 0, 0.9),
    carbDeficitGrams: num(raw.carbDeficitGrams, d.carbDeficitGrams, 0, 300),
    weekdayPattern: patternFromString(raw.weekdayPattern),
  };
}

/* ------------------------------ storage ------------------------------ */

/**
 * Rebuild a trusted AppState from anything — local storage, or the plan
 * document saved in the cloud database. Every field is re-validated, so a
 * corrupted or tampered document can only ever produce defaults.
 */
export function sanitizeAppState(raw: unknown): AppState {
  const parsed = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<
    Record<keyof AppState, unknown>
  >;
  const obj = (v: unknown) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
  return {
    unit: oneOf<WeightUnit>(parsed.unit, ["lb", "kg"], DEFAULT_UNIT),
    activeTab: oneOf<AppTab>(parsed.activeTab, APP_TABS, "timeline"),
    profile: sanitizeProfile(obj(parsed.profile)),
    fatLoss: sanitizeFatLoss(obj(parsed.fatLoss)),
    carbs: sanitizeCarbs(obj(parsed.carbs)),
    tracking: {
      adjustments: sanitizeAdjustments(obj(parsed.tracking).adjustments),
      habits: sanitizeHabitDefs(obj(parsed.tracking).habits),
      fasting: sanitizeFasting(obj(parsed.tracking).fasting),
    },
  };
}

export function loadFromStorage(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeAppState(JSON.parse(raw));
  } catch {
    // Corrupt or unavailable storage is not worth surfacing — fall back to
    // defaults and let the user re-enter.
    return null;
  }
}

export function saveToStorage(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private-mode storage; persistence is best-effort.
  }
}

export function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

/* -------------------------------- URL -------------------------------- */

/** Compact query-parameter aliases, so shared links stay readable. */
const URL_KEYS = {
  u: "unit",
  t: "activeTab",
  w: "weight",
  h: "heightInches",
  a: "age",
  s: "sex",
  bfo: "bodyFatOverride",
  gt: "goalType",
  tw: "targetWeight",
  tbf: "targetBodyFat",
  r: "weeklyRate",
  m: "mode",
  sd: "startDate",
  ed: "eventDate",
  al: "activityLevel",
  tdo: "tdeeOverride",
  ma: "includeMetabolicAdaptation",
  tdee: "tdee",
  g: "goal",
  dct: "dailyCalorieTarget",
  pb: "proteinBasis",
  ppl: "proteinPerLb",
  ffp: "fatFloorPercent",
  ffg: "fatFloorGramsPerLb",
  hd: "highDays",
  md: "mediumDays",
  ld: "lowDays",
  hcb: "highCarbBoost",
  lcc: "lowCarbCut",
  cdg: "carbDeficitGrams",
  wp: "weekdayPattern",
} as const;

type UrlKey = keyof typeof URL_KEYS;

const PROFILE_KEYS: UrlKey[] = ["w", "h", "a", "s", "bfo"];
const FAT_LOSS_KEYS: UrlKey[] = [
  "gt", "tw", "tbf", "r", "m", "sd", "ed", "al", "tdo", "ma",
];
const CARB_KEYS: UrlKey[] = [
  "tdee", "g", "dct", "pb", "ppl", "ffp", "ffg", "hd", "md", "ld", "hcb", "lcc", "cdg", "wp",
];

export function encodeStateToQuery(state: AppState): string {
  const params = new URLSearchParams();
  params.set("u", state.unit);
  params.set("t", state.activeTab);

  for (const key of PROFILE_KEYS) {
    const field = URL_KEYS[key] as keyof BiometricProfile;
    const value = state.profile[field];
    if (value === null || value === undefined) continue;
    params.set(key, String(value));
  }

  for (const key of FAT_LOSS_KEYS) {
    const field = URL_KEYS[key] as keyof FatLossInputs;
    const value = state.fatLoss[field];
    if (value === null || value === undefined) continue;
    params.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }

  for (const key of CARB_KEYS) {
    const field = URL_KEYS[key] as keyof CarbCyclingInputs;
    const value = state.carbs[field];
    if (value === null || value === undefined) continue;
    // The weekday pattern travels as seven letters ("HMLMHLM") rather than a
    // comma-joined array, to keep shared links short and readable.
    params.set(key, Array.isArray(value) ? patternToString(value) : String(value));
  }

  return params.toString();
}

export function decodeStateFromQuery(search: string): AppState | null {
  const params = new URLSearchParams(search);
  if ([...params.keys()].length === 0) return null;

  const profileRaw: Record<string, unknown> = {};
  const fatLossRaw: Record<string, unknown> = {};
  const carbsRaw: Record<string, unknown> = {};

  for (const key of PROFILE_KEYS) {
    const value = params.get(key);
    if (value !== null) profileRaw[URL_KEYS[key]] = value;
  }
  for (const key of FAT_LOSS_KEYS) {
    const value = params.get(key);
    if (value !== null) fatLossRaw[URL_KEYS[key]] = value;
  }
  for (const key of CARB_KEYS) {
    const value = params.get(key);
    if (value !== null) carbsRaw[URL_KEYS[key]] = value;
  }

  return {
    unit: oneOf<WeightUnit>(params.get("u"), ["lb", "kg"], DEFAULT_UNIT),
    activeTab: oneOf<AppTab>(params.get("t"), APP_TABS, "timeline"),
    profile: sanitizeProfile(profileRaw),
    fatLoss: sanitizeFatLoss(fatLossRaw),
    carbs: sanitizeCarbs(carbsRaw),
    tracking: { adjustments: [], habits: DEFAULT_HABITS, fasting: DEFAULT_FASTING },
  };
}

/** Replace the URL query without adding a history entry on every keystroke. */
export function syncUrl(state: AppState): void {
  if (typeof window === "undefined") return;
  const query = encodeStateToQuery(state);
  const next = `${window.location.pathname}?${query}`;
  window.history.replaceState(null, "", next);
}

export function buildShareUrl(state: AppState): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}?${encodeStateToQuery(state)}`;
}
