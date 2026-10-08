/**
 * Form checks: a member films a set of any exercise, sends the link with a
 * question, and a coach (an admin of their Whop community) replies with
 * feedback. The member gets a Whop notification when it's answered.
 *
 * Private: only the member and their community's admins ever see a request or
 * the feedback — nothing appears to other members. The app stores the video
 * link, never the video. Shared by the browser and the Worker
 * (worker/form-checks.ts).
 */

import { EXPERIENCE_ID_PATTERN } from "./fasting";
import { isValidVideoUrl } from "./training";
import type { ValidationResult } from "./tracking";

export const QUESTION_MAX = 300;
export const FEEDBACK_MAX = 1000;
export const EXERCISE_NAME_MAX = 60;
/** Requests a member can have waiting at once, per community. */
export const MAX_PENDING_FORM_CHECKS = 3;
/** Requests kept per member, per community (answered ones included). */
export const MAX_FORM_CHECKS = 100;
export const FORM_CHECK_ID_PATTERN = /^[0-9a-f]{32}$/;
const EXERCISE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** What to film, shown on the request form. */
export const FILMING_TIPS = [
  "One full working set, start to finish",
  "From the side or at a 45° angle, whole body in frame",
  "Upload it (YouTube unlisted, Instagram, Google Drive…) and paste the link",
];

/** One-tap starters for the coach's reply. */
export const FEEDBACK_STARTERS = [
  "Looks solid. Keep it up and add weight when the reps feel easy.",
  "Good set. One thing to fix: ",
  "Lower the weight a little and focus on: ",
];

export type FormCheckStatus = "pending" | "reviewed";

export interface FormCheckInput {
  experienceId: string;
  exerciseId: string;
  /** The exercise's name when sent, so it reads right even if it's later deleted. */
  exerciseName: string;
  videoUrl: string;
  question: string;
}

/** One of your own requests. */
export interface FormCheck {
  id: string;
  exerciseId: string;
  exerciseName: string;
  videoUrl: string;
  question: string;
  status: FormCheckStatus;
  feedback: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** A request waiting for a coach. */
export interface PendingFormCheck extends FormCheck {
  name: string;
  avatarUrl: string | null;
}

export interface FormChecksResponse {
  mine: FormCheck[];
  isAdmin: boolean;
  /** Admins only: requests waiting for feedback, oldest first. */
  pending: PendingFormCheck[];
}

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** Validate an untrusted request. */
export function validateFormCheck(raw: unknown): ValidationResult<FormCheckInput> {
  const bad = (error: string): ValidationResult<FormCheckInput> => ({ ok: false, error });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad("Expected a form check request.");
  const b = raw as Record<string, unknown>;
  if (typeof b.experienceId !== "string" || !EXPERIENCE_ID_PATTERN.test(b.experienceId)) {
    return bad("Open the app from your Whop community to ask for a form check.");
  }
  if (typeof b.exerciseId !== "string" || !EXERCISE_ID_PATTERN.test(b.exerciseId)) return bad("Pick an exercise.");
  const name = typeof b.exerciseName === "string" ? b.exerciseName.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > EXERCISE_NAME_MAX) return bad("Pick an exercise.");
  const videoUrl = typeof b.videoUrl === "string" ? b.videoUrl.trim() : "";
  if (!isValidVideoUrl(videoUrl)) return bad("Add a link to your video, starting with https://");
  const question = b.question ?? "";
  if (typeof question !== "string" || question.length > QUESTION_MAX) {
    return bad(`Keep your question to ${QUESTION_MAX} characters or fewer.`);
  }
  return {
    ok: true,
    value: { experienceId: b.experienceId, exerciseId: b.exerciseId, exerciseName: name, videoUrl, question: tidy(question) },
  };
}

/** Validate a coach's reply. */
export function validateFeedback(raw: unknown): ValidationResult<{ feedback: string }> {
  const f = (typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).feedback : undefined) ?? "";
  if (typeof f !== "string") return { ok: false, error: "Write some feedback." };
  const feedback = tidy(f);
  if (!feedback) return { ok: false, error: "Write some feedback." };
  if (feedback.length > FEEDBACK_MAX) return { ok: false, error: `Keep feedback to ${FEEDBACK_MAX} characters or fewer.` };
  return { ok: true, value: { feedback } };
}

/** The notification a member gets when their form check is answered. */
export function feedbackMessage(exerciseName: string, feedback: string): { title: string; content: string } {
  const flat = feedback.replace(/\s+/g, " ");
  return {
    title: `Coach feedback: ${exerciseName}`,
    content: flat.length > 180 ? `${flat.slice(0, 179).trimEnd()}… (open Training to read it all)` : flat,
  };
}
