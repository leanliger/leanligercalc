/**
 * The member's notification bell (src/lib/messages.ts):
 *
 *   GET  /api/notifications?experience=…   what's new for me, with unread counts
 *   POST /api/notifications/seen           I opened the bell
 *
 * Nothing new is stored for it: the list is put together from what's already
 * there (announcements, check-in replies, programs and habits sent, program
 * edits, calories and macros set, milestones, coach nudges) plus the app's own
 * updates, over the last few weeks. "Seen" is one timestamp per member.
 */

import { addDays } from "../src/lib/dates";
import {
  APP_UPDATES,
  NOTIFICATIONS_DAYS,
  NOTIFICATIONS_MAX,
  unreadCount,
  type NotificationItem,
  type NotificationsResponse,
} from "../src/lib/messages";
import { companyOfExperience } from "./messages";
import type { ReminderEnv } from "./reminders";
import type { WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & { DB: D1Database };

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function getNotifications(env: Env, userId: string, experienceId: string | null, now = new Date()): Promise<NotificationsResponse> {
  const companyId = await companyOfExperience(env, experienceId);
  const since = `${addDays(now.toISOString().slice(0, 10), -NOTIFICATIONS_DAYS)}T00:00:00.000Z`;

  const q = (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds);
  const [seen, checkins, assigned, edits, macros, milestones, nudges, tags, announcements, chat] = await env.DB.batch([
    q("SELECT seen_at FROM notification_seen WHERE user_id = ?", userId),
    q("SELECT week_start, reply, replied_at FROM checkins WHERE user_id = ? AND replied_at >= ?", userId, since),
    q(
      `SELECT a.id, a.kind, a.title, a.note, a.created_at FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
        WHERE t.user_id = ? AND a.cancelled_at IS NULL AND a.created_at >= ?`,
      userId,
      since,
    ),
    q("SELECT id, created_at FROM coach_program_edits WHERE member_id = ? AND created_at >= ?", userId, since),
    q("SELECT kcal, protein, carbs, fat, note, set_at FROM coach_macros WHERE user_id = ? AND set_at >= ?", userId, since),
    q("SELECT kind, level, updated_at FROM milestones WHERE user_id = ? AND updated_at >= ?", userId, since),
    q(
      `SELECT s.kind, s.anchor, s.sent_at, r.message FROM coach_nudges_sent s JOIN coach_nudge_rules r ON r.company_id = s.company_id AND r.kind = s.kind
        WHERE s.user_id = ? AND s.sent_at >= ?`,
      userId,
      since,
    ),
    q("SELECT tag_ids FROM member_tags WHERE company_id = ? AND member_id = ?", companyId ?? "", userId),
    // Scheduled announcements show from their send time.
    q(
      `SELECT id, title, body, tag_id, COALESCE(send_at, created_at) AS created_at FROM announcements
        WHERE company_id = ? AND COALESCE(send_at, created_at) >= ? AND COALESCE(send_at, created_at) <= ? ORDER BY 5 DESC LIMIT 30`,
      companyId ?? "",
      since,
      now.toISOString(),
    ),
    q("SELECT COUNT(*) AS n FROM coach_messages WHERE member_id = ? AND company_id = ? AND from_coach = 1 AND pending = 0 AND read_at IS NULL", userId, companyId ?? ""),
  ]);
  const rows = <T>(r: D1Result | undefined) => (r?.results ?? []) as T[];

  let myTags: string[] = [];
  try {
    myTags = JSON.parse(rows<{ tag_ids: string }>(tags)[0]?.tag_ids ?? "[]") as string[];
  } catch {
    myTags = [];
  }

  const items: NotificationItem[] = [];
  for (const a of rows<{ id: string; title: string; body: string; tag_id: string | null; created_at: string }>(announcements)) {
    if (a.tag_id && !myTags.includes(a.tag_id)) continue;
    items.push({ id: `ann-${a.id}`, kind: "announcement", title: a.title, body: clip(a.body, 400), at: a.created_at, target: null });
  }
  for (const c of rows<{ week_start: string; reply: string | null; replied_at: string }>(checkins)) {
    items.push({ id: `reply-${c.week_start}`, kind: "checkin-reply", title: "Your coach replied to your check-in", body: clip(c.reply ?? ""), at: c.replied_at, target: "checkin" });
  }
  for (const a of rows<{ id: string; kind: string; title: string; note: string; created_at: string }>(assigned)) {
    const program = a.kind === "program";
    items.push({
      id: `assign-${a.id}`,
      kind: program ? "program" : "habits",
      title: program ? `New program from your coach: ${a.title}` : `New habits from your coach: ${a.title}`,
      body: clip(a.note || (program ? "Open Training to add it." : "Open Today to add them.")),
      at: a.created_at,
      target: program ? "training" : "today",
    });
  }
  for (const e of rows<{ id: string; created_at: string }>(edits)) {
    items.push({ id: `edit-${e.id}`, kind: "program-edit", title: "Your coach updated your program", body: "The changes are in Training.", at: e.created_at, target: "training" });
  }
  for (const m of rows<{ kcal: number; protein: number; carbs: number; fat: number; note: string; set_at: string }>(macros)) {
    items.push({
      id: `macros-${m.set_at}`,
      kind: "macros",
      title: "Your coach set your calories and macros",
      body: clip(`${m.kcal} kcal · ${m.protein} g protein · ${m.carbs} g carbs · ${m.fat} g fat${m.note ? ` — ${m.note}` : ""}`),
      at: m.set_at,
      target: "macros",
    });
  }
  for (const m of rows<{ kind: string; level: number; updated_at: string }>(milestones)) {
    const weight = m.kind === "weight";
    items.push({
      id: `milestone-${m.kind}-${m.level}`,
      kind: "milestone",
      title: weight ? `Milestone: ${m.level} lb down` : `Milestone: ${m.level} in off your waist`,
      body: "Nice work. It's on your Progress tab.",
      at: m.updated_at,
      target: null,
    });
  }
  for (const n of rows<{ kind: string; anchor: string; sent_at: string; message: string }>(nudges)) {
    items.push({ id: `nudge-${n.kind}-${n.anchor}`, kind: "nudge", title: "From your coach", body: clip(n.message), at: n.sent_at, target: null });
  }
  for (const u of APP_UPDATES) {
    const at = `${u.date}T00:00:00.000Z`;
    if (at >= since) items.push({ id: `update-${u.id}`, kind: "update", title: u.title, body: u.body, at, target: u.target });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const list = items.slice(0, NOTIFICATIONS_MAX);
  const seenAt = rows<{ seen_at: string }>(seen)[0]?.seen_at ?? null;
  return {
    items: list,
    unread: unreadCount(list, seenAt),
    chatUnread: Number(rows<{ n: number }>(chat)[0]?.n ?? 0),
    chat: companyId !== null,
  };
}

export async function markNotificationsSeen(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notification_seen (user_id, seen_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (user_id) DO UPDATE SET seen_at = excluded.seen_at`,
  )
    .bind(userId)
    .run();
}
