/**
 * Accountability checks (worker/accountability.ts, coach-accountability.tsx,
 * accountability-card.tsx): when a member starts slipping, they get one
 * question from their coach with four one-tap answers. "Struggling" and
 * "Need help" go straight to the coach (a chat message, a Whop notification,
 * a row on Today); "Busy week" offers an easier week, or a week's pause; no
 * answer in NO_ANSWER_HOURS puts them on the coach's Today too. At most one
 * check a member every CHECK_EVERY_DAYS, never while paused, daytime only.
 */

import type { MemberSummary } from "./coach";

export const CHECK_EVERY_DAYS = 7;
/** Unanswered this long after sending: on the coach's Today as "No answer to check". */
export const NO_ANSWER_HOURS = 48;
/** How long the member's card stays up unanswered. */
export const OPEN_DAYS = 7;
/** The coach's local hours checks go out in (approved ones too). */
export const SEND_HOURS = { from: 9, to: 18 } as const;
export const QUESTION_MAX = 120;
export const NOTE_MAX = 300;
export const DEFAULT_QUESTION = "How's this week going?";

export type TriggerId = "risk" | "logging" | "habits" | "workouts" | "goal" | "checkin";

export const TRIGGERS: { id: TriggerId; label: string; on: boolean }[] = [
  { id: "risk", label: "Quit risk reaches medium", on: true },
  { id: "logging", label: "Logging drops to half their usual", on: true },
  { id: "habits", label: "Habit score in the red this week", on: true },
  { id: "workouts", label: "No workouts this week (when they usually train)", on: true },
  { id: "goal", label: "A Hold lift goal slips", on: false },
  { id: "checkin", label: "Weekly check-in skipped", on: true },
];

export const DEFAULT_TRIGGERS: TriggerId[] = TRIGGERS.filter((t) => t.on).map((t) => t.id);

export type Answer = "on-track" | "busy" | "struggling" | "help";
export const ANSWERS: { id: Answer; label: string }[] = [
  { id: "on-track", label: "On track" },
  { id: "busy", label: "Busy week" },
  { id: "struggling", label: "Struggling" },
  { id: "help", label: "Need help" },
];
export const ANSWER_LABEL: Record<Answer, string> = Object.fromEntries(ANSWERS.map((a) => [a.id, a.label])) as Record<Answer, string>;

export type Choice = "two-things" | "pause" | "keep";
export const CHOICES: { id: Choice; label: string }[] = [
  { id: "two-things", label: "Just 2 things this week: protein and steps" },
  { id: "pause", label: "Pause my plan for a week" },
  { id: "keep", label: "I'll keep going as is" },
];
export const CHOICE_LABEL: Record<Choice, string> = Object.fromEntries(CHOICES.map((c) => [c.id, c.label])) as Record<Choice, string>;

export interface AccountabilitySettings {
  enabled: boolean;
  /** "approve": checks wait for the coach each morning; "auto": they go by themselves. */
  mode: "approve" | "auto";
  triggers: TriggerId[];
  question: string;
}

export const DEFAULT_SETTINGS: AccountabilitySettings = { enabled: false, mode: "approve", triggers: DEFAULT_TRIGGERS, question: DEFAULT_QUESTION };

export type CheckStatus = "pending" | "sent" | "answered" | "skipped";

export interface AccountabilityCheck {
  id: string;
  memberId: string;
  status: CheckStatus;
  /** Why it was sent, in words. */
  triggers: string[];
  createdAt: string;
  sentAt: string | null;
  answer: Answer | null;
  note: string | null;
  choice: Choice | null;
  answeredAt: string | null;
}

export function sanitizeSettings(raw: unknown): AccountabilitySettings | null {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof b.enabled !== "boolean" || (b.mode !== "approve" && b.mode !== "auto") || !Array.isArray(b.triggers)) return null;
  const ids = new Set(TRIGGERS.map((t) => t.id));
  const triggers = [...new Set(b.triggers.filter((t): t is TriggerId => typeof t === "string" && ids.has(t as TriggerId)))];
  const question = typeof b.question === "string" ? b.question.trim().slice(0, QUESTION_MAX) : "";
  return { enabled: b.enabled, mode: b.mode, triggers, question: question || DEFAULT_QUESTION };
}

/** What a member's numbers say, as the reasons a check would go to them (empty: none). */
export function checkReasons(m: MemberSummary, triggers: readonly TriggerId[]): string[] {
  const on = new Set(triggers);
  const out: string[] = [];
  if (on.has("risk") && m.risk.level !== "low") out.push(`Quit risk ${m.risk.level} (${m.risk.score})`);
  if (on.has("logging")) {
    const fading = m.risk.reasons.find((r) => r.id === "fading" && r.points >= 25);
    if (fading) out.push(fading.text);
  }
  if (on.has("habits") && m.flags.includes("red")) out.push("Habit score in the red");
  if (on.has("workouts") && m.flags.includes("no-workouts")) out.push("No workouts this week");
  if (on.has("goal") && m.flags.includes("goal-slipping")) out.push(`Lift goal slipping${m.data.goalsSlipping?.length ? `: ${m.data.goalsSlipping.join(", ")}` : ""}`);
  if (on.has("checkin") && m.flags.includes("checkin")) out.push("No check-in this week");
  return out;
}

/** The coach needs to step in: asked for help or struggling, and you haven't been in touch since. */
export function needsHelp(c: AccountabilityCheck | null | undefined, lastCoachContact: string | null | undefined): boolean {
  if (!c || !c.answeredAt || (c.answer !== "help" && c.answer !== "struggling")) return false;
  return !lastCoachContact || lastCoachContact < c.answeredAt;
}

/** Sent, not answered for NO_ANSWER_HOURS, and you haven't been in touch since it went. */
export function noAnswer(c: AccountabilityCheck | null | undefined, lastCoachContact: string | null | undefined, now: number): boolean {
  if (!c || c.status !== "sent" || !c.sentAt || c.answeredAt) return false;
  if (now - Date.parse(c.sentAt) < NO_ANSWER_HOURS * 3_600_000) return false;
  return !lastCoachContact || lastCoachContact < c.sentAt;
}
