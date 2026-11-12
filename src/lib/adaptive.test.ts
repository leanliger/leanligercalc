import { describe, expect, it } from "vitest";
import { analyzeProgress } from "./adaptive";
import { addDays } from "./dates";
import { DEFAULT_FAT_LOSS_INPUTS, DEFAULT_PROFILE } from "./defaults";
import { calculateFatLossTimeline } from "./fat-loss";
import type { WeighIn } from "./tracking";
import type { FatLossInputs } from "./types";

const START = "2026-09-07"; // a Monday
const TODAY = "2026-09-28"; // three weeks in

/** Daily weigh-ins from the start, changing by `perWeek` lb a week (gain negative loss). */
function weighIns(from: number, perWeek: number, days = 21): WeighIn[] {
  return Array.from({ length: days + 1 }, (_, i) => ({
    date: addDays(START, i),
    weightLb: Math.round((from + (perWeek * i) / 7) * 10) / 10,
    calories: null,
    note: null,
  }));
}

const plan = (over: Partial<FatLossInputs>) =>
  calculateFatLossTimeline(DEFAULT_PROFILE, { ...DEFAULT_FAT_LOSS_INPUTS, startDate: START, mode: "startDate", ...over });

describe("check-ins on a lean bulk", () => {
  // 200 lb at 0.25% a week: about +0.5 lb a week.
  const bulk = plan({ phase: "bulk", bulkWeeks: 16, gainRate: 0.0025 });

  it("is on track when gaining at the planned rate", () => {
    const a = analyzeProgress(DEFAULT_PROFILE, bulk, weighIns(200, 0.5), [], TODAY);
    expect(a.status).toBe("on-track");
    expect(a.headline).toContain("gaining");
    expect(a.recommendation).toBeNull();
  });

  it("raises calories when gaining too slowly", () => {
    const a = analyzeProgress(DEFAULT_PROFILE, bulk, weighIns(200, 0), [], TODAY);
    expect(a.status).toBe("behind");
    expect(a.headline).toMatch(/^Gaining slower/);
    expect(a.recommendation?.kcal).toBeGreaterThan(0);
    expect(a.recommendation!.kcal).toBeLessThanOrEqual(300);
  });

  it("lowers calories when gaining too fast", () => {
    const a = analyzeProgress(DEFAULT_PROFILE, bulk, weighIns(200, 1.5), [], TODAY);
    expect(a.status).toBe("ahead");
    expect(a.headline).toMatch(/^Gaining faster/);
    expect(a.recommendation?.kcal).toBeLessThan(0);
  });

  it("estimates maintenance from intake minus the surplus actually stored", () => {
    // Eating the plan and gaining exactly to plan: maintenance should match the model.
    const a = analyzeProgress(DEFAULT_PROFILE, bulk, weighIns(200, 0.5), [], TODAY);
    expect(Math.abs(a.estimatedMaintenance! - a.modelMaintenance!)).toBeLessThan(80);
  });
});

describe("check-ins on a cut (unchanged)", () => {
  const cut = plan({ weeklyRate: 0.0075 });

  it("lowers calories when losing too slowly and raises them when losing too fast", () => {
    const slow = analyzeProgress(DEFAULT_PROFILE, cut, weighIns(200, 0), [], TODAY);
    expect(slow.status).toBe("behind");
    expect(slow.headline).toMatch(/^Losing slower/);
    expect(slow.recommendation?.kcal).toBeLessThan(0);
    const fast = analyzeProgress(DEFAULT_PROFILE, cut, weighIns(200, -3), [], TODAY);
    expect(fast.status).toBe("ahead");
    expect(fast.recommendation?.kcal).toBeGreaterThan(0);
  });

  it("is on track at the planned rate", () => {
    const a = analyzeProgress(DEFAULT_PROFILE, cut, weighIns(200, -1.5), [], TODAY);
    expect(a.status).toBe("on-track");
    expect(a.headline).toContain("losing");
  });
});
