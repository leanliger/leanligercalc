"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { formatMedium, formatShort } from "@/lib/dates";
import { formatWeight } from "@/lib/format";
import {
  AFTER_GOAL_OPTIONS,
  REVERSE_STEP_OPTIONS,
  afterGoalPlan,
  type AfterGoal,
} from "@/lib/reverse-diet";
import type { CalorieAdjustment } from "@/lib/tracking";
import type { BiometricProfile, FatLossInputs, FatLossResult, WeightUnit } from "@/lib/types";

const kcal = (n: number) => Math.round(n).toLocaleString();

/**
 * Plan → Timeline: what happens once the goal is reached. A reverse diet adds
 * calories back each week up to maintenance at the new weight; the Food log,
 * Today and Macros follow it automatically after the goal date.
 */
export function AfterGoalCard({
  profile,
  inputs,
  result,
  adjustments,
  unit,
  onChange,
}: {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  result: FatLossResult;
  adjustments: readonly CalorieAdjustment[];
  unit: WeightUnit;
  onChange: (patch: Partial<FatLossInputs>) => void;
}) {
  // Worked out as a reverse even when another option is picked, for the numbers in the copy.
  const plan = React.useMemo(
    () => afterGoalPlan(profile, { ...inputs, afterGoal: inputs.afterGoal === "stay" ? "maintain" : inputs.afterGoal }, result, adjustments),
    [profile, inputs, result, adjustments],
  );
  if (!plan) return null;
  const jump = plan.maintenance - plan.fromCalories;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          After your goal
        </CardTitle>
        <CardDescription>
          What to eat from {formatMedium(plan.startDate)}, once you&apos;re at {formatWeight(plan.weight, unit)}. Your Food log
          and Today switch over by themselves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SegmentedControl<AfterGoal>
          ariaLabel="After your goal"
          value={inputs.afterGoal}
          onValueChange={(afterGoal) => onChange({ afterGoal })}
          options={AFTER_GOAL_OPTIONS.map(({ value, label }) => ({ value, label }))}
        />

        {inputs.afterGoal === "reverse" ? (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Add each week</p>
              <SegmentedControl<string>
                ariaLabel="Calories added each week"
                size="sm"
                value={String(inputs.reverseStep)}
                onValueChange={(v) => onChange({ reverseStep: Number(v) })}
                options={REVERSE_STEP_OPTIONS.map((n) => ({ value: String(n), label: `+${n} kcal/day` }))}
                className="max-w-sm"
              />
            </div>
            {plan.weeks.length > 0 ? (
              <>
                <p className="tabular text-sm">
                  <span className="text-2xl font-semibold">{kcal(plan.fromCalories)}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="text-2xl font-semibold text-primary">{kcal(plan.maintenance)}</span>
                  <span className="ml-1.5 text-muted-foreground">kcal</span>
                  <span className="block text-xs text-muted-foreground">
                    over {plan.weeks.length} week{plan.weeks.length === 1 ? "" : "s"}, then maintenance from{" "}
                    {formatShort(plan.maintenanceDate)}
                  </span>
                </p>
                <ol className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Reverse diet weeks">
                  {plan.weeks.map((w) => (
                    <li key={w.index} className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-center">
                      <span className="block text-[11px] text-muted-foreground">Wk {w.index + 1}</span>
                      <span className="tabular text-sm font-semibold">{kcal(w.calories)}</span>
                    </li>
                  ))}
                  <li className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-center">
                    <span className="block text-[11px] text-primary">Then</span>
                    <span className="tabular text-sm font-semibold">{kcal(plan.maintenance)}</span>
                  </li>
                </ol>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Expect the scale to rise a couple of pounds in the first weeks: that&apos;s food, water and glycogen coming
                  back, not fat. Smaller steps take longer but keep that rebound gentler.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your last diet week is already within {inputs.reverseStep} kcal of maintenance ({kcal(plan.maintenance)} kcal),
                so you go straight there.
              </p>
            )}
          </>
        ) : inputs.afterGoal === "maintain" ? (
          <p className="tabular text-sm">
            <span className="text-2xl font-semibold text-primary">{kcal(plan.maintenance)}</span>
            <span className="ml-1.5 text-muted-foreground">kcal a day from {formatShort(plan.startDate)}</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              Up {kcal(jump)} kcal in one go. Expect a quick 2–4 lb rise from water and glycogen in the first week or two; a
              reverse diet spreads that out.
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            You&apos;ll keep eating your last week&apos;s <span className="tabular font-medium text-foreground">{kcal(plan.fromCalories)}</span>{" "}
            kcal after {formatShort(plan.startDate)}, {kcal(jump)} below maintenance. Fine for a few extra weeks; staying in a deficit
            for long isn&apos;t recommended.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
