/**
 * Monthly comparison: which photos get compared (shared by the Worker and the
 * app, so the check and the comparison use the same ones), and the photo
 * check before spending one of the day's analyses: a pose missing from one
 * set, very different lighting, or the body filling a very different share of
 * the frame (standing closer or further away). The pixel checks run on the
 * device from small copies of the photos; they're warnings, not a block.
 */

import { addDays, daysBetween } from "./dates";
import { COMPARE_MIN_DAYS, COMPARE_TARGET_DAYS } from "./physique";
import { POSES, POSE_LABELS, type PhotoMeta, type Pose } from "./photos";

export interface ComparePair {
  pose: Pose;
  before: PhotoMeta;
  after: PhotoMeta;
}

/**
 * The newest photo of each pose (within a week of the newest set), paired
 * with that pose's photo closest to `requested` (or about a month earlier),
 * at least COMPARE_MIN_DAYS before. `photos` newest first.
 */
export function comparePairs(photos: readonly PhotoMeta[], requested: string | null): { pairs: ComparePair[]; afterDate: string | null } {
  const afterDate = photos[0]?.date ?? null;
  if (!afterDate) return { pairs: [], afterDate: null };
  const latest = addDays(afterDate, -COMPARE_MIN_DAYS);
  const target = requested && requested <= latest ? requested : addDays(afterDate, -COMPARE_TARGET_DAYS);
  const pairs: ComparePair[] = [];
  for (const pose of POSES) {
    const after = photos.find((p) => p.pose === pose && p.date >= addDays(afterDate, -6));
    const older = photos.filter((p) => p.pose === pose && p.date <= latest);
    if (!after || older.length === 0) continue;
    const before = [...older].sort(
      (a, b) => Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)) || (a.date < b.date ? 1 : -1),
    )[0]!;
    pairs.push({ pose, before, after });
  }
  return { pairs, afterDate };
}

/** What the pixel check measures on one photo. */
export interface PhotoMetrics {
  /** Average brightness, 0–255. */
  brightness: number;
  /** Share of the photo's height the body takes up (0–1), or null when it can't tell the body from the background. */
  bodyHeight: number | null;
  /** Width ÷ height. */
  aspect: number;
}

/** Brightness 0–255 for an RGB pixel. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Metrics from a small copy of a photo (RGBA pixels, e.g. 48 px wide). The
 * body's height is the run of rows that differ clearly from the background,
 * judged from the colour along the photo's edges: rough, and only used to
 * warn when two photos differ a lot.
 */
export function photoMetrics(data: Uint8ClampedArray, width: number, height: number): PhotoMetrics {
  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return luma(data[i]!, data[i + 1]!, data[i + 2]!);
  };
  let sum = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) sum += px(x, y);
  const brightness = sum / (width * height);

  // Background: the median brightness along the left and right edges.
  const edge: number[] = [];
  for (let y = 0; y < height; y++) edge.push(px(0, y), px(1, y), px(width - 1, y), px(width - 2, y));
  edge.sort((a, b) => a - b);
  const bg = edge[Math.floor(edge.length / 2)]!;
  const rows: boolean[] = [];
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (Math.abs(px(x, y) - bg) > 28) n++;
    rows.push(n / width > 0.06);
  }
  const first = rows.indexOf(true);
  const last = rows.lastIndexOf(true);
  const span = first < 0 ? 0 : (last - first + 1) / height;
  // Almost nothing, or almost everything, differing means the background wasn't plain enough to tell.
  const bodyHeight = span < 0.2 || (first <= 0 && last >= height - 1 && rows.filter(Boolean).length > height * 0.97) ? null : span;
  return { brightness, bodyHeight, aspect: width / height };
}

export interface PhotoCheckIssue {
  pose: Pose | null;
  text: string;
}

/** Brightness apart (0–255) before the lighting counts as very different. */
export const LIGHTING_GAP = 38;
/** How much bigger one body can look than the other (as a share of the frame) before it counts as a different distance. */
export const DISTANCE_RATIO = 1.22;

/**
 * Warnings for a comparison: poses in one set with nothing to match in the
 * other, then lighting, distance and framing per pose.
 */
export function photoCheckIssues(
  photos: readonly PhotoMeta[],
  pairs: readonly ComparePair[],
  metrics: ReadonlyMap<string, PhotoMetrics>,
): PhotoCheckIssue[] {
  const issues: PhotoCheckIssue[] = [];
  const afterDate = photos[0]?.date;
  for (const pose of POSES) {
    if (pairs.some((p) => p.pose === pose)) continue;
    const recent = afterDate ? photos.some((p) => p.pose === pose && p.date >= addDays(afterDate, -6)) : false;
    const older = photos.some((p) => p.pose === pose);
    if (recent) issues.push({ pose, text: `Your new ${POSE_LABELS[pose].toLowerCase()} photo has no earlier one to compare with, so it's left out.` });
    else if (older) issues.push({ pose, text: `No new ${POSE_LABELS[pose].toLowerCase()} photo, so that view is left out. Add one first for the full comparison.` });
  }
  for (const pair of pairs) {
    const a = metrics.get(pair.before.id);
    const b = metrics.get(pair.after.id);
    if (!a || !b) continue;
    const view = POSE_LABELS[pair.pose].toLowerCase();
    if (Math.abs(a.brightness - b.brightness) >= LIGHTING_GAP) {
      issues.push({
        pose: pair.pose,
        text: `The ${view} photos have very different lighting (the new one is much ${b.brightness > a.brightness ? "brighter" : "darker"}), which can hide or exaggerate change.`,
      });
    }
    if ((a.aspect > 1) !== (b.aspect > 1)) {
      issues.push({ pose: pair.pose, text: `One ${view} photo is landscape and the other portrait. Frame them the same way.` });
    } else if (a.bodyHeight !== null && b.bodyHeight !== null) {
      const ratio = Math.max(a.bodyHeight, b.bodyHeight) / Math.min(a.bodyHeight, b.bodyHeight);
      if (ratio >= DISTANCE_RATIO) {
        issues.push({
          pose: pair.pose,
          text: `In the new ${view} photo you look ${b.bodyHeight > a.bodyHeight ? "closer to" : "further from"} the camera. Same spot and distance makes the comparison fairer.`,
        });
      }
    }
  }
  return issues;
}
