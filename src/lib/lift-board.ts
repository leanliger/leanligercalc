/**
 * The lift leaderboard: verified squat, bench press and deadlift singles,
 * ranked by strength relative to bodyweight (weight lifted ÷ bodyweight).
 *
 * A member submits a one-rep lift with a link to a video of it. It stays
 * private (the member and the community's admins) until an admin approves it;
 * only then does it appear on that community's board, video included. Each
 * member's best approved lift per exercise counts. Members can withdraw any
 * submission, and admins can reject or later remove one.
 *
 * Weights are stored in pounds, like everything else. Shared by the browser
 * and the Worker (worker/lift-board.ts).
 */

import { EXPERIENCE_ID_PATTERN } from "./fasting";
import { addDays } from "./dates";
import { isValidVideoUrl } from "./training";
import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";

export const LIFTS = ["squat", "bench", "deadlift"] as const;
export type Lift = (typeof LIFTS)[number];

export const LIFT_LABELS: Record<Lift, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
};

/** What a lift needs to show to be approved. */
export const LIFT_RULES: Record<Lift, string[]> = {
  squat: ["Hip crease below the top of the knee", "Stand all the way back up"],
  bench: ["Bar touches the chest", "Press to full lockout, hips stay on the bench"],
  deadlift: ["One pull from the floor", "Finish standing tall, hips and knees locked"],
};

export const VIDEO_RULES = [
  "One rep, filmed from start to finish",
  "Your whole body in frame, from the side or at an angle",
  "The weight (plates or numbers) visible in the video",
];

export const REJECT_REASONS = [
  "Depth or range of motion not met",
  "Video doesn't show the whole lift",
  "Can't see the weight on the bar",
  "Video link doesn't open",
];

export const LIFT_LIMITS_LB = { min: 20, max: 1200 } as const;
export const BODYWEIGHT_LIMITS_LB = { min: 70, max: 700 } as const;
/** A lift older than this can't be submitted. */
export const MAX_LIFT_AGE_DAYS = 365;
export const LIFT_NOTE_MAX = 200;
export const REVIEW_NOTE_MAX = 200;
/** Submissions kept per member, per lift, per community. */
export const MAX_SUBMISSIONS_PER_LIFT = 30;
/** Entries shown per lift (your own row is always included). */
export const LIFT_BOARD_MAX = 100;
export const SUBMISSION_ID_PATTERN = /^[0-9a-f]{32}$/;

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface LiftSubmissionInput {
  experienceId: string;
  lift: Lift;
  weightLb: number;
  bodyweightLb: number;
  /** The day the lift was done. */
  liftedOn: string;
  videoUrl: string;
  note: string;
}

/** One of your own submissions. */
export interface MySubmission {
  id: string;
  lift: Lift;
  weightLb: number;
  bodyweightLb: number;
  ratio: number;
  liftedOn: string;
  videoUrl: string;
  note: string;
  status: SubmissionStatus;
  reviewNote: string | null;
  createdAt: string;
}

/** A submission waiting for an admin. */
export interface PendingSubmission extends MySubmission {
  name: string;
  avatarUrl: string | null;
}

/** A row on the public board. Bodyweight itself isn't sent. */
export interface LiftBoardEntry {
  /** Admins only: the submission, so they can remove it. */
  id?: string;
  rank: number;
  name: string;
  avatarUrl: string | null;
  isYou: boolean;
  weightLb: number;
  ratio: number;
  liftedOn: string;
  videoUrl: string;
}

export interface LiftBoardResponse {
  boards: Record<Lift, LiftBoardEntry[]>;
  mine: MySubmission[];
  isAdmin: boolean;
  /** Admins only. */
  pending: PendingSubmission[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Weight lifted ÷ bodyweight, to two decimals. */
export function strengthRatio(weightLb: number, bodyweightLb: number): number {
  return bodyweightLb > 0 ? round2(weightLb / bodyweightLb) : 0;
}

export function isLift(v: unknown): v is Lift {
  return typeof v === "string" && (LIFTS as readonly string[]).includes(v);
}

/** Validate an untrusted submission. */
export function validateSubmission(raw: unknown, now: Date = new Date()): ValidationResult<LiftSubmissionInput> {
  const bad = (error: string): ValidationResult<LiftSubmissionInput> => ({ ok: false, error });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad("Expected a lift submission.");
  const b = raw as Record<string, unknown>;

  if (typeof b.experienceId !== "string" || !EXPERIENCE_ID_PATTERN.test(b.experienceId)) {
    return bad("Open the app from your Whop community to submit a lift.");
  }
  if (!isLift(b.lift)) return bad("Pick squat, bench press or deadlift.");
  const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (!num(b.weightLb, LIFT_LIMITS_LB.min, LIFT_LIMITS_LB.max)) {
    return bad(`Weight lifted must be ${LIFT_LIMITS_LB.min}–${LIFT_LIMITS_LB.max} lb.`);
  }
  if (!num(b.bodyweightLb, BODYWEIGHT_LIMITS_LB.min, BODYWEIGHT_LIMITS_LB.max)) {
    return bad(`Bodyweight must be ${BODYWEIGHT_LIMITS_LB.min}–${BODYWEIGHT_LIMITS_LB.max} lb.`);
  }
  const liftedOn = b.liftedOn;
  if (typeof liftedOn !== "string" || !isAcceptableWeighInDate(liftedOn, now)) {
    return bad("The date must be a real day, not in the future.");
  }
  const today = now.toISOString().slice(0, 10);
  if (liftedOn < addDays(today, -MAX_LIFT_AGE_DAYS)) return bad("Lifts from the last 12 months only.");
  const videoUrl = typeof b.videoUrl === "string" ? b.videoUrl.trim() : "";
  if (!isValidVideoUrl(videoUrl)) return bad("Add a link to your video, starting with https://");
  const note = b.note ?? "";
  if (typeof note !== "string" || note.length > LIFT_NOTE_MAX) return bad(`Notes must be ${LIFT_NOTE_MAX} characters or fewer.`);

  return {
    ok: true,
    value: {
      experienceId: b.experienceId,
      lift: b.lift,
      weightLb: round2(b.weightLb as number),
      bodyweightLb: round2(b.bodyweightLb as number),
      liftedOn,
      videoUrl,
      note: note.replace(/\s+/g, " ").trim(),
    },
  };
}

export interface ReviewInput {
  decision: "approve" | "reject";
  note: string | null;
}

export function validateReview(raw: unknown): ValidationResult<ReviewInput> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (b.decision !== "approve" && b.decision !== "reject") return { ok: false, error: "Approve or reject." };
  const note = b.note ?? null;
  if (note !== null && (typeof note !== "string" || note.length > REVIEW_NOTE_MAX)) {
    return { ok: false, error: `The reason must be ${REVIEW_NOTE_MAX} characters or fewer.` };
  }
  const clean = typeof note === "string" ? note.replace(/\s+/g, " ").trim() : "";
  return { ok: true, value: { decision: b.decision, note: clean || null } };
}

export interface ApprovedLift {
  id: string;
  userId: string;
  lift: Lift;
  weightLb: number;
  ratio: number;
  liftedOn: string;
  videoUrl: string;
  createdAt: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The board for one lift: each member's best approved lift (highest ratio;
 * ties go to the heavier lift, then the earlier one), ranked. Equal ratios
 * share a rank.
 */
export function rankLifts(rows: readonly ApprovedLift[], lift: Lift, viewerId: string): (LiftBoardEntry & { userId: string })[] {
  const best = new Map<string, ApprovedLift>();
  for (const r of rows) {
    if (r.lift !== lift) continue;
    const prev = best.get(r.userId);
    const better =
      !prev ||
      r.ratio > prev.ratio ||
      (r.ratio === prev.ratio && (r.weightLb > prev.weightLb || (r.weightLb === prev.weightLb && r.createdAt < prev.createdAt)));
    if (better) best.set(r.userId, r);
  }
  const sorted = [...best.values()].sort(
    (a, b) => b.ratio - a.ratio || b.weightLb - a.weightLb || (a.createdAt < b.createdAt ? -1 : 1),
  );
  let rank = 0;
  let prevRatio = Number.NaN;
  return sorted.map((r, i) => {
    if (r.ratio !== prevRatio) rank = i + 1;
    prevRatio = r.ratio;
    return {
      id: r.id,
      userId: r.userId,
      rank,
      name: r.name,
      avatarUrl: r.avatarUrl,
      isYou: r.userId === viewerId,
      weightLb: r.weightLb,
      ratio: r.ratio,
      liftedOn: r.liftedOn,
      videoUrl: r.videoUrl,
    };
  });
}

/** Where a video link goes, for display ("youtube.com"). */
export function videoHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return "video";
  }
}

/** "1.85× BW" */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}× BW`;
}
