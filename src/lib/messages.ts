/**
 * Coach–member chat, announcements, the member's notification bell and the
 * coach's daily digest: the shapes the Worker and the app share, and the
 * checks on what people type. See worker/messages.ts, worker/notifications.ts
 * and worker/digest.ts.
 */

import { FLAG_LABELS, type MemberSummary } from "./coach";

export const MESSAGE_MAX = 2000;
export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 1000;
/** How often an open chat asks for new messages. */
export const CHAT_POLL_MS = 10_000;
/** How often the app checks the bell and the chat icon while it's open. */
export const BELL_POLL_MS = 120_000;
/** A message doesn't notify again while the other side has an unread one from this long ago. */
export const NOTIFY_QUIET_MIN = 10;

export interface ChatMessage {
  id: string;
  fromCoach: boolean;
  body: string;
  /** ISO time it was sent. */
  at: string;
  /** The other side has opened the chat since. */
  read: boolean;
}

/** One member's thread in the coach's list. */
export interface ChatThread {
  memberId: string;
  last: ChatMessage;
  /** Messages from the member the coach hasn't opened. */
  unread: number;
}

export function validateMessage(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.` };
  return { ok: true, body };
}

/* ------------------------------ announcements ------------------------------ */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Members with this tag only; null = everyone. */
  tagId: string | null;
  at: string;
}

export function validateAnnouncement(raw: unknown): { ok: true; title: string; body: string; tagId: string | null } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  const tagId = typeof b.tagId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(b.tagId) ? b.tagId : null;
  if (!title) return { ok: false, error: "Give it a title." };
  if (title.length > ANNOUNCEMENT_TITLE_MAX) return { ok: false, error: `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters.` };
  if (!body) return { ok: false, error: "Write the announcement." };
  if (body.length > ANNOUNCEMENT_BODY_MAX) return { ok: false, error: `Keep it under ${ANNOUNCEMENT_BODY_MAX} characters.` };
  return { ok: true, title, body, tagId };
}

/* ------------------------------ notification bell ------------------------------ */

export type NotificationKind = "announcement" | "update" | "checkin-reply" | "program" | "habits" | "program-edit" | "macros" | "milestone" | "nudge";

/** Where tapping one takes the member. */
export type NotificationTarget = "today" | "checkin" | "training" | "macros" | "chat" | null;

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  target: NotificationTarget;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  /** Items newer than the last time they opened the bell. */
  unread: number;
  /** Coach messages they haven't read. */
  chatUnread: number;
  /** A coach is reachable from this community (it belongs to a whop we could look up). */
  chat: boolean;
}

/**
 * App updates for the bell, newest first. Add one when something members
 * would notice ships; it shows to everyone once.
 */
export const APP_UPDATES: readonly { id: string; date: string; title: string; body: string; target: NotificationTarget }[] = [
  {
    id: "2026-10-23-chat",
    date: "2026-10-23",
    title: "Message your coach",
    body: "Tap the chat icon at the top to message your coach directly. Replies show up here and as a Whop notification.",
    target: "chat",
  },
  {
    id: "2026-10-22-trends",
    date: "2026-10-22",
    title: "Strength trends by muscle",
    body: "Training now groups your lifts by muscle, with a bigger chart for each exercise and your best set at every rep count.",
    target: "training",
  },
];

/** Most items shown in the bell. */
export const NOTIFICATIONS_MAX = 40;
/** How far back the bell looks. */
export const NOTIFICATIONS_DAYS = 45;

export const unreadCount = (items: readonly NotificationItem[], seenAt: string | null) => items.filter((i) => !seenAt || i.at > seenAt).length;

/* ------------------------------ coach digest ------------------------------ */

/** Local hour the digest goes out, in the coach's time zone. */
export const DIGEST_HOUR = 8;

/**
 * The digest a coach gets in the morning, or null when nothing needs them.
 * Mirrors the Today lanes: check-ins to reply to, members to reach out to,
 * wins, and unread chat messages.
 */
export function digestMessage(members: readonly MemberSummary[], unreadChats: number): { title: string; content: string } | null {
  const reply = members.filter((m) => m.flags.includes("reply"));
  const risk = members.filter((m) => m.flags.some((f) => f !== "reply"));
  const wins = members.filter((m) => (m.data.milestones ?? []).length > 0);
  const slipping = members.filter((m) => m.flags.includes("slipping"));
  if (reply.length + risk.length + wins.length + unreadChats === 0) return null;

  const names = (list: readonly MemberSummary[], n = 3) => {
    const first = list.slice(0, n).map((m) => m.displayName.split(" ")[0]);
    return list.length > n ? `${first.join(", ")} +${list.length - n}` : first.join(", ");
  };
  const parts: string[] = [];
  if (reply.length) parts.push(`${reply.length} check-in${reply.length === 1 ? "" : "s"} to reply to (${names(reply)})`);
  if (unreadChats) parts.push(`${unreadChats} unread message${unreadChats === 1 ? "" : "s"}`);
  if (risk.length) {
    const top = risk[0]!;
    const why = FLAG_LABELS[top.flags.find((f) => f !== "reply")!].toLowerCase();
    parts.push(`${risk.length} to reach out to (${names(risk)}; ${top.displayName.split(" ")[0]}: ${why})`);
  }
  if (slipping.length) parts.push(`${slipping.length} with a slipping lift`);
  if (wins.length) parts.push(`${wins.length} win${wins.length === 1 ? "" : "s"} to celebrate (${names(wins)})`);
  // People, not list entries: someone waiting on a reply and at risk counts once.
  const need = new Set([...reply, ...risk].map((m) => m.data.userId)).size;
  return {
    title:
      need > 0
        ? `Your coaching day: ${need} member${need === 1 ? " needs" : "s need"} you`
        : unreadChats > 0
          ? `Your coaching day: ${unreadChats} unread message${unreadChats === 1 ? "" : "s"}`
          : "Your coaching day: wins to celebrate",
    content: parts.join(" · ").slice(0, 480),
  };
}
