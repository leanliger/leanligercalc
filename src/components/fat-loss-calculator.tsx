"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Flame,
  Gauge,
  Scale,
  Target,
  Timer,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Field, NumberField } from "@/components/field";
import { Stat } from "@/components/stat";
import { WarningList } from "@/components/warnings";
import { CopyButton } from "@/components/copy-button";
import { WeightCurveChart } from "@/components/weight-curve-chart";
import { MilestoneTable } from "@/components/milestone-table";
import {
  MAX_RATE,
  MIN_RATE,
  RATE_PRESETS,
  calculateFatLossTimeline,
  formatTimelineSummary,
  weightAtBodyFat,
} from "@/lib/fat-loss";
import { ACTIVITY_LABELS, resolveBodyFat } from "@/lib/body-composition";
import { describeDuration, formatLong, isValidISODate } from "@/lib/dates";
import { formatCalories, formatWeight } from "@/lib/format";
import type {
  ActivityLevel,
  BiometricProfile,
  FatLossInputs,
  GoalType,
  TimelineMode,
  WeightUnit,
} from "@/lib/types";
import { fromLb, round, toLb } from "@/lib/units";

interface FatLossCalculatorProps {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  onChange: (patch: Partial<FatLossInputs>) => void;
  unit: WeightUnit;
  /** Hands the derived calorie target over to the carb cycling tab. */
  onSendToCarbCycling: (payload: { dailyCalories: number; tdee: number }) => void;
  /** The shared biometrics panel, rendered above these inputs. */
  profileSlot: React.ReactNode;
}

const MODE_OPTIONS: readonly { value: TimelineMode; label: string; hint: string }[] = [
  { value: "startDate", label: "I know my start date", hint: "Solve for finish date" },
  { value: "eventDate", label: "I know my show date", hint: "Solve for start date" },
];

const GOAL_OPTIONS: readonly { value: GoalType; label: string }[] = [
  { value: "weight", label: "Goal weight" },
  { value: "bodyFat", label: "Goal body fat %" },
];

const RATE_PRESET_OPTIONS = [
  { value: "conservative", label: "Conservative", rate: RATE_PRESETS.conservative },
  { value: "moderate", label: "Moderate", rate: RATE_PRESETS.moderate },
  { value: "aggressive", label: "Aggressive", rate: RATE_PRESETS.aggressive },
] as const;

export function FatLossCalculator({
  profile,
  inputs,
  onChange,
  unit,
  onSendToCarbCycling,
  profileSlot,
}: FatLossCalculatorProps) {
  // Recalculated on every keystroke — the whole simulation is well under a
  // millisecond, so there is nothing to debounce or memoise beyond this.
  const result = React.useMemo(
    () => calculateFatLossTimeline(profile, inputs),
    [profile, inputs],
  );

  const currentBodyFat = resolveBodyFat(profile);

  const goalWeight = React.useMemo(() => {
    if (inputs.goalType === "weight") return inputs.targetWeight;
    const lean = profile.weight * (1 - currentBodyFat / 100);
    return weightAtBodyFat(lean, inputs.targetBodyFat);
  }, [profile.weight, currentBodyFat, inputs.goalType, inputs.targetWeight, inputs.targetBodyFat]);

  const activePreset = RATE_PRESET_OPTIONS.find(
    (preset) => Math.abs(preset.rate - inputs.weeklyRate) < 1e-6,
  );

  const summary = React.useMemo(
    () =>
      formatTimelineSummary(profile, inputs, result, unit, (lb) => fromLb(lb, unit)),
    [profile, inputs, result, unit],
  );

  const firstWeek = result.projection[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      {/* ----------------------------- Inputs ----------------------------- */}
      <div className="space-y-5 lg:sticky lg:top-4">
        {profileSlot}

        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Your goal
          </CardTitle>
          <CardDescription>
            Where you want to be, and how fast you want to get there.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <Field label="Goal type">
            <SegmentedControl
              ariaLabel="Goal type"
              value={inputs.goalType}
              onValueChange={(value) => onChange({ goalType: value })}
              options={GOAL_OPTIONS}
              size="sm"
            />
          </Field>

          {inputs.goalType === "weight" ? (
            <NumberField
              label="Target weight"
              value={round(fromLb(inputs.targetWeight, unit), 1)}
              onValueChange={(value) => onChange({ targetWeight: toLb(value, unit) })}
              suffix={unit}
              min={50}
              step={0.5}
              hint={`Projects to roughly ${round(result.endBodyFat, 1)}% body fat`}
            />
          ) : (
            <NumberField
              label="Target body fat"
              value={inputs.targetBodyFat}
              onValueChange={(value) => onChange({ targetBodyFat: value })}
              suffix="%"
              min={3}
              max={60}
              step={0.5}
              hint={`Roughly ${formatWeight(goalWeight, unit)} at your current lean mass`}
            />
          )}

          <Field label="Timeline direction">
            <SegmentedControl
              ariaLabel="Timeline direction"
              value={inputs.mode}
              onValueChange={(value) => onChange({ mode: value })}
              options={MODE_OPTIONS}
              size="sm"
            />
          </Field>

          <Field
            label={inputs.mode === "startDate" ? "Start date" : "Show / event date"}
            htmlFor="timeline-date"
          >
            <div className="relative">
              <Input
                id="timeline-date"
                type="date"
                value={inputs.mode === "startDate" ? inputs.startDate : inputs.eventDate}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!isValidISODate(value)) return;
                  onChange(
                    inputs.mode === "startDate"
                      ? { startDate: value }
                      : { eventDate: value },
                  );
                }}
                className="pr-10"
              />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>

          {/* --------------------------- Rate --------------------------- */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Weekly fat loss rate</span>
              <span className="tabular text-lg font-semibold text-primary">
                {(inputs.weeklyRate * 100).toFixed(2)}%
              </span>
            </div>

            <Slider
              value={[inputs.weeklyRate * 1000]}
              onValueChange={([value]) =>
                onChange({ weeklyRate: (value ?? 7.5) / 1000 })
              }
              min={MIN_RATE * 1000}
              max={MAX_RATE * 1000}
              step={0.05}
              aria-label="Weekly fat loss rate as a percentage of body weight"
            />

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0.50% · safest</span>
              <span>1.00% · ceiling</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {RATE_PRESET_OPTIONS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={activePreset?.value === preset.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => onChange({ weeklyRate: preset.rate })}
                  className="flex-col gap-0 py-1.5 h-auto"
                >
                  <span>{preset.label}</span>
                  <span className="text-[10px] font-normal opacity-80">
                    {(preset.rate * 100).toFixed(2)}%
                  </span>
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Loss is taken as a percentage of <em>current</em> weight each week, so the
              pounds per week shrink as you do.
            </p>
          </div>

          {/* ------------------------ Energy model ---------------------- */}
          <div className="space-y-3 border-t border-border pt-4">
            <Field label="Activity level" htmlFor="activity-level">
              <Select
                value={inputs.activityLevel}
                onValueChange={(value) =>
                  onChange({ activityLevel: value as ActivityLevel })
                }
              >
                <SelectTrigger id="activity-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                    <SelectItem key={level} value={level}>
                      {ACTIVITY_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <NumberField
              label="Known maintenance calories"
              value={inputs.tdeeOverride ?? 0}
              onValueChange={(value) =>
                onChange({ tdeeOverride: value > 0 ? value : null })
              }
              suffix="kcal"
              min={0}
              step={25}
              decimals={0}
              placeholder="Optional"
              hint={
                inputs.tdeeOverride
                  ? "Overrides the estimate, and still falls as you get lighter."
                  : `Estimated ${formatCalories(firstWeek?.tdee ?? 0)} from Mifflin-St Jeor + activity.`
              }
              help="If you have tracked your intake at stable weight, enter it here. A measured maintenance figure beats any formula."
            />

            <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border p-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Metabolic adaptation</span>
                <span className="block text-xs text-muted-foreground">
                  Models up to a 10% drop in maintenance across a long diet.
                </span>
              </span>
              <Switch
                checked={inputs.includeMetabolicAdaptation}
                onCheckedChange={(checked) =>
                  onChange({ includeMetabolicAdaptation: checked })
                }
                aria-label="Model metabolic adaptation"
              />
            </label>
          </div>
        </CardContent>
        </Card>
      </div>

      {/* ----------------------------- Results ---------------------------- */}
      <div className="space-y-5">
        <WarningList warnings={result.warnings} />

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                Prep summary
              </CardTitle>
              <CardDescription>
                {result.feasible
                  ? `${describeDuration(result.preciseWeeks)} at ${(inputs.weeklyRate * 100).toFixed(2)}% per week`
                  : "Set a goal below your current weight"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <CopyButton getText={() => summary} label="Copy plan" />
              <Button
                variant="secondary"
                size="sm"
                disabled={!result.feasible}
                onClick={() =>
                  onSendToCarbCycling({
                    dailyCalories: firstWeek?.targetCalories ?? 0,
                    tdee: firstWeek?.tdee ?? 0,
                  })
                }
              >
                <ArrowRightLeft />
                Send to carb cycling
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Prep duration"
                emphasis
                icon={<Timer className="h-3.5 w-3.5" />}
                value={`${result.weeksRequired} wk`}
                sub={describeDuration(result.preciseWeeks)}
              />
              <Stat
                label={inputs.mode === "eventDate" ? "Required start" : "Finish date"}
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                value={formatLong(
                  inputs.mode === "eventDate"
                    ? result.requiredStartDate
                    : result.finishDate,
                )}
                sub={
                  inputs.mode === "eventDate"
                    ? `Show: ${formatLong(result.finishDate)}`
                    : `Started: ${formatLong(result.requiredStartDate)}`
                }
              />
              <Stat
                label="Total loss"
                icon={<Target className="h-3.5 w-3.5" />}
                value={formatWeight(result.totalLoss, unit)}
                sub={`${formatWeight(result.fatLoss, unit)} fat · ${formatWeight(result.leanLoss, unit)} lean`}
              />
              <Stat
                label="Average intake"
                icon={<Flame className="h-3.5 w-3.5" />}
                value={formatCalories(result.averageTargetCalories)}
                sub={`${result.averageDailyDeficit} kcal/day deficit`}
              />
            </div>

            {result.requiredRate !== null && Number.isFinite(result.requiredRate) ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Starting today with {result.weeksAvailable} weeks until the show needs
                </span>
                <Badge
                  variant={
                    result.requiredRate > 0.01
                      ? "danger"
                      : result.requiredRate > 0.0085
                        ? "warning"
                        : "success"
                  }
                >
                  {(result.requiredRate * 100).toFixed(2)}% / week
                </Badge>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-medium">Projected curve</h3>
                <p className="text-xs text-muted-foreground">
                  Ending at {formatWeight(result.endWeight, unit)} ·{" "}
                  {round(result.endBodyFat, 1)}% body fat
                </p>
              </div>
              <WeightCurveChart
                projection={result.projection}
                unit={unit}
                goalWeight={result.feasible ? goalWeight : null}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly milestones</CardTitle>
            <CardDescription>
              Projected weight, composition, and the intake target for each week. Calorie
              triggers mark where to re-cut as maintenance falls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MilestoneTable projection={result.projection} unit={unit} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
