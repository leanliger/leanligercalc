/**
 * On-demand reminders (src/lib/coach-reminders.ts):
 *
 *   GET  /api/coach/reminders?company=…   coaches: reminders sent in the last week
 *   POST /api/coach/reminders             coaches: send one { company, members, kind }
 *
 * Only to people Whop lists as current members of the whop. The same
 * reminder waits 12 hours per member, and a member gets at most 4 a day, so a
 * busy dashboard can't flood anyone. One member gets it by first name; a
 * group gets the same words, one Whop request per community.
 */

import {
  REMINDERS_PER_DAY,
  REMINDER_COOLDOWN_HOURS,
  isReminderKind,
  reminderText,
} from "../src/lib/coach-reminders";
import { MEMBER_ID_PATTERN } from "../src/lib/program-edits";
import { companyMembers } from "./coach";
import { adminCheck, notifyMany } from "./messages";
import type { PhotoEnv } from "./photos";
import { sendWhop, type ReminderEnv } from "./reminders";
import { experienceOf } from "./sharing";
import type { WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & PhotoEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const RECENT_DAYS = 7;
const MAX_MEMBERS = 200;
const ID_CHUNK = 45;

async function recent(env: Env, companyId: string) {
  const { results } = await env.DB.prepare(
    `SELECT member_id, kind, sent_at FROM coach_reminders WHERE company_id = ? AND sent_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${RECENT_DAYS} days') ORDER BY sent_at DESC`,
  )
    .bind(companyId)
    .all<{ member_id: string; kind: string; sent_at: string }>();
  return results.map((r) => ({ memberId: r.member_id, kind: r.kind, sentAt: r.sent_at }));
}

export async function getReminders(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  return { ok: true, body: { reminders: await recent(env, companyId) } };
}

export async function sendReminder(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  if (!isReminderKind(b.kind)) return { ok: false, status: 422, error: "Pick a reminder." };
  const kind = b.kind;
  const asked = Array.isArray(b.members) ? [...new Set(b.members.filter((x): x is string => typeof x === "string" && MEMBER_ID_PATTERN.test(x)))] : [];
  if (asked.length === 0 || asked.length > MAX_MEMBERS) return { ok: false, status: 422, error: `Pick between 1 and ${MAX_MEMBERS} members.` };

  const listed = await companyMembers(env, companyId);
  if (!listed.ok) return { ok: false, status: 502, error: "Couldn't get your member list from Whop. Try again in a moment." };
  const current = asked.filter((id) => listed.profiles.has(id));

  // Who's had this one lately, and how many they've had today.
  const blocked = new Map<string, string>();
  for (let i = 0; i < current.length; i += ID_CHUNK) {
    const chunk = current.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT member_id,
              SUM(CASE WHEN kind = ? AND sent_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${REMINDER_COOLDOWN_HOURS} hours') THEN 1 ELSE 0 END) AS same,
              SUM(CASE WHEN sent_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') THEN 1 ELSE 0 END) AS today
         FROM coach_reminders WHERE member_id IN (${marks}) GROUP BY member_id`,
    )
      .bind(kind, ...chunk)
      .all<{ member_id: string; same: number; today: number }>();
    for (const r of results) {
      if (r.same > 0) blocked.set(r.member_id, `already sent in the last ${REMINDER_COOLDOWN_HOURS} hours`);
      else if (r.today >= REMINDERS_PER_DAY) blocked.set(r.member_id, `${REMINDERS_PER_DAY} reminders already today`);
    }
  }
  const sendTo = current.filter((id) => !blocked.has(id));
  if (sendTo.length > 0) {
    for (let i = 0; i < sendTo.length; i += 40) {
      await env.DB.batch(
        sendTo
          .slice(i, i + 40)
          .map((m) =>
            env.DB.prepare("INSERT INTO coach_reminders (id, company_id, member_id, kind, sent_by) VALUES (?, ?, ?, ?, ?)").bind(
              crypto.randomUUID().replace(/-/g, ""),
              companyId,
              m,
              kind,
              viewerId,
            ),
          ),
      );
    }
  }

  let notified = 0;
  if (sendTo.length === 1) {
    const id = sendTo[0]!;
    const first = (listed.profiles.get(id)?.name ?? "").trim().split(/\s+/)[0] ?? "";
    const exp = await experienceOf(env, id);
    if (exp) {
      const r = await sendWhop(env, exp, id, reminderText(kind, first));
      if (r.ok) notified = 1;
      else console.error("coach reminder failed", { status: r.status, reason: r.reason });
    }
  } else if (sendTo.length > 1) {
    // The same words for everyone: no name.
    const t = reminderText(kind, "");
    notified = await notifyMany(env, sendTo, { title: t.title, content: t.content.replace(/^Hey, /, "").replace(/^./, (c) => c.toUpperCase()) });
  }

  const skipped = [
    ...asked.filter((id) => !listed.profiles.has(id)).map((id) => ({ memberId: id, reason: "not a current member" })),
    ...[...blocked].map(([memberId, reason]) => ({ memberId, reason })),
  ];
  return { ok: true, body: { sent: sendTo.length, notified, skipped, reminders: await recent(env, companyId) } };
}
