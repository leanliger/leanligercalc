/**
 * Coach dashboard → First 14 days: each new member against the steps that
 * predict whether they stick, each due by a day after they joined. A step
 * past its day and not done makes them "stuck", so you see it before the
 * "May quit" flag ever could.
 *
 * Steps that need their logs can't be seen until they share their progress;
 * those show as unknown rather than missed.
 */

import type { CoachMemberData } from "./coach-api";
import { daysBetween } from "./dates";

/** Members who joined this many days ago or fewer (day 0 = the day they joined). */
export const FIRST_DAYS = 14;

export type FirstStepId = "sharing" | "welcome" | "goal" | "weigh-in" | "food" | "workout" | "checkin";

export const FIRST_STEPS: { id: FirstStepId; label: string; dueDay: number; nudge: string; yours?: boolean }[] = [
  { id: "sharing", label: "Shared their progress", dueDay: 1, nudge: "Ask them to turn on “Share my progress with my coach” (Settings → Coach access)." },
  { id: "welcome", label: "You welcomed them", dueDay: 1, nudge: "Send them a welcome message.", yours: true },
  { id: "goal", label: "Set their goal", dueDay: 2, nudge: "Help them set their goal on Plan → Timeline." },
  { id: "weigh-in", label: "First weigh-in", dueDay: 2, nudge: "Ask them to log a first weigh-in tomorrow morning." },
  { id: "food", label: "Logged food", dueDay: 3, nudge: "Ask them to log one day of food, even a rough one." },
  { id: "workout", label: "Finished a workout", dueDay: 5, nudge: "Point them at their program and their first workout." },
  { id: "checkin", label: "First check-in", dueDay: 9, nudge: "Remind them their weekly check-in is due." },
];

/** done, not yet due, overdue, or can't tell (not sharing). */
export type StepState = "done" | "upcoming" | "overdue" | "unknown";

export interface FirstDaysRow {
  id: string;
  /** Days since they joined: 0 on the day they joined. */
  day: number;
  joinedOn: string;
  steps: { id: FirstStepId; state: StepState }[];
  done: number;
  /** Their first overdue step, the one to nudge. */
  next: (typeof FIRST_STEPS)[number] | null;
  status: "stuck" | "on-track" | "done";
  /** Days since they last opened the whop, from Whop; null when unknown. */
  daysSinceOpened: number | null;
}

export function firstDays(
  members: readonly CoachMemberData[],
  today: string,
  hasPlan: (id: string) => boolean,
): FirstDaysRow[] {
  const rows: FirstDaysRow[] = [];
  for (const m of members) {
    if (!m.joinedAt) continue;
    const joinedOn = m.joinedAt.slice(0, 10);
    const day = daysBetween(joinedOn, today);
    if (day < 0 || day >= FIRST_DAYS) continue;
    const sharing = m.sharing.state === "shared";
    const did: Record<FirstStepId, boolean | null> = {
      sharing,
      welcome: !!m.lastCoachContact && m.lastCoachContact >= m.joinedAt,
      goal: sharing ? hasPlan(m.userId) : null,
      "weigh-in": sharing ? m.weighIns.length > 0 : null,
      food: sharing ? m.foodDays.some((f) => f.kcal > 0) : null,
      workout: sharing ? m.workoutDates.length > 0 : null,
      checkin: sharing ? m.checkins.length > 0 : null,
    };
    const steps = FIRST_STEPS.map((s) => ({
      id: s.id,
      state: (did[s.id] === true ? "done" : did[s.id] === null ? "unknown" : day >= s.dueDay ? "overdue" : "upcoming") as StepState,
    }));
    const done = steps.filter((s) => s.state === "done").length;
    const firstOverdue = steps.find((s) => s.state === "overdue");
    rows.push({
      id: m.userId,
      day,
      joinedOn,
      steps,
      done,
      next: firstOverdue ? FIRST_STEPS.find((s) => s.id === firstOverdue.id)! : null,
      status: done === FIRST_STEPS.length ? "done" : firstOverdue ? "stuck" : "on-track",
      daysSinceOpened: m.lastAccessedAt ? Math.max(0, daysBetween(m.lastAccessedAt.slice(0, 10), today)) : null,
    });
  }
  const rank = { stuck: 0, "on-track": 1, done: 2 } as const;
  // Stuck first, the longest-stuck at the top; then the newest.
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "stuck" ? b.day - a.day : a.day - b.day));
}
