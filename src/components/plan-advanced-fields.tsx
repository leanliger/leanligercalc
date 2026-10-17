"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { Field, NumberField } from "@/components/field";
import { HIGH_BOOST_RANGE, LOW_CUT_RANGE, resolveProtein } from "@/lib/carb-cycling";
import { dailyDeficitForRate, rateForDailyDeficit } from "@/lib/fat-loss";
import { formatCalories } from "@/lib/format";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, FatLossResult, ProteinBasis } from "@/lib/types";

/**
 * The settings most people never change, shown together under Plan →
 * Settings → Advanced: the deficit, maintenance and adaptation (the
 * Timeline's), then protein, fat and the carb swing (the eating plan's).
 */

const PROTEIN_BASIS_OPTIONS: readonly { value: ProteinBasis; label: string }[] = [
  { value: "bodyWeight", label: "Body weight" },
  { value: "leanMass", label: "Lean mass" },
];

/** Daily deficit instead of a rate, known maintenance, and metabolic adaptation. */
export function FatLossAdvancedFields({
  profile,
  inputs,
  result,
  onChange,
}: {
  profile: BiometricProfile;
  inputs: FatLossInputs;
  result: FatLossResult;
  onChange: (patch: Partial<FatLossInputs>) => void;
}) {
  const fixedId = React.useId();
  const firstWeek = result.projection[0];
  const lastDietWeek = result.projection.length > 2 ? result.projection[result.projection.length - 2] : undefined;
  const typedDeficit = inputs.fixedDeficit ?? Math.round(dailyDeficitForRate(profile, inputs.weeklyRate));
  // With a fixed deficit the weekly rate climbs as weight drops: first and last week.
  const rateAt = (i: number) => {
    const row = result.projection[i];
    const prev = result.projection[i - 1];
    return row && prev && prev.weight > 0 ? (row.weeklyLoss / prev.weight) * 100 : null;
  };
  const firstRate = rateAt(1);
  const lastRate = rateAt(result.projection.length - 1);

  return (
    <>
      <NumberField
        label="Daily deficit instead of speed"
        value={typedDeficit}
        onValueChange={(kcal) => {
          if (kcal > 0)
            onChange(
              inputs.fixedDeficit
                ? { fixedDeficit: Math.round(kcal), weeklyRate: rateForDailyDeficit(profile, kcal) }
                : { weeklyRate: rateForDailyDeficit(profile, kcal) },
            );
        }}
        suffix="kcal/day"
        min={50}
        step={25}
        decimals={0}
        hint={
          inputs.fixedDeficit
            ? result.feasible && firstRate !== null && lastRate !== null
              ? `The same every week. Weekly loss goes from ${firstRate.toFixed(2)}% to ${lastRate.toFixed(2)}% of your weight as you get lighter.`
              : "The same every week."
            : result.feasible && lastDietWeek
              ? `That's ${(inputs.weeklyRate * 100).toFixed(2)}% a week. It eases as your weight drops: about ${lastDietWeek.dailyDeficit.toLocaleString()} kcal/day by week ${lastDietWeek.week + 1}.`
              : `That's ${(inputs.weeklyRate * 100).toFixed(2)}% a week.`
        }
        help="With 'Keep it the same every week' off, this sets the speed that gives this deficit in week 1, and the deficit shrinks a little as you get lighter. On, the deficit stays exactly this, so the weekly loss speeds up slightly instead."
      />
      <div className="flex items-center gap-2.5">
        <label htmlFor={fixedId} className="min-w-0 flex-1 text-xs font-medium">
          Keep it the same every week
          <span className="block font-normal text-muted-foreground">
            {inputs.fixedDeficit ? "Changing the speed goes back to a rate." : "Off: the deficit eases as your weight drops."}
          </span>
        </label>
        <Switch
          id={fixedId}
          checked={inputs.fixedDeficit !== null}
          onCheckedChange={(on) => onChange(on ? { fixedDeficit: typedDeficit } : { fixedDeficit: null })}
        />
      </div>

      <NumberField
        label="Known maintenance calories"
        value={inputs.tdeeOverride ?? 0}
        onValueChange={(value) => onChange({ tdeeOverride: value > 0 ? value : null })}
        suffix="kcal"
        min={0}
        step={25}
        decimals={0}
        placeholder="Optional"
        hint={
          inputs.tdeeOverride
            ? "Overrides the estimate, and still falls as you get lighter."
            : `Leave blank to estimate (${formatCalories(firstWeek?.tdee ?? 0)} from ${
                inputs.activitySource === "steps" ? "your steps and training" : "your activity level"
              }).`
        }
        help="If you have tracked your intake at stable weight, enter it here. A measured maintenance figure beats any formula."
      />

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border p-3">
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">Metabolic adaptation</span>
          <span className="block text-xs text-muted-foreground">Allows for a slower burn late in a long diet (up to 10% lower maintenance).</span>
        </span>
        <Switch
          checked={inputs.includeMetabolicAdaptation}
          onCheckedChange={(checked) => onChange({ includeMetabolicAdaptation: checked })}
          aria-label="Model metabolic adaptation"
        />
      </label>
    </>
  );
}

/** Protein per pound (on body weight or lean mass) and the fat floor. */
export function ProteinFatFields({
  profile,
  inputs,
  onChange,
}: {
  profile: BiometricProfile;
  inputs: CarbCyclingInputs;
  onChange: (patch: Partial<CarbCyclingInputs>) => void;
}) {
  const protein = resolveProtein(profile, inputs);
  return (
    <>
      <div className="space-y-3">
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
            <span className="tabular font-semibold text-macro-protein">{inputs.proteinPerLb.toFixed(2)} g/lb</span>
          </div>
          <Slider
            value={[inputs.proteinPerLb * 100]}
            onValueChange={([value]) => onChange({ proteinPerLb: (value ?? 110) / 100 })}
            min={60}
            max={160}
            step={5}
            aria-label="Protein grams per pound"
          />
          <p className="tabular text-xs text-muted-foreground">
            {Math.round(protein)}g per day · {inputs.proteinBasis === "leanMass" ? "on lean mass" : "on body weight"}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Fat minimum</span>
            <span className="tabular font-semibold text-macro-fat">{Math.round(inputs.fatFloorPercent * 100)}% of calories</span>
          </div>
          <Slider
            value={[inputs.fatFloorPercent * 100]}
            onValueChange={([value]) => onChange({ fatFloorPercent: (value ?? 22) / 100 })}
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
    </>
  );
}

/** How far high days go up and low days come down (carb cycling only). */
export function CarbSwingFields({
  inputs,
  onChange,
}: {
  inputs: CarbCyclingInputs;
  onChange: (patch: Partial<CarbCyclingInputs>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">High-day carbs</span>
          <span className="tabular font-semibold text-day-high">+{Math.round(inputs.highCarbBoost * 100)}%</span>
        </div>
        <Slider
          value={[inputs.highCarbBoost * 100]}
          onValueChange={([value]) => onChange({ highCarbBoost: (value ?? 20) / 100 })}
          min={0}
          max={50}
          step={1}
          aria-label="High day carb boost"
        />
        <p className="text-[12px] text-muted-foreground">
          Recommended {Math.round(HIGH_BOOST_RANGE.min * 100)}–{Math.round(HIGH_BOOST_RANGE.max * 100)}% more carbs than an average day
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Low-day carbs</span>
          <span className="tabular font-semibold text-day-low">−{Math.round(inputs.lowCarbCut * 100)}%</span>
        </div>
        <Slider
          value={[inputs.lowCarbCut * 100]}
          onValueChange={([value]) => onChange({ lowCarbCut: (value ?? 25) / 100 })}
          min={0}
          max={60}
          step={1}
          aria-label="Low day carb cut"
        />
        <p className="text-[12px] text-muted-foreground">
          Recommended {Math.round(LOW_CUT_RANGE.min * 100)}–{Math.round(LOW_CUT_RANGE.max * 100)}% fewer carbs than an average day
        </p>
      </div>
    </div>
  );
}
