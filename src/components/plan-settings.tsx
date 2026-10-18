"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, ChevronRight, Lock, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { AdvancedFold } from "@/components/ui/advanced-fold";
import { Field, NumberField } from "@/components/field";
import { WarningList } from "@/components/warnings";
import { ProfileCard } from "@/components/profile-card";
import { AfterGoalCard } from "@/components/after-goal-card";
import { CarbSwingFields, FatLossAdvancedFields, ProteinFatFields } from "@/components/plan-advanced-fields";
import { ACTIVITY_LABELS, SEX_LABELS, resolveBodyFat } from "@/lib/body-composition";
import type { CoachMacros } from "@/lib/coach-macros";
import { formatMedium, isValidISODate } from "@/lib/dates";
import { MAX_RATE, MIN_RATE, RATE_PRESETS, calculateFatLossTimeline, weightAtBodyFat } from "@/lib/fat-loss";
import { formatWeight } from "@/lib/format";
import { AFTER_GOAL_OPTIONS } from "@/lib/reverse-diet";
import { STEP_LIMITS, TRAINING_DAY_LIMITS, kcalPerThousandSteps, maintenanceBreakdown } from "@/lib/activity";
import type { CalorieAdjustment } from "@/lib/tracking";
import type {
  ActivityLevel,
  ActivitySource,
  BiometricProfile,
  CarbCyclingInputs,
  FatLossInputs,
  GoalType,
  TimelineMode,
  WeightUnit,
} from "@/lib/types";
import { fromLb, inchesToCm, inchesToFeetInches, round, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: readonly { value: TimelineMode; label: string; hint: string }[] = [
  { value: "startDate", label: "I know my start date", hint: "Solve for finish date" },
  { value: "eventDate", label: "I know my show date", hint: "Solve for start date" },
];
const GOAL_OPTIONS: readonly { value: GoalType; label: string }[] = [
  { value: "weight", label: "Goal weight" },
  { value: "bodyFat", label: "Goal body fat %" },
];
const ACTIVITY_SOURCE_OPTIONS: readonly { value: ActivitySource; label: string }[] = [
  { value: "steps", label: "Steps and training" },
  { value: "level", label: "Activity level" },
];
const SPEEDS = [
  { value: "gentle", label: "Gentle", rate: RATE_PRESETS.gentle },
  { value: "conservative", label: "Conservative", rate: RATE_PRESETS.conservative },
  { value: "moderate", label: "Moderate", rate: RATE_PRESETS.moderate },
  { value: "aggressive", label: "Aggressive", rate: RATE_PRESETS.aggressive },
] as const;

type GroupId = "about" | "goal" | "speed" | "activity" | "after";

/** The speed's name, or null for a rate between the presets. */
export function speedName(rate: number): string | null {
  return SPEEDS.find((s) => Math.abs(s.rate - rate) < 1e-6)?.label ?? null;
}

/**
 * Plan → Settings: the plan as a short list (about you, goal, speed,
 * activity, eating plan, after the goal), each opening its own page, plus the
 * guided setup and one Advanced fold for what most people never change. The
 * eating plan opens its own section (Plan → Settings → Eating plan, `carbs`).
 */
export function PlanSettings({
  profile,
  onProfileChange,
  inputs,
  onChange,
  carbs,
  macrosProfile,
  onCarbsChange,
  adjustments,
  coachMacros,
  unit,
  onOpenEatingPlan,
  onRunSetup,
}: {
  profile: BiometricProfile;
  onProfileChange: (patch: Partial<BiometricProfile>) => void;
  inputs: FatLossInputs;
  onChange: (patch: Partial<FatLossInputs>) => void;
  carbs: CarbCyclingInputs;
  /** The profile the eating plan works from (protein at this week's weight). */
  macrosProfile: BiometricProfile;
  onCarbsChange: (patch: Partial<CarbCyclingInputs>) => void;
  adjustments: readonly CalorieAdjustment[];
  coachMacros: CoachMacros | null;
  unit: WeightUnit;
  onOpenEatingPlan: () => void;
  onRunSetup: () => void;
}) {
  const [open, setOpen] = React.useState<GroupId | null>(null);
  const result = React.useMemo(() => calculateFatLossTimeline(profile, inputs), [profile, inputs]);
  const coach = coachMacros !== null;
  const top = React.useRef<HTMLDivElement>(null);
  const go = (id: GroupId | null) => {
    setOpen(id);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "nearest" }));
  };

  const { feet, inches } = inchesToFeetInches(profile.heightInches);
  const height = unit === "kg" ? `${Math.round(inchesToCm(profile.heightInches))} cm` : `${feet}′${inches}″`;
  const w = (lb: number) => formatWeight(lb, unit);
  const goalWeight =
    inputs.goalType === "weight" ? inputs.targetWeight : weightAtBodyFat(profile.weight * (1 - resolveBodyFat(profile) / 100), inputs.targetBodyFat);
  const speed = speedName(inputs.weeklyRate);
  const afterLabel = AFTER_GOAL_OPTIONS.find((o) => o.value === inputs.afterGoal)?.label ?? "";

  const groups: { id: GroupId | "eating"; label: string; value: string; locked?: boolean }[] = [
    { id: "about", label: "About you", value: `${SEX_LABELS[profile.sex]} · ${profile.age} · ${height} · ${w(profile.weight)}` },
    {
      id: "goal",
      label: "Goal",
      value: `${inputs.goalType === "weight" ? `Get to ${w(inputs.targetWeight)}` : `${inputs.targetBodyFat}% body fat (about ${w(goalWeight)})`} · ${
        inputs.mode === "startDate" ? `starts ${formatMedium(inputs.startDate)}` : `show on ${formatMedium(inputs.eventDate)}`
      }`,
    },
    {
      id: "speed",
      label: "Speed",
      value: inputs.fixedDeficit
        ? `${inputs.fixedDeficit.toLocaleString()} kcal a day under maintenance${result.feasible ? ` · goal ${formatMedium(result.finishDate)}` : ""}`
        : `${speed ? `${speed} · ` : ""}${Number((inputs.weeklyRate * 100).toFixed(2))}% a week${result.feasible ? ` · goal ${formatMedium(result.finishDate)}` : ""}`,
      locked: coach,
    },
    {
      id: "activity",
      label: "Activity",
      value:
        inputs.activitySource === "steps"
          ? `${inputs.dailySteps.toLocaleString()} steps a day · ${inputs.trainingDays} training day${inputs.trainingDays === 1 ? "" : "s"}`
          : ACTIVITY_LABELS[inputs.activityLevel],
    },
    {
      id: "eating",
      label: "Eating plan",
      value: carbs.cycleCarbs ? `Carb cycling · ${carbs.highDays} high, ${carbs.mediumDays} medium, ${carbs.lowDays} low` : "Same every day",
      locked: coach,
    },
    {
      id: "after",
      label: "After the goal",
      value: inputs.afterGoal === "reverse" ? `Reverse diet · +${inputs.reverseStep} kcal a week` : afterLabel,
    },
  ];

  const advancedChanged = inputs.fixedDeficit !== null || inputs.tdeeOverride !== null;
  const advancedCount = carbs.cycleCarbs ? 9 : 7;

  if (open) {
    const title = groups.find((g) => g.id === open)!.label;
    return (
      <div ref={top} className="space-y-4 lg:max-w-2xl">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => go(null)}>
          <ArrowLeft />
          Settings
        </Button>
        {open === "about" ? (
          <ProfileCard profile={profile} onChange={onProfileChange} unit={unit} />
        ) : open === "after" ? (
          result.feasible ? (
            <AfterGoalCard profile={profile} inputs={inputs} result={result} adjustments={adjustments} unit={unit} onChange={onChange} />
          ) : (
            <p className="text-sm text-muted-foreground">Set a goal below your current weight first.</p>
          )
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              {open === "speed" && coach ? (
                <CardDescription className="flex items-center gap-1.5 text-primary">
                  <Lock className="h-3.5 w-3.5" />
                  Your coach sets your daily calories, so this only moves your goal date.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-5">
              {open === "goal" ? (
                <GoalFields profile={profile} inputs={inputs} onChange={onChange} unit={unit} endBodyFat={result.endBodyFat} goalWeight={goalWeight} />
              ) : open === "speed" ? (
                <SpeedFields profile={profile} inputs={inputs} onChange={onChange} firstDeficit={result.feasible ? (result.projection[0]?.dailyDeficit ?? null) : null} />
              ) : (
                <ActivityFields profile={profile} inputs={inputs} onChange={onChange} />
              )}
            </CardContent>
          </Card>
        )}
        <WarningList warnings={result.warnings} />
      </div>
    );
  }

  return (
    <div ref={top} className="space-y-3 lg:max-w-2xl">
      {coach ? (
        <p className="flex gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Your coach sets your daily calories and macros. Settings marked with a lock follow theirs.
        </p>
      ) : null}
      <WarningList warnings={result.warnings} />

      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => (g.id === "eating" ? onOpenEatingPlan() : go(g.id))}
              className="flex min-h-[60px] w-full items-center gap-3 molten-card rounded-[1.25rem] border border-primary/15 bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{g.label}</span>
                <span className="truncate text-[13px] text-muted-foreground">{g.value}</span>
              </span>
              {g.locked ? <Lock className="h-4 w-4 shrink-0 text-primary" role="img" aria-label="Set by your coach" /> : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Button variant="outline" className="h-11 w-full border-dashed" onClick={onRunSetup}>
        <Wand2 />
        Run the guided setup again
      </Button>

      <Card>
        <CardContent className="px-4 pb-4 pt-1">
          <AdvancedFold hint={`${advancedCount} settings most people never change`} changed={advancedChanged}>
            <FatLossAdvancedFields profile={profile} inputs={inputs} result={result} onChange={onChange} />
            <div className="space-y-4 border-t border-border pt-4">
              {coach ? (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <Lock className="h-3.5 w-3.5" />
                  Set by your coach while their macros are on. These apply again when they clear them.
                </p>
              ) : null}
              <ProteinFatFields profile={macrosProfile} inputs={carbs} onChange={onCarbsChange} />
            </div>
            {carbs.cycleCarbs ? (
              <div className="border-t border-border pt-4">
                <CarbSwingFields inputs={carbs} onChange={onCarbsChange} />
              </div>
            ) : null}
          </AdvancedFold>
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- pages --------------------------------- */

function GoalFields({
  inputs,
  onChange,
  unit,
  endBodyFat,
  goalWeight,
}: {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  onChange: (patch: Partial<FatLossInputs>) => void;
  unit: WeightUnit;
  endBodyFat: number;
  goalWeight: number;
}) {
  return (
    <>
      <Field label="Goal type">
        <SegmentedControl ariaLabel="Goal type" value={inputs.goalType} onValueChange={(value) => onChange({ goalType: value })} options={GOAL_OPTIONS} size="sm" />
      </Field>
      {inputs.goalType === "weight" ? (
        <NumberField
          label="Target weight"
          value={round(fromLb(inputs.targetWeight, unit), 1)}
          onValueChange={(value) => onChange({ targetWeight: toLb(value, unit) })}
          suffix={unit}
          min={50}
          step={0.5}
          hint={`Projects to roughly ${round(endBodyFat, 1)}% body fat`}
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
        <SegmentedControl ariaLabel="Timeline direction" value={inputs.mode} onValueChange={(value) => onChange({ mode: value })} options={MODE_OPTIONS} size="sm" />
      </Field>
      <Field label={inputs.mode === "startDate" ? "Start date" : "Show / event date"} htmlFor="plan-date">
        <div className="relative">
          <Input
            id="plan-date"
            type="date"
            value={inputs.mode === "startDate" ? inputs.startDate : inputs.eventDate}
            onChange={(event) => {
              const value = event.target.value;
              if (!isValidISODate(value)) return;
              onChange(inputs.mode === "startDate" ? { startDate: value } : { eventDate: value });
            }}
            className="pr-10"
          />
          <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </Field>
    </>
  );
}

function SpeedFields({
  profile,
  inputs,
  onChange,
  firstDeficit,
}: {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  onChange: (patch: Partial<FatLossInputs>) => void;
  firstDeficit: number | null;
}) {
  // What each speed costs in food: the daily deficit in week 1.
  const deficits = React.useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const s of SPEEDS) {
      const r = calculateFatLossTimeline(profile, { ...inputs, weeklyRate: s.rate, fixedDeficit: null });
      out[s.value] = r.feasible ? (r.projection[0]?.dailyDeficit ?? null) : null;
    }
    return out;
  }, [profile, inputs]);
  const active = SPEEDS.find((s) => Math.abs(s.rate - inputs.weeklyRate) < 1e-6);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Weekly loss</span>
        <span className="tabular text-lg font-semibold text-primary">{(inputs.weeklyRate * 100).toFixed(2)}% a week</span>
      </div>
      {firstDeficit !== null ? (
        <p className="tabular -mt-2 text-right text-xs text-muted-foreground">
          {firstDeficit.toLocaleString()} kcal a day under maintenance {inputs.fixedDeficit ? "every week" : "to start"}
        </p>
      ) : null}
      <Slider
        value={[inputs.weeklyRate * 1000]}
        onValueChange={([value]) => onChange({ weeklyRate: (value ?? 7.5) / 1000, fixedDeficit: null })}
        min={MIN_RATE * 1000}
        max={MAX_RATE * 1000}
        step={0.05}
        aria-label="Weekly fat loss rate as a percentage of body weight"
      />
      <div className="flex justify-between text-[12px] text-muted-foreground">
        <span>0.25% · slowest</span>
        <span>1.00% · ceiling</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {SPEEDS.map((s) => (
          <Button
            key={s.value}
            variant={active?.value === s.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange({ weeklyRate: s.rate, fixedDeficit: null })}
            className="h-auto flex-col gap-0 py-1.5"
          >
            <span>{s.label}</span>
            <span className="text-[11px] font-normal opacity-80">{(s.rate * 100).toFixed(2)}%</span>
            {deficits[s.value] !== null && deficits[s.value] !== undefined ? (
              <span className="tabular text-[11px] font-normal opacity-80">−{deficits[s.value]!.toLocaleString()} kcal/day</span>
            ) : null}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Loss is a percentage of your <em>current</em> weight each week, so the pounds a week and the deficit shrink as you do. Faster means
        fewer weeks, but less food and more hunger.
      </p>
    </div>
  );
}

function ActivityFields({
  profile,
  inputs,
  onChange,
}: {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  onChange: (patch: Partial<FatLossInputs>) => void;
}) {
  const maintenance = maintenanceBreakdown(profile, inputs);
  return (
    <>
      <Field label="Estimate maintenance from">
        <SegmentedControl
          ariaLabel="Estimate maintenance from"
          value={inputs.activitySource}
          onValueChange={(value) => onChange({ activitySource: value })}
          options={ACTIVITY_SOURCE_OPTIONS}
          size="sm"
        />
      </Field>
      {inputs.activitySource === "steps" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Daily steps"
              value={inputs.dailySteps}
              onValueChange={(value) => onChange({ dailySteps: Math.round(Math.min(Math.max(value, STEP_LIMITS.min), STEP_LIMITS.max)) })}
              min={STEP_LIMITS.min}
              max={STEP_LIMITS.max}
              step={500}
              decimals={0}
              help="Your usual daily average from your phone or watch. Log your real steps in Progress → Habits to see if you're matching it."
            />
            <NumberField
              label="Training days"
              value={inputs.trainingDays}
              onValueChange={(value) =>
                onChange({ trainingDays: Math.round(Math.min(Math.max(value, TRAINING_DAY_LIMITS.min), TRAINING_DAY_LIMITS.max)) })
              }
              suffix="/wk"
              min={TRAINING_DAY_LIMITS.min}
              max={TRAINING_DAY_LIMITS.max}
              step={1}
              decimals={0}
              help="Weight training or cardio sessions of about an hour."
            />
          </div>
          <dl className="tabular space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Resting + daily life</dt>
              <dd>{Math.round(maintenance.base).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{inputs.dailySteps.toLocaleString()} steps</dt>
              <dd className="text-success">+{Math.round(maintenance.steps).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {inputs.trainingDays} training day{inputs.trainingDays === 1 ? "" : "s"} (daily average)
              </dt>
              <dd className="text-success">+{Math.round(maintenance.training).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-border pt-1 text-sm font-semibold">
              <dt>Maintenance</dt>
              <dd>{Math.round(maintenance.total).toLocaleString()} kcal</dd>
            </div>
            <p className="pt-1 text-[12px] text-muted-foreground">
              Every 1,000 extra daily steps burns about {Math.round(kcalPerThousandSteps(profile.weight))} kcal.
            </p>
          </dl>
        </>
      ) : (
        <Field label="Activity level" htmlFor="activity-level">
          <Select value={inputs.activityLevel} onValueChange={(value) => onChange({ activityLevel: value as ActivityLevel })}>
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
          <p className={cn("mt-1.5 text-[12px] leading-relaxed text-muted-foreground")}>
            One guess for steps and training together. Switch to <strong>Steps and training</strong> for an estimate built from your actual
            day.
          </p>
        </Field>
      )}
    </>
  );
}
