import { describe, expect, it } from "vitest";
import { libraryExercise } from "./exercises";
import { doneSets, e1rm, setReps, setVolume, splitCanonical, swapExercise, validateWorkout, weakerSide } from "./training";
import { doneSet, logged, openSet, workout } from "./test-helpers";

const lib = (id: string) => {
  const e = libraryExercise(id);
  if (!e) throw new Error(`No library exercise ${id}`);
  return e;
};

describe("swapExercise", () => {
  it("replaces an untouched exercise in place and remembers what it replaced", () => {
    const w = workout("2026-11-02", "ua", [logged("bench-press", [openSet(), openSet(), openSet()])]);
    const out = swapExercise(w, 0, lib("machine-chest-press"), []);
    expect(out.exercises).toHaveLength(1);
    expect(out.exercises[0]!.exerciseId).toBe("machine-chest-press");
    expect(out.exercises[0]!.swappedFrom).toBe("bench-press");
    expect(out.exercises[0]!.sets).toHaveLength(3);
  });

  it("splits a part-done exercise: done sets stay, the rest move to the swap", () => {
    const w = workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), openSet(), openSet()])]);
    const out = swapExercise(w, 0, lib("machine-chest-press"), []);
    expect(out.exercises.map((e) => [e.exerciseId, e.sets.length, e.swappedFrom])).toEqual([
      ["bench-press", 1, undefined],
      ["machine-chest-press", 2, "bench-press"],
    ]);
  });

  it("keeps the first exercise when a swap is swapped again, and drops it when swapped back", () => {
    const w = workout("2026-11-02", "ua", [logged("bench-press", [openSet(), openSet()])]);
    const once = swapExercise(w, 0, lib("machine-chest-press"), []);
    const twice = swapExercise(once, 0, lib("smith-bench-press"), []);
    expect(twice.exercises[0]!.swappedFrom).toBe("bench-press");
    const back = swapExercise(once, 0, lib("bench-press"), []);
    expect(back.exercises[0]!.exerciseId).toBe("bench-press");
    expect(back.exercises[0]!.swappedFrom).toBeUndefined();
  });

  it("does nothing for the same exercise or a finished one", () => {
    const w = workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()])]);
    expect(swapExercise(w, 0, lib("machine-chest-press"), [])).toBe(w);
    const open = workout("2026-11-02", "ua", [logged("bench-press", [openSet()])]);
    expect(swapExercise(open, 0, lib("bench-press"), [])).toBe(open);
  });
});

describe("validateWorkout", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const raw = (exercises: unknown[]) => ({
    date: "2026-11-02",
    name: "Upper A",
    programId: "p1",
    dayId: "ua",
    startedAt: Date.UTC(2026, 10, 2, 10),
    finishedAt: Date.UTC(2026, 10, 2, 11),
    note: "",
    exercises,
  });
  const ex = (extra: object) => ({ exerciseId: "machine-chest-press", name: "Machine chest press", bodyweight: false, target: null, restSec: null, sets: [doneSet()], ...extra });

  it("keeps a valid swappedFrom", () => {
    const r = validateWorkout(raw([ex({ swappedFrom: "bench-press" })]), "workout-0001", now);
    expect(r.ok && r.value.exercises[0]!.swappedFrom).toBe("bench-press");
  });

  it("drops a bad or self-referencing swappedFrom without rejecting the workout", () => {
    for (const bad of ["no spaces allowed", 42, "machine-chest-press"]) {
      const r = validateWorkout(raw([ex({ swappedFrom: bad })]), "workout-0001", now);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.exercises[0]!.swappedFrom).toBeUndefined();
    }
  });

  it("rejects a done set with no reps and a future date", () => {
    expect(validateWorkout(raw([ex({ sets: [{ weight: 100, reps: 0, done: true }] })]), "workout-0001", now).ok).toBe(false);
    expect(validateWorkout({ ...raw([ex({})]), date: "2026-11-20" }, "workout-0001", now).ok).toBe(false);
  });

  it("keeps both sides' reps for a one-sided set whose sides differed", () => {
    const r = validateWorkout(raw([ex({ oneSide: true, sets: [{ weight: 30, reps: 8, left: 8, right: 10, done: true }] })]), "workout-0001", now);
    expect(r.ok && r.value.exercises[0]!.sets[0]).toMatchObject({ left: 8, right: 10, reps: 8 });
  });
});

describe("set maths", () => {
  it("estimates a 1RM with Epley, and a single is itself", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2);
    expect(e1rm(0, 5)).toBe(0);
  });

  it("counts reps and volume on both sides of a one-sided exercise", () => {
    const [s] = doneSets(logged("single-arm-cable-curl", [{ weight: 20, reps: 10, done: true }], { oneSide: true }));
    expect(setReps(s!)).toBe(20);
    expect(setVolume(s!)).toBe(400);
  });

  it("uses each side's own weight for volume when weights are split", () => {
    const [s] = doneSets(
      logged("single-arm-cable-curl", [{ weight: 25, reps: 10, leftWeight: 20, rightWeight: 25, left: 10, right: 10, done: true }], { oneSide: true, splitWeight: true }),
    );
    expect(setVolume(s!)).toBe(450);
  });

  it("skips sets that aren't done", () => {
    expect(doneSets(logged("bench-press", [doneSet(), openSet(), { weight: 100, reps: 8, done: false }]))).toHaveLength(1);
  });

  it("treats a split-weight set as its stronger side", () => {
    expect(splitCanonical(20, 10, 25, 10)).toEqual({ weight: 25, reps: 10 });
    expect(splitCanonical(20, 10, 25, null)).toEqual({ weight: 20, reps: 10 });
  });

  it("names the weaker side only when it's behind on every uneven set", () => {
    const set = (left: number, right: number) => ({ weight: 20, reps: Math.min(left, right), rir: null, sides: 2 as const, left, right });
    expect(weakerSide([set(8, 10), set(7, 9)])).toEqual({ side: "left", by: 2 });
    expect(weakerSide([set(8, 10), set(10, 8)])).toBeNull();
    expect(weakerSide([set(10, 10)])).toBeNull();
  });
});
