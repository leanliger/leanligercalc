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
/** Chat photos: the longest side on the device, and the largest file the Worker takes. */
export const CHAT_PHOTO_MAX_DIMENSION = 1600;
export const CHAT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
/** Chat voice notes. */
export const CHAT_VOICE_MAX_SECONDS = 60;
export const CHAT_VOICE_MAX_BYTES = 3 * 1024 * 1024;
/** Photos and voice notes one person can send a day, across their chats. */
export const CHAT_ATTACHMENTS_PER_DAY = 30;
/** How far ahead a message or announcement can be scheduled. */
export const SCHEDULE_MAX_DAYS = 60;
/** Members one bulk message can go to. */
export const BULK_MAX = 200;

export interface ChatMessage {
  id: string;
  fromCoach: boolean;
  body: string;
  /** ISO time it was sent. */
  at: string;
  /** The other side has opened the chat since. */
  read: boolean;
  /** A photo or voice note with it; fetched separately (never a public URL). */
  attachment?: { kind: "photo" | "voice"; seconds: number | null } | null;
  /** Coach only: written now, delivered at this ISO time. */
  scheduledFor?: string | null;
}

/** One member's thread in the coach's list. */
export interface ChatThread {
  memberId: string;
  last: ChatMessage;
  /** Messages from the member the coach hasn't opened. */
  unread: number;
}

export function validateMessage(raw: unknown, allowEmpty = false): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body && !allowEmpty) return { ok: false, error: "Write a message first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.` };
  return { ok: true, body };
}

/**
 * A time to send something later: an ISO time at least a minute ahead and at
 * most SCHEDULE_MAX_DAYS out. Missing or null = send now.
 */
export function validateSendAt(raw: unknown, now = new Date()): { ok: true; sendAt: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, sendAt: null };
  const t = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(t)) return { ok: false, error: "Pick a date and time to send it." };
  if (t < now.getTime() + 60_000) return { ok: false, error: "Pick a time in the future." };
  if (t > now.getTime() + SCHEDULE_MAX_DAYS * 86_400_000) return { ok: false, error: `Schedule it within ${SCHEDULE_MAX_DAYS} days.` };
  return { ok: true, sendAt: new Date(t).toISOString() };
}

/** "Tue, Oct 28, 9:00 AM" in the viewer's time. */
export const formatSendAt = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/* ------------------------------ saved replies ------------------------------ */

export const SAVED_REPLY_TITLE_MAX = 60;
export const SAVED_REPLIES_MAX = 100;

export interface SavedReply {
  id: string;
  title: string;
  body: string;
}

export function validateSavedReply(raw: unknown): { ok: true; title: string; body: string } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  let title = typeof b.title === "string" ? b.title.trim() : "";
  if (!body) return { ok: false, error: "Write the reply first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.` };
  // No name given: the start of the reply.
  if (!title) {
    const first = body.split("\n")[0]!;
    title = first.length > SAVED_REPLY_TITLE_MAX ? `${first.slice(0, SAVED_REPLY_TITLE_MAX - 1)}…` : first;
  }
  if (title.length > SAVED_REPLY_TITLE_MAX) return { ok: false, error: `Keep the name under ${SAVED_REPLY_TITLE_MAX} characters.` };
  return { ok: true, title, body };
}

/** {first} in a saved reply becomes the member's first name. */
export const fillReply = (body: string, firstName: string) => body.replace(/\{first\}/gi, firstName);

/** The message a one-tap kudos sends. */
export const kudosMessage = (firstName: string, win: string) =>
  `Huge win, ${firstName}: ${win.charAt(0).toLowerCase()}${win.slice(1)}! That comes from showing up day after day. Proud of you, keep it going.`;

/* ------------------------------ announcements ------------------------------ */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Members with this tag only; null = everyone. */
  tagId: string | null;
  at: string;
  /** When it goes out, while it's scheduled for later. */
  scheduledFor?: string | null;
}

export function validateAnnouncement(
  raw: unknown,
  now = new Date(),
): { ok: true; title: string; body: string; tagId: string | null; sendAt: string | null } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  const tagId = typeof b.tagId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(b.tagId) ? b.tagId : null;
  if (!title) return { ok: false, error: "Give it a title." };
  if (title.length > ANNOUNCEMENT_TITLE_MAX) return { ok: false, error: `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters.` };
  if (!body) return { ok: false, error: "Write the announcement." };
  if (body.length > ANNOUNCEMENT_BODY_MAX) return { ok: false, error: `Keep it under ${ANNOUNCEMENT_BODY_MAX} characters.` };
  const when = validateSendAt(b.sendAt, now);
  if (!when.ok) return when;
  return { ok: true, title, body, tagId, sendAt: when.sendAt };
}

/* ------------------------------ notification bell ------------------------------ */

export type NotificationKind =
  | "announcement"
  | "update"
  | "checkin-reply"
  | "program"
  | "habits"
  | "program-edit"
  | "macros"
  | "milestone"
  | "nudge"
  | "comparison-comment";

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
    id: "2026-10-23-sides",
    date: "2026-10-23",
    title: "Left and right reps",
    body: "Single-arm and single-leg exercises now have a Left and a Right box on every set. Right copies Left as you type, and the weaker side is outlined.",
    target: "training",
  },
  {
    id: "2026-10-23-chat-media",
    date: "2026-10-23",
    title: "Photos and voice notes in chat",
    body: "Send your coach a photo or a voice note from the chat. They stay private between you and your coach.",
    target: "chat",
  },
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
