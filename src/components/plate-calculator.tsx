"use client";

import * as React from "react";
import { Check, Disc3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { BARS, PLATES, describePlates, plateColor, platesFor, type PlateColor } from "@/lib/plates";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAR_KEY = "prep-calculator:bar:v1";
const LOAD_KEY = "prep-calculator:load-type:v1";

/** A barbell counts the bar's own weight; a plate-loaded machine is plates only. */
export type LoadType = "barbell" | "machine";

/** The bar this member uses, remembered on the device. */
export function useBar(unit: WeightUnit): [number, (bar: number) => void] {
  const [bar, setBar] = React.useState<number>(BARS[unit][0]!);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(BAR_KEY) ?? "null") as Record<string, number> | null;
      const b = saved?.[unit];
      setBar(typeof b === "number" && BARS[unit].includes(b) ? b : BARS[unit][0]!);
    } catch {
      setBar(BARS[unit][0]!);
    }
  }, [unit]);
  const choose = React.useCallback(
    (b: number) => {
      setBar(b);
      try {
        const saved = JSON.parse(window.localStorage.getItem(BAR_KEY) ?? "{}") as Record<string, number>;
        window.localStorage.setItem(BAR_KEY, JSON.stringify({ ...saved, [unit]: b }));
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
    },
    [unit],
  );
  return [bar, choose];
}

/** Barbell or machine on the Training tab card, remembered on the device. */
function useLoadType(): [LoadType, (t: LoadType) => void] {
  const [type, setType] = React.useState<LoadType>("barbell");
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(LOAD_KEY) === "machine") setType("machine");
    } catch {
      /* storage blocked: start on barbell */
    }
  }, []);
  const choose = React.useCallback((t: LoadType) => {
    setType(t);
    try {
      window.localStorage.setItem(LOAD_KEY, t);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  }, []);
  return [type, choose];
}

/** Plate height by weight, as a share of the biggest plate. */
function plateHeight(p: number, unit: WeightUnit): number {
  const biggest = PLATES[unit][0]!;
  return Math.max(34, Math.round(Math.sqrt(p / biggest) * 100));
}

/** Plate thickness in px: heavier plates are thicker, and each is wide enough for its number written upright. */
function plateWidth(p: number, unit: WeightUnit): number {
  const rank = PLATES[unit].indexOf(p);
  return [20, 19, 18, 17, 16, 16, 16][rank] ?? 16;
}

/** Smaller type for longer labels ("2.5", "1.25") so they fit across a plate. */
function labelSize(p: number): string {
  const len = String(p).length;
  return len <= 2 ? "text-[10px]" : len === 3 ? "text-[9px]" : "text-[7.5px]";
}

// Full class names, so Tailwind keeps them.
const PLATE_CLASS: Record<PlateColor, string> = {
  blue: "bg-plate-blue text-plate-blue-foreground",
  green: "bg-plate-green text-plate-green-foreground",
  red: "bg-plate-red text-plate-red-foreground",
  yellow: "bg-plate-yellow text-plate-yellow-foreground",
  white: "bg-plate-white text-plate-white-foreground",
  silver: "bg-plate-silver text-plate-silver-foreground",
};

function Plates({ plates, unit }: { plates: readonly number[]; unit: WeightUnit }) {
  if (plates.length === 0) return null;
  return (
    <div className="flex h-full shrink-0 items-center gap-[2px] px-[2px]">
      {plates.map((p, i) => (
        <div
          key={i}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[3px] font-bold leading-none tracking-tighter ring-1 ring-inset ring-black/15",
            PLATE_CLASS[plateColor(p, unit)],
            labelSize(p),
          )}
          style={{ height: `${plateHeight(p, unit)}%`, width: plateWidth(p, unit) }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

/**
 * The whole load, drawn: sleeve, plates, collar, the middle, then the same on
 * the other side. Heaviest plates sit against the collars. The middle is the
 * bar's shaft, or a block for a plate-loaded machine. A very heavy load
 * scrolls sideways rather than squashing the plates.
 */
function BarDiagram({ perSide, unit, type }: { perSide: readonly number[]; unit: WeightUnit; type: LoadType }) {
  const sleeve = "h-2.5 min-w-2 flex-1 bg-muted-foreground/45";
  const collar = <div className="h-6 w-1.5 shrink-0 rounded-sm bg-muted-foreground/70" />;
  return (
    <div className="scrollbar-thin overflow-x-auto" aria-hidden>
      <div className="flex h-28 w-full min-w-max items-center">
        <div className={cn(sleeve, "rounded-l")} />
        <Plates plates={[...perSide].reverse()} unit={unit} />
        {collar}
        {type === "machine" ? (
          <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[8px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-20">
            Machine
          </div>
        ) : (
          <div className="h-1.5 w-8 shrink-0 bg-muted-foreground/35 sm:w-24" />
        )}
        {collar}
        <Plates plates={perSide} unit={unit} />
        <div className={cn(sleeve, "rounded-r")} />
      </div>
    </div>
  );
}

/** The result for a total: diagram, plates per side, and anything that can't be loaded exactly. */
export function PlateResult({ total, bar, unit, type = "barbell" }: { total: number; bar: number; unit: WeightUnit; type?: LoadType }) {
  const barWeight = type === "barbell" ? bar : 0;
  const load = platesFor(total, barWeight, unit);
  if (type === "barbell" && load.belowBar) {
    return <p className="text-xs text-muted-foreground">That&apos;s less than the {bar} {unit} bar on its own.</p>;
  }
  if (load.perSide.length === 0) {
    if (type === "machine") {
      const smallest = PLATES[unit][PLATES[unit].length - 1]!;
      return <p className="text-xs text-muted-foreground">That&apos;s less than the smallest pair of plates ({2 * smallest} {unit}).</p>;
    }
    return (
      <div className="space-y-1.5">
        <BarDiagram perSide={[]} unit={unit} type={type} />
        <p className="text-xs text-muted-foreground">Just the empty bar ({bar} {unit}).</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <BarDiagram perSide={load.perSide} unit={unit} type={type} />
      <p className="text-sm">
        <span className="font-semibold">Each side:</span> <span className="tabular">{describePlates(load.perSide)}</span>
        <span className="tabular text-muted-foreground"> ({load.sideWeight} {unit})</span>
      </p>
      <p className="tabular text-xs text-muted-foreground">
        {type === "barbell" ? `Counts the ${bar} ${unit} bar.` : "Plates only. No bar weight counted."}
      </p>
      {load.short > 0 ? (
        <p className="tabular text-xs text-warning">
          Closest with standard plates: {load.loaded} {unit} ({load.short} {unit} short).
        </p>
      ) : null}
    </div>
  );
}

/** Barbell or machine, as two check boxes where ticking one unticks the other. */
export function LoadTypePicker({ value, onChange, className }: { value: LoadType; onChange: (t: LoadType) => void; className?: string }) {
  const name = React.useId();
  const options: { value: LoadType; label: string }[] = [
    { value: "barbell", label: "Barbell" },
    { value: "machine", label: "Machine" },
  ];
  return (
    <div role="radiogroup" aria-label="Loading a barbell or a machine" className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer select-none items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              on ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-[4px] border",
                on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60",
              )}
            >
              {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Training tab card: type a weight, see the plates. */
export function PlateCalculatorCard({ unit }: { unit: WeightUnit }) {
  const [text, setText] = React.useState(unit === "kg" ? "100" : "225");
  const [bar, setBar] = useBar(unit);
  const [type, setType] = useLoadType();
  const id = React.useId();
  React.useEffect(() => setText(unit === "kg" ? "100" : "225"), [unit]);
  const total = Number(text.replace(",", "."));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Disc3 className="h-4 w-4 text-primary" />
          Plate calculator
        </CardTitle>
        <CardDescription>Type the total weight to see what goes on each side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LoadTypePicker value={type} onChange={setType} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor={id} className="text-xs font-medium">
              Total
            </label>
            <div className="relative w-28">
              <Input id={id} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="pr-9" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
            </div>
          </div>
          {type === "barbell" ? <BarPicker unit={unit} bar={bar} onBar={setBar} className="w-40" /> : null}
        </div>
        {text.trim() && Number.isFinite(total) && total > 0 ? (
          <PlateResult total={total} bar={bar} unit={unit} type={type} />
        ) : (
          <p className="text-xs text-muted-foreground">Enter a weight.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function BarPicker({ unit, bar, onBar, className }: { unit: WeightUnit; bar: number; onBar: (b: number) => void; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs font-medium">Bar</p>
      <SegmentedControl
        ariaLabel="Bar weight"
        size="sm"
        value={String(bar)}
        onValueChange={(v) => onBar(Number(v))}
        options={BARS[unit].map((b) => ({ value: String(b), label: `${b} ${unit}` }))}
      />
    </div>
  );
}
