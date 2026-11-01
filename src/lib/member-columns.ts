/**
 * Coach dashboard → Members, the list's columns: the five always shown, the
 * optional ones a coach picks (remembered on the device), and how each sorts.
 * A heading sorts by its column the first time with the problems on top
 * (`firstDir`), the opposite way the second time.
 */

import type { MemberSummary } from "./coach";
import { addDays, daysBetween } from "./dates";
import { forecast } from "./member-insights";
import { weightChangeOver } from "./muscle-check";

export type ColumnKey =
  | "health"
  | "week"
  | "trend"
  | "lastLog"
  | "checkin"
  | "risk"
  | "goal"
  | "workouts"
  | "protein"
  | "joined"
  | "tags"
  | "program";

export type SortDir = 1 | -1;

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Always shown (not in the picker's choices). */
  fixed?: boolean;
  /** The first click's direction: whichever puts the ones needing you on top. */
  firstDir: SortDir;
  /** Grid track on a computer. */
  width: string;
  align: "left" | "center" | "right";
}

export const COLUMNS: ColumnDef[] = [
  { key: "health", label: "Health", fixed: true, firstDir: 1, width: "3rem", align: "center" },
  { key: "week", label: "Week", fixed: true, firstDir: 1, width: "3.5rem", align: "right" },
  { key: "trend", label: "4-wk trend", fixed: true, firstDir: -1, width: "6.75rem", align: "right" },
  { key: "lastLog", label: "Last log", fixed: true, firstDir: -1, width: "5.5rem", align: "left" },
  { key: "checkin", label: "Check-in", fixed: true, firstDir: 1, width: "5.5rem", align: "left" },
  { key: "risk", label: "Quit risk", firstDir: -1, width: "5rem", align: "left" },
  { key: "goal", label: "Goal date", firstDir: -1, width: "5rem", align: "right" },
  { key: "workouts", label: "Workouts", firstDir: 1, width: "4.5rem", align: "right" },
  { key: "protein", label: "Protein", firstDir: 1, width: "4.5rem", align: "right" },
  { key: "joined", label: "Joined", firstDir: -1, width: "4.5rem", align: "right" },
  { key: "tags", label: "Tags", firstDir: 1, width: "6.5rem", align: "left" },
  { key: "program", label: "Program", firstDir: 1, width: "7rem", align: "left" },
];

export const OPTIONAL_COLUMNS = COLUMNS.filter((c) => !c.fixed).map((c) => c.key);
/** Quit risk is on until a coach changes the picks. */
export const DEFAULT_EXTRA: ColumnKey[] = ["risk"];

/** Weeks in the trend line. */
export const TREND_WEEKS = 4;

/**
 * Their average weigh-in for each of the last TREND_WEEKS weeks (oldest
 * first, ending today; null for a week without one) and the change from the
 * first week with one to the last.
 */
export function weightTrend(weighIns: readonly { date: string; weightLb: number }[], today: string): { weeks: (number | null)[]; changeLb: number | null } {
  const weeks: (number | null)[] = [];
  for (let w = TREND_WEEKS - 1; w >= 0; w--) {
    const end = addDays(today, -w * 7);
    const start = addDays(end, -6);
    const xs = weighIns.filter((x) => x.date >= start && x.date <= end).map((x) => x.weightLb);
    weeks.push(xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  }
  const known = weeks.filter((x): x is number => x !== null);
  return { weeks, changeLb: known.length >= 2 ? Math.round((known[known.length - 1]! - known[0]!) * 10) / 10 : null };
}

/** When they'd reach their goal weight at their current rate (as on their Insights tab); null without one. */
export function goalDate(m: MemberSummary, today: string): string | null {
  const goal = m.state.fatLoss.goalType === "weight" ? m.state.fatLoss.targetWeight : null;
  if (goal === null) return null;
  const sixWeeks = weightChangeOver(m.data.weighIns, today);
  const rate = m.progress?.observedRate ?? (sixWeeks === null ? null : -sixWeeks / 6);
  return forecast({ today, trendLb: m.progress?.trendWeight ?? m.latestWeightLb, rateLb: rate, goalLb: goal, kcalDelta: 0, stepsDelta: 0 }).date;
}

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * The value a column sorts by; null sorts last either way. Check-in sorts
 * "to review" first, then none yet, then done.
 */
export function sortValue(key: ColumnKey, m: MemberSummary, ctx: { today: string; tagNames: (id: string) => string }): number | string | null {
  switch (key) {
    case "health":
      return m.health?.score ?? null;
    case "week":
      return m.week.percent;
    case "trend":
      // First click (high to low): gaining or flat on top, the biggest losses last.
      return weightTrend(m.data.weighIns, ctx.today).changeLb;
    case "lastLog":
      return m.daysSinceLog;
    case "checkin":
      return m.flags.includes("reply") ? 0 : m.checkedIn ? 2 : 1;
    case "risk":
      return RISK_RANK[m.risk.level] * 1000 + m.risk.score;
    case "goal": {
      const d = goalDate(m, ctx.today);
      return d ? daysBetween(ctx.today, d) : null;
    }
    case "workouts":
      return m.workouts7;
    case "protein":
      return m.food7?.protein ?? null;
    case "joined":
      return m.data.joinedAt;
    case "tags":
      return ctx.tagNames(m.data.userId) || null;
    case "program":
      return m.data.program ?? null;
  }
}

export function sortMembers(list: readonly MemberSummary[], key: ColumnKey, dir: SortDir, ctx: Parameters<typeof sortValue>[2]): MemberSummary[] {
  const vals = new Map(list.map((m) => [m.data.userId, sortValue(key, m, ctx)]));
  return [...list].sort((a, b) => {
    const x = vals.get(a.data.userId) ?? null;
    const y = vals.get(b.data.userId) ?? null;
    if (x === null || y === null) return x === y ? a.displayName.localeCompare(b.displayName) : x === null ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * dir || a.displayName.localeCompare(b.displayName);
  });
}

/** The picked optional columns, from storage; unknown keys dropped. */
export function parseColumns(raw: string | null): ColumnKey[] {
  if (raw === null) return DEFAULT_EXTRA;
  try {
    const xs = JSON.parse(raw) as unknown;
    return Array.isArray(xs) ? OPTIONAL_COLUMNS.filter((k) => xs.includes(k)) : DEFAULT_EXTRA;
  } catch {
    return DEFAULT_EXTRA;
  }
}
