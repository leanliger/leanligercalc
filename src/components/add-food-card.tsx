"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  History,
  Keyboard,
  Loader2,
  Minus,
  PenLine,
  Plus,
  ScanBarcode,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  MEALS,
  availableUnits,
  caloriesLookOff,
  defaultAmount,
  hasNutrition,
  kcalFromMacros,
  macrosFor,
  myFoodId,
  normalizeBarcode,
  productFromEntry,
  roundMacros,
  sameBarcode,
  scaleMacros,
  unitLabel,
  FOOD_BRAND_MAX,
  FOOD_NAME_MAX,
  SERVING_LABEL_MAX,
  type FoodEntry,
  type FoodProduct,
  type FoodUnit,
  type Macros,
  type MealId,
} from "@/lib/food";
import { lookupBarcode, searchFoods } from "@/lib/food-lookup";
import { cn } from "@/lib/utils";

/* --------------------------------- modes --------------------------------- */

/** What the "Add food" card is showing. Lifted up so other cards can open a product. */
export type AddMode =
  | { kind: "menu" }
  | { kind: "scan" }
  | { kind: "lookup"; code: string }
  | { kind: "search" }
  | { kind: "product"; product: FoodProduct; quantity?: number; unit?: FoodUnit }
  | { kind: "manual"; seed: ManualSeed };

/** Starting values for the type-it-in form. */
export interface ManualSeed {
  notice: string | null;
  barcode: string | null;
  name: string;
  brand: string;
  servingLabel: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  quantity: string;
  saveAsMine: boolean;
  /** Update this saved food rather than creating a new one. */
  myFoodId: string | null;
}

export const EMPTY_SEED: ManualSeed = {
  notice: null,
  barcode: null,
  name: "",
  brand: "",
  servingLabel: "",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
  quantity: "1",
  saveAsMine: false,
  myFoodId: null,
};

const SOURCE_LABEL: Record<FoodProduct["source"], string> = {
  off: "Open Food Facts",
  usda: "USDA",
  mine: "My food",
  recent: "Recent",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

/** "1 scoop (32 g)" → { size: 32, unit: "g" } */
function parseServingSize(label: string): { size: number; unit: "g" | "ml" } | null {
  const m = /(\d+(?:\.\d+)?)\s*(g|ml)\b/i.exec(label);
  if (!m) return null;
  const size = Number(m[1]);
  return size > 0 && size <= 5000 ? { size, unit: m[2]!.toLowerCase() as "g" | "ml" } : null;
}

/** Seed the manual form from a product, e.g. to correct its numbers. */
export function seedFromProduct(p: FoodProduct, notice: string | null): ManualSeed {
  const basis =
    p.perServing ?? (p.per100 && p.servingSize ? scaleMacros(p.per100, p.servingSize / 100) : p.per100);
  const label =
    p.servingLabel ?? (p.perServing ? "" : p.per100 && p.servingSize ? `${p.servingSize} ${p.baseUnit}` : `100 ${p.baseUnit}`);
  const m = basis ? roundMacros(basis) : null;
  return {
    notice,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand ?? "",
    servingLabel: label,
    kcal: m ? String(m.kcal) : "",
    protein: m ? String(m.protein) : "",
    carbs: m ? String(m.carbs) : "",
    fat: m ? String(m.fat) : "",
    quantity: "1",
    saveAsMine: true,
    myFoodId: myFoodId(p),
  };
}

/** One line of calories and macros. */
export function MacroLine({ m, className }: { m: Macros; className?: string }) {
  return (
    <span className={cn("tabular text-xs text-muted-foreground", className)}>
      <span className="font-medium text-foreground">{Math.round(m.kcal).toLocaleString()} kcal</span>
      <span className="mx-1.5" aria-hidden>
        ·
      </span>
      <span className="text-macro-protein">P {fmt(m.protein)}</span>
      <span className="mx-1" aria-hidden />
      <span className="text-macro-carb">C {fmt(m.carbs)}</span>
      <span className="mx-1" aria-hidden />
      <span className="text-macro-fat">F {fmt(m.fat)}</span>
    </span>
  );
}

/* --------------------------------- card ---------------------------------- */

interface AddFoodCardProps {
  mode: AddMode;
  setMode: (mode: AddMode) => void;
  meal: MealId;
  setMeal: (meal: MealId) => void;
  /** "today", or e.g. "Mon, Oct 5". */
  dayLabel: string;
  myFoods: FoodProduct[];
  recents: FoodEntry[];
  /** Calories and macros left for the day after eating `m`, when there's a target. */
  leftAfter: (m: Macros) => Macros | null;
  onAdd: (entry: FoodEntry) => Promise<void>;
  onSaveMyFood: (food: FoodProduct) => Promise<FoodProduct>;
}

export const AddFoodCard = React.forwardRef<HTMLDivElement, AddFoodCardProps>(function AddFoodCard(
  { mode, setMode, meal, setMeal, dayLabel, myFoods, recents, leftAfter, onAdd, onSaveMyFood },
  ref,
) {
  const [flash, setFlash] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const lookupAbort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => lookupAbort.current?.abort(), []);

  // Messages fade after a while; errors stay until the next action.
  React.useEffect(() => {
    if (flash?.kind !== "ok") return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const go = (next: AddMode) => {
    lookupAbort.current?.abort();
    setFlash(null);
    setMode(next);
  };

  const lookup = async (code: string) => {
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    setFlash(null);

    // A member's own entry for this barcode beats the database.
    const mine = myFoods.find((f) => f.barcode && sameBarcode(f.barcode, code));
    if (mine) {
      setMode({ kind: "product", product: mine });
      return;
    }
    setMode({ kind: "lookup", code });
    let outcome;
    try {
      outcome = await lookupBarcode(code, controller.signal);
    } catch {
      return; // aborted: the member moved on
    }
    if (controller.signal.aborted) return;
    if (outcome.kind === "found" && hasNutrition(outcome.product)) {
      setMode({ kind: "product", product: outcome.product });
    } else if (outcome.kind === "found") {
      setMode({
        kind: "manual",
        seed: {
          ...seedFromProduct(outcome.product, null),
          notice: `Found “${outcome.product.name}”, but the database has no nutrition for it. Copy the numbers from the label — you’ll only need to do this once.`,
        },
      });
    } else if (outcome.kind === "missing") {
      setMode({
        kind: "manual",
        seed: {
          ...EMPTY_SEED,
          barcode: code,
          saveAsMine: true,
          notice: `Barcode ${code} isn’t in the database yet. Copy the numbers from the label — it’ll be remembered next time you scan it.`,
        },
      });
    } else {
      setMode({ kind: "menu" });
      setFlash({ kind: "error", text: outcome.message });
    }
  };

  const add = async (entry: Omit<FoodEntry, "id" | "meal">) => {
    const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? "your log";
    await onAdd({ ...entry, id: newId(), meal });
    setMode({ kind: "menu" });
    setFlash({ kind: "ok", text: `Added ${entry.name} to ${mealLabel}.` });
  };

  const title =
    mode.kind === "scan" || mode.kind === "lookup"
      ? "Scan a barcode"
      : mode.kind === "search"
        ? "Search foods"
        : mode.kind === "manual"
          ? "Enter from the label"
          : mode.kind === "product"
            ? "How much?"
            : "Add food";

  return (
    <Card ref={ref} className="scroll-mt-20">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          {mode.kind !== "menu" ? (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => go({ kind: "menu" })}>
              <ArrowLeft />
              Back
            </Button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Adding to {dayLabel}:</p>
          <SegmentedControl
            ariaLabel="Meal"
            size="sm"
            value={meal}
            onValueChange={setMeal}
            options={MEALS.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {mode.kind === "menu" ? (
          <MenuView
            recents={recents}
            onScan={() => go({ kind: "scan" })}
            onSearch={() => go({ kind: "search" })}
            onManual={() => go({ kind: "manual", seed: EMPTY_SEED })}
            onBarcode={(code) => void lookup(code)}
            onRecent={(e) => go({ kind: "product", product: productFromEntry(e), quantity: e.quantity, unit: e.unit })}
          />
        ) : mode.kind === "scan" ? (
          <BarcodeScanner onDetected={(code) => void lookup(code)} onCancel={() => go({ kind: "menu" })} />
        ) : mode.kind === "lookup" ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking up barcode {mode.code}…
          </p>
        ) : mode.kind === "search" ? (
          <SearchView
            myFoods={myFoods}
            onPick={(p) => go({ kind: "product", product: p })}
            onManual={() => go({ kind: "manual", seed: EMPTY_SEED })}
          />
        ) : mode.kind === "product" ? (
          <ProductView
            key={mode.product.key}
            product={mode.product}
            initialQuantity={mode.quantity}
            initialUnit={mode.unit}
            mealLabel={MEALS.find((m) => m.id === meal)?.label ?? ""}
            leftAfter={leftAfter}
            onAdd={add}
            onFix={() =>
              go({
                kind: "manual",
                seed: seedFromProduct(
                  mode.product,
                  mode.product.source === "mine"
                    ? null
                    : "Correct anything that doesn’t match the label. Your version is saved to My foods and used from now on.",
                ),
              })
            }
          />
        ) : (
          <ManualView
            key={JSON.stringify(mode.seed)}
            seed={mode.seed}
            mealLabel={MEALS.find((m) => m.id === meal)?.label ?? ""}
            onAdd={add}
            onSaveMyFood={onSaveMyFood}
          />
        )}

        {flash ? (
          <p
            role={flash.kind === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
              flash.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
            )}
          >
            {flash.kind === "error" ? <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> : <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
            {flash.text}
          </p>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Barcode and search data come from{" "}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Open Food Facts
          </a>
          , a free database anyone can add to. Always check the numbers against the label.
        </p>
      </CardContent>
    </Card>
  );
});

/* ---------------------------------- menu --------------------------------- */

function MenuView({
  recents,
  onScan,
  onSearch,
  onManual,
  onBarcode,
  onRecent,
}: {
  recents: FoodEntry[];
  onScan: () => void;
  onSearch: () => void;
  onManual: () => void;
  onBarcode: (code: string) => void;
  onRecent: (e: FoodEntry) => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [typedError, setTypedError] = React.useState<string | null>(null);
  const inputId = React.useId();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <BigButton icon={<ScanBarcode />} label="Scan" sub="barcode" onClick={onScan} primary />
        <BigButton icon={<Search />} label="Search" sub="by name" onClick={onSearch} />
        <BigButton icon={<PenLine />} label="Quick add" sub="from label" onClick={onManual} />
      </div>

      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const code = normalizeBarcode(typed);
          if (!code) {
            setTypedError("That isn’t a valid barcode. Check the digits under the bars.");
            return;
          }
          setTypedError(null);
          onBarcode(code);
        }}
      >
        <Label htmlFor={inputId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Keyboard className="h-3.5 w-3.5" />
          Or type the barcode numbers
        </Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 0737628064502"
            value={typed}
            maxLength={20}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={typedError ? true : undefined}
          />
          <Button type="submit" variant="outline" disabled={typed.replace(/\D/g, "").length < 8}>
            Look up
          </Button>
        </div>
        {typedError ? (
          <p role="alert" className="text-xs text-destructive">
            {typedError}
          </p>
        ) : null}
      </form>

      {recents.length > 0 ? (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            Recent
          </p>
          <ul className="space-y-1">
            {recents.slice(0, 8).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onRecent(e)}
                  className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {fmt(e.quantity)} {e.unit === "serving" ? unitLabel("serving", e.quantity) : e.unit}
                      {e.brand ? ` · ${e.brand}` : ""}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{Math.round(e.kcal)} kcal</span>
                  <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BigButton({
  icon,
  label,
  sub,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center transition-colors [&_svg]:h-6 [&_svg]:w-6",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border hover:bg-muted/40 [&_svg]:text-primary",
      )}
    >
      {icon}
      <span className="text-sm font-semibold leading-tight">{label}</span>
      <span className={cn("text-[11px] leading-tight", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {sub}
      </span>
    </button>
  );
}

/* --------------------------------- search -------------------------------- */

function SearchView({
  myFoods,
  onPick,
  onManual,
}: {
  myFoods: FoodProduct[];
  onPick: (p: FoodProduct) => void;
  onManual: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; results: FoodProduct[]; query: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [opening, setOpening] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const inputId = React.useId();

  React.useEffect(() => () => abort.current?.abort(), []);

  const q = query.trim().toLowerCase();
  const mine = q.length >= 2 ? myFoods.filter((f) => `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(q)).slice(0, 5) : [];

  const run = async () => {
    if (q.length < 2) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: "loading" });
    try {
      const outcome = await searchFoods(q, controller.signal);
      if (controller.signal.aborted) return;
      setState(outcome.kind === "ok" ? { kind: "done", results: outcome.results, query: q } : outcome);
    } catch {
      /* aborted */
    }
  };

  // Search hits carry nutrition per 100 g only. Fetch the full product for its
  // serving size, falling back to the search hit if that fails.
  const pick = async (p: FoodProduct) => {
    if (p.source !== "off" || !p.barcode) {
      onPick(p);
      return;
    }
    setOpening(p.key);
    try {
      const outcome = await lookupBarcode(p.barcode);
      onPick(outcome.kind === "found" && hasNutrition(outcome.product) ? outcome.product : p);
    } catch {
      onPick(p);
    }
  };

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Label htmlFor={inputId} className="sr-only">
          Food name
        </Label>
        <Input
          id={inputId}
          type="search"
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          placeholder="e.g. greek yogurt, Quest bar"
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={q.length < 2 || state.kind === "loading"}>
          {state.kind === "loading" ? <Loader2 className="animate-spin" /> : <Search />}
          <span className="sr-only sm:not-sr-only">Search</span>
        </Button>
      </form>

      {mine.length > 0 ? <ResultList title="My foods" items={mine} opening={opening} onPick={pick} /> : null}

      {state.kind === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.kind === "done" ? (
        state.results.length > 0 ? (
          <ResultList title={`Results for “${state.query}”`} items={state.results} opening={opening} onPick={pick} />
        ) : (
          <p className="text-sm text-muted-foreground">No matches. Try fewer words, the brand name, or scan the barcode.</p>
        )
      ) : null}

      <p className="text-xs text-muted-foreground">
        Can&apos;t find it?{" "}
        <button type="button" onClick={onManual} className="font-medium text-primary underline underline-offset-2">
          Enter it from the label
        </button>
      </p>
    </div>
  );
}

function ResultList({
  title,
  items,
  opening,
  onPick,
}: {
  title: string;
  items: FoodProduct[];
  opening: string | null;
  onPick: (p: FoodProduct) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {items.map((p) => {
          const basis = p.perServing
            ? { m: p.perServing, per: p.servingLabel ? `per ${p.servingLabel}` : "per serving" }
            : p.per100
              ? { m: p.per100, per: `per 100 ${p.baseUnit}` }
              : null;
          return (
            <li key={p.key}>
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[p.brand, p.source === "usda" ? "USDA" : null].filter(Boolean).join(" · ") || " "}
                  </span>
                  {basis ? (
                    <span className="block truncate">
                      <MacroLine m={roundMacros(basis.m)} /> <span className="text-[11px] text-muted-foreground">{basis.per}</span>
                    </span>
                  ) : null}
                </span>
                {opening === p.key ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------- product -------------------------------- */

function ProductView({
  product,
  initialQuantity,
  initialUnit,
  mealLabel,
  leftAfter,
  onAdd,
  onFix,
}: {
  product: FoodProduct;
  initialQuantity?: number;
  initialUnit?: FoodUnit;
  mealLabel: string;
  leftAfter: (m: Macros) => Macros | null;
  onAdd: (entry: Omit<FoodEntry, "id" | "meal">) => Promise<void>;
  onFix: () => void;
}) {
  const units = availableUnits(product);
  const fallback = defaultAmount(product);
  const [unit, setUnit] = React.useState<FoodUnit>(
    initialUnit && units.includes(initialUnit) ? initialUnit : (fallback?.unit ?? "serving"),
  );
  const [text, setText] = React.useState(String(initialQuantity ?? fallback?.quantity ?? 1));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const qtyId = React.useId();

  const quantity = Number(text);
  const macros = macrosFor(product, quantity, unit);
  const left = macros ? leftAfter(macros) : null;
  const step = unit === "serving" ? 0.5 : 10;
  const perUnit = product.perServing ?? product.per100;
  const looksOff = perUnit ? caloriesLookOff(perUnit) : null;
  const servingText =
    product.servingLabel ?? (product.servingSize ? `${product.servingSize} ${product.baseUnit}` : null);

  const switchUnit = (next: FoodUnit) => {
    if (next === unit) return;
    // Keep the same amount of food when switching between servings and grams.
    if (product.servingSize && Number.isFinite(quantity) && quantity > 0) {
      const converted = next === "serving" ? quantity / product.servingSize : quantity * product.servingSize;
      setText(String(Math.round(converted * 100) / 100));
    } else {
      setText(next === "serving" ? "1" : "100");
    }
    setUnit(next);
  };

  const bump = (delta: number) => {
    const base = Number.isFinite(quantity) ? quantity : 0;
    const next = Math.max(Math.round((base + delta) * 100) / 100, 0);
    setText(String(next || step));
  };

  const submit = async () => {
    if (!macros) {
      setError("Enter an amount above 0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        quantity: Math.round(quantity * 100) / 100,
        unit,
        servingLabel: unit === "serving" ? servingText : null,
        ...macros,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add it. Try again.");
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1">
        <p className="text-base font-semibold leading-snug">{product.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {product.brand ? <span>{product.brand}</span> : null}
          <Badge variant="secondary" className="px-2 py-0 text-[10px]">
            {SOURCE_LABEL[product.source]}
          </Badge>
          {product.barcode ? <span className="tabular">#{product.barcode}</span> : null}
        </div>
        {servingText && units.includes("serving") ? (
          <p className="text-xs text-muted-foreground">1 serving = {servingText}</p>
        ) : null}
      </div>

      {units.length > 1 ? (
        <SegmentedControl
          ariaLabel="Measure by"
          size="sm"
          value={unit}
          onValueChange={switchUnit}
          options={units.map((u) => ({ value: u, label: u === "serving" ? "Servings" : u === "g" ? "Grams" : "Millilitres" }))}
        />
      ) : null}

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
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="pr-20 text-center text-base"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {unit === "serving" ? unitLabel("serving", quantity) : unit}
            </span>
          </div>
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => bump(step)} aria-label="More">
            <Plus />
          </Button>
        </div>
      </div>

      <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
        {macros ? <MacroLine m={macros} className="text-sm" /> : <span className="text-sm text-muted-foreground">Enter an amount</span>}
        {left ? (
          <p className="tabular text-xs text-muted-foreground">
            Leaves {left.kcal >= 0 ? `${Math.round(left.kcal).toLocaleString()} kcal` : `${Math.round(-left.kcal).toLocaleString()} kcal over`}
            {" · "}
            {left.protein > 0 ? `${Math.round(left.protein)} g protein to go` : "protein target met"}
          </p>
        ) : null}
      </div>

      {looksOff ? (
        <p className="flex gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            The calories ({looksOff.stated}) don&apos;t match the macros (which add up to {looksOff.fromMacros}). Check the label and fix the numbers if needed.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !macros} className="flex-1">
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add to {mealLabel}
        </Button>
        {product.source !== "recent" ? (
          <Button type="button" variant="outline" onClick={onFix}>
            <PenLine />
            {product.source === "mine" ? "Edit" : "Fix numbers"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/* --------------------------------- manual -------------------------------- */

function parseOptional(text: string): number | null | "bad" {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 20000 ? n : "bad";
}

function ManualView({
  seed,
  mealLabel,
  onAdd,
  onSaveMyFood,
}: {
  seed: ManualSeed;
  mealLabel: string;
  onAdd: (entry: Omit<FoodEntry, "id" | "meal">) => Promise<void>;
  onSaveMyFood: (food: FoodProduct) => Promise<FoodProduct>;
}) {
  const [f, setF] = React.useState(seed);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ids = {
    name: React.useId(),
    brand: React.useId(),
    serving: React.useId(),
    kcal: React.useId(),
    protein: React.useId(),
    carbs: React.useId(),
    fat: React.useId(),
    qty: React.useId(),
    save: React.useId(),
  };
  const set = (patch: Partial<ManualSeed>) => setF((prev) => ({ ...prev, ...patch }));

  const nums = {
    kcal: parseOptional(f.kcal),
    protein: parseOptional(f.protein),
    carbs: parseOptional(f.carbs),
    fat: parseOptional(f.fat),
  };
  const macroPart = {
    protein: typeof nums.protein === "number" ? nums.protein : 0,
    carbs: typeof nums.carbs === "number" ? nums.carbs : 0,
    fat: typeof nums.fat === "number" ? nums.fat : 0,
  };
  const autoKcal = kcalFromMacros(macroPart);
  const perServing: Macros = { kcal: typeof nums.kcal === "number" ? nums.kcal : autoKcal, ...macroPart };
  const looksOff = typeof nums.kcal === "number" ? caloriesLookOff(perServing) : null;
  const quantity = Number(f.quantity);

  const submit = async () => {
    if (Object.values(nums).includes("bad")) {
      setError("Calories and macros must be numbers of 0 or more.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
      setError("Servings eaten must be more than 0 (and at most 100).");
      return;
    }
    const name = f.name.trim() || "Quick add";
    const servingLabel = f.servingLabel.trim() || null;
    setBusy(true);
    setError(null);
    try {
      if (f.saveAsMine) {
        const parsed = servingLabel ? parseServingSize(servingLabel) : null;
        await onSaveMyFood({
          key: `mine:${f.myFoodId ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m_${Date.now().toString(36)}`)}`,
          source: "mine",
          barcode: f.barcode,
          name,
          brand: f.brand.trim() || null,
          per100: null,
          perServing: roundMacros(perServing),
          servingLabel,
          servingSize: parsed?.size ?? null,
          baseUnit: parsed?.unit ?? "g",
        });
      }
      await onAdd({
        name,
        brand: f.brand.trim() || null,
        barcode: f.barcode,
        quantity: Math.round(quantity * 100) / 100,
        unit: "serving",
        servingLabel,
        ...roundMacros(scaleMacros(perServing, quantity)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it. Try again.");
      setBusy(false);
    }
  };

  const numberField = (key: "kcal" | "protein" | "carbs" | "fat", label: string, unit: string, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={ids[key]} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={ids[key]}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={f[key]}
          placeholder={placeholder ?? "0"}
          onChange={(e) => set({ [key]: e.target.value } as Partial<ManualSeed>)}
          aria-invalid={nums[key] === "bad" ? true : undefined}
          className="pr-10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {f.notice ? (
        <p className="flex gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{f.notice}</span>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ids.name} className="text-xs">
            Name
          </Label>
          <Input id={ids.name} value={f.name} maxLength={FOOD_NAME_MAX} placeholder="Quick add" onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.brand} className="text-xs">
            Brand <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id={ids.brand} value={f.brand} maxLength={FOOD_BRAND_MAX} onChange={(e) => set({ brand: e.target.value })} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={ids.serving} className="text-xs">
          Serving size on the label <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={ids.serving}
          value={f.servingLabel}
          maxLength={SERVING_LABEL_MAX}
          placeholder="e.g. 1 scoop (32 g)"
          onChange={(e) => set({ servingLabel: e.target.value })}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">Per serving</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {numberField("kcal", "Calories", "kcal", autoKcal > 0 ? String(autoKcal) : "0")}
          {numberField("protein", "Protein", "g")}
          {numberField("carbs", "Carbs", "g")}
          {numberField("fat", "Fat", "g")}
        </div>
        {f.kcal.trim() === "" && autoKcal > 0 ? (
          <p className="text-[11px] text-muted-foreground">Calories left blank: worked out from the macros ({autoKcal} kcal).</p>
        ) : null}
      </fieldset>

      {looksOff ? (
        <p className="flex gap-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {looksOff.stated} kcal doesn&apos;t match the macros ({looksOff.fromMacros} kcal). Double-check the numbers.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={ids.qty} className="text-xs">
            Servings eaten
          </Label>
          <Input
            id={ids.qty}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
          />
        </div>
        <div className="tabular pb-2 text-right text-xs text-muted-foreground">
          {Number.isFinite(quantity) && quantity > 0 ? <MacroLine m={roundMacros(scaleMacros(perServing, quantity))} /> : null}
        </div>
      </div>

      <label htmlFor={ids.save} className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          id={ids.save}
          type="checkbox"
          checked={f.saveAsMine}
          onChange={(e) => set({ saveAsMine: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
        />
        <span>
          {f.myFoodId ? "Update it in My foods" : "Save to My foods"}
          <span className="block text-xs text-muted-foreground">
            {f.barcode ? "Scanning this barcode will use your numbers from now on." : "So you can add it again in one tap."}
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        Add to {mealLabel}
      </Button>
    </form>
  );
}
