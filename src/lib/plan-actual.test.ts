import { describe, expect, it } from "vitest";
import { cutShort, dayLines, planVsActual } from "./plan-actual";
import { day, doneSet, logged, planned, program, workout } from "./test-helpers";

const upperA = day("ua", "Upper A", [planned("bench-press", 2), planned("barbell-row", 2)]);
const lowerA = day("la", "Lower A", [planned("back-squat", 2)]);
// Mon 2 Nov and Wed 4 Nov 2026: Upper A, then Lower A.
const prog = program([upperA, lowerA], { startDate: "2026-11-02", weekdays: [0, 2], weeks: 1, note: "" });
const TODAY = "2026-11-06";

const month = (workouts: Parameters<typeof planVsActual>[1], rest: string[] = []) =>
  planVsActual(prog, workouts, new Set(rest), "2026-11-01", TODAY);
const on = (r: ReturnType<typeof month>, date: string) => r.days.find((d) => d.date === date)!;

describe("cutShort", () => {
  it("is false when every planned set is done", () => {
    expect(cutShort(upperA, workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()]), logged("barbell-row", [doneSet(), doneSet()])]))).toBe(false);
  });

  it("is true when a planned exercise is skipped or short", () => {
    expect(cutShort(upperA, workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()])]))).toBe(true);
    expect(cutShort(upperA, workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()]), logged("barbell-row", [doneSet()])]))).toBe(true);
  });

  it("counts sets of an exercise swapped in for a planned one", () => {
    const w = workout("2026-11-02", "ua", [
      logged("machine-chest-press", [doneSet(), doneSet()], { swappedFrom: "bench-press" }),
      logged("barbell-row", [doneSet(), doneSet()]),
    ]);
    expect(cutShort(upperA, w)).toBe(false);
  });

  it("adds up a part-done exercise and its swap", () => {
    const w = workout("2026-11-02", "ua", [
      logged("bench-press", [doneSet()]),
      logged("machine-chest-press", [doneSet()], { swappedFrom: "bench-press" }),
      logged("barbell-row", [doneSet(), doneSet()]),
    ]);
    expect(cutShort(upperA, w)).toBe(false);
  });

  it("still counts an unrelated extra exercise as not covering a skipped one", () => {
    const w = workout("2026-11-02", "ua", [logged("machine-chest-press", [doneSet(), doneSet()]), logged("barbell-row", [doneSet(), doneSet()])]);
    expect(cutShort(upperA, w)).toBe(true);
  });
});

describe("planVsActual", () => {
  it("marks a full planned session done and a short one cut short", () => {
    const full = month([workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()]), logged("barbell-row", [doneSet(), doneSet()])])]);
    expect(on(full, "2026-11-02").kind).toBe("done");
    const short = month([workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()])])]);
    expect(on(short, "2026-11-02").kind).toBe("part");
    expect(short.summary.part).toBe(1);
  });

  it("marks a planned day with nothing logged as missed, or rest when rest was ticked", () => {
    expect(on(month([]), "2026-11-02").kind).toBe("missed");
    const rested = month([], ["2026-11-02"]);
    expect(on(rested, "2026-11-02").kind).toBe("rest");
    expect(rested.summary.rest).toBe(1);
    expect(rested.summary.missed).toBe(1); // Wednesday is still missed
  });

  it("counts a different program day done in a session's place as done, shown as swapped", () => {
    const r = month([workout("2026-11-02", "la", [logged("back-squat", [doneSet(), doneSet()])])]);
    const d = on(r, "2026-11-02");
    expect(d.kind).toBe("done");
    expect(d.plan?.name).toBe("Lower A");
    expect(d.swappedFrom).toBe("Upper A");
  });

  it("counts a workout with a swapped exercise as done", () => {
    const r = month([
      workout("2026-11-02", "ua", [
        logged("machine-chest-press", [doneSet(), doneSet()], { swappedFrom: "bench-press" }),
        logged("barbell-row", [doneSet(), doneSet()]),
      ]),
    ]);
    expect(on(r, "2026-11-02").kind).toBe("done");
  });

  it("matches a session done a day late to its planned day", () => {
    const r = month([workout("2026-11-03", "ua", [logged("bench-press", [doneSet(), doneSet()]), logged("barbell-row", [doneSet(), doneSet()])])]);
    expect(on(r, "2026-11-02").movedTo).toBe("2026-11-03");
    expect(on(r, "2026-11-03").kind).toBe("done");
    expect(on(r, "2026-11-03").movedFrom).toBe("2026-11-02");
    expect(r.summary.missed).toBe(1); // only Wednesday
  });

  it("ignores unfinished workouts", () => {
    const r = month([workout("2026-11-02", "ua", [logged("bench-press", [doneSet(), doneSet()])], { finishedAt: null })]);
    expect(on(r, "2026-11-02").kind).toBe("missed");
  });

  it("calls a workout on an unplanned day inside the calendar extra", () => {
    const r = month([workout("2026-11-05", null, [logged("bench-press", [doneSet()])], { programId: null })]);
    expect(on(r, "2026-11-05").kind).toBe("extra");
    expect(r.summary.extra).toBe(1);
  });

  it("shows upcoming sessions as today or planned, not missed", () => {
    const r = planVsActual(prog, [], new Set(), "2026-11-01", "2026-11-04");
    expect(on(r, "2026-11-04").kind).toBe("today");
    const early = planVsActual(prog, [], new Set(), "2026-11-01", "2026-11-01");
    expect(on(early, "2026-11-02").kind).toBe("planned");
  });
});

describe("dayLines", () => {
  it("shows a swap on the planned line and doesn't list it again as added", () => {
    const w = workout("2026-11-02", "ua", [
      logged("machine-chest-press", [doneSet(), doneSet()], { swappedFrom: "bench-press", name: "Machine chest press" }),
      logged("barbell-row", [doneSet()], { name: "Barbell row" }),
      logged("cable-fly", [doneSet()], { name: "Cable fly" }),
    ]);
    const lines = dayLines(upperA, w, []);
    expect(lines.map((l) => [l.name, l.status])).toEqual([
      [expect.stringContaining("→ Machine chest press"), "hit"],
      ["Barbell row", "short"],
      ["Cable fly", "extra"],
    ]);
  });

  it("marks everything skipped when there's no workout", () => {
    expect(dayLines(upperA, null, []).every((l) => l.status === "skipped")).toBe(true);
  });
});
