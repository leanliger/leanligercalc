import { describe, expect, it } from "vitest";
import { leanMass, mifflinStJeorBmr, resolveBodyFat } from "./body-composition";
import { calculateCarbCycling, caloriesFromMacros } from "./carb-cycling";
import { DEFAULT_CARB_INPUTS, DEFAULT_FAT_LOSS_INPUTS, DEFAULT_PROFILE } from "./defaults";
import { calculateFatLossTimeline, fatLossFraction, intakeFloor } from "./fat-loss";
import { describePlates, platesFor, weightFromCounts } from "./plates";
import { kgToLb, lbToKg } from "./units";

describe("body composition", () => {
  it("computes BMR with Mifflin-St Jeor", () => {
    // 200 lb, 70 in, 30, male: 10·90.72 + 6.25·177.8 − 150 + 5 ≈ 1873
    expect(mifflinStJeorBmr(DEFAULT_PROFILE)).toBeCloseTo(1873.4, 0);
    expect(mifflinStJeorBmr({ ...DEFAULT_PROFILE, sex: "female" })).toBeCloseTo(1873.4 - 166, 0);
  });

  it("uses a measured body fat over the estimate", () => {
    expect(resolveBodyFat({ ...DEFAULT_PROFILE, bodyFatOverride: 15 })).toBe(15);
    expect(leanMass({ ...DEFAULT_PROFILE, bodyFatOverride: 15 })).toBeCloseTo(170, 5);
  });

  it("converts units both ways", () => {
    expect(kgToLb(lbToKg(185))).toBeCloseTo(185, 9);
  });
});

describe("macros (calculateCarbCycling)", () => {
  const steady = calculateCarbCycling(DEFAULT_PROFILE, DEFAULT_CARB_INPUTS);
  const cycled = calculateCarbCycling(DEFAULT_PROFILE, { ...DEFAULT_CARB_INPUTS, cycleCarbs: true });

  it("covers all 7 days", () => {
    for (const r of [steady, cycled]) expect(r.days.reduce((n, d) => n + d.count, 0)).toBe(7);
  });

  it("each day's calories match its macros", () => {
    for (const r of [steady, cycled]) for (const d of r.days) expect(d.calories).toBeCloseTo(caloriesFromMacros(d), -1);
  });

  it("sets protein from body weight and keeps fat at or above the floor", () => {
    for (const d of steady.days) {
      expect(d.protein).toBeCloseTo(200 * 0.9, -1);
      expect(d.fat).toBeGreaterThanOrEqual(200 * 0.3 - 1);
    }
  });

  it("lands the week close to the target calories", () => {
    for (const r of [steady, cycled]) expect(Math.abs(r.weekly.averageDailyCalories - r.baseline.calories)).toBeLessThan(r.baseline.calories * 0.05);
  });

  it("puts more carbs on high days than low days when cycling", () => {
    const carbs = (t: string) => cycled.days.find((d) => d.type === t)?.carbs ?? 0;
    expect(carbs("high")).toBeGreaterThan(carbs("low"));
  });

  it("follows an explicit calorie target", () => {
    const r = calculateCarbCycling(DEFAULT_PROFILE, { ...DEFAULT_CARB_INPUTS, dailyCalorieTarget: 2200 });
    expect(r.baseline.calories).toBeCloseTo(2200, -1);
  });
});

describe("fat loss timeline", () => {
  const r = calculateFatLossTimeline(DEFAULT_PROFILE, { ...DEFAULT_FAT_LOSS_INPUTS, startDate: "2026-11-02" });

  it("reaches the goal weight and loses the difference", () => {
    expect(r.totalLoss).toBeCloseTo(25, 0);
    expect(r.projection[r.projection.length - 1]!.weight).toBeLessThanOrEqual(175.5);
    expect(r.weeksRequired).toBeGreaterThan(0);
  });

  it("loses weight every week, never more fat than total", () => {
    for (let i = 1; i < r.projection.length; i++) {
      expect(r.projection[i]!.weight).toBeLessThanOrEqual(r.projection[i - 1]!.weight);
    }
    expect(r.fatLoss).toBeLessThanOrEqual(r.totalLoss + 1e-9);
  });

  it("takes longer at a gentler rate", () => {
    const slow = calculateFatLossTimeline(DEFAULT_PROFILE, { ...DEFAULT_FAT_LOSS_INPUTS, startDate: "2026-11-02", weeklyRate: 0.005 });
    expect(slow.weeksRequired).toBeGreaterThan(r.weeksRequired);
  });

  it("keeps the fat share of loss higher for slower diets and within bounds", () => {
    expect(fatLossFraction(0.005, 20)).toBeCloseTo(0.95, 5);
    expect(fatLossFraction(0.01, 20)).toBeCloseTo(0.8, 5);
    expect(fatLossFraction(0.05, 3)).toBeGreaterThanOrEqual(0.5);
  });

  it("never prescribes less than the intake floor", () => {
    expect(intakeFloor(120)).toBe(1200);
    expect(intakeFloor(250)).toBe(2000);
  });
});

describe("plates", () => {
  it("loads the heaviest plates first, per side", () => {
    const p = platesFor(225, 45, "lb");
    expect(p.perSide).toEqual([45, 45]);
    expect(p.loaded).toBe(225);
    expect(p.short).toBe(0);
  });

  it("reports what can't be loaded and weights below the bar", () => {
    expect(platesFor(46, 45, "lb").short).toBeGreaterThan(0);
    expect(platesFor(30, 45, "lb").belowBar).toBe(true);
  });

  it("round-trips plate counts to a total and reads them out", () => {
    expect(weightFromCounts({ "45": 2, "10": 1 }, 45, "lb").total).toBe(245);
    expect(describePlates([45, 45, 25, 10])).toBe("2 × 45, 25, 10");
  });
});
