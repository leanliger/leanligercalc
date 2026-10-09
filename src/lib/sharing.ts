/**
 * Coach access: a member's progress is visible in the coach dashboard only
 * while they choose to share it. Off for everyone by default.
 *
 *   - A coach (admin of the whop) can ask; the member gets a Whop notification
 *     and a prompt in the app, and picks Share or Not now.
 *   - Members can also switch sharing on themselves, and off at any time.
 *   - A coach can stop viewing (switches it off) once they're done.
 *   - After "Not now", the coach can ask again after REQUEST_COOLDOWN_DAYS.
 *
 * Shared covers the plan, weigh-ins, measurements, habits and streaks, food
 * totals and pause status. Progress photos also need their own switch.
 * Shared by the browser and the Worker (worker/sharing.ts).
 */

import { addDays, formatShort } from "./dates";

export type SharingState = "shared" | "requested" | "declined" | "off";

export const REQUEST_COOLDOWN_DAYS = 7;

/** What's included, shown to members before they decide. */
export const SHARED_ITEMS = [
  "Your plan and goal",
  "Weigh-ins and measurements",
  "Daily habits, streaks and weekly scores",
  "Daily food totals (not individual foods)",
  "Whether you're paused",
];

/** The coach's view of one member's choice. */
export interface MemberSharing {
  state: SharingState;
  /** When it was shared, asked for, or declined. */
  since: string | null;
  /** After a "Not now": the first day the coach can ask again. */
  askAgainFrom: string | null;
}

/** The member's own view. */
export interface MySharing {
  shared: boolean;
  sharedAt: string | null;
  /** A coach's request waiting for an answer. */
  requestedAt: string | null;
}

export interface SharingRow {
  shared: number;
  shared_at: string | null;
  requested_at: string | null;
  declined_at: string | null;
}

export function memberSharing(row: SharingRow | null): MemberSharing {
  if (row?.shared === 1) return { state: "shared", since: row.shared_at, askAgainFrom: null };
  if (row?.requested_at) return { state: "requested", since: row.requested_at, askAgainFrom: null };
  if (row?.declined_at) {
    return { state: "declined", since: row.declined_at, askAgainFrom: addDays(row.declined_at.slice(0, 10), REQUEST_COOLDOWN_DAYS) };
  }
  return { state: "off", since: null, askAgainFrom: null };
}

export function mySharing(row: SharingRow | null): MySharing {
  return {
    shared: row?.shared === 1,
    sharedAt: row?.shared === 1 ? row.shared_at : null,
    requestedAt: row?.shared === 1 ? null : (row?.requested_at ?? null),
  };
}

/** Whether a coach may send a request now, and if not, why. */
export function canRequest(s: MemberSharing, today: string): { ok: true } | { ok: false; error: string } {
  if (s.state === "shared") return { ok: false, error: "They're already sharing with you." };
  if (s.state === "requested") return { ok: false, error: "You've already asked. They'll see it next time they open the app." };
  if (s.state === "declined" && s.askAgainFrom && today < s.askAgainFrom) {
    return { ok: false, error: `They said not now. You can ask again from ${formatShort(s.askAgainFrom)}.` };
  }
  return { ok: true };
}

export function requestMessage(): { title: string; content: string } {
  return {
    title: "Your coach asked to see your progress",
    content:
      "Open Prep Calculator to share your weigh-ins, habits and food totals with your coach, or choose Not now. You can turn it off any time in Settings.",
  };
}
