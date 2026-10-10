"use client";

import * as React from "react";
import { ArrowDown, Beef, Calculator, Droplet, TrendingDown, Wheat } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { CopyButton } from "@/components/copy-button";
import { WarningList } from "@/components/warnings";
import {
  CARB_DEFICIT_RANGE,
  FAT_PERCENT_RANGE,
  PROTEIN_RANGE,
  calculateMacroBaseline,
  formatMacroBaselineSummary,
} from "@/lib/macro-baseline";
import type { BiometricProfile, MacroSplit, WeightUnit } from "@/lib/types";
import { KCAL_PER_G, fromLb, round } from "@/lib/units";
import { cn } from "@/lib/utils";

interface MacroBaselineCardProps {
  profile: BiometricProfile;
  /** Maintenance calories the split is built from. */
  maintenanceCalories: number;
  proteinPerLb: number;
  fatPercent: number;
  carbDeficitGrams: number;
  unit: WeightUnit;
  onProteinChange: (value: number) => void;
  onFatPercentChange: (value: number) => void;
  onDeficitChange: (value: number) => void;
  /** Pushes the computed target calories into the weekly cycling plan. */
  onApplyToPlan: (targetCalories: number) => void;
  /**
   * Carb cycle is following the Timeline, so this card is an alternative way
   * to set the target, not the target in use. Labelled that way so the page
   * doesn't show two different "daily targets".
   */
  following?: boolean;
}

const MACROS = [
  {
    key: "protein" as const,
    label: "Protein",
    icon: Beef,
    dot: "bg-macro-protein",
    text: "text-macro-protein",
    kcal: KCAL_PER_G.protein,
  },
  {
    key: "fat" as const,
    label: "Fat",
    icon: Droplet,
    dot: "bg-macro-fat",
    text: "text-macro-fat",
    kcal: KCAL_PER_G.fat,
  },
  {
    key: "carbs" as const,
    label: "Carbs",
    icon: Wheat,
    dot: "bg-macro-carb",
    text: "text-macro-carb",
    kcal: KCAL_PER_G.carbs,
  },
];

/** One numbered step, with the working shown underneath. */
function Step({
  number,
  title,
  working,
  children,
}: {
  number: number;
  title: string;
  working: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{title}</span>
          <code className="tabular rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {working}
          </code>
        </div>
        {children}
      </div>
    </div>
  );
}

function SplitRow({ split, dimmed }: { split: MacroSplit; dimmed?: boolean }) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", dimmed && "opacity-60")}>
      {MACROS.map((macro) => {
        const line = split[macro.key];
        return (
          <div key={macro.key} className="rounded-md border border-border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", macro.dot)} />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {macro.label}
              </span>
            </div>
            <div className="tabular mt-1 text-lg font-semibold leading-none">
              {line.grams}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">g</span>
            </div>
            <div className="tabular mt-1 text-[11px] text-muted-foreground">
              {line.calories.toLocaleString()} kcal · {line.percentOfCalories}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MacroBaselineCard({
  profile,
  maintenanceCalories,
  proteinPerLb,
  fatPercent,
  carbDeficitGrams,
  unit,
  onProteinChange,
  onFatPercentChange,
  onDeficitChange,
  onApplyToPlan,
  following = false,
}: MacroBaselineCardProps) {
  const result = React.useMemo(
    () =>
      calculateMacroBaseline(profile, {
        dailyCalories: maintenanceCalories,
        proteinPerLb,
        fatPercent,
        carbDeficitGrams,
      }),
    [profile, maintenanceCalories, proteinPerLb, fatPercent, carbDeficitGrams],
  );

  const displayWeight = round(fromLb(profile.weight, unit), 1);
  const summary = React.useMemo(
    () => formatMacroBaselineSummary(result, unit, fromLb(profile.weight, unit)),
    [result, unit, profile.weight],
  );

  const { maintenance, target } = result;
  const inDeficit = carbDeficitGrams > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            {following ? "Or: set your deficit by cutting carbs" : "Daily macro targets"}
          </CardTitle>
          <CardDescription>
            {following
              ? "An alternative to the Timeline's target. Using it switches Macros off following the Timeline."
              : "Protein from body weight, fat as a share of calories, carbs from what remains."}
          </CardDescription>
        </div>
        <CopyButton getText={() => summary} label="Copy" />
      </CardHeader>

      <CardContent className="space-y-5">
        <WarningList warnings={result.warnings} />

        {/* ------------------------- Step 1: protein ------------------------ */}
        <Step
          number={1}
          title="Protein"
          working={`${displayWeight} ${unit} × ${proteinPerLb.toFixed(2)} = ${maintenance.protein.grams}g × 4 = ${maintenance.protein.calories.toLocaleString()} kcal`}
        >
          <div className="space-y-1.5">
            <Slider
              value={[proteinPerLb * 100]}
              onValueChange={([v]) => onProteinChange((v ?? 90) / 100)}
              min={60}
              max={140}
              step={5}
              aria-label="Protein grams per pound of body weight"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0.60 g/lb</span>
              <span className="font-medium text-macro-protein">
                {proteinPerLb.toFixed(2)} g/lb
              </span>
              <span>1.40 g/lb</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recommended {PROTEIN_RANGE.min.toFixed(1)}–{PROTEIN_RANGE.max.toFixed(1)}{" "}
              g per pound of body weight.
            </p>
          </div>
        </Step>

        {/* --------------------------- Step 2: fat -------------------------- */}
        <Step
          number={2}
          title="Fat"
          working={`${maintenance.totalCalories.toLocaleString()} × ${Math.round(fatPercent * 100)}% = ${maintenance.fat.calories.toLocaleString()} kcal ÷ 9 = ${maintenance.fat.grams}g`}
        >
          <div className="space-y-1.5">
            <Slider
              value={[fatPercent * 100]}
              onValueChange={([v]) => onFatPercentChange((v ?? 27) / 100)}
              min={15}
              max={45}
              step={1}
              aria-label="Fat as a percentage of total calories"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>15%</span>
              <span className="font-medium text-macro-fat">
                {Math.round(fatPercent * 100)}% of calories
              </span>
              <span>45%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recommended {Math.round(FAT_PERCENT_RANGE.min * 100)}–
              {Math.round(FAT_PERCENT_RANGE.max * 100)}% of total daily calories.
            </p>
          </div>
        </Step>

        {/* -------------------------- Step 3: carbs ------------------------- */}
        <Step
          number={3}
          title="Carbs — everything left over"
          working={`${maintenance.totalCalories.toLocaleString()} − ${maintenance.protein.calories.toLocaleString()} − ${maintenance.fat.calories.toLocaleString()} = ${maintenance.carbs.calories.toLocaleString()} kcal ÷ 4 = ${maintenance.carbs.grams}g`}
        >
          <SplitRow split={maintenance} dimmed={inDeficit} />
          <p className="text-[11px] text-muted-foreground">
            At maintenance — {maintenance.totalCalories.toLocaleString()} kcal per day.
          </p>
        </Step>

        {/* ------------------------- Step 4: deficit ------------------------ */}
        <Step
          number={4}
          title="Deficit — cut carbs only"
          working={
            inDeficit
              ? `−${Math.round(carbDeficitGrams)}g × 4 = −${result.dailyDeficit.toLocaleString()} kcal/day`
              : "maintenance — no deficit"
          }
        >
          <div className="space-y-1.5">
            <Slider
              value={[carbDeficitGrams]}
              onValueChange={([v]) => onDeficitChange(Math.round(v ?? 0))}
              min={0}
              max={175}
              step={5}
              aria-label="Grams of carbohydrate removed per day"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0g · maintain</span>
              <span className="font-medium text-macro-carb">
                −{Math.round(carbDeficitGrams)}g carbs
              </span>
              <span>175g</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recommended {CARB_DEFICIT_RANGE.min}–{CARB_DEFICIT_RANGE.max}g, which is
              a {CARB_DEFICIT_RANGE.min * 4}–{CARB_DEFICIT_RANGE.max * 4} kcal daily
              deficit. Protein and fat stay put — protein protects lean mass, fat
              protects hormones, so carbs are the only macro with room to give.
            </p>
          </div>
        </Step>

        {/* ---------------------------- Result ----------------------------- */}
        {inDeficit ? (
          <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{following ? "Target by cutting carbs" : "Your daily target"}</span>
              </div>
              <Badge variant="default" className="tabular">
                −{result.dailyDeficit.toLocaleString()} kcal/day
              </Badge>
            </div>

            <SplitRow split={target} />

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="tabular text-2xl font-semibold text-primary">
                {target.totalCalories.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  kcal/day
                </span>
              </span>
              <span className="tabular flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                {result.weeklyDeficit.toLocaleString()} kcal/week ≈{" "}
                {result.projectedWeeklyLoss} {unit}/week
              </span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={!result.feasible}
              onClick={() => onApplyToPlan(target.totalCalories)}
            >
              {following
                ? `Use ${target.totalCalories.toLocaleString()} kcal instead`
                : `Use ${target.totalCalories.toLocaleString()} kcal for the weekly plan`}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Set a carb deficit above to see your fat-loss targets. At 0g you are eating
            at maintenance.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
