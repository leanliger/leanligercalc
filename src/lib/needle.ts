/**
 * Coaching: diet-break timing, and "what moved the needle" (a member's
 * Insights tab, coach-member-insights.tsx).
 *
 * Diet break: from weeks in a deficit, the rate slowing or a plateau, hunger,
 * energy and sleep trending down in check-ins, and lifts slipping, either a
 * full diet break (1–2 weeks at maintenance), refeed days, or not yet.
 *
 * What moved the needle: each change a coach made (macros, a program or habit
 * set they started, a program edit, focus items) with their weight rate and
 * logging in the two weeks before against the two weeks after. Changes within
 * three days of each other are judged together, and a result is a link, not
 * proof.
 */

import { addDays, daysBetween } from "./dates";
import type { Checkin } from "./checkins";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** lb a week over the weigh-ins between `from` and `to`: the median slope between every pair, so one odd morning can't swing it. */
export function rateBetween(weighIns: readonly { date: string; weightLb: number }[], from: string, to: string): number | null {
  const pts = weighIns.filter((w) => w.date >= from && w.date <= to).map((w) => ({ x: daysBetween(from, w.date), y: w.weightLb }));
  if (pts.length < 3) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 5) return null;
  const s: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j]!.x !== pts[i]!.x) s.push((pts[j]!.y - pts[i]!.y) / (pts[j]!.x - pts[i]!.x));
  s.sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return (s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2) * 7;
}

/* -------------------------------- diet break -------------------------------- */

export interface DietBreakAdvice {
  verdict: "break" | "refeed" | "not-yet" | "not-dieting";
  title: string;
  reasons: string[];
  weeksInDeficit: number | null;
  /** Their measured maintenance, for the break's calories. */
  maintenance: number | null;
}

export function dietBreakAdvice(o: {
  today: string;
  /** The day their diet started (src/lib/plateau.ts → dietStartToday), or null when they aren't cutting. */
  dietStart: string | null;
  weighIns: readonly { date: string; weightLb: number }[];
  plateau: boolean;
  slipping: number;
  checkins: readonly Checkin[];
  maintenance: number | null;
}): DietBreakAdvice {
  if (!o.dietStart) {
    return { verdict: "not-dieting", title: "Not in a fat-loss phase", reasons: ["Diet breaks only apply while they're cutting."], weeksInDeficit: null, maintenance: o.maintenance };
  }
  const weeks = Math.floor(daysBetween(o.dietStart, o.today) / 7);
  let points = 0;
  const reasons: string[] = [];
  if (weeks >= 12) {
    points += 2;
    reasons.push(`${weeks} weeks in a deficit`);
  } else if (weeks >= 8) {
    points += 1;
    reasons.push(`${weeks} weeks in a deficit`);
  }
  if (o.plateau) {
    points += 2;
    reasons.push("Weight flat for 2+ weeks");
  } else {
    const recent = rateBetween(o.weighIns, addDays(o.today, -20), o.today);
    const earlier = rateBetween(o.weighIns, addDays(o.today, -55), addDays(o.today, -21));
    if (recent !== null && earlier !== null && earlier < -0.3 && recent > earlier * 0.6) {
      points += 1;
      reasons.push(`Loss slowing: ${r1(-earlier)} → ${r1(Math.max(0, -recent))} lb a week`);
    }
  }
  // How they feel: the last three check-ins against the three before (5 = good).
  const sorted = [...o.checkins].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const recentC = sorted.slice(0, 3);
  const earlierC = sorted.slice(3, 6);
  const mean = (cs: readonly Checkin[], k: "hunger" | "energy" | "sleep") => avg(cs.map((c) => c.answers.ratings[k]));
  for (const [k, label] of [
    ["hunger", "Hunger"],
    ["energy", "Energy"],
    ["sleep", "Sleep"],
  ] as const) {
    const now = mean(recentC, k);
    const before = mean(earlierC, k);
    if (now === null) continue;
    if (now <= 2.5) {
      points += 1;
      reasons.push(`${label} rated ${r1(now)}/5 lately${before !== null ? ` (was ${r1(before)})` : ""}`);
    } else if (before !== null && before - now >= 1) {
      points += 1;
      reasons.push(`${label} down from ${r1(before)} to ${r1(now)}/5`);
    }
  }
  if (o.slipping >= 2) {
    points += 1;
    reasons.push(`${o.slipping} lifts slipping`);
  }
  const kcal = o.maintenance ? ` (about ${(Math.round(o.maintenance / 50) * 50).toLocaleString("en-US")} kcal)` : "";
  if (points >= 4) return { verdict: "break", title: `Diet break: 1–2 weeks at maintenance${kcal}`, reasons, weeksInDeficit: weeks, maintenance: o.maintenance };
  if (points >= 2) return { verdict: "refeed", title: `Refeed days: 1–2 a week at maintenance${kcal}, the extra from carbs`, reasons, weeksInDeficit: weeks, maintenance: o.maintenance };
  return { verdict: "not-yet", title: "No break needed yet", reasons: reasons.length ? reasons : [`${weeks} week${weeks === 1 ? "" : "s"} in, no warning signs`], weeksInDeficit: weeks, maintenance: o.maintenance };
}

/* -------------------------------- what moved the needle -------------------------------- */

export interface CoachChange {
  date: string;
  kind: string;
  title: string;
}

export interface ChangeEffect {
  date: string;
  changes: CoachChange[];
  before: { rate: number | null; logDays: number };
  after: { rate: number | null; logDays: number };
  verdict: "helped" | "hurt" | "no-change" | "too-soon" | "no-data";
  text: string;
}

const WINDOW = 14;
/** Kinds judged on results; reminders and nudges are too small to read on the scale. */
const JUDGED = new Set(["macros", "program", "habits", "program-edit", "focus"]);

export function changeEffects(o: {
  changes: readonly CoachChange[];
  weighIns: readonly { date: string; weightLb: number }[];
  /** Days with any log. */
  logDates: ReadonlySet<string>;
  today: string;
  /** -1 when they're trying to lose, +1 to gain. */
  direction: -1 | 1;
  unit: WeightUnit;
}): ChangeEffect[] {
  const groups: CoachChange[][] = [];
  for (const c of o.changes.filter((x) => JUDGED.has(x.kind))) {
    const last = groups.at(-1);
    if (last && daysBetween(last[0]!.date, c.date) <= 3) {
      // The same change twice (three program edits in a day) shows once, with a count.
      const same = last.find((x) => x.title.replace(/ (×d+)$/, "") === c.title);
      if (same) {
        const n = Number(/ (×(d+))$/.exec(same.title)?.[1] ?? 1) + 1;
        same.title = `${c.title} (×${n})`;
      } else last.push({ ...c });
    } else groups.push([{ ...c }]);
  }
  const logs = (from: string, to: string) => {
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (o.logDates.has(d)) n++;
    return n;
  };
  const w = (lb: number) => `${lb <= 0 ? "−" : "+"}${r1(fromLb(Math.abs(lb), o.unit))}`;
  return groups
    .map((g): ChangeEffect => {
      const date = g[0]!.date;
      const bFrom = addDays(date, -WINDOW);
      const bTo = addDays(date, -1);
      const aTo = addDays(date, WINDOW - 1) < o.today ? addDays(date, WINDOW - 1) : o.today;
      const before = { rate: rateBetween(o.weighIns, bFrom, bTo), logDays: logs(bFrom, bTo) };
      const after = { rate: rateBetween(o.weighIns, date, aTo), logDays: logs(date, aTo) };
      const afterDays = daysBetween(date, aTo) + 1;
      if (afterDays < 7) return { date, changes: g, before, after, verdict: "too-soon", text: "Less than a week since: too soon to tell." };
      if (before.rate === null || after.rate === null) {
        return { date, changes: g, before, after, verdict: "no-data", text: "Not enough weigh-ins either side to judge the scale." };
      }
      const better = (after.rate - before.rate) * o.direction; // positive = moving the right way faster
      const rateText = `${w(before.rate)} → ${w(after.rate)} ${o.unit} a week`;
      const logText = `logging ${r1((before.logDays / WINDOW) * 7)} → ${r1((after.logDays / afterDays) * 7)} days a week`;
      if (better >= 0.3) return { date, changes: g, before, after, verdict: "helped", text: `Helped: ${rateText}; ${logText}.` };
      if (better <= -0.3) return { date, changes: g, before, after, verdict: "hurt", text: `Didn't help: ${rateText}; ${logText}.` };
      return { date, changes: g, before, after, verdict: "no-change", text: `No clear change: ${rateText}; ${logText}.` };
    })
    .reverse();
}
