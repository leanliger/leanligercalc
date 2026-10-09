"use client";

import * as React from "react";
import { Disc3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { BARS, PLATES, describePlates, platesFor } from "@/lib/plates";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAR_KEY = "prep-calculator:bar:v1";

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

/** Plate height by weight, as a share of the biggest plate. */
function plateHeight(p: number, unit: WeightUnit): number {
  const biggest = PLATES[unit][0]!;
  return Math.max(30, Math.round(Math.sqrt(p / biggest) * 100));
}

/** One side of the bar, drawn: the sleeve with plates stacked from the collar out. */
function BarDiagram({ perSide, unit }: { perSide: readonly number[]; unit: WeightUnit }) {
  return (
    <div className="flex h-24 items-center" aria-hidden>
      <div className="h-2 w-6 rounded-l bg-muted-foreground/40" />
      <div className="h-6 w-1.5 bg-muted-foreground/60" />
      <div className="flex h-full items-center gap-[3px] px-[3px]">
        {perSide.map((p, i) => (
          <div
            key={i}
            className="flex w-5 items-center justify-center rounded-sm bg-primary text-[9px] font-bold text-primary-foreground"
            style={{ height: `${plateHeight(p, unit)}%` }}
          >
            <span className="-rotate-90 whitespace-nowrap">{p}</span>
          </div>
        ))}
      </div>
      <div className="h-2 flex-1 rounded-r bg-muted-foreground/40" />
    </div>
  );
}

/** The result for a total: diagram, plates per side, and anything that can't be loaded exactly. */
export function PlateResult({ total, bar, unit }: { total: number; bar: number; unit: WeightUnit }) {
  const load = platesFor(total, bar, unit);
  if (load.belowBar) {
    return <p className="text-xs text-muted-foreground">That&apos;s less than the {bar} {unit} bar on its own.</p>;
  }
  if (load.perSide.length === 0) {
    return <p className="text-xs text-muted-foreground">Just the empty bar ({bar} {unit}).</p>;
  }
  return (
    <div className="space-y-1.5">
      <BarDiagram perSide={load.perSide} unit={unit} />
      <p className="text-sm">
        <span className="font-semibold">Each side:</span> <span className="tabular">{describePlates(load.perSide)}</span>
        <span className="tabular text-muted-foreground"> ({load.sideWeight} {unit})</span>
      </p>
      {load.short > 0 ? (
        <p className="tabular text-xs text-warning">
          Closest with standard plates: {load.loaded} {unit} ({load.short} {unit} short).
        </p>
      ) : null}
    </div>
  );
}

/** Training tab card: type a weight, see the plates. */
export function PlateCalculatorCard({ unit }: { unit: WeightUnit }) {
  const [text, setText] = React.useState(unit === "kg" ? "100" : "225");
  const [bar, setBar] = useBar(unit);
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
          <BarPicker unit={unit} bar={bar} onBar={setBar} className="w-40" />
        </div>
        {text.trim() && Number.isFinite(total) && total > 0 ? (
          <PlateResult total={total} bar={bar} unit={unit} />
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
