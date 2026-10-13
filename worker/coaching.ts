/**
 * Coaching tools: private notes, weekly check-ins and coach-set macros.
 *
 *   GET    /api/coach/notes?company&member        a coach's private note on a member
 *   PUT    /api/coach/notes  { company, member, note }
 *   GET    /api/coach/checkins?company&member     a member's check-ins (newest first)
 *   POST   /api/coach/checkins/reply  { company, member, weekStart, reply }
 *   GET    /api/coach/macros?company&member       macros the coach set, if any
 *   PUT    /api/coach/macros  { company, member, protein, carbs, fat, note }
 *   DELETE /api/coach/macros?company&member       back to the member's own plan
 *   GET    /api/checkins?date=yyyy-mm-dd          members: my check-ins, and this week's numbers so far
 *   PUT    /api/checkins  { date, answers }       members: send this week's check-in
 *   GET    /api/my-macros                         members: macros my coach set, if any
 *   GET    /api/report                            members: my progress report
 *   GET    /api/coach/report?company&member       a member's progress report (while they share)
 *   POST   /api/coach/report/share  { company, member }  tell the member it's ready
 *   GET    /api/coach/tags?company                the whop's tag list and each member's tags
 *   PUT    /api/coach/tags  { company, tags }     save the tag list
 *   PUT    /api/coach/member-tags  { company, member, tagIds }  one member's tags
 *
 * Coach calls go through coachCheck (an admin of the whop, asking about one of
 * its members). Notes, check-ins and macros don't depend on progress sharing:
 * a check-in is sent to the coach on purpose, and notes and macros are the
 * coach's own.
 */

import { addDays, daysBetween, isValidISODate, todayISO } from "../src/lib/dates";
import { sanitizeHabitDefs, weekStartOf, type HabitEntries } from "../src/lib/habits";
import {
  CHECKIN_DAYS,
  CHECKIN_REPLY_MAX,
  checkinReplyMessage,
  computeCheckinStats,
  validateCheckinAnswers,
  type Checkin,
} from "../src/lib/checkins";
import { coachMacrosMessage, validateCoachMacros, type CoachMacros } from "../src/lib/coach-macros";
import { buildProgressReport, type ReportPhoto } from "../src/lib/progress-report";
import type { Measurement } from "../src/lib/measurements";
import type { Workout } from "../src/lib/training";
import { sendWhop } from "./reminders";
import { coachCheck, experienceOf, isSharingProgress, type SharingEnv, type SharingResult } from "./sharing";
import { accessLevel, hasWhopKey } from "./whop";
import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { DEFAULT_TAGS, sanitizeTags, type MemberTag } from "../src/lib/member-tags";

export const NOTE_MAX = 2000;
const CHECKIN_HISTORY = 26;

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const obj = (raw: unknown) => (typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});

/* ---------------------------------- notes ---------------------------------- */

export async function getCoachNote(env: SharingEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  const row = await env.DB.prepare("SELECT note, updated_at FROM coach_notes WHERE company_id = ? AND member_id = ?")
    .bind(company, c.memberId)
    .first<{ note: string; updated_at: string }>();
  return { ok: true, body: { note: row?.note ?? "", updatedAt: row?.updated_at ?? null } };
}

export async function saveCoachNote(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = obj(raw);
  const note = typeof b.note === "string" ? b.note.slice(0, NOTE_MAX).trim() : "";
  if (note) {
    await env.DB.prepare(
      `INSERT INTO coach_notes (company_id, member_id, note, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (company_id, member_id) DO UPDATE SET note = excluded.note, updated_by = excluded.updated_by, updated_at = ${NOW_SQL}`,
    )
      .bind(b.company, c.memberId, note, viewerId)
      .run();
  } else {
    await env.DB.prepare("DELETE FROM coach_notes WHERE company_id = ? AND member_id = ?").bind(b.company, c.memberId).run();
  }
  return { ok: true, body: { note, updatedAt: note ? new Date().toISOString() : null } };
}

/* -------------------------------- check-ins -------------------------------- */

interface CheckinRow {
  week_start: string;
  answers: string;
  stats: string;
  submitted_at: string;
  reply: string | null;
  replied_at: string | null;
  reply_audio: string | null;
  reply_audio_seconds: number | null;
}

function toCheckin(r: CheckinRow): Checkin | null {
  try {
    return {
      weekStart: r.week_start,
      submittedAt: r.submitted_at,
      answers: JSON.parse(r.answers) as Checkin["answers"],
      stats: JSON.parse(r.stats) as Checkin["stats"],
      reply: r.reply,
      repliedAt: r.replied_at,
      replyAudio: r.reply_audio ? { seconds: r.reply_audio_seconds ?? 0 } : null,
    };
  } catch {
    return null;
  }
}

async function checkinsOf(env: SharingEnv, userId: string): Promise<Checkin[]> {
  const { results } = await env.DB.prepare(
    "SELECT week_start, answers, stats, submitted_at, reply, replied_at, reply_audio, reply_audio_seconds FROM checkins WHERE user_id = ? ORDER BY week_start DESC LIMIT ?",
  )
    .bind(userId, CHECKIN_HISTORY)
    .all<CheckinRow>();
  return results.map(toCheckin).filter((x): x is Checkin => x !== null);
}

/** The member's numbers for the 7 days ending `to`, from their logs. */
async function statsFor(env: SharingEnv, userId: string, to: string) {
  const from = addDays(to, -(CHECKIN_DAYS * 2 - 1)); // the week before too, for the weight change
  // The calendar week (for the habit scorecard) always starts within these 7 days.
  const habitFrom = addDays(to, -(CHECKIN_DAYS - 1));
  const [weighIns, habits, plan, workouts, food, photos] = await env.DB.batch([
    env.DB.prepare("SELECT date, weight_lb FROM weigh_ins WHERE user_id = ? AND date >= ? AND date <= ?").bind(userId, from, to),
    env.DB.prepare("SELECT date, entries FROM habit_logs WHERE user_id = ? AND date >= ? AND date <= ?").bind(userId, habitFrom, to),
    env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId),
    env.DB.prepare(
      "SELECT date, json_extract(data, '$.finishedAt') IS NOT NULL AS finished FROM workouts WHERE user_id = ? AND date >= ? AND date <= ?",
    ).bind(userId, addDays(to, -(CHECKIN_DAYS - 1)), to),
    env.DB.prepare("SELECT date, entries FROM food_logs WHERE user_id = ? AND date >= ? AND date <= ?").bind(userId, addDays(to, -(CHECKIN_DAYS - 1)), to),
    env.DB.prepare("SELECT date FROM progress_photos WHERE user_id = ? AND date >= ? AND date <= ?").bind(userId, addDays(to, -(CHECKIN_DAYS - 1)), to),
  ]);
  const parse = <T>(s: string, fallback: T): T => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return fallback;
    }
  };
  const planRow = (plan?.results?.[0] ?? null) as { state: string } | null;
  const state = planRow ? parse<{ tracking?: { habits?: unknown } } | null>(planRow.state, null) : null;
  return computeCheckinStats(
    {
      weighIns: ((weighIns?.results ?? []) as { date: string; weight_lb: number }[]).map((w) => ({ date: w.date, weightLb: w.weight_lb })),
      habitLogs: ((habits?.results ?? []) as { date: string; entries: string }[]).map((h) => ({ date: h.date, entries: parse<HabitEntries>(h.entries, {}) })),
      habits: sanitizeHabitDefs(state?.tracking?.habits),
      workouts: ((workouts?.results ?? []) as { date: string; finished: number }[]).map((w) => ({ date: w.date, finished: w.finished === 1 })),
      foodDays: ((food?.results ?? []) as { date: string; entries: string }[]).map((f) => {
        const entries = parse<{ kcal?: number; protein?: number }[]>(f.entries, []);
        return {
          date: f.date,
          kcal: entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0),
          protein: entries.reduce((s, e) => s + (Number(e.protein) || 0), 0),
        };
      }),
      photoDates: ((photos?.results ?? []) as { date: string }[]).map((p) => p.date),
    },
    to,
  );
}

/** The member's local date must be about today (time zones put it a day either side). */
function checkinDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !isValidISODate(raw)) return null;
  return Math.abs(daysBetween(todayISO(), raw)) <= 1 ? raw : null;
}

export async function getMyCheckins(env: SharingEnv, userId: string, dateRaw: string | null): Promise<SharingResult> {
  const date = checkinDate(dateRaw);
  const checkins = await checkinsOf(env, userId);
  return { ok: true, body: { checkins, preview: date ? await statsFor(env, userId, date) : null } };
}

export async function submitCheckin(env: SharingEnv, userId: string, raw: unknown): Promise<SharingResult> {
  const b = obj(raw);
  const date = checkinDate(b.date);
  if (!date) return { ok: false, status: 422, error: "Your phone's date looks off. Check it and try again." };
  const answers = validateCheckinAnswers(b.answers);
  if (!answers.ok) return { ok: false, status: 422, error: answers.error };
  const weekStart = weekStartOf(date);
  const existing = await env.DB.prepare("SELECT reply FROM checkins WHERE user_id = ? AND week_start = ?")
    .bind(userId, weekStart)
    .first<{ reply: string | null }>();
  if (existing?.reply) return { ok: false, status: 409, error: "Your coach already replied to this week's check-in." };
  const stats = await statsFor(env, userId, date);
  await env.DB.prepare(
    `INSERT INTO checkins (user_id, week_start, answers, stats) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, week_start) DO UPDATE SET answers = excluded.answers, stats = excluded.stats, submitted_at = ${NOW_SQL}`,
  )
    .bind(userId, weekStart, JSON.stringify(answers.value), JSON.stringify(stats))
    .run();
  return { ok: true, body: { checkins: await checkinsOf(env, userId) } };
}

export async function coachCheckins(env: SharingEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  return { ok: true, body: { checkins: await checkinsOf(env, c.memberId) } };
}

export async function replyToCheckin(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = obj(raw);
  const weekStart = typeof b.weekStart === "string" && isValidISODate(b.weekStart) ? b.weekStart : null;
  const reply = typeof b.reply === "string" ? b.reply.trim().slice(0, CHECKIN_REPLY_MAX) : "";
  if (!weekStart) return { ok: false, status: 422, error: "Bad request." };
  if (!reply) return { ok: false, status: 422, error: "Write a reply first." };
  // (A voice reply sets reply to '' so the check-in counts as answered; text can follow.)
  const res = await env.DB.prepare(
    `UPDATE checkins SET reply = ?, replied_by = ?, replied_at = ${NOW_SQL} WHERE user_id = ? AND week_start = ?`,
  )
    .bind(reply, viewerId, c.memberId, weekStart)
    .run();
  if (!res.meta.changes) return { ok: false, status: 404, error: "That check-in isn't there any more." };

  let notified = false;
  const exp = await experienceOf(env, c.memberId);
  if (exp) {
    const sent = await sendWhop(env, exp, c.memberId, checkinReplyMessage());
    notified = sent.ok;
    if (!sent.ok) console.error("check-in reply notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { checkins: await checkinsOf(env, c.memberId), notified } };
}

/* --------------------------------- macros --------------------------------- */

interface MacroRow {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string;
  set_at: string;
}

const toMacros = (r: MacroRow | null): CoachMacros | null =>
  r ? { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, note: r.note, setAt: r.set_at } : null;

async function macrosOf(env: SharingEnv, userId: string): Promise<CoachMacros | null> {
  return toMacros(
    await env.DB.prepare("SELECT kcal, protein, carbs, fat, note, set_at FROM coach_macros WHERE user_id = ?").bind(userId).first<MacroRow>(),
  );
}

export async function getMyMacros(env: SharingEnv, userId: string): Promise<SharingResult> {
  return { ok: true, body: { macros: await macrosOf(env, userId) } };
}

export async function coachGetMacros(env: SharingEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  return { ok: true, body: { macros: await macrosOf(env, c.memberId) } };
}

export async function coachSetMacros(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const v = validateCoachMacros(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  await env.DB.prepare(
    `INSERT INTO coach_macros (user_id, company_id, kcal, protein, carbs, fat, note, set_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET company_id = excluded.company_id, kcal = excluded.kcal, protein = excluded.protein,
       carbs = excluded.carbs, fat = excluded.fat, note = excluded.note, set_by = excluded.set_by, set_at = ${NOW_SQL}`,
  )
    .bind(c.memberId, obj(raw).company, v.value.kcal, v.value.protein, v.value.carbs, v.value.fat, v.value.note, viewerId)
    .run();
  let notified = false;
  const exp = await experienceOf(env, c.memberId);
  if (exp) {
    const sent = await sendWhop(env, exp, c.memberId, coachMacrosMessage(v.value));
    notified = sent.ok;
    if (!sent.ok) console.error("macros notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { macros: await macrosOf(env, c.memberId), notified } };
}

export async function coachClearMacros(env: SharingEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  await env.DB.prepare("DELETE FROM coach_macros WHERE user_id = ?").bind(c.memberId).run();
  return { ok: true, body: { macros: null } };
}

/* ----------------------------- progress report ----------------------------- */

const REPORT_WORKOUTS = 1000;

/** A member's report from their whole history. Photos only when `withPhotos`. */
async function reportOf(env: SharingEnv, userId: string, withPhotos: boolean) {
  const [weighIns, measurements, workouts, photos, checkins, plan] = await env.DB.batch([
    env.DB.prepare("SELECT date, weight_lb FROM weigh_ins WHERE user_id = ? ORDER BY date").bind(userId),
    env.DB.prepare("SELECT date, waist, hips, chest, arms, thighs FROM measurements WHERE user_id = ? ORDER BY date").bind(userId),
    env.DB.prepare("SELECT id, data FROM workouts WHERE user_id = ? ORDER BY date DESC LIMIT ?").bind(userId, REPORT_WORKOUTS),
    env.DB.prepare("SELECT id, date, pose FROM progress_photos WHERE user_id = ? ORDER BY date").bind(userId),
    env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?").bind(userId),
    env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId),
  ]);
  const parsed: Workout[] = [];
  for (const r of (workouts?.results ?? []) as { id: string; data: string }[]) {
    try {
      parsed.push({ ...(JSON.parse(r.data) as Workout), id: r.id });
    } catch {
      /* skip a corrupt row */
    }
  }
  let goalLb: number | null = null;
  try {
    const state = JSON.parse(((plan?.results?.[0] ?? null) as { state: string } | null)?.state ?? "null") as {
      fatLoss?: { goalType?: unknown; targetWeight?: unknown };
    } | null;
    if (state?.fatLoss?.goalType === "weight" && typeof state.fatLoss.targetWeight === "number") goalLb = state.fatLoss.targetWeight;
  } catch {
    goalLb = null;
  }
  return buildProgressReport({
    weighIns: ((weighIns?.results ?? []) as { date: string; weight_lb: number }[]).map((w) => ({ date: w.date, weightLb: w.weight_lb })),
    measurements: (measurements?.results ?? []) as Measurement[],
    workouts: parsed,
    photos: withPhotos ? ((photos?.results ?? []) as ReportPhoto[]) : null,
    checkins: ((checkins?.results?.[0] ?? null) as { n: number } | null)?.n ?? 0,
    goalLb,
  });
}

export async function getMyReport(env: SharingEnv, userId: string): Promise<SharingResult> {
  return { ok: true, body: { report: await reportOf(env, userId, true) } };
}

export async function coachReport(env: SharingEnv, viewerId: string, company: string, member: string): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, { company, member });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) {
    return { ok: false, status: 403, error: "This member isn't sharing their progress with you right now." };
  }
  // Photos only if they also share their photos with you.
  const photoRow = await env.DB.prepare("SELECT share_with_coach FROM photo_settings WHERE user_id = ?").bind(c.memberId).first<{ share_with_coach: number }>();
  const report = await reportOf(env, c.memberId, photoRow?.share_with_coach === 1 && Boolean((env as { PHOTOS?: unknown }).PHOTOS));
  return { ok: true, body: { report } };
}

export async function shareReport(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const exp = await experienceOf(env, c.memberId);
  if (!exp) return { ok: false, status: 409, error: "They haven't opened the app in your whop yet, so there's nowhere to notify them." };
  const sent = await sendWhop(env, exp, c.memberId, {
    title: "Your coach shared your progress report",
    content: "See how far you've come: open Lean Stature System → Progress → Check-in → My progress report.",
  });
  if (!sent.ok) return { ok: false, status: 502, error: "Whop didn't send the notification. Try again in a moment." };
  return { ok: true, body: { notified: true } };
}

/* ---------------------------------- tags ---------------------------------- */

async function adminOf(env: SharingEnv, viewerId: string, company: unknown): Promise<SharingResult | null> {
  if (typeof company !== "string" || !COMPANY_ID_PATTERN.test(company)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, company);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  return null;
}

/** The whop's tag list (the defaults until a coach changes it). */
export async function tagsOf(env: SharingEnv, company: string): Promise<MemberTag[]> {
  const row = await env.DB.prepare("SELECT tags FROM coach_tags WHERE company_id = ?").bind(company).first<{ tags: string }>();
  if (!row) return DEFAULT_TAGS;
  try {
    return sanitizeTags(JSON.parse(row.tags)) ?? DEFAULT_TAGS;
  } catch {
    return DEFAULT_TAGS;
  }
}

/** Each member's tag ids, keeping only tags that still exist. */
export async function memberTagsOf(env: SharingEnv, company: string, tags: MemberTag[]): Promise<Record<string, string[]>> {
  const known = new Set(tags.map((t) => t.id));
  const { results } = await env.DB.prepare("SELECT member_id, tag_ids FROM member_tags WHERE company_id = ?").bind(company).all<{ member_id: string; tag_ids: string }>();
  const out: Record<string, string[]> = {};
  for (const r of results) {
    try {
      const ids = (JSON.parse(r.tag_ids) as unknown[]).filter((x): x is string => typeof x === "string" && known.has(x));
      if (ids.length > 0) out[r.member_id] = ids;
    } catch {
      /* skip a corrupt row */
    }
  }
  return out;
}

export async function getTags(env: SharingEnv, viewerId: string, company: string): Promise<SharingResult> {
  const denied = await adminOf(env, viewerId, company);
  if (denied) return denied;
  const tags = await tagsOf(env, company);
  return { ok: true, body: { tags, members: await memberTagsOf(env, company, tags) } };
}

export async function saveTags(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const b = obj(raw);
  const denied = await adminOf(env, viewerId, b.company);
  if (denied) return denied;
  const tags = sanitizeTags(b.tags);
  if (!tags) return { ok: false, status: 422, error: "Expected a list of tags." };
  await env.DB.prepare(
    `INSERT INTO coach_tags (company_id, tags) VALUES (?, ?)
     ON CONFLICT (company_id) DO UPDATE SET tags = excluded.tags, updated_at = ${NOW_SQL}`,
  )
    .bind(b.company, JSON.stringify(tags))
    .run();
  return { ok: true, body: { tags, members: await memberTagsOf(env, b.company as string, tags) } };
}

export async function setMemberTags(env: SharingEnv, viewerId: string, raw: unknown): Promise<SharingResult> {
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = obj(raw);
  const company = b.company as string;
  const known = new Set((await tagsOf(env, company)).map((t) => t.id));
  const ids = Array.isArray(b.tagIds) ? [...new Set(b.tagIds.filter((x): x is string => typeof x === "string" && known.has(x)))] : [];
  if (ids.length > 0) {
    await env.DB.prepare(
      `INSERT INTO member_tags (company_id, member_id, tag_ids) VALUES (?, ?, ?)
       ON CONFLICT (company_id, member_id) DO UPDATE SET tag_ids = excluded.tag_ids`,
    )
      .bind(company, c.memberId, JSON.stringify(ids))
      .run();
  } else {
    await env.DB.prepare("DELETE FROM member_tags WHERE company_id = ? AND member_id = ?").bind(company, c.memberId).run();
  }
  return { ok: true, body: { tagIds: ids } };
}
