"use client";

import * as React from "react";
import { CalendarRange, Flame, Percent, Sparkles, Utensils } from "lucide-react";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { Field, NumberField } from "@/components/field";
import { Stat } from "@/components/stat";
import { WarningList } from "@/components/warnings";
import { CopyButton } from "@/components/copy-button";
import { MacroCard } from "@/components/macro-card";
import { MacroBaselineCard } from "@/components/macro-baseline-card";
import { WeeklyMacroChart } from "@/components/weekly-macro-chart";
import {
  GOAL_DEFICITS,
  GOAL_LABELS,
  HIGH_BOOST_RANGE,
  LOW_CUT_RANGE,
  calculateCarbCycling,
  formatCarbPlanSummary,
  resolveProtein,
} from "@/lib/carb-cycling";
import { SCHEDULE_PRESETS } from "@/lib/defaults";
import { formatCalories, formatWeight } from "@/lib/format";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  CarbGoal,
  ProteinBasis,
  WeightUnit,
} from "@/lib/types";
import { fromLb, round } from "@/lib/units";
import { cn } from "@/lib/utils";
import { WeekdayPatternEditor } from "@/components/weekday-pattern-editor";
import { countsFromPattern, resolveWeekdayPattern } from "@/lib/weekday-pattern";

interface CarbCyclingCalculatorProps {
  profile: BiometricProfile;
  inputs: CarbCyclingInputs;
  onChange: (patch: Partial<CarbCyclingInputs>) => void;
  unit: WeightUnit;
  /** True when the current target came from the timeline tab. */
  linkedToTimeline: boolean;
  onClearLink: () => void;
  /** The shared biometrics panel, rendered above these inputs. */
  profileSlot: React.ReactNode;
}

const GOAL_OPTIONS: readonly { value: CarbGoal; label: string; hint: string }[] = [
  { value: "fatLoss", label: GOAL_LABELS.fatLoss, hint: "−20%" },
  { value: "recomp", label: GOAL_LABELS.recomp, hint: "−10%" },
  { value: "maintenance", label: GOAL_LABELS.maintenance, hint: "±0%" },
];

const PROTEIN_BASIS_OPTIONS: readonly { value: ProteinBasis; label: string }[] = [
  { value: "bodyWeight", label: "Body weight" },
  { value: "leanMass", label: "Lean mass" },
];

/** Stepper for the high / medium / low day counts. */
function DayCounter({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent: string;
}) {
  // `<output>` is not a labelable element, so the association is made with
  // aria-labelledby rather than a `for`/`id` pair.
  const labelId = React.useId();
  return (
    <div className="rounded-lg border border-border p-2.5 text-center">
      <div className="flex items-center justify-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", accent)} />
        <span id={labelId} className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.max(value - 1, 0))}
          disabled={value <= 0}
          aria-label={`Decrease ${label} days`}
        >
          −
        </Button>
        <output
          aria-labelledby={labelId}
          className="tabular w-8 text-lg font-semibold"
          aria-live="polite"
        >
          {value}
        </output>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange(Math.min(value + 1, 7))}
          disabled={value >= 7}
          aria-label={`Increase ${label} days`}
        >
          +
        </Button>
      </div>
    </div>
  );
}

export function CarbCyclingCalculator({
  profile,
  inputs,
  onChange,
  unit,
  linkedToTimeline,
  onClearLink,
  profileSlot,
}: CarbCyclingCalculatorProps) {
  const result = React.useMemo(
    () => calculateCarbCycling(profile, inputs),
    [profile, inputs],
  );
  const protein = resolveProtein(profile, inputs);
  const totalDays = inputs.highDays + inputs.mediumDays + inputs.lowDays;
  const pattern = React.useMemo(() => resolveWeekdayPattern(inputs), [inputs]);

  // Changing the counts invalidates any hand-placed weekday pattern, so drop it
  // and let the new counts be placed automatically.
  const setCounts = (patch: Partial<Pick<CarbCyclingInputs, "highDays" | "mediumDays" | "lowDays">>) =>
    onChange({ ...patch, weekdayPattern: null });

  const summary = React.useMemo(
    () => formatCarbPlanSummary(result, fromLb(profile.weight, unit), unit),
    [result, profile.weight, unit],
  );

  const activeDays = result.days.filter((day) => day.count > 0);
  const derivedTarget = Math.round(inputs.tdee * (1 - GOAL_DEFICITS[inputs.goal]));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      {/* ----------------------------- Inputs ----------------------------- */}
      <div className="space-y-5 lg:sticky lg:top-4">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-primary" />
            Plan setup
          </CardTitle>
          <CardDescription>
            Protein and fat hold steady; carbohydrate does the cycling.
          </CardDescription>
          {profileSlot}
        </CardHeader>

        <CardContent className="space-y-5">
          <NumberField
            label="Maintenance calories (TDEE)"
            value={inputs.tdee}
            onValueChange={(value) => onChange({ tdee: value })}
            suffix="kcal"
            min={800}
            step={25}
            decimals={0}
          />

          <Field label="Goal">
            <SegmentedControl
              ariaLabel="Goal"
              value={inputs.goal}
              onValueChange={(value) => onChange({ goal: value })}
              options={GOAL_OPTIONS}
              size="sm"
            />
          </Field>

          <NumberField
            label="Daily calorie target"
            value={inputs.dailyCalorieTarget ?? derivedTarget}
            onValueChange={(value) =>
              onChange({ dailyCalorieTarget: value > 0 ? value : null })
            }
            suffix="kcal"
            min={800}
            step={25}
            decimals={0}
            hint={
              linkedToTimeline
                ? "Imported from your fat loss timeline."
                : inputs.dailyCalorieTarget === null
                  ? `Derived from TDEE and goal (${derivedTarget} kcal).`
                  : "Manual override — clear to derive from TDEE and goal."
            }
            help="This is the average day. High and low days move around it, and the week still averages here exactly."
          />

          {(linkedToTimeline || inputs.dailyCalorieTarget !== null) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange({ dailyCalorieTarget: null });
                onClearLink();
              }}
            >
              Reset to goal-derived target
            </Button>
          )}

          {/* --------------------------- Protein -------------------------- */}
          <div className="space-y-3 border-t border-border pt-4">
            <Field label="Protein basis">
              <SegmentedControl
                ariaLabel="Protein basis"
                value={inputs.proteinBasis}
                onValueChange={(value) => onChange({ proteinBasis: value })}
                options={PROTEIN_BASIS_OPTIONS}
                size="sm"
              />
            </Field>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Protein per pound</span>
                <span className="tabular font-semibold text-macro-protein">
                  {inputs.proteinPerLb.toFixed(2)} g/lb
                </span>
              </div>
              <Slider
                value={[inputs.proteinPerLb * 100]}
                onValueChange={([value]) =>
                  onChange({ proteinPerLb: (value ?? 110) / 100 })
                }
                min={60}
                max={160}
                step={5}
                aria-label="Protein grams per pound"
              />
              <p className="tabular text-xs text-muted-foreground">
                {Math.round(protein)}g per day ·{" "}
                {inputs.proteinBasis === "leanMass" ? "on lean mass" : "on body weight"}
              </p>
            </div>
          </div>

          {/* ---------------------------- Fat floor ----------------------- */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Fat floor</span>
                <span className="tabular font-semibold text-macro-fat">
                  {Math.round(inputs.fatFloorPercent * 100)}% of calories
                </span>
              </div>
              <Slider
                value={[inputs.fatFloorPercent * 100]}
                onValueChange={([value]) =>
                  onChange({ fatFloorPercent: (value ?? 22) / 100 })
                }
                min={15}
                max={40}
                step={1}
                aria-label="Minimum fat as a percentage of calories"
              />
            </div>

            <NumberField
              label="Absolute fat minimum"
              value={inputs.fatFloorGramsPerLb}
              onValueChange={(value) => onChange({ fatFloorGramsPerLb: value })}
              suffix="g/lb"
              min={0.1}
              max={1}
              step={0.05}
              decimals={2}
              hint="Whichever floor is higher wins, on every day type."
              help="Hormone production and fat-soluble vitamin absorption both suffer below roughly 0.3g per pound of body weight."
            />
          </div>

          {/* ---------------------------- Schedule ------------------------ */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Weekly schedule</span>
              <Badge variant={totalDays === 7 ? "success" : "danger"} className="tabular">
                {totalDays} / 7 days
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <DayCounter
                label="High"
                value={inputs.highDays}
                onChange={(value) => setCounts({ highDays: value })}
                accent="bg-day-high"
              />
              <DayCounter
                label="Medium"
                value={inputs.mediumDays}
                onChange={(value) => setCounts({ mediumDays: value })}
                accent="bg-day-medium"
              />
              <DayCounter
                label="Low"
                value={inputs.lowDays}
                onChange={(value) => setCounts({ lowDays: value })}
                accent="bg-day-low"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_PRESETS.map((preset) => {
                const active =
                  inputs.highDays === preset.high &&
                  inputs.mediumDays === preset.medium &&
                  inputs.lowDays === preset.low;
                return (
                  <Button
                    key={preset.label}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    title={preset.hint}
                    onClick={() =>
                      setCounts({
                        highDays: preset.high,
                        mediumDays: preset.medium,
                        lowDays: preset.low,
                      })
                    }
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>

            {totalDays === 7 ? (
              <WeekdayPatternEditor
                pattern={pattern}
                isCustom={inputs.weekdayPattern !== null}
                onChange={(next) => {
                  const counts = countsFromPattern(next);
                  onChange({
                    weekdayPattern: next,
                    highDays: counts.high,
                    mediumDays: counts.medium,
                    lowDays: counts.low,
                  });
                }}
                onReset={() => onChange({ weekdayPattern: null })}
              />
            ) : null}
          </div>

          {/* --------------------------- Amplitude ------------------------ */}
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">High-day carb boost</span>
                <span className="tabular font-semibold text-day-high">
                  +{Math.round(inputs.highCarbBoost * 100)}%
                </span>
              </div>
              <Slider
                value={[inputs.highCarbBoost * 100]}
                onValueChange={([value]) =>
                  onChange({ highCarbBoost: (value ?? 20) / 100 })
                }
                min={0}
                max={50}
                step={1}
                aria-label="High day carb boost"
              />
              <p className="text-[11px] text-muted-foreground">
                Recommended {Math.round(HIGH_BOOST_RANGE.min * 100)}–
                {Math.round(HIGH_BOOST_RANGE.max * 100)}% over baseline carbs
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Low-day carb cut</span>
                <span className="tabular font-semibold text-day-low">
                  −{Math.round(inputs.lowCarbCut * 100)}%
                </span>
              </div>
              <Slider
                value={[inputs.lowCarbCut * 100]}
                onValueChange={([value]) => onChange({ lowCarbCut: (value ?? 25) / 100 })}
                min={0}
                max={60}
                step={1}
                aria-label="Low day carb cut"
              />
              <p className="text-[11px] text-muted-foreground">
                Recommended {Math.round(LOW_CUT_RANGE.min * 100)}–
                {Math.round(LOW_CUT_RANGE.max * 100)}% under baseline carbs
              </p>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>

      {/* ----------------------------- Results ---------------------------- */}
      <div className="space-y-5">
        {/* The plain daily split comes first: most people want "what do I eat
            today" before they want a seven-day rotation. */}
        <MacroBaselineCard
          profile={profile}
          maintenanceCalories={inputs.tdee}
          proteinPerLb={inputs.proteinPerLb}
          fatPercent={inputs.fatFloorPercent}
          carbDeficitGrams={inputs.carbDeficitGrams}
          unit={unit}
          onProteinChange={(v) => onChange({ proteinPerLb: v })}
          onFatPercentChange={(v) => onChange({ fatFloorPercent: v })}
          onDeficitChange={(v) => onChange({ carbDeficitGrams: v })}
          onApplyToPlan={(kcal) => {
            onChange({ dailyCalorieTarget: kcal });
            onClearLink();
          }}
        />

        <WarningList warnings={result.warnings} />

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Daily targets
              </CardTitle>
              <CardDescription>
                {activeDays.map((d) => `${d.count} ${d.type}`).join(" · ")} — averaging{" "}
                {formatCalories(result.weekly.averageDailyCalories)} per day
              </CardDescription>
            </div>
            <CopyButton getText={() => summary} label="Copy plan" />
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeDays.map((day) => (
                <MacroCard key={day.type} day={day} />
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Weekly average"
                emphasis
                icon={<Flame className="h-3.5 w-3.5" />}
                value={formatCalories(result.weekly.averageDailyCalories)}
                sub={`Target ${formatCalories(result.baseline.calories)}`}
              />
              <Stat
                label="Weekly deficit"
                icon={<Percent className="h-3.5 w-3.5" />}
                value={
                  result.weekly.weeklyDeficit > 0
                    ? formatCalories(result.weekly.weeklyDeficit)
                    : "Maintenance"
                }
                sub={
                  result.weekly.weeklyDeficit > 0
                    ? `≈ ${formatWeight(result.weekly.projectedWeeklyLoss, unit, 2)} per week`
                    : "No deficit configured"
                }
              />
              <Stat
                label="Weekly protein"
                icon={<CalendarRange className="h-3.5 w-3.5" />}
                value={`${result.weekly.protein.toLocaleString()}g`}
                sub={`${result.days[0]?.protein ?? 0}g every day`}
              />
              <Stat
                label="Weekly carbs"
                icon={<CalendarRange className="h-3.5 w-3.5" />}
                value={`${result.weekly.carbs.toLocaleString()}g`}
                sub={`${result.baseline.carbs}g baseline day`}
              />
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-medium">Week at a glance</h3>
                <p className="text-xs text-muted-foreground">
                  Arrange high days around your hardest sessions
                </p>
              </div>
              <WeeklyMacroChart result={result} pattern={pattern} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How this plan balances</CardTitle>
            <CardDescription>
              Protein is identical daily and fat comes from a fixed weekly budget, so
              only carbohydrate moves — which is what keeps the 7-day totals exact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative scrollbar-thin overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 text-left font-medium">
                      Day type
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Days
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Protein
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Carbs
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Fat
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Calories
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map((day) => (
                    <tr key={day.type} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-medium capitalize">
                        {day.type}
                      </th>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">
                        {day.count}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{day.protein}g</td>
                      <td className="tabular px-3 py-2 text-right font-medium">
                        {day.carbs}g
                      </td>
                      <td className="tabular px-3 py-2 text-right">{day.fat}g</td>
                      <td className="tabular px-3 py-2 text-right font-medium">
                        {day.calories.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <th scope="row" className="px-3 py-2.5 text-left">
                      Weekly total
                    </th>
                    <td className="tabular px-3 py-2.5 text-right">{totalDays}</td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {result.weekly.protein.toLocaleString()}g
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {result.weekly.carbs.toLocaleString()}g
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {result.weekly.fat.toLocaleString()}g
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {result.weekly.calories.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
