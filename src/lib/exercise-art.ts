/**
 * Line drawings for the built-in exercises, served from public/exercise-art/:
 *
 *   <id>.webp        128px thumbnail (the first drawing), shown next to the name
 *   <id>-1.webp      384px drawings for the exercise page: the two ends of the
 *   <id>-2.webp      movement, or just -1 where only one drawing is right
 *
 * The files are white lines on a transparent background. They are used as CSS
 * masks (see `.exercise-art` in globals.css) and painted with the text colour,
 * so they follow light and dark mode.
 *
 * Members' own exercises have no drawing; callers show an icon instead.
 *
 * Source: Workout Guide by Bryl Lim (github.com/bryllim/workout-guide), based on
 * Everkinetic artwork, CC BY-SA 4.0. Rasterized and resized for the app; see
 * public/exercise-art/CREDITS.txt.
 */

import { libraryExercise } from "./exercises";

/** Shown under the drawings on every exercise page, as the license asks. */
export const ART_CREDIT = {
  title: "Workout Guide",
  author: "Bryl Lim",
  basedOn: "Everkinetic",
  sourceUrl: "https://github.com/bryllim/workout-guide",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

/** Exercises with one drawing: only one of the set shows the position properly, or only one exists. */
const ONE_DRAWING = new Set(["ab-wheel", "cable-crunch", "incline-machine-press"]);

export interface ExerciseArt {
  thumb: string;
  /** One or two drawings, in order. */
  drawings: string[];
}

/** The drawings for a built-in exercise, or null for a member's own one. */
export function exerciseArt(exerciseId: string): ExerciseArt | null {
  const ex = libraryExercise(exerciseId);
  if (!ex) return null;
  // A one-arm or one-leg version shows its two-sided version's drawings.
  const id = ex.artOf ?? exerciseId;
  const base = `/exercise-art/${id}`;
  return {
    thumb: `${base}.webp`,
    drawings: ONE_DRAWING.has(id) ? [`${base}-1.webp`] : [`${base}-1.webp`, `${base}-2.webp`],
  };
}
