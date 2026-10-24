/**
 * Drop-off risk: how likely a member is to go quiet and quit, from the signs
 * that come first: logging falling off against their own usual, days since
 * their last log, not opening the app, missed check-ins after sending them,
 * a low health score, and falling behind plan. 0–100, with the reasons and
 * the one thing most worth doing about the biggest one. Paused members
 * aren't scored. See src/lib/coach.ts (flag) and the Insights tab.
 */

import type { CoachMemberData } from "./coach-api";
import { addDays, daysBetween } from "./dates";

export type RiskLevel = "low" | "medium" | "high";

export interface DropOffRisk {
  score: number;
  level: RiskLevel;
  reasons: { id: string; text: string; points: number }[];
  /** The best next step, for the biggest reason. */
  action: string;
}

export const RISK_HIGH = 50;
export const RISK_MEDIUM = 25;

/** Days with any log (weigh-in, habit, food, workout) between `from` and `to`. */
function loggedDays(d: CoachMemberData, from: string, to: string, withFood: boolean): number {
  const inRange = (x: string) => x >= from && x <= to;
  return new Set([
    ...d.weighIns.filter((w) => inRange(w.date)).map((w) => w.date),
    ...d.habitLogs.filter((l) => inRange(l.date) && Object.keys(l.entries).length > 0).map((l) => l.date),
    ...(withFood ? d.foodDays.filter((f) => inRange(f.date) && f.kcal > 0).map((f) => f.date) : []),
    ...d.workoutDates.filter(inRange),
  ]).size;
}

const ACTIONS: Record<string, string> = {
  quiet: "Message them personally today: ask how they're doing, not about the plan. Offer a pause if life got busy.",
  fading: "Send a short, warm check-in message and one easy goal for the week (just weigh in 3 times).",
  away: "Send a reminder: they haven't opened the app in a while. A personal message works better than a generic one.",
  checkins: "Send a check-in reminder, and reply quickly when it comes in.",
  behind: "Review their plan with them: being behind is frustrating. Celebrate what they did do, then make one small change.",
  health: "Pick the one habit they're missing most and make it their only focus this week.",
};

export function dropOffRisk(
  d: CoachMemberData,
  s: { daysSinceLog: number | null; healthScore: number | null; behind: boolean; paused: boolean },
  today: string,
): DropOffRisk {
  if (s.paused) return { score: 0, level: "low", reasons: [], action: "Paused: no action needed." };
  const reasons: DropOffRisk["reasons"] = [];

  // Logging this week against their usual week over the three before (food only goes back two weeks, so it's left out of both).
  const recent = loggedDays(d, addDays(today, -6), today, false);
  const before = loggedDays(d, addDays(today, -27), addDays(today, -7), false) / 3;
  if (before >= 3) {
    const drop = 1 - recent / before;
    if (drop >= 0.5) reasons.push({ id: "fading", text: `Logging down ${Math.round(drop * 100)}% on their usual (${recent} days this week vs about ${Math.round(before)})`, points: 25 });
    else if (drop >= 0.3) reasons.push({ id: "fading", text: `Logging down ${Math.round(drop * 100)}% on their usual`, points: 15 });
  }

  if (s.daysSinceLog === null) reasons.push({ id: "quiet", text: "Hasn't logged anything yet", points: 20 });
  else if (s.daysSinceLog >= 8) reasons.push({ id: "quiet", text: `Nothing logged for ${s.daysSinceLog} days`, points: 30 });
  else if (s.daysSinceLog >= 5) reasons.push({ id: "quiet", text: `Nothing logged for ${s.daysSinceLog} days`, points: 20 });
  else if (s.daysSinceLog >= 3) reasons.push({ id: "quiet", text: `Nothing logged for ${s.daysSinceLog} days`, points: 10 });

  if (d.lastAccessedAt) {
    const away = daysBetween(d.lastAccessedAt.slice(0, 10), today);
    if (away >= 7) reasons.push({ id: "away", text: `Hasn't opened your whop in ${away} days`, points: 15 });
  }

  // Check-ins: they used to send them, and stopped.
  const sent = d.checkins.map((c) => c.submittedAt.slice(0, 10));
  const lately = sent.filter((x) => x >= addDays(today, -13)).length;
  const earlier = sent.filter((x) => x < addDays(today, -13) && x >= addDays(today, -41)).length;
  if (lately === 0 && earlier >= 2) reasons.push({ id: "checkins", text: "Stopped sending check-ins (none in 2 weeks, after sending them before)", points: 15 });

  if (s.healthScore !== null && s.healthScore < 40) reasons.push({ id: "health", text: `Health score ${s.healthScore}`, points: 10 });
  if (s.behind) reasons.push({ id: "behind", text: "Behind plan: progress slower than expected", points: 10 });

  const score = Math.min(100, reasons.reduce((a, r) => a + r.points, 0));
  reasons.sort((a, b) => b.points - a.points);
  return {
    score,
    level: score >= RISK_HIGH ? "high" : score >= RISK_MEDIUM ? "medium" : "low",
    reasons,
    action: reasons.length ? ACTIONS[reasons[0]!.id]! : "Nothing to do: they're engaged.",
  };
}
