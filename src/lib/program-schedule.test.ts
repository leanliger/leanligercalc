import { describe, expect, it } from "vitest";
import { blockToActivate, defaultWeekdays, sanitizeSchedule, scheduleEnd, scheduleSessions, sessionStates, weekdayOf } from "./program-schedule";
import { day, doneSet, logged, planned, program, workout } from "./test-helpers";

const days = [day("ua", "Upper A", [planned("bench-press")]), day("la", "Lower A", [planned("back-squat")]), day("ub", "Upper B", [planned("db-bench-press")])];
// Mon/Wed/Fri for 2 weeks from Mon 2 Nov 2026.
const prog = program(days, { startDate: "2026-11-02", weekdays: [0, 2, 4], weeks: 2, note: "" });

describe("scheduleSessions", () => {
  it("puts the program's days on the training weekdays, in order, wrapping around", () => {
    const s = scheduleSessions(prog);
    expect(s.map((x) => `${x.date} ${x.day.name}`)).toEqual([
      "2026-11-02 Upper A",
      "2026-11-04 Lower A",
      "2026-11-06 Upper B",
      "2026-11-09 Upper A",
      "2026-11-11 Lower A",
      "2026-11-13 Upper B",
    ]);
    expect(scheduleEnd(prog)).toBe("2026-11-15");
  });

  it("has no sessions without a calendar", () => {
    expect(scheduleSessions(program(days))).toEqual([]);
  });
});

describe("sessionStates", () => {
  const today = "2026-11-09";
  const states = (ws: Parameters<typeof sessionStates>[1]) => sessionStates(prog, ws, today);

  it("marks past sessions missed, today's today and later ones upcoming", () => {
    expect(states([]).map((s) => s.status)).toEqual(["missed", "missed", "missed", "today", "upcoming", "upcoming"]);
  });

  it("matches a workout on its date, and a moved one to the nearest open session of the same day", () => {
    const s = states([
      workout("2026-11-02", "ua", [logged("bench-press", [doneSet()])]),
      // Lower A done Thursday instead of Wednesday.
      workout("2026-11-05", "la", [logged("back-squat", [doneSet()])]),
    ]);
    expect(s[0]).toMatchObject({ status: "done", moved: false });
    expect(s[1]).toMatchObject({ status: "done", moved: true });
    expect(s[2]!.status).toBe("missed");
  });

  it("doesn't match a workout more than 3 days from any open session, or from another program", () => {
    const far = program(days, { startDate: "2026-11-02", weekdays: [0], weeks: 2, note: "" });
    // 5 days before the first session.
    const s = sessionStates(far, [workout("2026-10-28", "ua", [logged("bench-press", [doneSet()])])], today);
    expect(s.map((x) => x.status)).toEqual(["missed", "today"]);
    const other = states([workout("2026-11-02", "ua", [logged("bench-press", [doneSet()])], { programId: "other" })]);
    expect(other[0]!.status).toBe("missed");
  });
});

describe("schedule helpers", () => {
  it("numbers weekdays from Monday", () => {
    expect(weekdayOf("2026-11-02")).toBe(0);
    expect(weekdayOf("2026-11-08")).toBe(6);
  });

  it("rejects a schedule without weekdays or with too many weeks, and tidies weekdays", () => {
    expect(sanitizeSchedule({ startDate: "2026-11-02", weekdays: [], weeks: 4 })).toBeUndefined();
    expect(sanitizeSchedule({ startDate: "2026-11-02", weekdays: [0], weeks: 99 })).toBeUndefined();
    expect(sanitizeSchedule({ startDate: "2026-11-02", weekdays: [4, 0, 4, 9], weeks: 4 })?.weekdays).toEqual([0, 4]);
  });

  it("spreads default training days across the week", () => {
    expect(defaultWeekdays(3)).toEqual([0, 2, 4]);
    expect(defaultWeekdays(0)).toEqual([0]);
    expect(defaultWeekdays(10)).toHaveLength(7);
  });

  it("starts the queued block once the active program's calendar has ended", () => {
    const a = { ...program(days, { startDate: "2026-11-02", weekdays: [0], weeks: 2, note: "" }), id: "a" };
    const b = { ...program(days, { startDate: "2026-11-16", weekdays: [0], weeks: 2, note: "" }), id: "b" };
    const settings = { programs: [a, b], activeProgramId: "a" };
    expect(blockToActivate(settings, "2026-11-15")).toBeNull();
    expect(blockToActivate(settings, "2026-11-16")).toBe("b");
  });
});
