"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Field, NumberField } from "@/components/field";
import { SEX_LABELS } from "@/lib/body-composition";
import { formatMedium, isValidISODate } from "@/lib/dates";
import { RATE_PRESETS, calculateFatLossTimeline } from "@/lib/fat-loss";
import { GAIN_RATE_LABELS, GAIN_RATE_PRESETS, MAX_BULK_WEEKS, MIN_BULK_WEEKS, clampBulkWeeks } from "@/lib/lean-bulk";
import { STEP_LIMITS, TRAINING_DAY_LIMITS } from "@/lib/activity";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, Sex, WeightUnit } from "@/lib/types";
import { cmToInches, feetInchesToInches, fromLb, inchesToCm, inchesToFeetInches, round, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const STEPS = ["About you", "Your goal", "How fast", "Activity", "Eating plan"] as const;

const SPEEDS = [
  { id: "gentle", label: "Gentle", rate: RATE_PRESETS.conservative, note: "Easiest to stick to. Best for keeping muscle when already lean.", warn: false },
  { id: "moderate", label: "Moderate", rate: RATE_PRESETS.moderate, note: "The usual choice for a cut.", warn: false },
  { id: "fast", label: "Fast", rate: RATE_PRESETS.aggressive, note: "Hungrier, and harder to keep muscle. Plan a diet break.", warn: true },
] as const;

const BULK_SPEEDS = [
  { id: "slow", label: GAIN_RATE_LABELS.slow, rate: GAIN_RATE_PRESETS.slow, note: "Leanest. Suits someone who's been training for years.", warn: false },
  { id: "standard", label: GAIN_RATE_LABELS.standard, rate: GAIN_RATE_PRESETS.standard, note: "The usual choice for a lean bulk.", warn: false },
  { id: "faster", label: GAIN_RATE_LABELS.faster, rate: GAIN_RATE_PRESETS.faster, note: "Suits beginners. More of the gain will be fat.", warn: true },
] as const;

const PHASE_OPTIONS = [
  { value: "cut" as const, label: "Cut" },
  { value: "bulk" as const, label: "Lean bulk" },
];

const SEX_OPTIONS = (["male", "female"] as const).map((value) => ({ value, label: SEX_LABELS[value] }));

export interface PlanSetupResult {
  profile: Partial<BiometricProfile>;
  fatLoss: Partial<FatLossInputs>;
  carbs: Partial<CarbCyclingInputs>;
}

/**
 * The guided setup: five short steps (about you, goal, how fast, activity,
 * eating plan) that fill in the same settings as Plan → Settings. Nothing is
 * saved until Finish. Full screen on phones, a centred panel on wider screens.
 */
export function PlanSetup({
  profile,
  fatLoss,
  carbs,
  unit,
  today,
  onClose,
  onFinish,
}: {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  unit: WeightUnit;
  today: string;
  onClose: () => void;
  onFinish: (result: PlanSetupResult) => void;
}) {
  const [step, setStep] = React.useState(0);
  const [sex, setSex] = React.useState<Sex>(profile.sex);
  const [age, setAge] = React.useState(profile.age);
  const [heightInches, setHeightInches] = React.useState(profile.heightInches);
  const [weight, setWeight] = React.useState(profile.weight);
  const [target, setTarget] = React.useState(fatLoss.goalType === "weight" ? fatLoss.targetWeight : Math.round(profile.weight * 0.9));
  const [startDate, setStartDate] = React.useState(fatLoss.mode === "startDate" && fatLoss.startDate >= today ? fatLoss.startDate : today);
  const [rate, setRate] = React.useState<number>(
    SPEEDS.find((s) => Math.abs(s.rate - fatLoss.weeklyRate) < 1e-6)?.rate ?? RATE_PRESETS.moderate,
  );
  const [phase, setPhase] = React.useState(fatLoss.phase);
  const [bulkWeeks, setBulkWeeks] = React.useState(fatLoss.bulkWeeks);
  const [gainRate, setGainRate] = React.useState<number>(
    BULK_SPEEDS.find((s) => Math.abs(s.rate - fatLoss.gainRate) < 1e-6)?.rate ?? GAIN_RATE_PRESETS.standard,
  );
  const bulking = phase === "bulk";
  const [steps, setSteps] = React.useState(fatLoss.dailySteps);
  const [trainingDays, setTrainingDays] = React.useState(fatLoss.trainingDays);
  const [cycle, setCycle] = React.useState(carbs.cycleCarbs);
  const heading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    heading.current?.focus();
  }, [step]);
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const draftProfile: BiometricProfile = { ...profile, sex, age, heightInches, weight, bodyFatOverride: weight === profile.weight ? profile.bodyFatOverride : null };
  const draftInputs = (speed: number): FatLossInputs => ({
    ...fatLoss,
    phase,
    goalType: "weight",
    targetWeight: target,
    mode: "startDate",
    startDate,
    ...(bulking ? { bulkWeeks, gainRate: speed } : { weeklyRate: speed }),
    fixedDeficit: null,
    activitySource: "steps",
    dailySteps: steps,
    trainingDays,
  });
  const options = (bulking ? BULK_SPEEDS : SPEEDS).map((s) => {
    const r = calculateFatLossTimeline(draftProfile, draftInputs(s.rate));
    return { ...s, result: r };
  });
  const chosenRate = bulking ? gainRate : rate;
  const picked = options.find((o) => Math.abs(o.rate - chosenRate) < 1e-6) ?? options[1]!;
  const pickSpeed = (r: number) => (bulking ? setGainRate(r) : setRate(r));

  const w = (lb: number, d = 1) => `${round(fromLb(lb, unit), d)} ${unit}`;
  const goalOk = bulking || (target < weight && target > 50);
  const canNext = step === 1 ? goalOk && isValidISODate(startDate) : true;

  const finish = () =>
    onFinish({
      profile: { sex, age, heightInches, weight, ...(weight === profile.weight ? {} : { bodyFatOverride: null }) },
      fatLoss: {
        phase,
        ...(bulking ? { bulkWeeks, gainRate } : { goalType: "weight" as const, targetWeight: target, weeklyRate: rate, fixedDeficit: null }),
        mode: "startDate",
        startDate,
        activitySource: "steps",
        dailySteps: steps,
        trainingDays,
      },
      carbs: { cycleCarbs: cycle },
    });

  const { feet, inches } = inchesToFeetInches(heightInches);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guided setup"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-background lg:items-center lg:bg-background/80 lg:p-6 lg:backdrop-blur-sm"
    >
      <div className="flex min-h-full w-full max-w-lg flex-col gap-4 bg-background p-4 pb-6 lg:min-h-0 lg:rounded-2xl lg:border lg:border-border lg:p-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Close setup" onClick={onClose}>
            <X />
          </Button>
          <div role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`} className="grid flex-1 grid-cols-5 gap-1">
            {STEPS.map((s, i) => (
              <span key={s} className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <span className="tabular text-xs text-muted-foreground">
            {step + 1} of {STEPS.length}
          </span>
        </div>

        {step === 0 ? (
          <>
            <Header refEl={heading} title="About you" text="Used to estimate your body fat and how much you burn in a day." />
            <Field label="Sex">
              <SegmentedControl ariaLabel="Sex" value={sex} onValueChange={setSex} options={SEX_OPTIONS} size="sm" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Current weight" value={round(fromLb(weight, unit), 1)} onValueChange={(v) => setWeight(toLb(v, unit))} suffix={unit} min={50} step={0.5} />
              <NumberField label="Age" value={age} onValueChange={setAge} suffix="yrs" min={14} max={100} step={1} decimals={0} />
            </div>
            {unit === "lb" ? (
              <div className="grid grid-cols-2 items-end gap-3">
                <NumberField label="Height" aria-label="Height, feet" value={feet} onValueChange={(v) => setHeightInches(feetInchesToInches(v, inches))} suffix="ft" min={3} max={8} step={1} decimals={0} />
                <NumberField label="Height, inches" labelSrOnly aria-label="Height, inches" value={inches} onValueChange={(v) => setHeightInches(feetInchesToInches(feet, v))} suffix="in" min={0} max={11} step={1} decimals={0} />
              </div>
            ) : (
              <NumberField label="Height" value={round(inchesToCm(heightInches), 0)} onValueChange={(v) => setHeightInches(cmToInches(v))} suffix="cm" min={100} max={240} step={1} decimals={0} />
            )}
          </>
        ) : step === 1 ? (
          <>
            <Header
              refEl={heading}
              title="What's your goal?"
              text={
                bulking
                  ? `You're ${w(weight)} now. Pick how long to build for, and when to start.`
                  : `You're ${w(weight)} now. Pick the weight you want to reach, and when to start.`
              }
            />
            <Field label="Plan">
              <SegmentedControl ariaLabel="Plan" value={phase} onValueChange={setPhase} options={PHASE_OPTIONS} size="sm" />
            </Field>
            {bulking ? (
              <NumberField
                label="Length"
                value={bulkWeeks}
                onValueChange={(v) => setBulkWeeks(clampBulkWeeks(v))}
                suffix="weeks"
                min={MIN_BULK_WEEKS}
                max={MAX_BULK_WEEKS}
                step={1}
                decimals={0}
              />
            ) : (
              <>
                <NumberField label="Goal weight" value={round(fromLb(target, unit), 1)} onValueChange={(v) => setTarget(toLb(v, unit))} suffix={unit} min={50} step={0.5} />
                {!goalOk ? <p className="text-sm text-warning">Your goal needs to be below your current weight.</p> : null}
              </>
            )}
            <Field label="Start date" htmlFor="setup-start">
              <Input id="setup-start" type="date" value={startDate} onChange={(e) => isValidISODate(e.target.value) && setStartDate(e.target.value)} />
            </Field>
          </>
        ) : step === 2 ? (
          <>
            <Header
              refEl={heading}
              title={bulking ? "How fast do you want to gain?" : "How fast do you want to go?"}
              text={
                bulking
                  ? `${bulkWeeks} weeks from ${w(weight, 0)}. Faster means more weight gained, but more of it is fat.`
                  : `${w(weight, 0)} to ${w(target, 0)}. Faster means fewer weeks, but less food and more hunger.`
              }
            />
            <div role="radiogroup" aria-label="Speed" className="space-y-2.5">
              {options.map((o) => {
                const on = o === picked;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickSpeed(o.rate)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-xl border-2 p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold">
                        {o.label} <span className="text-[13px] font-normal text-muted-foreground">· {Number((o.rate * 100).toFixed(2))}% a week</span>
                      </span>
                      <span className={cn("h-5 w-5 shrink-0 rounded-full border-2", on ? "border-primary bg-primary" : "border-border")} aria-hidden />
                    </span>
                    {o.result.feasible ? (
                      <span className="tabular grid grid-cols-3 gap-2">
                        {bulking ? (
                          <span className="flex flex-col">
                            <span className="text-[11px] text-muted-foreground">End weight</span>
                            <span className="font-semibold">{w(o.result.endWeight)}</span>
                          </span>
                        ) : (
                          <span className="flex flex-col">
                            <span className="text-[11px] text-muted-foreground">Goal date</span>
                            <span className="font-semibold">{formatMedium(o.result.finishDate)}</span>
                          </span>
                        )}
                        <span className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">{bulking ? "Gain" : "Length"}</span>
                          <span className="font-semibold">{bulking ? `+${w(-o.result.totalLoss)}` : `${o.result.weeksRequired} wk`}</span>
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[11px] text-muted-foreground">Eating</span>
                          <span className="font-semibold">{Math.round(o.result.averageTargetCalories).toLocaleString()} / day</span>
                        </span>
                      </span>
                    ) : null}
                    <span className={cn("text-xs", o.warn ? "text-warning" : "text-muted-foreground")}>{o.note}</span>
                  </button>
                );
              })}
            </div>
            {picked.result.feasible ? (
              <p className="molten-card rounded-[1.25rem] border border-primary/15 bg-card px-3 py-2.5 text-sm">
                {bulking
                  ? `At ${picked.label.toLowerCase()}, you reach about ${w(picked.result.endWeight, 0)} on ${formatMedium(picked.result.finishDate)}, eating about ${Math.round(picked.result.averageTargetCalories).toLocaleString()} kcal a day on average. Check-ins adjust that to your real rate of gain. You can change this any time in Settings.`
                  : `At ${picked.label.toLowerCase()}, you reach ${w(target, 0)} on ${formatMedium(picked.result.finishDate)} after ${picked.result.weeksRequired} weeks, eating about ${Math.round(picked.result.averageTargetCalories).toLocaleString()} kcal a day on average. You can change this any time in Settings.`}
              </p>
            ) : null}
          </>
        ) : step === 3 ? (
          <>
            <Header refEl={heading} title="How active are you?" text="Your usual day. Steps and training are counted in how much you burn, so you don't eat them back." />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Daily steps"
                value={steps}
                onValueChange={(v) => setSteps(Math.round(Math.min(Math.max(v, STEP_LIMITS.min), STEP_LIMITS.max)))}
                min={STEP_LIMITS.min}
                max={STEP_LIMITS.max}
                step={500}
                decimals={0}
              />
              <NumberField
                label="Training days"
                value={trainingDays}
                onValueChange={(v) => setTrainingDays(Math.round(Math.min(Math.max(v, TRAINING_DAY_LIMITS.min), TRAINING_DAY_LIMITS.max)))}
                suffix="/wk"
                min={TRAINING_DAY_LIMITS.min}
                max={TRAINING_DAY_LIMITS.max}
                step={1}
                decimals={0}
              />
            </div>
          </>
        ) : (
          <>
            <Header refEl={heading} title="How do you want to eat?" text="Either way, every week averages out to the same calories." />
            <div role="radiogroup" aria-label="Eating plan" className="space-y-2.5">
              {[
                { value: false, label: "Same every day", note: "One set of numbers, every day. Simplest to follow." },
                { value: true, label: "Carb cycling", note: "More carbs on hard training days, fewer on rest days: 2 high, 3 medium, 2 low." },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={cycle === o.value}
                  onClick={() => setCycle(o.value)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-xl border-2 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    cycle === o.value ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{o.label}</span>
                    <span className="text-xs text-muted-foreground">{o.note}</span>
                  </span>
                  <span className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-full border-2", cycle === o.value ? "border-primary bg-primary" : "border-border")} aria-hidden />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-auto flex gap-2.5 pt-2">
          <Button variant="outline" className="h-12 flex-1" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button className="h-12 flex-[2] font-semibold" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next: {STEPS[step + 1]!.toLowerCase()}
            </Button>
          ) : (
            <Button className="h-12 flex-[2] font-semibold" onClick={finish}>
              Finish and see my plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ refEl, title, text }: { refEl: React.RefObject<HTMLHeadingElement | null>; title: string; text: string }) {
  return (
    <div className="space-y-1">
      <h2 ref={refEl} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
