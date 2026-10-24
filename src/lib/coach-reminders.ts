/**
 * On-demand reminders from the coach (coach dashboard → Members → the bell
 * beside a member, a member's page, or bulk actions; worker/coach-reminders.ts).
 * Each goes out as a Whop notification in the coach's words, shows in the
 * member's bell (tapping it opens the right tab) and on their Timeline.
 * Suggested ones follow the member's flags.
 */

import type { MemberSummary } from "./coach";
import { addDays } from "./dates";
import { STEPS_KEY } from "./habits";
import type { NotificationTarget } from "./messages";

export type ReminderKind = "checkin" | "weigh-in" | "food" | "habits" | "workout" | "steps" | "photos" | "measurements" | "water";

export interface ReminderInfo {
  kind: ReminderKind;
  label: string;
  title: string;
  /** {first} becomes the member's first name. */
  content: string;
  target: Exclude<NotificationTarget, null>;
}

export const REMINDERS: readonly ReminderInfo[] = [
  {
    kind: "checkin",
    label: "Weekly check-in",
    title: "Time for your weekly check-in",
    content: "{first}, take 2 minutes to send your check-in so I can review your week. Progress → Check-in.",
    target: "checkin",
  },
  {
    kind: "weigh-in",
    label: "Weigh-in",
    title: "Weigh-in reminder",
    content: "{first}, step on the scale tomorrow morning, after the bathroom and before food, and log it in Progress.",
    target: "checkin",
  },
  {
    kind: "food",
    label: "Log food",
    title: "Log today's food",
    content: "{first}, get today's meals into your Food log, even rough entries. It's how I fine-tune your numbers.",
    target: "macros",
  },
  {
    kind: "habits",
    label: "Habits",
    title: "Tick off today's habits",
    content: "{first}, open Today and tick off your habits. Small wins add up.",
    target: "today",
  },
  {
    kind: "workout",
    label: "Workout",
    title: "Workout reminder",
    content: "{first}, your next session is waiting in Training. Get it in today.",
    target: "training",
  },
  {
    kind: "steps",
    label: "Steps",
    title: "Get your steps in",
    content: "{first}, a 15-minute walk after a meal is an easy win toward today's step goal.",
    target: "today",
  },
  {
    kind: "photos",
    label: "Progress photos",
    title: "Progress photo time",
    content: "{first}, take your front, side and back photos in the same spot and lighting as last time. Progress → Photos.",
    target: "checkin",
  },
  {
    kind: "measurements",
    label: "Measurements",
    title: "Time to measure",
    content: "{first}, measure your waist, hips, chest, arms and thighs and log them in Progress → Measurements.",
    target: "checkin",
  },
  {
    kind: "water",
    label: "Water",
    title: "Drink some water",
    content: "{first}, have a glass of water now and keep a bottle with you today.",
    target: "today",
  },
];

export const REMINDER_KINDS = REMINDERS.map((r) => r.kind);
export const reminderInfo = (kind: string) => REMINDERS.find((r) => r.kind === kind) ?? null;
export const isReminderKind = (v: unknown): v is ReminderKind => typeof v === "string" && (REMINDER_KINDS as string[]).includes(v);

/** The same reminder to the same member waits this long. */
export const REMINDER_COOLDOWN_HOURS = 12;
/** Reminders one member can get from coaches in a day. */
export const REMINDERS_PER_DAY = 4;

export const reminderText = (kind: ReminderKind, firstName: string) => {
  const r = reminderInfo(kind)!;
  const first = firstName.trim() || "Hey";
  return { title: r.title, content: r.content.replace(/\{first\}/g, first) };
};

/** Which reminders fit this member right now, from their flags and numbers. */
export function suggestedReminders(m: MemberSummary): ReminderKind[] {
  const out: ReminderKind[] = [];
  if (m.flags.includes("checkin")) out.push("checkin");
  if (m.flags.includes("no-weigh-in")) out.push("weigh-in");
  if (m.flags.includes("inactive") || (m.food7 !== null && m.food7.days < 4) || (m.food7 === null && m.hasPlan)) out.push("food");
  if (m.flags.includes("red")) out.push("habits");
  if (m.flags.includes("no-workouts")) out.push("workout");
  // Steps: under 75% of their target over the last 7 days they logged a count.
  const target = m.state.fatLoss.activitySource === "steps" ? m.state.fatLoss.dailySteps : 0;
  if (target > 0 && m.lastLog) {
    const from = addDays(m.lastLog, -6);
    const counts = m.data.habitLogs
      .filter((l) => l.date >= from)
      .map((l) => l.entries[STEPS_KEY])
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (counts.length > 0 && counts.reduce((a, b) => a + b, 0) / counts.length < target * 0.75) out.push("steps");
  }
  return out;
}

/** "2 h ago", "yesterday". */
export function sentAgoShort(iso: string, now = Date.now()): string {
  const h = Math.round((now - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
