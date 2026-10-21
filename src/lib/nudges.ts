/**
 * Automatic nudges (coach dashboard → Library → Automatic nudges): rules a
 * coach switches on, like "no food logged for 3 days → send a message". The
 * server checks them once a day (worker/nudges.ts) and sends the coach's
 * message as a Whop notification.
 *
 * Each rule goes to a member once per gap: someone who last logged food on
 * Tuesday gets one "no food" nudge about it, not one every day after. Only
 * members sharing their progress with the coach are checked, never on a day
 * they paused, and at most one nudge per member per day.
 */

import { daysBetween } from "./dates";

export const NUDGE_KINDS = ["no_food", "no_weighin", "no_workout", "no_checkin"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];

export const NUDGE_MESSAGE_MAX = 200;
export const NUDGE_DAYS_MIN = 2;
export const NUDGE_DAYS_MAX = 30;

export interface NudgeRule {
  kind: NudgeKind;
  enabled: boolean;
  /** Days without it before the nudge goes out. */
  days: number;
  message: string;
}

/** What each rule watches, for the settings list. Earlier ones win when several are due on the same day. */
export const NUDGE_INFO: Record<NudgeKind, { label: string; what: string; days: number; message: string }> = {
  no_checkin: {
    label: "No check-in",
    what: "No weekly check-in sent for",
    days: 9,
    message: "Haven't seen your check-in this week. Two minutes in the app and I can adjust your plan.",
  },
  no_food: {
    label: "No food logged",
    what: "No food logged for",
    days: 3,
    message: "Haven't seen any food logged in a few days. Even a rough log helps me keep your plan on track.",
  },
  no_weighin: {
    label: "No weigh-in",
    what: "No weigh-in for",
    days: 4,
    message: "Quick reminder to step on the scale tomorrow morning. A few weigh-ins a week keep your trend accurate.",
  },
  no_workout: {
    label: "No workout",
    what: "No finished workout for",
    days: 5,
    message: "It's been a few days since your last session. Get one in today, even a short one counts.",
  },
};

/** The order rules are checked in (one nudge per member per day). */
export const NUDGE_ORDER: readonly NudgeKind[] = ["no_checkin", "no_food", "no_weighin", "no_workout"];

export const defaultNudgeRule = (kind: NudgeKind): NudgeRule => ({ kind, enabled: false, days: NUDGE_INFO[kind].days, message: NUDGE_INFO[kind].message });

/** Every rule, with defaults filled in for ones the coach hasn't saved. */
export function withDefaults(saved: readonly NudgeRule[]): NudgeRule[] {
  return NUDGE_ORDER.map((k) => saved.find((r) => r.kind === k) ?? defaultNudgeRule(k));
}

export function validateNudgeRules(raw: unknown): { ok: true; rules: NudgeRule[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Expected a list of rules." };
  const rules: NudgeRule[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) return { ok: false, error: "That rule isn't valid." };
    const o = r as Record<string, unknown>;
    if (!NUDGE_KINDS.includes(o.kind as NudgeKind)) return { ok: false, error: "That rule isn't valid." };
    const kind = o.kind as NudgeKind;
    if (rules.some((x) => x.kind === kind)) continue;
    const days = typeof o.days === "number" && Number.isInteger(o.days) ? o.days : NaN;
    if (!(days >= NUDGE_DAYS_MIN && days <= NUDGE_DAYS_MAX)) {
      return { ok: false, error: `${NUDGE_INFO[kind].label}: pick between ${NUDGE_DAYS_MIN} and ${NUDGE_DAYS_MAX} days.` };
    }
    const message = typeof o.message === "string" ? o.message.replace(/\s+/g, " ").trim() : "";
    if (!message) return { ok: false, error: `${NUDGE_INFO[kind].label}: write the message members get.` };
    if (message.length > NUDGE_MESSAGE_MAX) return { ok: false, error: `${NUDGE_INFO[kind].label}: keep the message to ${NUDGE_MESSAGE_MAX} characters.` };
    rules.push({ kind, enabled: o.enabled === true, days, message });
  }
  return { ok: true, rules };
}

/**
 * Whether a rule is due for a member today, and the gap it's about. `last` is
 * the day they last did it (null if never); `since` is when they started
 * sharing, so someone new isn't nudged about the time before. Due once
 * `days` whole days have passed without it (last log Oct 18, 3 days: due on
 * Oct 22). Returns the anchor (the start of the gap) to record, so each gap
 * gets one nudge.
 */
export function nudgeDue(last: string | null, since: string, today: string, days: number): string | null {
  const from = last && last > since ? last : since;
  return daysBetween(from, today) > days ? from : null;
}
