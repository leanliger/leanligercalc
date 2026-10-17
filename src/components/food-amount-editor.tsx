"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  editBasis,
  perUnit,
  roundMacros,
  scaleMacros,
  unitLabel,
  type FoodBasis,
  type FoodUnit,
  type MacroField,
  type Macros,
} from "@/lib/food";
import { cn } from "@/lib/utils";

/** What the editor hands back: the amount and its nutrition, ready to log. */
export interface AmountResult extends Macros {
  quantity: number;
  unit: FoodUnit;
  /** For servings: what one is, e.g. "1 scoop (32 g)". */
  servingLabel: string | null;
}

const FIELDS: { key: MacroField; label: string; suffix: string; text: string }[] = [
  { key: "kcal", label: "Calories", suffix: "kcal", text: "text-foreground" },
  { key: "protein", label: "Protein", suffix: "g", text: "text-macro-protein" },
  { key: "carbs", label: "Carbs", suffix: "g", text: "text-macro-carb" },
  { key: "fat", label: "Fat", suffix: "g", text: "text-macro-fat" },
];

const fmt = (n: number, field: MacroField) => String(field === "kcal" ? Math.round(n) : Math.round(n * 10) / 10);

/**
 * The amount of a food and its calories and macros, all editable: switch
 * between servings and grams (asking how many grams a serving is when the
 * label doesn't say), change the amount and the numbers scale with it, or
 * type the numbers themselves. Typed numbers become the food's new basis,
 * so they keep scaling; changing protein, carbs or fat moves the calories by
 * 4 / 4 / 9 kcal a gram.
 */
export function FoodAmountEditor({
  basis: initialBasis,
  baseUnit,
  initialQuantity,
  initialUnit,
  servingSize: initialSize,
  servingLabel,
  onChange,
}: {
  basis: FoodBasis | null;
  baseUnit: "g" | "ml";
  initialQuantity: number;
  initialUnit: FoodUnit;
  servingSize: number | null;
  servingLabel: string | null;
  onChange: (result: AmountResult | null) => void;
}) {
  const [basis, setBasis] = React.useState<FoodBasis | null>(initialBasis);
  const [unit, setUnit] = React.useState<"base" | "serving">(initialUnit === "serving" ? "serving" : "base");
  const [qtyText, setQtyText] = React.useState(String(initialQuantity));
  const [size, setSize] = React.useState<number | null>(initialSize);
  const [sizeText, setSizeText] = React.useState(initialSize ? String(initialSize) : "");
  // The field being typed in keeps its text; the others follow the numbers.
  const [draft, setDraft] = React.useState<{ field: MacroField; text: string } | null>(null);
  const qtyId = React.useId();
  const sizeId = React.useId();

  const quantity = Number(qtyText);
  const one = basis ? perUnit(basis, unit, size) : null;
  const macros = one && quantity > 0 ? scaleMacros(one, quantity) : null;
  const needsSize = basis !== null && one === null;
  const unitName = baseUnit === "ml" ? "ml" : "g";

  const label =
    unit === "serving"
      ? (servingLabel ?? (size ? `1 serving (${size} ${unitName})` : null))
      : null;

  React.useEffect(() => {
    onChange(
      macros
        ? {
            quantity: Math.round(quantity * 100) / 100,
            unit: unit === "serving" ? "serving" : baseUnit,
            servingLabel: label,
            ...roundMacros(macros),
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report when the numbers change
  }, [macros?.kcal, macros?.protein, macros?.carbs, macros?.fat, quantity, unit, label]);

  const switchUnit = (next: "base" | "serving") => {
    if (next === unit) return;
    setDraft(null);
    // Keep the same amount of food when the serving's size is known.
    if (size && quantity > 0) {
      const converted = next === "serving" ? quantity / size : quantity * size;
      setQtyText(String(Math.round(converted * 100) / 100));
    } else {
      setQtyText(next === "serving" ? "1" : "100");
    }
    setUnit(next);
  };

  const changeSize = (text: string) => {
    setSizeText(text);
    const n = Number(text);
    const valid = Number.isFinite(n) && n > 0 ? n : null;
    // Switching to grams before the size was known: the amount was a guess of 100 g;
    // now that a serving's size is known, start from one serving's worth.
    if (valid && !size && unit === "base" && basis?.per === "serving") setQtyText(String(valid));
    setSize(valid);
  };

  const bump = (delta: number) => {
    setDraft(null);
    const next = Math.max(Math.round(((quantity || 0) + delta) * 100) / 100, 0);
    setQtyText(String(next || (unit === "serving" ? 0.5 : 10)));
  };

  const editField = (field: MacroField, text: string) => {
    setDraft({ field, text });
    const v = Number(text);
    if (!macros || !(quantity > 0) || text.trim() === "" || !Number.isFinite(v) || v < 0) return;
    setBasis(editBasis(macros, quantity, unit, field, v));
  };

  const step = unit === "serving" ? 0.5 : 10;
  const unitOptions = [
    { value: "serving" as const, label: "Servings" },
    { value: "base" as const, label: baseUnit === "ml" ? "Millilitres" : "Grams" },
  ];

  return (
    <div className="space-y-3">
      <SegmentedControl ariaLabel="Measure by" size="sm" value={unit} onValueChange={switchUnit} options={unitOptions} />

      <div className="space-y-1.5">
        <Label htmlFor={qtyId}>Amount</Label>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => bump(-step)} aria-label="Less">
            <Minus />
          </Button>
          <div className="relative min-w-0 flex-1">
            <Input
              id={qtyId}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={qtyText}
              onChange={(e) => {
                setDraft(null);
                setQtyText(e.target.value);
              }}
              className="pr-20 text-center text-base"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {unit === "serving" ? unitLabel("serving", quantity) : unitName}
            </span>
          </div>
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => bump(step)} aria-label="More">
            <Plus />
          </Button>
        </div>
      </div>

      <div className={cn("flex items-center gap-2 text-xs", needsSize ? "rounded-md border border-primary/40 bg-primary/5 p-2.5" : "text-muted-foreground")}>
        <label htmlFor={sizeId} className={cn("shrink-0", needsSize && "font-medium text-foreground")}>
          {needsSize ? `How many ${unitName === "g" ? "grams" : "ml"} is 1 serving?` : "1 serving ="}
        </label>
        <div className="relative w-28">
          <Input
            id={sizeId}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder={needsSize ? "e.g. 32" : "unknown"}
            value={sizeText}
            onChange={(e) => changeSize(e.target.value)}
            className="h-8 pr-8 text-sm"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{unitName}</span>
        </div>
      </div>

      <fieldset className="space-y-1.5" disabled={!macros}>
        <legend className="mb-1.5 text-sm font-medium">
          For this amount <span className="font-normal text-muted-foreground">(tap a number to change it)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FIELDS.map((f) => {
            const id = `${qtyId}-${f.key}`;
            const value = draft?.field === f.key ? draft.text : macros ? fmt(macros[f.key], f.key) : "";
            return (
              <div key={f.key} className="space-y-1">
                <label htmlFor={id} className={cn("block text-[11px] font-semibold", f.text)}>
                  {f.label}
                </label>
                <div className="relative">
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={value}
                    onChange={(e) => editField(f.key, e.target.value)}
                    onBlur={() => setDraft(null)}
                    className={cn("tabular h-10 px-2.5 text-sm", f.key !== "kcal" && "pr-7")}
                  />
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    {f.suffix === "kcal" ? "" : "g"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground">
          {macros
            ? "Change the amount and these scale with it. Protein, carbs and fat move the calories by 4 / 4 / 9 kcal a gram."
            : needsSize
              ? "Add the serving's size to switch between servings and grams."
              : "Enter an amount above 0."}
        </p>
      </fieldset>
    </div>
  );
}
