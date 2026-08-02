"use client";

import * as React from "react";
import { Info, Ruler, User } from "lucide-react";
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
import { SegmentedControl } from "@/components/ui/segmented";
import { Field, NumberField } from "@/components/field";
import {
  SEX_LABELS,
  bodyFatCategory,
  bodyFatIsLikelyOverestimated,
  calculateBmi,
  isEstimatedBodyFat,
  resolveBodyFat,
} from "@/lib/body-composition";
import type { BiometricProfile, Sex, WeightUnit } from "@/lib/types";
import {
  cmToInches,
  feetInchesToInches,
  fromLb,
  inchesToCm,
  inchesToFeetInches,
  round,
  toLb,
} from "@/lib/units";
import { cn } from "@/lib/utils";

interface ProfileCardProps {
  profile: BiometricProfile;
  onChange: (patch: Partial<BiometricProfile>) => void;
  unit: WeightUnit;
  className?: string;
}

const SEX_OPTIONS: readonly { value: Sex; label: string }[] = [
  { value: "male", label: SEX_LABELS.male },
  { value: "female", label: SEX_LABELS.female },
];

/** Feet + inches pair, shown when the app is in imperial mode. */
function HeightImperial({
  heightInches,
  onChange,
}: {
  heightInches: number;
  onChange: (inches: number) => void;
}) {
  const { feet, inches } = inchesToFeetInches(heightInches);
  return (
    <div className="grid grid-cols-2 items-end gap-2">
      {/* The visible label reads "Height" for both halves; aria-label carries
          the unit, which a screen reader would not pick up from the suffix. */}
      <NumberField
        label="Height"
        aria-label="Height, feet"
        value={feet}
        onValueChange={(value) => onChange(feetInchesToInches(value, inches))}
        suffix="ft"
        min={3}
        max={8}
        step={1}
        decimals={0}
      />
      <NumberField
        label="Height, inches"
        labelSrOnly
        aria-label="Height, inches"
        value={inches}
        onValueChange={(value) => onChange(feetInchesToInches(feet, value))}
        suffix="in"
        min={0}
        max={11}
        step={1}
        decimals={0}
      />
    </div>
  );
}

export function ProfileCard({ profile, onChange, unit, className }: ProfileCardProps) {
  const bodyFat = resolveBodyFat(profile);
  const estimated = isEstimatedBodyFat(profile);
  const bmi = calculateBmi(profile.weight, profile.heightInches);
  const mayOverestimate = bodyFatIsLikelyOverestimated(profile);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          About you
        </CardTitle>
        <CardDescription>
          Used by both calculators. Everything recalculates as you type.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Current weight"
            value={round(fromLb(profile.weight, unit), 1)}
            onValueChange={(value) => onChange({ weight: toLb(value, unit) })}
            suffix={unit}
            min={50}
            step={0.5}
          />
          <NumberField
            label="Age"
            value={profile.age}
            onValueChange={(value) => onChange({ age: value })}
            suffix="yrs"
            min={14}
            max={100}
            step={1}
            decimals={0}
          />
        </div>

        {unit === "lb" ? (
          <HeightImperial
            heightInches={profile.heightInches}
            onChange={(inches) => onChange({ heightInches: inches })}
          />
        ) : (
          <NumberField
            label="Height"
            value={round(inchesToCm(profile.heightInches), 0)}
            onValueChange={(value) => onChange({ heightInches: cmToInches(value) })}
            suffix="cm"
            min={100}
            max={240}
            step={1}
            decimals={0}
          />
        )}

        <Field
          label="Sex"
          help="Selects the coefficients in the Mifflin-St Jeor and Deurenberg equations, which are only published for male and female. If neither fits you, enter a measured body fat percentage and your known maintenance calories — that bypasses both equations."
        >
          <SegmentedControl
            ariaLabel="Sex"
            value={profile.sex}
            onValueChange={(value) => onChange({ sex: value })}
            options={SEX_OPTIONS}
            size="sm"
          />
        </Field>

        {/* ---------------------- Derived composition ---------------------- */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Body fat
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tabular text-2xl font-semibold text-primary">
                  {round(bodyFat, 1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {bodyFatCategory(bodyFat, profile.sex)}
                </span>
              </div>
            </div>
            <Badge variant={estimated ? "secondary" : "success"}>
              {estimated ? "Estimated" : "Measured"}
            </Badge>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {estimated ? (
              <>
                Estimated from your height, weight, age and sex (BMI {round(bmi, 1)}).
                You don&apos;t need to know this number — but if you&apos;ve had a DEXA,
                BodPod, or caliper reading, entering it makes the projection more
                accurate.
              </>
            ) : (
              <>Using your measured value instead of the estimate.</>
            )}
          </p>

          {mayOverestimate ? (
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/[0.09] p-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed">
                This estimate is BMI-based, and BMI can&apos;t tell muscle from fat. At
                your height and weight it may read several points high if you carry
                above-average muscle — likely if you train seriously.
              </p>
            </div>
          ) : null}

          {estimated ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onChange({ bodyFatOverride: round(bodyFat, 1) })}
            >
              I know my body fat %
            </Button>
          ) : (
            <div className="space-y-2">
              <Field label="Measured body fat" htmlFor="bf-override">
                <div className="relative">
                  <Input
                    id="bf-override"
                    type="number"
                    inputMode="decimal"
                    min={3}
                    max={70}
                    step={0.5}
                    value={profile.bodyFatOverride ?? ""}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      onChange({
                        bodyFatOverride: Number.isFinite(parsed) ? parsed : null,
                      });
                    }}
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange({ bodyFatOverride: null })}
              >
                Use the estimate instead
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
