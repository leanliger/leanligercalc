/**
 * Accountability checks (src/lib/accountability.ts; tables from migration 0040):
 *
 *   GET  /api/accountability                       member: my open check (or the one I just answered)
 *   POST /api/accountability/:id                   member: answer it { answer, note } or pick for a busy week { choice }
 *
 *   GET  /api/coach/accountability?company=…       coach: settings and the last 45 days of checks
 *   PUT  /api/coach/accountability                 coach: { company, enabled, mode, triggers, question, timeZone }
 *   GET  /api/coach/accountability/preview?company=…  coach: who'd get one now, and why (nothing sent)
 *   POST /api/coach/accountability/send            coach: send now { company, members }
 *   POST /api/coach/accountability/approve         coach: send or skip waiting ones { company, ids, skip }
 *
 * Every hour (the cron, during the coach's daytime) each whop with checks on
 * finds members whose numbers say they're slipping and who haven't had one
 * in CHECK_EVERY_DAYS (and aren't paused): sent straight away, or queued for
 * a coach to approve. "Struggling" and "Need help" become a chat message from
 * the member and a Whop notification to the whop's team; a week's pause from
 * a busy week too.
 */

import {
  ANSWER_LABEL,
  CHECK_EVERY_DAYS,
  CHOICE_LABEL,
  DEFAULT_SETTINGS,
  NOTE_MAX,
  OPEN_DAYS,
  SEND_HOURS,
  checkReasons,
  sanitizeSettings,
  type AccountabilityCheck,
  type AccountabilitySettings,
  type Answer,
  type Choice,
} from "../src/lib/accountability";
import { summarizeMember, type CoachOverview } from "../src/lib/coach";
import { isValidTimeZone, localClock } from "../src/lib/fasting";
import { MEMBER_ID_PATTERN } from "../src/lib/program-edits";
import { coachOverview, type CoachEnv } from "./coach";
import { adminCheck, memberName } from "./messages";
import { sendWhop, sendWhopTeam, type ReminderEnv } from "./reminders";
import { experienceOf } from "./sharing";

type Env = CoachEnv & ReminderEnv & Parameters<typeof adminCheck>[0];
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const CHECK_ID_PATTERN = /^[a-f0-9]{32}$/;
/** Checks one whop's hourly run may queue or send. */
const PER_RUN = 30;
const newId = () => crypto.randomUUID().replace(/-/g, "");
const iso = (d: Date) => d.toISOString();

interface CheckRow {
  id: string;
  company_id: string;
  member_id: string;
  status: string;
  triggers: string;
  question: string;
  created_at: string;
  sent_at: string | null;
  answer: string | null;
  note: string | null;
  choice: string | null;
  answered_at: string | null;
}

export function rowToCheck(r: Omit<CheckRow, "company_id" | "question">): AccountabilityCheck {
  let triggers: string[] = [];
  try {
    triggers = (JSON.parse(r.triggers) as unknown[]).filter((t): t is string => typeof t === "string");
  } catch {
    triggers = [];
  }
  return {
    id: r.id,
    memberId: r.member_id,
    status: r.status as AccountabilityCheck["status"],
    triggers,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    answer: (r.answer as Answer | null) ?? null,
    note: r.note,
    choice: (r.choice as Choice | null) ?? null,
    answeredAt: r.answered_at,
  };
}

async function settingsOf(env: Env, companyId: string): Promise<(AccountabilitySettings & { coachId: string; timeZone: string }) | null> {
  const r = await env.DB.prepare("SELECT enabled, mode, triggers, question, coach_id, time_zone FROM accountability_settings WHERE company_id = ?")
    .bind(companyId)
    .first<{ enabled: number; mode: string; triggers: string; question: string; coach_id: string; time_zone: string }>();
  if (!r) return null;
  let triggers: unknown = [];
  try {
    triggers = JSON.parse(r.triggers);
  } catch {
    triggers = [];
  }
  const s = sanitizeSettings({ enabled: r.enabled === 1, mode: r.mode, triggers, question: r.question }) ?? DEFAULT_SETTINGS;
  return { ...s, coachId: r.coach_id, timeZone: r.time_zone };
}

/** Members whose numbers say they're slipping, as the coach sees them, and why. */
async function candidates(env: Env, coachId: string, companyId: string, settings: AccountabilitySettings, now: Date): Promise<{ ok: true; list: { memberId: string; reasons: string[] }[]; members: Set<string> } | { ok: false; error: Result }> {
  const overview = await coachOverview(env, coachId, companyId, now);
  if (!overview.ok) return { ok: false, error: { ok: false, status: overview.status, error: overview.error } };
  const body = overview.body as CoachOverview;
  const today = now.toISOString().slice(0, 10);
  const since = iso(new Date(now.getTime() - CHECK_EVERY_DAYS * 86_400_000));
  const { results } = await env.DB.prepare("SELECT DISTINCT member_id FROM accountability_checks WHERE company_id = ? AND created_at >= ?")
    .bind(companyId, since)
    .all<{ member_id: string }>();
  const recent = new Set(results.map((r) => r.member_id));
  const list: { memberId: string; reasons: string[] }[] = [];
  for (const m of body.members) {
    if (m.sharing.state !== "shared" || recent.has(m.userId)) continue;
    const s = summarizeMember(m, today);
    if (s.paused) continue;
    const reasons = checkReasons(s, settings.triggers);
    if (reasons.length) list.push({ memberId: m.userId, reasons });
  }
  return { ok: true, list, members: new Set(body.members.map((m) => m.userId)) };
}

/** Tell the member a check is waiting (it shows on their Today either way). */
async function notifyMember(env: Env, memberId: string, question: string): Promise<void> {
  const exp = await experienceOf(env, memberId);
  if (!exp) return;
  const res = await sendWhop(env, exp, memberId, { title: "Quick check-in from your coach", content: `${question} One tap in the app.` });
  if (!res.ok) console.error("accountability check notification failed", { status: res.status, reason: res.reason });
}

async function create(env: Env, companyId: string, memberId: string, reasons: string[], question: string, send: boolean, now: Date): Promise<void> {
  await env.DB.prepare("INSERT INTO accountability_checks (id, company_id, member_id, status, triggers, question, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), companyId, memberId, send ? "sent" : "pending", JSON.stringify(reasons), question, send ? iso(now) : null)
    .run();
  if (send) await notifyMember(env, memberId, question);
}

/* ---------------------------------- coach ---------------------------------- */

export async function coachAccountability(env: Env, viewerId: string, companyId: string, now = new Date()): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const s = await settingsOf(env, companyId);
  const { results } = await env.DB.prepare(
    "SELECT id, member_id, status, triggers, created_at, sent_at, answer, note, choice, answered_at FROM accountability_checks WHERE company_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 300",
  )
    .bind(companyId, iso(new Date(now.getTime() - 45 * 86_400_000)))
    .all<Omit<CheckRow, "company_id" | "question">>();
  const settings: AccountabilitySettings = s ? { enabled: s.enabled, mode: s.mode, triggers: s.triggers, question: s.question } : DEFAULT_SETTINGS;
  return { ok: true, body: { settings, checks: results.map(rowToCheck) } };
}

export async function saveAccountability(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const s = sanitizeSettings(b);
  if (!s || !isValidTimeZone(b.timeZone)) return { ok: false, status: 422, error: "Bad request." };
  await env.DB.prepare(
    `INSERT INTO accountability_settings (company_id, enabled, mode, triggers, question, coach_id, time_zone) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (company_id) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode, triggers = excluded.triggers,
       question = excluded.question, coach_id = excluded.coach_id, time_zone = excluded.time_zone, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(companyId, s.enabled ? 1 : 0, s.mode, JSON.stringify(s.triggers), s.question, viewerId, b.timeZone)
    .run();
  return coachAccountability(env, viewerId, companyId);
}

export async function previewAccountability(env: Env, viewerId: string, companyId: string, now = new Date()): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const s = (await settingsOf(env, companyId)) ?? DEFAULT_SETTINGS;
  const c = await candidates(env, viewerId, companyId, s, now);
  if (!c.ok) return c.error;
  return { ok: true, body: { candidates: c.list } };
}

export async function sendAccountabilityNow(env: Env, viewerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const ids = Array.isArray(b.members) ? [...new Set(b.members.filter((x): x is string => typeof x === "string" && MEMBER_ID_PATTERN.test(x)))].slice(0, 200) : [];
  if (ids.length === 0) return { ok: false, status: 422, error: "Pick someone to send it to." };
  const s = (await settingsOf(env, companyId)) ?? DEFAULT_SETTINGS;
  const c = await candidates(env, viewerId, companyId, s, now);
  if (!c.ok) return c.error;
  const why = new Map(c.list.map((x) => [x.memberId, x.reasons]));
  let sent = 0;
  for (const id of ids) {
    // Only members of this whop; anyone not slipping right now gets it as the coach's own.
    if (!c.members.has(id)) continue;
    await create(env, companyId, id, why.get(id) ?? ["Sent by your coach"], s.question, true, now);
    sent++;
  }
  return { ok: true, body: { sent } };
}

export async function approveAccountability(env: Env, viewerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && CHECK_ID_PATTERN.test(x)).slice(0, 200) : [];
  let done = 0;
  for (const id of ids) {
    const row = await env.DB.prepare("SELECT member_id, question FROM accountability_checks WHERE id = ? AND company_id = ? AND status = 'pending'")
      .bind(id, companyId)
      .first<{ member_id: string; question: string }>();
    if (!row) continue;
    if (b.skip === true) {
      await env.DB.prepare("UPDATE accountability_checks SET status = 'skipped' WHERE id = ?").bind(id).run();
    } else {
      await env.DB.prepare("UPDATE accountability_checks SET status = 'sent', sent_at = ? WHERE id = ?").bind(iso(now), id).run();
      await notifyMember(env, row.member_id, row.question);
    }
    done++;
  }
  return { ok: true, body: { done } };
}

/* --------------------------------- members --------------------------------- */

export async function myCheck(env: Env, userId: string, now = new Date()): Promise<Result> {
  const r = await env.DB.prepare(
    `SELECT id, question, answer, choice, sent_at FROM accountability_checks
     WHERE member_id = ? AND status IN ('sent', 'answered') AND sent_at >= ? ORDER BY sent_at DESC LIMIT 1`,
  )
    .bind(userId, iso(new Date(now.getTime() - OPEN_DAYS * 86_400_000)))
    .first<{ id: string; question: string; answer: string | null; choice: string | null; sent_at: string }>();
  return { ok: true, body: { check: r ? { id: r.id, question: r.question, answer: r.answer, choice: r.choice, sentAt: r.sent_at } : null } };
}

export async function answerCheck(env: Env, userId: string, id: string, raw: unknown, now = new Date()): Promise<Result> {
  if (!CHECK_ID_PATTERN.test(id)) return { ok: false, status: 404, error: "Not found." };
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const row = await env.DB.prepare("SELECT company_id, status, answer, choice FROM accountability_checks WHERE id = ? AND member_id = ?")
    .bind(id, userId)
    .first<{ company_id: string; status: string; answer: string | null; choice: string | null }>();
  if (!row || (row.status !== "sent" && row.status !== "answered")) return { ok: false, status: 404, error: "That check isn't open any more." };

  // Something for the coach to see in their Inbox, with a Whop notification to the whop's team.
  const tellCoach = async (title: (name: string) => string, body: string) => {
    await env.DB.prepare("INSERT INTO coach_messages (id, company_id, member_id, from_coach, sender_id, body) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(newId(), row.company_id, userId, userId, body)
      .run();
    const name = await memberName(env, userId);
    const sent = await sendWhopTeam(env, row.company_id, null, { title: title(name), content: body.length > 140 ? `${body.slice(0, 137)}…` : body });
    if (!sent.ok) console.error("accountability alert to coach failed", { status: sent.status, reason: sent.reason });
  };

  if (b.answer !== undefined) {
    if (row.answer) return { ok: false, status: 409, error: "You've already answered this one." };
    if (typeof b.answer !== "string" || !(b.answer in ANSWER_LABEL)) return { ok: false, status: 422, error: "Pick an answer." };
    const answer = b.answer as Answer;
    const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, NOTE_MAX) : null;
    await env.DB.prepare("UPDATE accountability_checks SET status = 'answered', answer = ?, note = ?, answered_at = ? WHERE id = ?")
      .bind(answer, note, iso(now), id)
      .run();
    if (answer === "help" || answer === "struggling") {
      await tellCoach(
        (name) => (answer === "help" ? `${name} asked for help` : `${name} is struggling this week`),
        `From my check-in: ${ANSWER_LABEL[answer]}${note ? `. ${note}` : "."}`,
      );
    }
    return { ok: true, body: { answer } };
  }

  if (b.choice !== undefined) {
    if (row.answer !== "busy") return { ok: false, status: 409, error: "Answer the check first." };
    if (row.choice) return { ok: false, status: 409, error: "You've already picked." };
    if (typeof b.choice !== "string" || !(b.choice in CHOICE_LABEL)) return { ok: false, status: 422, error: "Pick one." };
    const choice = b.choice as Choice;
    await env.DB.prepare("UPDATE accountability_checks SET choice = ? WHERE id = ?").bind(choice, id).run();
    if (choice === "pause") await tellCoach((name) => `${name} paused their plan for a week`, "From my check-in: busy week, so I've paused my plan for a week.");
    return { ok: true, body: { choice } };
  }
  return { ok: false, status: 422, error: "Bad request." };
}

/* ---------------------------------- hourly ---------------------------------- */

/** Each whop with checks on, during its coach's daytime: send or queue checks for members slipping. */
export async function runAccountability(env: Env, now: Date): Promise<{ whops: number; queued: number; sent: number }> {
  const { results } = await env.DB.prepare("SELECT company_id FROM accountability_settings WHERE enabled = 1").all<{ company_id: string }>();
  let queued = 0;
  let sent = 0;
  let whops = 0;
  for (const { company_id: companyId } of results) {
    try {
      const s = await settingsOf(env, companyId);
      if (!s?.enabled) continue;
      const hour = Math.floor(localClock(now, s.timeZone).minute / 60);
      if (hour < SEND_HOURS.from || hour >= SEND_HOURS.to) continue;
      const c = await candidates(env, s.coachId, companyId, s, now);
      if (!c.ok) {
        console.error("accountability run skipped", { status: c.error.ok ? 0 : c.error.status });
        continue;
      }
      whops++;
      for (const x of c.list.slice(0, PER_RUN)) {
        await create(env, companyId, x.memberId, x.reasons, s.question, s.mode === "auto", now);
        if (s.mode === "auto") sent++;
        else queued++;
      }
    } catch (e) {
      console.error("accountability run failed", e instanceof Error ? e.message : String(e));
    }
  }
  return { whops, queued, sent };
}
