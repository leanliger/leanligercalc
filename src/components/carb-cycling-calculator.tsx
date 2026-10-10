"use client";

import * as React from "react";
import { CalendarRange, Flame, Info, Percent, Sparkles, Utensils } from "lucide-react";
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
  HIGH_BOOST_RANGE,
  LOW_CUT_RANGE,
  calculateCarbCycling,
  formatCarbPlanSummary,
  resolveProtein,
} from "@/lib/carb-cycling";
import { SCHEDULE_PRESETS } from "@/lib/defaults";
import type { DayTarget } from "@/lib/day-targets";
import { formatCalories, formatWeight } from "@/lib/format";
import { formatShort } from "@/lib/dates";
import type { PlanWeek } from "@/lib/plan-link";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  ProteinBasis,
  WeightUnit,
} from "@/lib/types";
import { fromLb, round } from "@/lib/units";
import { cn } from "@/lib/utils";
import { WeekdayPatternEditor } from "@/components/weekday-pattern-editor";
import { countsFromPattern, resolveWeekdayPattern } from "@/lib/weekday-pattern";
import { STEADY_DAY_DESCRIPTION, STEADY_DAY_LABEL } from "@/lib/carb-cycling";

interface CarbCyclingCalculatorProps {
  profile: BiometricProfile;
  inputs: CarbCyclingInputs;
  onChange: (patch: Partial<CarbCyclingInputs>) => void;
  unit: WeightUnit;
  /**
   * The week of the Timeline's plan these numbers come from; null while it has
   * no plan, when maintenance and the target are typed here (src/lib/plan-link.ts).
   */
  planWeek: PlanWeek | null;
  /** What the Timeline's maintenance is made of, e.g. "2,248 base + 254 steps + 156 training". */
  maintenanceNote?: string;
  onOpenTimeline?: () => void;
  /** The shared biometrics panel, rendered above these inputs. */
  profileSlot: React.ReactNode;
  /**
   * What the Food log is aiming at today (src/lib/day-targets.ts): the
   * Roadmap's numbers when today is inside it, otherwise this plan's.
   */
  foodLogToday?: DayTarget | null;
  onOpenRoadmap?: () => void;
}

const DAY_NAME = { high: "High", medium: "Medium", low: "Low" } as const;

/**
 * One sentence relating the days to maintenance, because "why is a high day
 * still under maintenance?" is the question this page raises most.
 */
function MaintenanceLine({
  maintenance,
  average,
  highest,
  steady = false,
}: {
  maintenance: number;
  average: number;
  highest: number;
  steady?: boolean;
}) {
  if (!(maintenance > 0) || !(average > 0)) return null;
  const gap = Math.round(maintenance - average);
  const kcal = (v: number) => `${Math.round(Math.abs(v)).toLocaleString()} kcal`;
  let text: string;
  if (steady) {
    text =
      gap > 25
        ? `You eat ${kcal(average)} every day, ${kcal(gap)} below your maintenance of ${kcal(maintenance)}. Your steps and training are already counted in that maintenance.`
        : gap < -25
          ? `You eat ${kcal(average)} every day, ${kcal(gap)} above your maintenance of ${kcal(maintenance)}.`
          : `You eat about your maintenance of ${kcal(maintenance)} every day.`;
  } else if (gap > 25) {
    text =
      highest < maintenance
        ? `Every day is below your maintenance of ${kcal(maintenance)}. High days are high compared with your other days, not with maintenance. The week averages a ${kcal(gap)}/day deficit.`
        : `The week averages a ${kcal(gap)}/day deficit below your maintenance of ${kcal(maintenance)}; only your highest days reach it.`;
  } else if (gap < -25) {
    text = `The week averages ${kcal(gap)}/day above your maintenance of ${kcal(maintenance)}.`;
  } else {
    text = `The week averages about your maintenance of ${kcal(maintenance)}: high days sit above it and low days below.`;
  }
  return <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

/**
 * Says which calories the Food log is using today. While the Timeline has a
 * plan they're the same as this page (both are this week of it).
 */
function FoodLogNote({
  target,
  planCalories,
  onOpenRoadmap,
}: {
  target: DayTarget;
  /** This page's calories for the same kind of day. */
  planCalories: number | null;
  onOpenRoadmap?: () => void;
}) {
  const day = target.steady ? null : `${DAY_NAME[target.type]} day`;
  const same = planCalories !== null && Math.abs(planCalories - target.calories) <= 5;
  return (
    <p className="flex gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      {target.source === "roadmap" ? (
        <span>
          Your Food log is using <strong className="tabular">{formatCalories(target.calories)}</strong> today ({day ? `${day}, ` : ""}from the
          Roadmap){same ? (
            <>, the same as here.</>
          ) : (
            <>
              . The Roadmap lowers the Timeline&apos;s calories each week as your weight drops and includes any check-in
              changes, so it differs from the numbers here.
            </>
          )}
          {onOpenRoadmap ? (
            <>
              {" "}
              <button
                type="button"
                onClick={onOpenRoadmap}
                className="font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                Open the Roadmap
              </button>
            </>
          ) : null}
        </span>
      ) : (
        <span>
          Your Food log is using these numbers today: <strong className="tabular">{formatCalories(target.calories)}</strong>
          {day ? ` (${day})` : ""}.
        </span>
      )}
    </p>
  );
}

/** A calorie number that comes from the Timeline: shown, not typed. */
function PlanNumber({ label, value, hint, help }: { label: string; value: number; hint?: string; help?: string }) {
  return (
    <Field label={label} hint={hint} help={help}>
      <div className="tabular flex h-10 items-center justify-between rounded-md border border-border bg-muted/40 px-3 text-sm">
        <span className="font-semibold">{Math.round(value).toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">kcal</span>
      </div>
    </Field>
  );
}

/** Which week of the plan these numbers are, and the way to change them. */
function PlanWeekLine({ week, unit, onOpenTimeline }: { week: PlanWeek; unit: WeightUnit; onOpenTimeline?: () => void }) {
  const text =
    week.when === "before"
      ? `Your plan starts ${formatShort(week.startDate)}: these are its first week`
      : week.when === "after"
        ? `Your plan finished ${formatShort(week.goalDate)}: these are its last week`
        : `Week ${week.index + 1} of ${week.count} of your plan`;
  const weight = week.index > 0 ? ` · planned weight ${formatWeight(week.weight, unit)}` : "";
  return (
    <p className="tabular text-xs leading-relaxed text-muted-foreground">
      <CalendarRange className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-primary" aria-hidden />
      {text}
      {weight}.{" "}
      {onOpenTimeline ? (
        <button
          type="button"
          onClick={onOpenTimeline}
          className="font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          Change on Timeline
        </button>
      ) : null}
    </p>
  );
}

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
  planWeek,
  maintenanceNote,
  profileSlot,
  foodLogToday,
  onOpenRoadmap,
  onOpenTimeline,
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
  // Only while the Timeline has no plan: a default target until the member types one.
  const derivedPercent = Math.round(GOAL_DEFICITS[inputs.goal] * 100);
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
            {inputs.cycleCarbs
              ? "Protein and fat hold steady; carbohydrate does the cycling."
              : "The same calories and macros every day. Protein from body weight, fat at a healthy level, carbs fill the rest."}
          </CardDescription>
          <div className="pt-2">
          <Field label="Eating pattern">
            <SegmentedControl
              ariaLabel="Eating pattern"
              size="sm"
              value={inputs.cycleCarbs ? "cycle" : "steady"}
              onValueChange={(v) => onChange({ cycleCarbs: v === "cycle" })}
              options={[
                { value: "steady" as const, label: "Same every day" },
                { value: "cycle" as const, label: "Carb cycling" },
              ]}
            />
          </Field>
          </div>
          {profileSlot}
          {foodLogToday ? (
            <FoodLogNote
              target={foodLogToday}
              planCalories={result.days.find((d) => d.type === foodLogToday.type)?.calories ?? null}
              onOpenRoadmap={onOpenRoadmap}
            />
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5">
          {planWeek ? (
            // The Timeline sets these: this week of its plan, the same as the Roadmap and Food log.
            <>
              <PlanWeekLine week={planWeek} unit={unit} onOpenTimeline={onOpenTimeline} />
              <div className="grid grid-cols-2 gap-3">
                <PlanNumber
                  label="Maintenance (TDEE)"
                  value={inputs.tdee}
                  hint={
                    planWeek.index === 0
                      ? maintenanceNote
                      : "Lower than at the start: it falls as your weight comes down."
                  }
                />
                <PlanNumber
                  label="Daily calorie target"
                  value={inputs.dailyCalorieTarget ?? derivedTarget}
                  hint={`Reaches your goal by ${formatShort(planWeek.goalDate)}${
                    planWeek.adjustment
                      ? `, with your check-in change of ${planWeek.adjustment > 0 ? "+" : "−"}${Math.abs(planWeek.adjustment)} kcal`
                      : ""
                  }.`}
                  help="This is the average day. High and low days move around it, and the week still averages here exactly. To change it, change your rate or goal on the Timeline."
                />
              </div>
            </>
          ) : (
            <>
              <NumberField
                label="Maintenance calories (TDEE)"
                value={inputs.tdee}
                onValueChange={(value) => onChange({ tdee: value })}
                suffix="kcal"
                min={800}
                step={25}
                decimals={0}
                hint="Set a goal on the Timeline and these follow it."
              />
              <NumberField
                label="Daily calorie target"
                value={inputs.dailyCalorieTarget ?? derivedTarget}
                onValueChange={(value) => onChange({ dailyCalorieTarget: value > 0 ? value : null })}
                suffix="kcal"
                min={800}
                step={25}
                decimals={0}
                hint={
                  inputs.dailyCalorieTarget === null
                    ? `${derivedPercent}% under maintenance until you type your own.`
                    : "Your own number."
                }
                help="This is the average day. High and low days move around it, and the week still averages here exactly."
              />
              {inputs.dailyCalorieTarget !== null && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange({ dailyCalorieTarget: null })}>
                  Go back to {derivedPercent}% under maintenance
                </Button>
              )}
            </>
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

          {inputs.cycleCarbs ? (
          <>
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
                {Math.round(HIGH_BOOST_RANGE.max * 100)}% more carbs than an average day
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
                {Math.round(LOW_CUT_RANGE.max * 100)}% fewer carbs than an average day
              </p>
            </div>
          </div>

          </>
          ) : null}        </CardContent>
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
          unit={unit}
          onProteinChange={(v) => onChange({ proteinPerLb: v })}
          onFatPercentChange={(v) => onChange({ fatFloorPercent: v })}
          dailyTarget={result.feasible ? result.weekly.averageDailyCalories : undefined}
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
                {inputs.cycleCarbs ? (
                  <>
                    {activeDays.map((d) => `${d.count} ${d.type}`).join(" · ")} — averaging{" "}
                    {formatCalories(result.weekly.averageDailyCalories)} per day
                  </>
                ) : (
                  <>The same every day: {formatCalories(result.weekly.averageDailyCalories)}</>
                )}
              </CardDescription>
            </div>
            <CopyButton getText={() => summary} label="Copy plan" />
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeDays.map((day) => (
                <MacroCard
                  key={day.type}
                  day={day}
                  maintenance={inputs.tdee}
                  label={inputs.cycleCarbs ? undefined : STEADY_DAY_LABEL}
                  description={inputs.cycleCarbs ? undefined : STEADY_DAY_DESCRIPTION}
                />
              ))}
            </div>
            <MaintenanceLine
              maintenance={inputs.tdee}
              average={result.weekly.averageDailyCalories}
              highest={Math.max(...activeDays.map((d) => d.calories))}
              steady={!inputs.cycleCarbs}
            />

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
                sub={`${result.baseline.carbs}g on an average day`}
              />
            </div>

            {inputs.cycleCarbs ? (
            <>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-medium">Week at a glance</h3>
                <p className="text-xs text-muted-foreground">
                  Arrange high days around your hardest sessions
                </p>
              </div>
              <WeeklyMacroChart result={result} pattern={pattern} maintenance={inputs.tdee} />
            </div>
            </>
            ) : null}
          </CardContent>
        </Card>

        {inputs.cycleCarbs ? (
        <>
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
        </>
        ) : null}
      </div>
    </div>
  );
}
