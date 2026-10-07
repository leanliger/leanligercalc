/**
 * Progress photos — optional, private by default.
 *
 * Photos are resized and re-saved as JPEG on the member's device before upload
 * (which also strips location and other metadata), then kept in private
 * Cloudflare R2 storage. Only the member can see them, and their coach only if
 * the member switches on "Share photos with my coach". They never appear on
 * the leaderboard or go to any other service.
 *
 * Shared by the browser and the Worker.
 */

import { isAcceptableWeighInDate, type ValidationResult } from "./tracking";

export const POSES = ["front", "side", "back"] as const;
export type Pose = (typeof POSES)[number];
export const POSE_LABELS: Record<Pose, string> = { front: "Front", side: "Side", back: "Back" };

export interface PhotoMeta {
  id: string;
  date: string;
  pose: Pose;
}

/** Uploads are re-encoded on the device to about 150–400 KB; this is a hard cap. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** Longest side, in pixels, photos are resized to before upload. */
export const PHOTO_MAX_DIMENSION = 1440;
export const MAX_PHOTOS = 400;

export const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function validatePhotoMeta(date: string, pose: string, now?: Date): ValidationResult<{ date: string; pose: Pose }> {
  if (!isAcceptableWeighInDate(date, now)) return { ok: false, error: "Date must be a real calendar day, not in the future." };
  if (!(POSES as readonly string[]).includes(pose)) return { ok: false, error: "Pose must be front, side or back." };
  return { ok: true, value: { date, pose: pose as Pose } };
}

/** A real JPEG starts with FF D8 FF. Anything else is refused, whatever its content type says. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
