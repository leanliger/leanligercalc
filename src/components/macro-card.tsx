"use client";

import * as React from "react";
import { Beef, Droplet, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { DAY_DESCRIPTIONS, DAY_LABELS } from "@/lib/carb-cycling";
import type { DayPlan } from "@/lib/types";
import { KCAL_PER_G } from "@/lib/units";
import { cn } from "@/lib/utils";

const DAY_ACCENTS = {
  high: {
    bar: "bg-day-high",
    text: "text-day-high",
    ring: "border-day-high/40 bg-day-high/[0.06]",
  },
  medium: {
    bar: "bg-day-medium",
    text: "text-day-medium",
    ring: "border-day-medium/40 bg-day-medium/[0.06]",
  },
  low: {
    bar: "bg-day-low",
    text: "text-day-low",
    ring: "border-day-low/40 bg-day-low/[0.06]",
  },
} as const;

const MACROS = [
  { key: "protein", label: "Protein", icon: Beef, color: "bg-macro-protein", text: "text-macro-protein" },
  { key: "carbs", label: "Carbs", icon: Wheat, color: "bg-macro-carb", text: "text-macro-carb" },
  { key: "fat", label: "Fat", icon: Droplet, color: "bg-macro-fat", text: "text-macro-fat" },
] as const;

/** "613 under maintenance", "120 over maintenance", or "at maintenance". */
function vsMaintenance(calories: number, maintenance: number): string {
  const diff = Math.round(maintenance - calories);
  if (Math.abs(diff) < 10) return "at maintenance";
  return `${Math.abs(diff).toLocaleString()} ${diff > 0 ? "under" : "over"} maintenance`;
}

export function MacroCard({ day, maintenance }: { day: DayPlan; maintenance?: number }) {
  const accent = DAY_ACCENTS[day.type];

  // Calorie share per macro drives the stacked bar, so the visual proportions
  // reflect energy contribution rather than raw grams.
  const kcal = {
    protein: day.protein * KCAL_PER_G.protein,
    carbs: day.carbs * KCAL_PER_G.carbs,
    fat: day.fat * KCAL_PER_G.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat || 1;

  const copyText = [
    `${DAY_LABELS[day.type]} day — ${day.calories} kcal`,
    `Protein ${day.protein}g · Carbs ${day.carbs}g · Fat ${day.fat}g`,
    `${day.count} day${day.count === 1 ? "" : "s"} per week`,
  ].join("\n");

  return (
    <div className={cn("flex flex-col rounded-lg border p-4", accent.ring)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent.bar)} />
            <h3 className="truncate text-sm font-semibold">{DAY_LABELS[day.type]}</h3>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {DAY_DESCRIPTIONS[day.type]}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 tabular">
          {day.count}×/wk
        </Badge>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="tabular text-3xl font-semibold leading-none">
          {day.calories.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">kcal</span>
        {day.caloriePercentOfBaseline !== 0 ? (
          <span
            className={cn(
              "ml-auto tabular text-xs font-medium",
              day.caloriePercentOfBaseline > 0 ? "text-success" : "text-muted-foreground",
            )}
          >
            {day.caloriePercentOfBaseline > 0 ? "+" : ""}
            {day.caloriePercentOfBaseline}% vs target
          </span>
        ) : null}
      </div>

      {maintenance ? (
        <p className="tabular mt-1 text-xs text-muted-foreground">{vsMaintenance(day.calories, maintenance)}</p>
      ) : null}

      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Calorie split: ${Math.round((kcal.protein / total) * 100)}% protein, ${Math.round((kcal.carbs / total) * 100)}% carbs, ${Math.round((kcal.fat / total) * 100)}% fat`}
      >
        {MACROS.map((macro) => (
          <div
            key={macro.key}
            className={macro.color}
            style={{ width: `${(kcal[macro.key] / total) * 100}%` }}
          />
        ))}
      </div>

      <dl className="mt-4 space-y-2">
        {MACROS.map((macro) => {
          const Icon = macro.icon;
          return (
            <div key={macro.key} className="flex items-center gap-2 text-sm">
              <Icon className={cn("h-3.5 w-3.5 shrink-0", macro.text)} />
              <dt className="text-muted-foreground">{macro.label}</dt>
              <dd className="ml-auto flex items-baseline gap-2">
                <span className="tabular font-semibold">{day[macro.key]}g</span>
                <span className="tabular w-14 text-right text-xs text-muted-foreground">
                  {day.perPound[macro.key]} g/lb
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
        <span className="text-[11px] text-muted-foreground">
          {day.fatFloorApplied ? "Fat at floor" : "Fat above floor"}
        </span>
        <CopyButton getText={() => copyText} label="Copy" variant="ghost" />
      </div>
    </div>
  );
}
