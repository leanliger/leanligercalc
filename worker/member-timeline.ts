/**
 * A member's timeline for the coach:
 * GET /api/coach/member-timeline?company=…&member=…&unit=lb|kg&days=90
 *
 * Weigh-ins (a line a week, plus notes), check-ins and the coach's replies,
 * the coach's notes, programs and habits sent, program edits, macros set,
 * milestones, measurements, finished workouts and, when the member shares
 * them, progress photo days. Built by src/lib/member-timeline.ts. Same
 * checks as the other member routes: the viewer is an admin of the company,
 * the member belongs to it and shares their progress.
 */

import { addDays } from "../src/lib/dates";
import { buildTimeline, TIMELINE_DAYS, TIMELINE_MAX_DAYS, type TimelineRows } from "../src/lib/member-timeline";
import type { MilestoneKind } from "../src/lib/milestones";
import type { NudgeKind } from "../src/lib/nudges";
import { doneSets, setVolume, type Workout } from "../src/lib/training";
import { coachCheck, isSharingProgress, type SharingEnv } from "./sharing";

type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const json = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export async function coachMemberTimeline(
  env: SharingEnv,
  viewerId: string,
  companyId: string,
  memberId: string,
  unitRaw: string,
  daysRaw: string,
  now = new Date(),
): Promise<Result> {
  const c = await coachCheck(env, viewerId, { company: companyId, member: memberId });
  if ("error" in c) return c.error;
  if (!(await isSharingProgress(env, c.memberId))) {
    return { ok: false, status: 403, error: "This member isn't sharing their progress with you." };
  }
  const unit = unitRaw === "kg" ? "kg" : "lb";
  const days = Math.min(Math.max(Number.parseInt(daysRaw, 10) || TIMELINE_DAYS, 7), TIMELINE_MAX_DAYS);
  const today = now.toISOString().slice(0, 10);
  const since = addDays(today, -days);
  // A week earlier for weigh-ins, so the first week's change has something to compare with.
  const weighFrom = addDays(since, -14);
  const m = c.memberId;
  const db = env.DB;

  const [weighIns, checkins, note, assignments, edits, macros, milestones, photoShare, photos, measurements, workouts, nudges, messages, reminders] = await Promise.all([
    db.prepare("SELECT date, weight_lb, note FROM weigh_ins WHERE user_id = ? AND date >= ? ORDER BY date").bind(m, weighFrom).all<{ date: string; weight_lb: number; note: string | null }>(),
    db
      .prepare(
        "SELECT week_start, submitted_at, answers, reply, replied_at, reply_audio_seconds FROM checkins WHERE user_id = ? AND (submitted_at >= ? OR replied_at >= ?)",
      )
      .bind(m, since, since)
      .all<{ week_start: string; submitted_at: string; answers: string; reply: string | null; replied_at: string | null; reply_audio_seconds: number | null }>(),
    db.prepare("SELECT note, updated_at FROM coach_notes WHERE company_id = ? AND member_id = ?").bind(companyId, m).first<{ note: string; updated_at: string }>(),
    db
      .prepare(
        `SELECT a.kind, a.title, a.created_at, a.cancelled_at, t.status, t.responded_at
           FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
          WHERE a.company_id = ? AND t.user_id = ? AND a.created_at >= ?`,
      )
      .bind(companyId, m, since)
      .all<{ kind: string; title: string; created_at: string; cancelled_at: string | null; status: string; responded_at: string | null }>(),
    db
      .prepare("SELECT created_at, applied_at FROM coach_program_edits WHERE company_id = ? AND member_id = ? AND created_at >= ?")
      .bind(companyId, m, since)
      .all<{ created_at: string; applied_at: string | null }>(),
    db.prepare("SELECT kcal, protein, carbs, fat, set_at FROM coach_macros WHERE user_id = ? AND company_id = ?").bind(m, companyId).first<{
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      set_at: string;
    }>(),
    db.prepare("SELECT kind, level, reached_on FROM milestones WHERE user_id = ? AND reached_on >= ?").bind(m, since).all<{ kind: MilestoneKind; level: number; reached_on: string }>(),
    db.prepare("SELECT share_with_coach FROM photo_settings WHERE user_id = ?").bind(m).first<{ share_with_coach: number }>(),
    db.prepare("SELECT date, pose FROM progress_photos WHERE user_id = ? AND date >= ?").bind(m, since).all<{ date: string; pose: string }>(),
    db
      .prepare("SELECT date, waist, hips, chest, arms, thighs FROM measurements WHERE user_id = ? AND date >= ? ORDER BY date")
      .bind(m, addDays(since, -120))
      .all<{ date: string; waist: number | null; hips: number | null; chest: number | null; arms: number | null; thighs: number | null }>(),
    db.prepare("SELECT date, data FROM workouts WHERE user_id = ? AND date >= ?").bind(m, since).all<{ date: string; data: string }>(),
    db
      .prepare(
        `SELECT s.kind, s.sent_at, r.message FROM coach_nudges_sent s
           LEFT JOIN coach_nudge_rules r ON r.company_id = s.company_id AND r.kind = s.kind
          WHERE s.company_id = ? AND s.user_id = ? AND s.sent_at >= ?`,
      )
      .bind(companyId, m, since)
      .all<{ kind: NudgeKind; sent_at: string; message: string | null }>(),
    db
      .prepare("SELECT from_coach, body, created_at, attachment FROM coach_messages WHERE company_id = ? AND member_id = ? AND pending = 0 AND created_at >= ?")
      .bind(companyId, m, since)
      .all<{ from_coach: number; body: string; created_at: string; attachment: string | null }>(),
    db
      .prepare("SELECT kind, sent_at FROM coach_reminders WHERE company_id = ? AND member_id = ? AND sent_at >= ?")
      .bind(companyId, m, since)
      .all<{ kind: string; sent_at: string }>(),
  ]);

  const rows: TimelineRows = {
    weighIns: weighIns.results.map((r) => ({ date: r.date, weightLb: r.weight_lb, note: r.note })),
    checkins: checkins.results.map((r) => ({
      weekStart: r.week_start,
      submittedAt: r.submitted_at,
      answers: json(r.answers, {}),
      reply: r.reply,
      repliedAt: r.replied_at,
      voiceSeconds: r.reply_audio_seconds,
    })),
    note: note ? { text: note.note, updatedAt: note.updated_at } : null,
    assignments: assignments.results.map((r) => ({
      kind: r.kind,
      title: r.title,
      createdAt: r.created_at,
      status: r.status,
      respondedAt: r.responded_at,
      cancelledAt: r.cancelled_at,
    })),
    programEdits: edits.results.map((r) => ({ createdAt: r.created_at, appliedAt: r.applied_at })),
    nudges: nudges.results.map((r) => ({ kind: r.kind, message: r.message, sentAt: r.sent_at })),
    reminders: reminders.results.map((r) => ({ kind: r.kind, sentAt: r.sent_at })),
    messages: messages.results.map((r) => ({
      fromCoach: r.from_coach === 1,
      body: r.body,
      at: r.created_at,
      attachment: r.attachment === "photo" || r.attachment === "voice" ? r.attachment : null,
    })),
    macros: macros ? { kcal: macros.kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat, setAt: macros.set_at } : null,
    milestones: milestones.results.map((r) => ({ kind: r.kind, level: r.level, reachedOn: r.reached_on })),
    photos: photoShare?.share_with_coach === 1 ? photos.results : null,
    measurements: measurements.results,
    workouts: workouts.results.flatMap((r) => {
      const w = json<Workout | null>(r.data, null);
      if (!w || !Array.isArray(w.exercises) || w.finishedAt == null) return [];
      const sets = w.exercises.flatMap(doneSets);
      return [{ date: r.date, finishedAt: w.finishedAt, name: w.name || "Workout", sets: sets.length, volumeLb: sets.reduce((s, x) => s + setVolume(x), 0) }];
    }),
  };

  return { ok: true, body: { since, days, events: buildTimeline(rows, since, unit) } };
}
