/**
 * Lift leaderboard (see src/lib/lift-board.ts).
 *
 *   GET    /api/lift-board?experience=exp_…              the boards, my submissions (+ the review queue for admins)
 *   POST   /api/lift-board/submissions                    submit a lift { experienceId, lift, weightLb, … }
 *   DELETE /api/lift-board/submissions/:id                withdraw one of mine
 *   PUT    /api/lift-board/submissions/:id/review         admins: { decision: "approve" | "reject", note }
 *
 * Every call checks the member's access to the community with Whop. Only
 * admins of the submission's community can review it. Other members only ever
 * see approved lifts, and never the bodyweight a member entered.
 */

import {
  LIFT_BOARD_MAX,
  LIFT_LABELS,
  LIFTS,
  MAX_SUBMISSIONS_PER_LIFT,
  rankLifts,
  strengthRatio,
  validateReview,
  validateSubmission,
  type ApprovedLift,
  type Lift,
  type LiftBoardEntry,
  type LiftBoardResponse,
  type MySubmission,
  type PendingSubmission,
  type SubmissionStatus,
} from "../src/lib/lift-board";
import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import { fromLb } from "../src/lib/units";
import { sendWhop } from "./reminders";
import { accessLevel, hasWhopKey, whopGet, type WhopEnv } from "./whop";

export interface LiftBoardEnv extends WhopEnv {
  DB: D1Database;
}

export type LiftBoardResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const NAME_MAX = 60;
const MAX_APPROVED_ROWS = 5000;

interface Row {
  id: string;
  experience_id: string;
  user_id: string;
  lift: Lift;
  weight_lb: number;
  bodyweight_lb: number;
  ratio: number;
  lifted_on: string;
  video_url: string;
  note: string;
  status: SubmissionStatus;
  review_note: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

const displayName = (r: Pick<Row, "name" | "username">) => r.name ?? (r.username ? `@${r.username}` : "Member");

const toMine = (r: Row): MySubmission => ({
  id: r.id,
  lift: r.lift,
  weightLb: r.weight_lb,
  bodyweightLb: r.bodyweight_lb,
  ratio: r.ratio,
  liftedOn: r.lifted_on,
  videoUrl: r.video_url,
  note: r.note,
  status: r.status,
  reviewNote: r.review_note,
  createdAt: r.created_at,
});

const toApproved = (r: Row): ApprovedLift => ({
  id: r.id,
  userId: r.user_id,
  lift: r.lift,
  weightLb: r.weight_lb,
  ratio: r.ratio,
  liftedOn: r.lifted_on,
  videoUrl: r.video_url,
  createdAt: r.created_at,
  name: displayName(r),
  avatarUrl: r.avatar_url,
});

/** The viewer's access to the community, or the error to return. */
async function access(
  env: LiftBoardEnv,
  userId: string,
  experienceId: string,
): Promise<{ level: "admin" | "customer" } | { error: LiftBoardResult }> {
  if (!EXPERIENCE_ID_PATTERN.test(experienceId)) {
    return { error: { ok: false, status: 422, error: "Open the app from your Whop community to see the lift leaderboard." } };
  }
  if (!hasWhopKey(env)) return { error: { ok: false, status: 503, error: "The leaderboard isn't switched on for this app yet." } };
  const level = await accessLevel(env, userId, experienceId);
  if (level === null) return { error: { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." } };
  if (level === "no_access") return { error: { ok: false, status: 403, error: "You don't have access to this community." } };
  return { level };
}

async function approvedRows(env: LiftBoardEnv, experienceId: string, lift?: Lift): Promise<Row[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM lift_submissions WHERE experience_id = ? AND status = 'approved'${lift ? " AND lift = ?" : ""} LIMIT ?`,
  )
    .bind(...(lift ? [experienceId, lift, MAX_APPROVED_ROWS] : [experienceId, MAX_APPROVED_ROWS]))
    .all<Row>();
  return results;
}

/* ---------------------------------- read ---------------------------------- */

export async function getLiftBoard(env: LiftBoardEnv, userId: string, experienceId: string): Promise<LiftBoardResult> {
  const a = await access(env, userId, experienceId);
  if ("error" in a) return a.error;
  const isAdmin = a.level === "admin";

  const [approved, mine, pending] = await env.DB.batch<Row>([
    env.DB.prepare("SELECT * FROM lift_submissions WHERE experience_id = ? AND status = 'approved' LIMIT ?").bind(
      experienceId,
      MAX_APPROVED_ROWS,
    ),
    env.DB.prepare("SELECT * FROM lift_submissions WHERE experience_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100").bind(
      experienceId,
      userId,
    ),
    env.DB.prepare("SELECT * FROM lift_submissions WHERE experience_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 100").bind(
      experienceId,
    ),
  ]);

  const rows = (approved?.results ?? []).map(toApproved);
  const boards = {} as Record<Lift, LiftBoardEntry[]>;
  for (const lift of LIFTS) {
    const ranked = rankLifts(rows, lift, userId);
    const top = ranked.slice(0, LIFT_BOARD_MAX);
    const you = ranked.find((e) => e.isYou);
    if (you && !top.includes(you)) top.push(you);
    // Never send user ids; submission ids only to admins (to remove an entry).
    boards[lift] = top.map(({ userId: _u, id, ...e }) => (isAdmin ? { ...e, id } : e));
  }

  const body: LiftBoardResponse = {
    boards,
    mine: (mine?.results ?? []).map(toMine),
    isAdmin,
    pending: isAdmin
      ? (pending?.results ?? []).map((r): PendingSubmission => ({ ...toMine(r), name: displayName(r), avatarUrl: r.avatar_url }))
      : [],
  };
  return { ok: true, body };
}

/* --------------------------------- submit --------------------------------- */

export async function submitLift(env: LiftBoardEnv, userId: string, raw: unknown): Promise<LiftBoardResult> {
  const v = validateSubmission(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const s = v.value;
  const a = await access(env, userId, s.experienceId);
  if ("error" in a) return a.error;

  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM lift_submissions WHERE user_id = ? AND experience_id = ? AND lift = ?`,
  )
    .bind(userId, s.experienceId, s.lift)
    .first<{ n: number; pending: number | null }>();
  if (counts?.pending) {
    return { ok: false, status: 409, error: `Your ${LIFT_LABELS[s.lift].toLowerCase()} is already waiting for review. Withdraw it to send a different one.` };
  }
  if (counts && counts.n >= MAX_SUBMISSIONS_PER_LIFT) {
    return { ok: false, status: 409, error: `You've reached ${MAX_SUBMISSIONS_PER_LIFT} ${LIFT_LABELS[s.lift].toLowerCase()} submissions. Withdraw an old one first.` };
  }

  // Their public Whop profile, so the board shows the name and photo they use in the community.
  const profile = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`);
  const p = (profile.status === 200 ? profile.body : null) as
    | { name?: string | null; username?: string | null; profile_picture?: { url?: string } | null }
    | null;
  const clip = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, NAME_MAX) : null);
  const avatar = typeof p?.profile_picture?.url === "string" && /^https:\/\//.test(p.profile_picture.url) ? p.profile_picture.url : null;

  const id = crypto.randomUUID().replace(/-/g, "");
  const ratio = strengthRatio(s.weightLb, s.bodyweightLb);
  await env.DB.prepare(
    `INSERT INTO lift_submissions
       (id, experience_id, user_id, lift, weight_lb, bodyweight_lb, ratio, lifted_on, video_url, note, name, username, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, s.experienceId, userId, s.lift, s.weightLb, s.bodyweightLb, ratio, s.liftedOn, s.videoUrl, s.note, clip(p?.name), clip(p?.username), avatar)
    .run();
  const row = await env.DB.prepare("SELECT * FROM lift_submissions WHERE id = ?").bind(id).first<Row>();
  return { ok: true, body: { submission: row ? toMine(row) : null } };
}

export async function withdrawLift(env: LiftBoardEnv, userId: string, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM lift_submissions WHERE id = ? AND user_id = ?").bind(id, userId).run();
}

/* --------------------------------- review --------------------------------- */

/** The member's weight unit, from their plan, for the notification text. */
async function unitOf(env: LiftBoardEnv, userId: string): Promise<"lb" | "kg"> {
  const row = await env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(userId).first<{ state: string }>();
  try {
    return (JSON.parse(row?.state ?? "{}") as { unit?: string }).unit === "kg" ? "kg" : "lb";
  } catch {
    return "lb";
  }
}

export async function reviewLift(env: LiftBoardEnv, viewerId: string, id: string, raw: unknown): Promise<LiftBoardResult> {
  const v = validateReview(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const row = await env.DB.prepare("SELECT * FROM lift_submissions WHERE id = ?").bind(id).first<Row>();
  if (!row) return { ok: false, status: 404, error: "That submission no longer exists." };

  const a = await access(env, viewerId, row.experience_id);
  if ("error" in a) return a.error;
  if (a.level !== "admin") return { ok: false, status: 403, error: "Only coaches can review lifts." };

  const status: SubmissionStatus = v.value.decision === "approve" ? "approved" : "rejected";
  const wasApproved = row.status === "approved";
  await env.DB.prepare(
    `UPDATE lift_submissions
     SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
  )
    .bind(status, status === "rejected" ? v.value.note : null, viewerId, id)
    .run();

  // Let the member know, if notifications are on and something changed.
  let notified = false;
  if (status !== row.status && hasWhopKey(env)) {
    const label = LIFT_LABELS[row.lift];
    const unit = await unitOf(env, row.user_id);
    const weight = `${Math.round(fromLb(row.weight_lb, unit) * 10) / 10} ${unit}`;
    let msg: { title: string; content: string };
    if (status === "approved") {
      const board = rankLifts((await approvedRows(env, row.experience_id, row.lift)).map(toApproved), row.lift, row.user_id);
      const you = board.find((e) => e.isYou);
      const counts = you?.id === row.id;
      msg = {
        title: `Your ${label.toLowerCase()} was approved`,
        content: counts
          ? `${weight} at ${row.ratio.toFixed(2)}× bodyweight — you're #${you!.rank} on the ${label.toLowerCase()} leaderboard.`
          : `${weight} at ${row.ratio.toFixed(2)}× bodyweight. Your best ${label.toLowerCase()} is still the one on the leaderboard.`,
      };
    } else {
      msg = {
        title: wasApproved ? `Your ${label.toLowerCase()} was removed from the leaderboard` : `Your ${label.toLowerCase()} video wasn't approved`,
        content: v.value.note ?? "Check the lift rules and send it again.",
      };
    }
    const sent = await sendWhop(env, row.experience_id, row.user_id, msg);
    notified = sent.ok;
    if (!sent.ok) console.error("lift review notification failed", { status: sent.status, reason: sent.reason });
  }
  return { ok: true, body: { status, notified } };
}
