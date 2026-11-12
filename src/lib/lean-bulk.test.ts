import { describe, expect, it } from "vitest";
import { DEFAULT_FAT_LOSS_INPUTS, DEFAULT_PROFILE } from "./defaults";
import { calculateFatLossTimeline } from "./fat-loss";
import { dailySurplusForRate, KCAL_PER_LB_GAINED, leanGainFraction } from "./lean-bulk";
import type { FatLossInputs } from "./types";

const bulk = (over: Partial<FatLossInputs> = {}) =>
  calculateFatLossTimeline(DEFAULT_PROFILE, { ...DEFAULT_FAT_LOSS_INPUTS, startDate: "2026-11-02", phase: "bulk", bulkWeeks: 16, gainRate: 0.0025, ...over });

describe("lean bulk timeline", () => {
  const r = bulk();

  it("runs for the chosen weeks from the start date", () => {
    expect(r.phase).toBe("bulk");
    expect(r.feasible).toBe(true);
    expect(r.weeksRequired).toBe(16);
    expect(r.projection).toHaveLength(17);
    expect(r.requiredStartDate).toBe("2026-11-02");
    expect(r.finishDate).toBe("2027-02-22");
  });

  it("gains the rate each week, compounding", () => {
    expect(r.endWeight).toBeCloseTo(200 * Math.pow(1.0025, 16), 0);
    for (let i = 1; i < r.projection.length; i++) {
      expect(r.projection[i]!.weight).toBeGreaterThan(r.projection[i - 1]!.weight);
      expect(r.projection[i]!.weeklyLoss).toBeLessThan(0);
    }
  });

  it("stores the gain as negative losses and a negative deficit", () => {
    expect(r.totalLoss).toBeLessThan(0);
    expect(r.fatLoss).toBeLessThan(0);
    expect(r.leanLoss).toBeLessThan(0);
    expect(r.fatLoss + r.leanLoss).toBeCloseTo(r.totalLoss, 0);
    expect(r.averageDailyDeficit).toBeLessThan(0);
    for (const w of r.projection) expect(w.targetCalories).toBeGreaterThan(w.tdee);
  });

  it("prices the surplus at the estimate per pound, and maintenance rises with weight", () => {
    const w0 = r.projection[0]!;
    expect(w0.targetCalories - w0.tdee).toBeCloseTo(dailySurplusForRate(200, 0.0025), -1);
    expect(dailySurplusForRate(200, 0.0025)).toBeCloseTo((0.5 * KCAL_PER_LB_GAINED) / 7, 5);
    expect(r.projection[16]!.tdee).toBeGreaterThan(w0.tdee);
  });

  it("gains more body fat at a faster rate", () => {
    const fast = bulk({ gainRate: 0.005 });
    expect(fast.endBodyFat).toBeGreaterThan(r.endBodyFat);
    expect(fast.warnings.some((w) => w.title.includes("0.50%"))).toBe(false);
    const faster = bulk({ gainRate: 0.0075 });
    expect(faster.warnings.some((w) => w.level === "warning" && w.title.startsWith("Gaining"))).toBe(true);
  });

  it("warns when starting at high body fat", () => {
    const high = calculateFatLossTimeline({ ...DEFAULT_PROFILE, bodyFatOverride: 25 }, { ...DEFAULT_FAT_LOSS_INPUTS, phase: "bulk" });
    expect(high.warnings.some((w) => w.title.startsWith("Starting at"))).toBe(true);
    const lean = calculateFatLossTimeline({ ...DEFAULT_PROFILE, bodyFatOverride: 12 }, { ...DEFAULT_FAT_LOSS_INPUTS, phase: "bulk" });
    expect(lean.warnings.some((w) => w.title.startsWith("Starting at"))).toBe(false);
  });

  it("keeps weeks and rate within bounds", () => {
    expect(bulk({ bulkWeeks: 1 }).weeksRequired).toBe(4);
    expect(bulk({ bulkWeeks: 500 }).weeksRequired).toBe(52);
    expect(bulk({ gainRate: 0.5 }).endWeight).toBeCloseTo(200 * Math.pow(1.01, 16), 0);
  });

  it("leaves a cut unchanged", () => {
    const cut = calculateFatLossTimeline(DEFAULT_PROFILE, { ...DEFAULT_FAT_LOSS_INPUTS, startDate: "2026-11-02" });
    expect(cut.phase).toBe("cut");
    expect(cut.totalLoss).toBeGreaterThan(0);
  });
});

describe("leanGainFraction", () => {
  it("is about half at 0.25% a week from 15% body fat, less when faster or fatter", () => {
    expect(leanGainFraction(0.0025, 15)).toBeCloseTo(0.5, 5);
    expect(leanGainFraction(0.005, 15)).toBeLessThan(0.5);
    expect(leanGainFraction(0.0025, 25)).toBeLessThan(0.5);
    expect(leanGainFraction(0.05, 60)).toBeGreaterThanOrEqual(0.15);
  });
});
