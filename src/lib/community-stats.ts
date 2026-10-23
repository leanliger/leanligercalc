/**
 * Community stats for marketing (coach dashboard → Library → Wins &
 * testimonials): totals across the members who share their progress, for a
 * period, e.g. "Our members lost 230 lb in October". Totals only, never
 * names, and only once enough members are counted that no one person's
 * numbers can be picked out. See worker/community-stats.ts.
 */

import { addDays, daysBetween } from "./dates";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

export type StatsPeriod = "this-month" | "last-month" | "30d";
export const STATS_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
];
/** Fewest members counted before any totals are shown. */
export const STATS_MIN_MEMBERS = 3;

export interface CommunityStats {
  period: StatsPeriod;
  from: string;
  to: string;
  /** "October", "October so far" or "the last 30 days". */
  label: string;
  /** Members sharing their progress, counted. */
  members: number;
  /** Of them, members who logged anything in the period. */
  active: number;
  /** Weight lost, summed over members whose weight went down (lb). */
  lbLost: number;
  membersDown: number;
  /** Waist inches lost, summed over members whose waist went down. */
  waistInLost: number;
  workouts: number;
  /** Weight × reps over every finished set (lb). */
  volumeLb: number;
  checkins: number;
  milestones: number;
  /** False when too few members are counted to show totals. */
  enough: boolean;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function periodRange(period: StatsPeriod, today: string): { from: string; to: string; label: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  if (period === "30d") return { from: addDays(today, -29), to: today, label: "the last 30 days" };
  if (period === "this-month") return { from: `${today.slice(0, 7)}-01`, to: today, label: `${MONTHS[m - 1]} so far` };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const from = `${py}-${String(pm).padStart(2, "0")}-01`;
  return { from, to: addDays(`${today.slice(0, 7)}-01`, -1), label: MONTHS[pm - 1]! };
}

/**
 * A member's weight change over the period: a straight line through their
 * weigh-ins in it (3+ over a week or more), from its first weigh-in to its
 * last. Day-to-day water swings would make first-minus-last unreliable.
 */
export function weightChangeLb(weighIns: readonly { date: string; weightLb: number }[]): number | null {
  if (weighIns.length < 3) return null;
  const start = weighIns.reduce((d, w) => (w.date < d ? w.date : d), weighIns[0]!.date);
  const pts = weighIns.map((w) => ({ x: daysBetween(start, w.date), y: w.weightLb }));
  const span = Math.max(...pts.map((p) => p.x));
  if (span < 7) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  return (pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx) * span;
}

const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
const thousands = (n: number) => Math.round(n).toLocaleString("en-US");

/** Ready-to-post lines from the totals; only the numbers worth bragging about. */
export function marketingText(s: CommunityStats, unit: WeightUnit): string {
  const weight = round(fromLb(s.lbLost, unit));
  const waist = unit === "kg" ? round(s.waistInLost * 2.54) : round(s.waistInLost);
  const volume = fromLb(s.volumeLb, unit);
  const parts: string[] = [];
  if (weight > 0) parts.push(`lost ${weight.toLocaleString("en-US")} ${unit}${s.membersDown > 1 ? ` between ${s.membersDown} of them` : ""}`);
  if (waist > 0) parts.push(`took ${waist} ${unit === "kg" ? "cm" : "inches"} off their waists`);
  if (s.workouts > 0) parts.push(`finished ${thousands(s.workouts)} workouts${volume >= 1000 ? ` and lifted ${thousands(volume)} ${unit}` : ""}`);
  if (s.milestones > 0) parts.push(`hit ${s.milestones} milestone${s.milestones === 1 ? "" : "s"}`);
  if (s.checkins > 0) parts.push(`sent ${s.checkins} weekly check-in${s.checkins === 1 ? "" : "s"}`);
  if (parts.length === 0) return "";
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const when = s.period === "30d" ? "In the last 30 days" : s.period === "this-month" ? `So far this ${s.label.replace(" so far", "")}` : `In ${s.label}`;
  return `${when}, our members ${list}. Real people, real logs, tracked in the app.`;
}
