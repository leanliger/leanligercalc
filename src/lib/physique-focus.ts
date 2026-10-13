/**
 * Physique analysis → program focus (coach dashboard → a member).
 *
 * The analysis is free text (src/lib/physique.ts), with a "Target Areas for
 * Growth" section. This finds the muscles that section names and drafts extra
 * weekly sets for them on the member's program, for the coach to check and
 * send as an ordinary program edit (src/lib/program-edits.ts). Nothing goes to
 * the member until the coach sends it.
 *
 * The draft is deliberately small, about EXTRA_WEEKLY_SETS hard sets a week
 * per target muscle, which is the usual "specialisation" nudge without
 * blowing up the session:
 *   - the muscle already has isolation work (a rep range reaching 12+): add a
 *     set to it, one at a time across those exercises, at most
 *     MAX_ADDED_PER_EXERCISE each and never past MAX_SETS_PER_EXERCISE;
 *   - two or more sets still to place: add one isolation exercise from
 *     FOCUS_EXERCISES to the day that already trains that body region most
 *     (fewest exercises breaking a tie) rather than piling sets onto heavy
 *     compounds;
 *   - a single set left over goes on a compound for that muscle, if any.
 */

import { findExercise, type Program, type ProgramDay } from "./training";
import { MUSCLE_LABELS, type Exercise, type Muscle } from "./exercises";
import type { PhysiqueAnalysis } from "./physique";

export const EXTRA_WEEKLY_SETS = 3;
const MAX_ADDED_PER_EXERCISE = 2;
const MAX_SETS_PER_EXERCISE = 6;
/** At most this many target muscles from one analysis. */
export const MAX_FOCUS_MUSCLES = 3;

/** Words that point at each muscle in a coach's write-up. */
const MUSCLE_WORDS: Record<Muscle, RegExp> = {
  chest: /\b(chest|pecs?|pectorals?)\b/i,
  back: /\b(back|lats?|latissimus|v[- ]?taper|traps|trapezius|rhomboids?|rear thickness)\b/i,
  shoulders: /\b(shoulders?|delts?|deltoids?|capped)\b/i,
  biceps: /\b(biceps?|arms?)\b/i,
  triceps: /\b(triceps?|arms?)\b/i,
  quads: /\b(quads?|quadriceps|thighs?|legs?|lower body|vmo|teardrop)\b/i,
  hamstrings: /\b(hamstrings?|hams|posterior chain|legs?|lower body)\b/i,
  glutes: /\b(glutes?|gluteal|butt|posterior chain)\b/i,
  calves: /\b(calf|calves|lower legs?)\b/i,
  core: /\b(core|abs|abdominals?|obliques|midsection|rectus)\b/i,
};

/** One isolation exercise per muscle, added when the program has nothing for it. */
export const FOCUS_EXERCISES: Record<Muscle, { id: string; repsMin: number; repsMax: number }> = {
  chest: { id: "incline-db-press", repsMin: 8, repsMax: 12 },
  back: { id: "chest-supported-row", repsMin: 8, repsMax: 12 },
  shoulders: { id: "lateral-raise", repsMin: 12, repsMax: 20 },
  biceps: { id: "incline-db-curl", repsMin: 10, repsMax: 15 },
  triceps: { id: "overhead-triceps-extension", repsMin: 10, repsMax: 15 },
  quads: { id: "leg-extension", repsMin: 12, repsMax: 15 },
  hamstrings: { id: "seated-leg-curl", repsMin: 10, repsMax: 15 },
  glutes: { id: "hip-thrust", repsMin: 8, repsMax: 12 },
  calves: { id: "standing-calf-raise", repsMin: 10, repsMax: 15 },
  core: { id: "cable-crunch", repsMin: 10, repsMax: 15 },
};

const UPPER: readonly Muscle[] = ["chest", "back", "shoulders", "biceps", "triceps"];
const LOWER: readonly Muscle[] = ["quads", "hamstrings", "glutes", "calves"];

/** The text under the "Target Areas for Growth" heading (or anything like it). */
export function targetAreaText(analysis: PhysiqueAnalysis): string | null {
  const s = analysis.sections.find((x) => /target|growth|lagging|weak|improve/i.test(x.heading));
  return s && s.lines.length > 0 ? s.lines.join("\n") : null;
}

/**
 * The muscles the target-areas section names, in the order it mentions them,
 * at most MAX_FOCUS_MUSCLES. Each line counts for the area it leads with
 * ("Side delts: more width would improve the V-taper" is shoulders, not
 * back); "arms" leads to biceps and triceps, "legs" to quads and hamstrings.
 * Lines saying an area couldn't be judged (lighting, clothing) or isn't
 * visible yet (abs at this body fat) are skipped.
 */
export function laggingMuscles(analysis: PhysiqueAnalysis): Muscle[] {
  const text = targetAreaText(analysis);
  if (!text) return [];
  const out: Muscle[] = [];
  for (const line of text.split("\n")) {
    if (/(\blimited\b|\bobscured\b|can(?:'|no)t (?:be )?(?:assess|see|judge)|(?:\bnot|n't) (?:yet |fully |clearly )?visible|\bunable to\b)/i.test(line)) continue;
    let first = Infinity;
    let lead: Muscle[] = [];
    for (const [muscle, re] of Object.entries(MUSCLE_WORDS) as [Muscle, RegExp][]) {
      const m = re.exec(line);
      if (!m) continue;
      if (m.index < first) {
        first = m.index;
        lead = [muscle];
      } else if (m.index === first) lead.push(muscle);
    }
    for (const m of lead) if (!out.includes(m)) out.push(m);
  }
  return out.slice(0, MAX_FOCUS_MUSCLES);
}

export type FocusChange =
  | { id: string; muscle: Muscle; kind: "sets"; dayId: string; dayName: string; exerciseIndex: number; exerciseName: string; from: number; to: number }
  | { id: string; muscle: Muscle; kind: "exercise"; dayId: string; dayName: string; exerciseId: string; exerciseName: string; sets: number; repsMin: number; repsMax: number };

const muscleOf = (exerciseId: string, custom: readonly Exercise[]) => findExercise(exerciseId, custom)?.muscle ?? null;

/** Draft the changes for these muscles on this program. Pure: the program isn't touched. */
export function draftFocus(program: Program, muscles: readonly Muscle[], custom: readonly Exercise[]): FocusChange[] {
  const changes: FocusChange[] = [];
  // Running set counts, so two muscles sharing an exercise (rare) don't overfill it.
  const sets = new Map<string, number>();
  const key = (d: ProgramDay, i: number) => `${d.id}:${i}`;
  for (const d of program.days) d.exercises.forEach((e, i) => sets.set(key(d, i), e.sets));
  const added = new Map<string, number>();

  for (const muscle of muscles) {
    let left = EXTRA_WEEKLY_SETS;
    const slots = program.days.flatMap((d) =>
      d.exercises.map((e, i) => ({ d, i, e })).filter(({ e }) => muscleOf(e.exerciseId, custom) === muscle),
    );
    // Round-robin across the exercises already there: isolation work first.
    const place = (group: typeof slots) => {
      for (let round = 0; round < MAX_ADDED_PER_EXERCISE && left > 0; round++) {
        for (const { d, i, e } of group) {
          if (left === 0) break;
          const k = key(d, i);
          const now = sets.get(k) ?? e.sets;
          if ((added.get(k) ?? 0) >= MAX_ADDED_PER_EXERCISE || now >= MAX_SETS_PER_EXERCISE) continue;
          sets.set(k, now + 1);
          added.set(k, (added.get(k) ?? 0) + 1);
          left--;
        }
      }
    };
    place(slots.filter(({ e }) => e.repsMax >= 12));
    const needsExercise =
      left >= 2 && !program.days.some((d) => d.exercises.some((e) => e.exerciseId === FOCUS_EXERCISES[muscle].id));
    if (!needsExercise) place(slots.filter(({ e }) => e.repsMax < 12));
    for (const { d, i, e } of slots) {
      const k = key(d, i);
      const extra = added.get(k) ?? 0;
      if (extra === 0 || changes.some((c) => c.kind === "sets" && c.dayId === d.id && c.exerciseIndex === i)) continue;
      changes.push({
        id: `sets:${k}`,
        muscle,
        kind: "sets",
        dayId: d.id,
        dayName: d.name,
        exerciseIndex: i,
        exerciseName: findExercise(e.exerciseId, custom)?.name ?? "Exercise",
        from: e.sets,
        to: e.sets + extra,
      });
    }

    // Nothing (or not enough) to add to: one isolation exercise on the best day.
    if (needsExercise && program.days.length > 0) {
      const pick = FOCUS_EXERCISES[muscle];
      const ex = findExercise(pick.id, custom);
      if (!ex) continue;
      const region = UPPER.includes(muscle) ? UPPER : LOWER.includes(muscle) ? LOWER : null;
      const score = (d: ProgramDay) =>
        region ? d.exercises.filter((e) => region.includes(muscleOf(e.exerciseId, custom) as Muscle)).length : 0;
      const day = [...program.days].sort((a, b) => score(b) - score(a) || a.exercises.length - b.exercises.length)[0]!;
      if (day.exercises.some((e) => e.exerciseId === pick.id)) continue;
      changes.push({
        id: `add:${day.id}:${muscle}`,
        muscle,
        kind: "exercise",
        dayId: day.id,
        dayName: day.name,
        exerciseId: pick.id,
        exerciseName: ex.name,
        sets: Math.max(2, Math.min(left, 4)),
        repsMin: pick.repsMin,
        repsMax: pick.repsMax,
      });
    }
  }
  return changes;
}

/** The program with the chosen changes applied. */
export function applyFocus(program: Program, changes: readonly FocusChange[]): Program {
  return {
    ...program,
    days: program.days.map((d) => {
      const exercises = d.exercises.map((e, i) => {
        const c = changes.find((x) => x.kind === "sets" && x.dayId === d.id && x.exerciseIndex === i);
        return c && c.kind === "sets" ? { ...e, sets: c.to } : e;
      });
      for (const c of changes) {
        if (c.kind === "exercise" && c.dayId === d.id) {
          exercises.push({ exerciseId: c.exerciseId, sets: c.sets, repsMin: c.repsMin, repsMax: c.repsMax, restSec: null });
        }
      }
      return { ...d, exercises };
    }),
  };
}

/** "Shoulders, calves" */
export const musclesText = (ms: readonly Muscle[]) => ms.map((m, i) => (i === 0 ? MUSCLE_LABELS[m] : MUSCLE_LABELS[m].toLowerCase())).join(", ");
