/**
 * Challenges: a coach sends a scheduled program as a challenge (Assign →
 * "Make it a challenge"). Members who join get the program and a place on the
 * challenge's leaderboard, ranked by how many of its planned workouts they've
 * finished (worker/assignments.ts challengeStandings).
 */

import { addDays } from "./dates";
import type { ProgramSchedule } from "./program-schedule";
import { weekdayOf } from "./program-schedule";

export interface ChallengeEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Workouts from the challenge program finished within its dates. */
  done: number;
  rank: number;
  isYou: boolean;
}

export interface ChallengeStandings {
  id: string;
  title: string;
  note: string;
  startDate: string;
  endDate: string;
  weeks: number;
  /** Planned workouts over the whole challenge. */
  planned: number;
  entrants: number;
  entries: ChallengeEntry[];
}

/** First and last day of the challenge, inclusive. */
export function challengeWindow(s: ProgramSchedule): { start: string; end: string } {
  return { start: s.startDate, end: addDays(s.startDate, s.weeks * 7 - 1) };
}

/** Planned workouts: training weekdays over its weeks. */
export function plannedWorkouts(s: ProgramSchedule): number {
  let n = 0;
  for (let i = 0; i < s.weeks * 7; i++) if (s.weekdays.includes(weekdayOf(addDays(s.startDate, i)))) n++;
  return n;
}

/** Rank by workouts done (ties share a rank), then by name. */
export function rankEntries(rows: Omit<ChallengeEntry, "rank">[]): ChallengeEntry[] {
  const sorted = [...rows].sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
  let rank = 0;
  let last = -1;
  return sorted.map((r, i) => {
    if (r.done !== last) {
      rank = i + 1;
      last = r.done;
    }
    return { ...r, rank };
  });
}

export function challengeMessage(title: string, startDate: string, weeks: number): { title: string; content: string } {
  return {
    title: `Your coach started a challenge: ${title}`,
    content: `${weeks} week${weeks === 1 ? "" : "s"} from ${startDate}. Open Lean Stature System to join: you get the program and a spot on the leaderboard.`,
  };
}
