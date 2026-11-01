"use client";

import * as React from "react";
import { Check, ChefHat, ChevronLeft, ChevronRight, ClipboardList, Copy, Loader2, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import type { FoodDay } from "@/lib/coach-api";
import { addDays, formatShort } from "@/lib/dates";
import type { DayTarget } from "@/lib/day-targets";
import {
  MEALS,
  availableUnits,
  defaultAmount,
  macrosFor,
  productFromEntry,
  roundMacros,
  unitLabel,
  type FoodEntry,
  type FoodProduct,
  type FoodUnit,
  type MealId,
} from "@/lib/food";
import { searchFoods } from "@/lib/food-lookup";
import { DEFAULT_PICKS, GROUPS, STAPLES, amountText, groceryList, type GroceryGroup } from "@/lib/grocery";
import { reportWeekStart, weeklyNutritionReport, type DayStatus } from "@/lib/nutrition-report";
import { MAX_RECIPE_ITEMS, RECIPE_NAME_MAX, cleanServings, perServing, recipeEntry, recipeTotals, saveRecipe, type Recipe, type RecipeItem } from "@/lib/recipes";
import { cn } from "@/lib/utils";

/**
 * Nutrition tools: the weekly report (members: Nutrition → Report; coaches: a
 * member's Nutrition tab), and Meal prep's grocery list and recipe calculator
 * (members only). The maths is in src/lib/nutrition-report.ts, grocery.ts and
 * recipes.ts.
 */

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const STATUS: Record<DayStatus, { label: string; bar: string; text: string }> = {
  on: { label: "On target", bar: "bg-success", text: "text-success" },
  over: { label: "Over", bar: "bg-destructive", text: "text-destructive" },
  under: { label: "Under", bar: "bg-warning", text: "text-warning" },
  partial: { label: "Partly logged", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  none: { label: "Not logged", bar: "bg-transparent", text: "text-muted-foreground" },
  ahead: { label: "", bar: "bg-transparent", text: "text-muted-foreground" },
};

/* ================================ weekly report ================================ */

export function NutritionReportCard({
  foodDays,
  targetFor,
  today,
  who,
  onWeek,
}: {
  foodDays: readonly FoodDay[];
  targetFor: ((date: string) => DayTarget | null) | null;
  today: string;
  /** The member's first name on the coach's copy; "you" when left out. */
  who?: string;
  /** Called with a week's Monday when it's opened, so its days can load. */
  onWeek?: (weekStart: string) => void;
}) {
  const thisWeek = reportWeekStart(today);
  const [weekStart, setWeekStart] = React.useState(thisWeek);
  React.useEffect(() => onWeek?.(weekStart), [weekStart, onWeek]);
  const r = React.useMemo(() => weeklyNutritionReport(foodDays, targetFor, weekStart, today), [foodDays, targetFor, weekStart, today]);
  const top = Math.max(1, ...r.days.map((d) => Math.max(d.kcal ?? 0, d.target?.calories ?? 0)));
  const macroRows = r.avg && r.target
    ? ([
        ["Calories", r.avg.kcal, r.target.calories, ""],
        ["Protein", r.avg.protein, r.target.protein, " g"],
        ["Carbs", r.avg.carbs, r.target.carbs, " g"],
        ["Fat", r.avg.fat, r.target.fat, " g"],
      ] as const)
    : null;
  const mealTotal = r.meals.reduce((n, m) => n + m.kcal, 0);

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex flex-1 items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Weekly nutrition report
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))}>
              <ChevronLeft />
            </Button>
            <span className="tabular w-32 text-center text-xs font-medium">
              {weekStart === thisWeek ? "This week" : `${formatShort(weekStart)} – ${formatShort(r.weekEnd)}`}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Next week"
              disabled={weekStart >= thisWeek}
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <CardDescription>
          {who ? `${who}'s` : "Your"} food, Monday to Sunday, against each day&apos;s targets. Days under 500 kcal count as partly logged and stay out of the averages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Avg calories" value={r.avg ? r.avg.kcal.toLocaleString() : "—"} sub={r.target ? `target ${r.target.calories.toLocaleString()}` : undefined} />
          <Tile label="Days on target" value={`${r.onTarget}/${r.logged}`} sub={`${r.over} over · ${r.under} under`} />
          <Tile label="Protein hit" value={`${r.proteinHits}/${r.logged}`} sub={r.avg && r.target ? `${r.avg.protein} g of ${r.target.protein} g` : undefined} />
          <Tile label="Days logged" value={`${r.logged}/${r.daysSoFar}`} sub={r.partial ? `+${r.partial} partly` : undefined} />
        </div>

        {/* A bar a day, against the day's target (the line). */}
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label={r.days.map((d) => `${formatShort(d.date)}: ${d.kcal ?? "nothing"} kcal${d.target ? ` of ${d.target.calories}` : ""}`).join("; ")}>
          {r.days.map((d) => {
            const st = STATUS[d.status];
            return (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatShort(d.date)}: ${st.label}${d.kcal ? `, ${d.kcal.toLocaleString()} kcal` : ""}`}>
                <div className="relative flex h-28 w-full items-end overflow-hidden rounded-sm bg-muted/30">
                  {d.target ? <div className="absolute inset-x-0 border-t-2 border-dashed border-foreground/40" style={{ bottom: `${(d.target.calories / top) * 100}%` }} /> : null}
                  {d.kcal ? <div className={cn("w-full", st.bar)} style={{ height: `${(d.kcal / top) * 100}%` }} /> : null}
                </div>
                <span className={cn("text-[10px]", d.date === today ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {"MTWTFSS"[r.days.indexOf(d)]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(["on", "over", "under", "partial"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-sm", STATUS[s].bar)} aria-hidden />
              {STATUS[s].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-3 border-t-2 border-dashed border-foreground/40" aria-hidden />
            Target
          </span>
        </div>

        {macroRows ? (
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="text-[12px] text-muted-foreground">
                <th className="pb-1 text-left font-medium">Average day</th>
                <th className="pb-1 text-right font-medium">Ate</th>
                <th className="pb-1 text-right font-medium">Target</th>
                <th className="pb-1 text-right font-medium">Diff</th>
              </tr>
            </thead>
            <tbody>
              {macroRows.map(([label, ate, goal, u]) => {
                const diff = ate - goal;
                const off = Math.abs(diff) > goal * 0.1;
                return (
                  <tr key={label} className="border-t border-border">
                    <td className="py-1">{label}</td>
                    <td className="py-1 text-right">{ate.toLocaleString()}{u}</td>
                    <td className="py-1 text-right text-muted-foreground">{goal.toLocaleString()}{u}</td>
                    <td className={cn("py-1 text-right font-medium", off ? (diff > 0 ? "text-destructive" : "text-warning") : "text-success")}>
                      {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
                      {Math.abs(diff).toLocaleString()}
                      {u}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}

        {mealTotal > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-muted-foreground">Average day by meal</p>
            <div className="flex h-3 overflow-hidden rounded-full">
              {r.meals.map((m, i) => (
                <div key={m.meal} className={MEAL_BAR[i]} style={{ width: `${(m.kcal / mealTotal) * 100}%` }} title={`${m.label}: ${m.kcal} kcal`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              {r.meals.map((m, i) => (
                <span key={m.meal} className="tabular flex items-center gap-1">
                  <span className={cn("h-2 w-2 rounded-sm", MEAL_BAR[i])} aria-hidden />
                  {m.label} {m.kcal.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {r.notes.length ? (
          <ul className="space-y-1 text-sm">
            {r.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                {n}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

const MEAL_BAR = ["bg-macro-protein", "bg-macro-carb", "bg-primary", "bg-macro-fat"];

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular text-lg font-semibold">{value}</p>
      {sub ? <p className="tabular text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ================================ grocery list ================================ */

const PICKS_KEY = "prep-calculator:grocery-picks";

export function GroceryListCard({ targetFor, today, metric }: { targetFor: (date: string) => DayTarget | null; today: string; metric: boolean }) {
  const [days, setDays] = React.useState<"3" | "5" | "7">("7");
  const [picks, setPicks] = React.useState<string[]>(DEFAULT_PICKS);
  const [ticked, setTicked] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(PICKS_KEY);
      const saved = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(saved)) setPicks(STAPLES.filter((s) => saved.includes(s.id)).map((s) => s.id));
    } catch {
      /* the defaults */
    }
  }, []);
  const toggle = (id: string) => {
    const next = picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id];
    setPicks(next);
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  const n = Number(days);
  // The targets' average over the days shopped for.
  const target = React.useMemo(() => {
    const ts = Array.from({ length: n }, (_, i) => targetFor(addDays(today, i))).filter((t): t is DayTarget => t !== null);
    if (!ts.length) return null;
    const avg = (k: "calories" | "protein" | "carbs" | "fat") => Math.round(ts.reduce((s, t) => s + t[k], 0) / ts.length);
    return { calories: avg("calories"), protein: avg("protein"), carbs: avg("carbs"), fat: avg("fat") };
  }, [targetFor, today, n]);
  const list = target ? groceryList(target, picks, n) : null;
  const byGroup = (g: GroceryGroup) => (list?.items ?? []).filter((i) => i.staple.group === g);
  const text = list
    ? [`Groceries for ${n} days`, ...GROUPS.flatMap((g) => byGroup(g.id).map((i) => `- ${i.staple.name}: ${amountText(i, metric)}${i.staple.as ? ` (${i.staple.as})` : ""}`))].join("\n")
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused */
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Grocery list
        </CardTitle>
        <CardDescription>Pick the foods you like; the amounts are worked out to hit your macros. Weights are as bought (raw meat, dry rice and oats).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!target ? (
          <p className="text-sm text-muted-foreground">Set up your plan first: the list is sized to your daily targets.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">Shop for</span>
              <SegmentedControl
                ariaLabel="Days to shop for"
                size="sm"
                value={days}
                onValueChange={setDays}
                options={[
                  { value: "3" as const, label: "3 days" },
                  { value: "5" as const, label: "5 days" },
                  { value: "7" as const, label: "7 days" },
                ]}
                className="w-auto"
              />
            </div>

            <div className="space-y-2.5">
              {GROUPS.map((g) => (
                <div key={g.id}>
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {g.label} <span className="font-normal">· {g.hint}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {STAPLES.filter((s) => s.group === g.id).map((s) => {
                      const on = picks.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(s.id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          {on ? <Check className="mr-1 inline h-3 w-3" aria-hidden /> : null}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {list && list.missing.length ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-[12px] text-warning">
                Pick at least one {list.missing.map((g) => GROUPS.find((x) => x.id === g)!.label.toLowerCase()).join(" and one ")} food, or the list can&apos;t reach your{" "}
                {list.missing.map((g) => (g === "fats" ? "fat" : g)).join(" and ")}.
              </p>
            ) : null}

            {list ? (
              <>
                <div className="rounded-lg border border-border">
                  {GROUPS.filter((g) => byGroup(g.id).length).map((g) => (
                    <div key={g.id} className="border-b border-border px-3 py-2 last:border-b-0">
                      <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                      <ul className="space-y-1">
                        {byGroup(g.id).map((i) => {
                          const done = ticked.includes(i.staple.id);
                          return (
                            <li key={i.staple.id}>
                              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                                  checked={done}
                                  onChange={() => setTicked((t) => (done ? t.filter((x) => x !== i.staple.id) : [...t, i.staple.id]))}
                                />
                                <span className={cn("flex-1", done && "text-muted-foreground line-through")}>{i.staple.name}</span>
                                <span className={cn("tabular font-medium", done && "text-muted-foreground")}>
                                  {amountText(i, metric)}
                                  {i.staple.as ? <span className="font-normal text-muted-foreground"> {i.staple.as}</span> : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="tabular text-[12px] text-muted-foreground">
                  A day from this list: {list.perDay.kcal.toLocaleString()} kcal · {list.perDay.protein} g protein · {list.perDay.carbs} g carbs · {list.perDay.fat} g fat. Your
                  target: {list.target.kcal.toLocaleString()} · {list.target.protein} · {list.target.carbs} · {list.target.fat}. Sauces, drinks and extras aren&apos;t counted.
                </p>
                <Button size="sm" variant="outline" onClick={() => void copy()}>
                  <Copy />
                  {copied ? "Copied" : "Copy list"}
                </Button>
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================ recipes ================================ */

export function RecipesCard({
  recipes,
  onChange,
  recents,
  onLog,
}: {
  recipes: Recipe[];
  onChange: (recipes: Recipe[]) => void;
  /** Recently logged foods, quick to add as ingredients. */
  recents: FoodEntry[];
  /** Log servings of a recipe to today, in a meal. */
  onLog: (entry: FoodEntry) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState<Recipe | null>(null);
  const [logging, setLogging] = React.useState<{ id: string; servings: string; meal: MealId } | null>(null);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  if (editing) {
    return (
      <RecipeEditor
        recipe={editing}
        recents={recents}
        onCancel={() => setEditing(null)}
        onSave={(r) => {
          onChange(saveRecipe(recipes, r));
          setEditing(null);
          setStatus({ ok: true, text: `Saved ${r.name}.` });
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="flex flex-1 items-center gap-2 text-base">
            <ChefHat className="h-4 w-4 text-primary" />
            Recipes
          </CardTitle>
          <Button size="sm" onClick={() => setEditing({ id: newId(), name: "", servings: 4, items: [] })}>
            <Plus />
            New recipe
          </Button>
        </div>
        <CardDescription>Enter what goes in and how many servings it makes; it works out the calories and macros of one serving, ready to log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status ? <p className={cn("text-sm", status.ok ? "text-success" : "text-destructive")}>{status.text}</p> : null}
        {recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipes yet. Add one you cook often: chili, overnight oats, a stir-fry.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recipes.map((r) => {
              const p = perServing(r);
              const open = logging?.id === r.id;
              return (
                <li key={r.id} className="space-y-2 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      <p className="tabular text-[12px] text-muted-foreground">
                        1 of {r.servings} servings: {p.kcal.toLocaleString()} kcal · P {p.protein} · C {p.carbs} · F {p.fat}
                      </p>
                    </div>
                    <Button size="sm" variant={open ? "default" : "outline"} onClick={() => setLogging(open ? null : { id: r.id, servings: "1", meal: "dinner" })}>
                      Log
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => {
                        onChange(recipes.filter((x) => x.id !== r.id));
                        setStatus({ ok: true, text: `Deleted ${r.name}.` });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {open && logging ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                      <Input
                        aria-label="Servings"
                        inputMode="decimal"
                        className="h-8 w-20"
                        value={logging.servings}
                        onChange={(e) => setLogging({ ...logging, servings: e.target.value })}
                      />
                      <span className="text-sm">serving(s) to</span>
                      <select
                        aria-label="Meal"
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={logging.meal}
                        onChange={(e) => setLogging({ ...logging, meal: e.target.value as MealId })}
                      >
                        {MEALS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-sm">today</span>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const n = Number(logging.servings.replace(",", "."));
                          if (!(n > 0 && n <= 20)) {
                            setStatus({ ok: false, text: "Enter how many servings, e.g. 1 or 1.5." });
                            return;
                          }
                          try {
                            await onLog(recipeEntry(r, n, logging.meal, newId()));
                            setLogging(null);
                            setStatus({ ok: true, text: `Logged ${n} serving${n === 1 ? "" : "s"} of ${r.name} to ${MEALS.find((m) => m.id === logging.meal)!.label.toLowerCase()}.` });
                          } catch {
                            setStatus({ ok: false, text: "Couldn't log it. Try again." });
                          }
                        }}
                      >
                        Add to log
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecipeEditor({ recipe, recents, onSave, onCancel }: { recipe: Recipe; recents: FoodEntry[]; onSave: (r: Recipe) => void; onCancel: () => void }) {
  const [name, setName] = React.useState(recipe.name);
  const [servings, setServings] = React.useState(String(recipe.servings));
  const [items, setItems] = React.useState<RecipeItem[]>(recipe.items);
  const [error, setError] = React.useState<string | null>(null);
  const n = cleanServings(Number(servings.replace(",", ".")));
  const total = recipeTotals({ items });
  const each = perServing({ items, servings: n });

  const save = () => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return setError("Give it a name.");
    if (!items.length) return setError("Add at least one ingredient.");
    onSave({ id: recipe.id, name: clean.slice(0, RECIPE_NAME_MAX), servings: n, items });
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ChefHat className="h-4 w-4 text-primary" />
          {recipe.name ? `Edit ${recipe.name}` : "New recipe"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className="space-y-1 text-[12px] text-muted-foreground">
            Name
            <Input value={name} maxLength={RECIPE_NAME_MAX} placeholder="Turkey chili" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-[12px] text-muted-foreground">
            Servings
            <Input value={servings} inputMode="decimal" onChange={(e) => setServings(e.target.value)} />
          </label>
        </div>

        <div className="space-y-1">
          <p className="text-[12px] font-medium text-muted-foreground">Ingredients ({items.length})</p>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Search for each ingredient below, with the amount that goes in the whole recipe.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {it.name}
                    <span className="text-muted-foreground"> · {unitLabel(it.unit, it.quantity) ? `${it.quantity} ${unitLabel(it.unit, it.quantity)}` : it.quantity}</span>
                  </span>
                  <span className="tabular text-[12px] text-muted-foreground">{Math.round(it.kcal)} kcal</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length < MAX_RECIPE_ITEMS ? <IngredientPicker recents={recents} onAdd={(it) => setItems([...items, it])} /> : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Whole recipe</p>
            <p className="tabular text-sm font-semibold">{total.kcal.toLocaleString()} kcal</p>
            <p className="tabular text-[11px] text-muted-foreground">
              P {total.protein} · C {total.carbs} · F {total.fat}
            </p>
          </div>
          <div className="rounded-lg bg-primary/10 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">One serving (of {n})</p>
            <p className="tabular text-sm font-semibold">{each.kcal.toLocaleString()} kcal</p>
            <p className="tabular text-[11px] text-muted-foreground">
              P {each.protein} · C {each.carbs} · F {each.fat}
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={save}>Save recipe</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IngredientPicker({ recents, onAdd }: { recents: FoodEntry[]; onAdd: (item: RecipeItem) => void }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<FoodProduct[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<{ product: FoodProduct; qty: string; unit: FoodUnit } | null>(null);
  const [manual, setManual] = React.useState<{ name: string; kcal: string; protein: string; carbs: string; fat: string } | null>(null);
  const recentProducts = React.useMemo(() => recents.slice(0, 8).map(productFromEntry), [recents]);

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    const r = await searchFoods(q.trim());
    setBusy(false);
    if (r.kind === "ok") setResults(r.results);
    else setError(r.message);
  };
  const pick = (p: FoodProduct) => {
    const d = defaultAmount(p);
    const unit = availableUnits(p).includes("g") ? "g" : (d?.unit ?? "serving");
    setPicked({ product: p, qty: unit === "g" ? "100" : String(d?.quantity ?? 1), unit });
  };

  if (manual) {
    const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);
    return (
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-[12px] font-medium">Type in an ingredient (for the amount used)</p>
        <Input placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
        <div className="grid grid-cols-4 gap-2">
          {(["kcal", "protein", "carbs", "fat"] as const).map((k) => (
            <label key={k} className="space-y-1 text-[11px] text-muted-foreground">
              {k === "kcal" ? "kcal" : `${k[0]!.toUpperCase()}${k.slice(1)} g`}
              <Input inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (!manual.name.trim()) return;
              onAdd({
                name: manual.name.trim().slice(0, 100),
                brand: null,
                barcode: null,
                quantity: 1,
                unit: "serving",
                servingLabel: null,
                ...roundMacros({ kcal: num(manual.kcal), protein: num(manual.protein), carbs: num(manual.carbs), fat: num(manual.fat) }),
              });
              setManual(null);
            }}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setManual(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (picked) {
    const qty = Number(picked.qty.replace(",", "."));
    const m = qty > 0 ? macrosFor(picked.product, qty, picked.unit) : null;
    return (
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="truncate text-sm font-medium">
          {picked.product.name}
          {picked.product.brand ? <span className="font-normal text-muted-foreground"> · {picked.product.brand}</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Amount" inputMode="decimal" className="h-8 w-24" value={picked.qty} onChange={(e) => setPicked({ ...picked, qty: e.target.value })} />
          <select
            aria-label="Unit"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={picked.unit}
            onChange={(e) => setPicked({ ...picked, unit: e.target.value as FoodUnit })}
          >
            {availableUnits(picked.product).map((u) => (
              <option key={u} value={u}>
                {u === "serving" ? (picked.product.servingLabel ?? "serving") : u}
              </option>
            ))}
          </select>
          <span className="tabular text-[12px] text-muted-foreground">{m ? `${Math.round(m.kcal)} kcal · P ${roundMacros(m).protein}` : ""}</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!m}
            onClick={() => {
              if (!m) return;
              onAdd({
                name: picked.product.name,
                brand: picked.product.brand,
                barcode: picked.product.barcode,
                quantity: qty,
                unit: picked.unit,
                servingLabel: picked.unit === "serving" ? picked.product.servingLabel : null,
                ...roundMacros(m),
              });
              setPicked(null);
              setResults(null);
              setQ("");
            }}
          >
            Add ingredient
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input placeholder="Add an ingredient: chicken thighs, kidney beans…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" size="icon" variant="outline" aria-label="Search" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </form>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      {results ? (
        results.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nothing found. Try another name, or type it in.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {results.slice(0, 15).map((p) => (
              <li key={p.key}>
                <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/40" onClick={() => pick(p)}>
                  {p.name}
                  {p.brand ? <span className="text-muted-foreground"> · {p.brand}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : recentProducts.length ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[12px] text-muted-foreground">Recent:</span>
          {recentProducts.map((p) => (
            <button key={p.key} type="button" className="rounded-full border border-border px-2 py-0.5 text-[12px] hover:bg-muted/40" onClick={() => pick(p)}>
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className="text-[12px] font-medium text-primary hover:underline" onClick={() => setManual({ name: "", kcal: "", protein: "", carbs: "", fat: "" })}>
        Type one in instead
      </button>
    </div>
  );
}
