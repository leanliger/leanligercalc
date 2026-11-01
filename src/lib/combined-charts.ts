/**
 * Charts that put two measures side by side (coach dashboard):
 *
 *   - muscleKeptSeries: a member's trend weight against a strength index (their
 *     main lifts' estimated max, 100 = where each started in the window), week
 *     by week. Weight down with strength near 100 is muscle kept.
 *   - effortVsResults: every member as a dot, consistency across, progress
 *     against their plan up. The four corners are four different jobs.
 */

import type { MemberSummary } from "./coach";
import { HEALTH_PARTS } from "./coach";

// Weight vs strength lives on its own so the Worker can build it without the coach maths.
export { MUSCLE_CHART_WEEKS, muscleKeptSeries, type MusclePoint } from "./muscle-kept";

/* ----------------------------- effort vs results ----------------------------- */

/** Consistency at or above this (%) counts as consistent. */
export const EFFORT_LINE = 70;
/** Progress at or above this share of the plan's rate counts as on track. */
export const RESULTS_LINE = 0.8;

export type Quadrant = "on-track" | "stalling" | "lucky" | "drifting";

export const QUADRANTS: Record<Quadrant, { label: string; job: string }> = {
  "on-track": { label: "Consistent and on track", job: "Leave them be, and celebrate the wins." },
  stalling: { label: "Consistent but stalling", job: "They're doing the work: adjust the plan." },
  lucky: { label: "Inconsistent but losing anyway", job: "Check what they're logging is the whole picture." },
  drifting: { label: "Inconsistent and stalling", job: "An accountability conversation." },
};

export interface EffortPoint {
  id: string;
  name: string;
  /** 0–100: days logged in the last 7, with their habit score over the same days when they have one. */
  effort: number;
  /** Their measured rate over their plan's: 1 = exactly on plan. Clamped to −0.5…2. */
  results: number;
  quadrant: Quadrant;
  healthScore: number | null;
}

export function effortVsResults(members: readonly MemberSummary[]): { points: EffortPoint[]; missing: number } {
  const points: EffortPoint[] = [];
  let missing = 0;
  for (const m of members) {
    const observed = m.progress?.observedRate ?? null;
    const planned = m.progress?.plannedRate ?? null;
    if (!m.health || observed === null || planned === null || Math.abs(planned) < 0.05) {
      missing++;
      continue;
    }
    const logging = m.health.logging / HEALTH_PARTS.logging;
    // The last 7 days, so it doesn't reset to zero every Monday.
    const effort = Math.round((m.habits7 === null ? logging : logging * 0.6 + (m.habits7 / 100) * 0.4) * 100);
    const results = Math.max(-0.5, Math.min(2, Math.round((observed / planned) * 100) / 100));
    const consistent = effort >= EFFORT_LINE;
    const onTrack = results >= RESULTS_LINE;
    points.push({
      id: m.data.userId,
      name: m.displayName,
      effort,
      results,
      quadrant: consistent ? (onTrack ? "on-track" : "stalling") : onTrack ? "lucky" : "drifting",
      healthScore: m.health.score,
    });
  }
  return { points, missing };
}
