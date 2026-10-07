"use client";

import * as React from "react";
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  HardDrive,
  ListChecks,
  Pencil,
  Target,
  Trash2,
  Undo2,
  Utensils,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { dayTargetFinder } from "@/lib/day-targets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { AddFoodCard, MacroLine, type AddMode } from "@/components/add-food-card";
import { FastingCard, type NotificationStatus } from "@/components/fasting-card";
import type { FastingSettings } from "@/lib/fasting";
import type { SessionInfo } from "@/lib/checkin-store";
import { DAY_LABELS } from "@/lib/carb-cycling";
import { addDays, formatShort } from "@/lib/dates";
import {
  CALORIE_TOLERANCE_KCAL,
  FOOD_DAYS_AHEAD,
  MAX_FOOD_ENTRIES_PER_DAY,
  MEALS,
  PROTEIN_TOLERANCE_G,
  applyFoodTicks,
  defaultMeal,
  myFoodId,
  recentFoods,
  roundMacros,
  scaleMacros,
  sumMacros,
  targetHits,
  unitLabel,
  type FoodEntry,
  type FoodLog,
  type FoodProduct,
  type Macros,
  type MealId,
} from "@/lib/food";
import type { HabitDef, HabitLog } from "@/lib/habits";
import type { CalorieAdjustment } from "@/lib/tracking";
import type { BiometricProfile, CarbCyclingInputs, DayType, FatLossInputs } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_PILL: Record<DayType, string> = {
  high: "bg-roadmap-high text-roadmap-high-foreground",
  medium: "bg-roadmap-medium text-roadmap-medium-foreground",
  low: "bg-roadmap-low text-roadmap-low-foreground",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

interface MacrosTabProps {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  adjustments: CalorieAdjustment[];
  today: string;
  session: SessionInfo;
  foodLogs: FoodLog[];
  /** Make sure logs around this date are loaded (older days load on demand). */
  onEnsureLoaded: (date: string) => void;
  onSaveFoodDay: (date: string, entries: FoodEntry[]) => Promise<void>;
  myFoods: FoodProduct[];
  onSaveMyFood: (food: FoodProduct) => Promise<FoodProduct>;
  onRemoveMyFood: (id: string) => Promise<void>;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  fasting: FastingSettings;
  onFastingChange: (fasting: FastingSettings) => void;
  notifications: NotificationStatus;
  onNavigate: (tab: "timeline" | "checkin") => void;
  /** Which sub-section is open: what you eat, or when (the fasting timer). */
  section: NutritionSection;
  onSectionChange: (section: NutritionSection) => void;
}

export type NutritionSection = "food" | "fasting";

export function MacrosTab({
  profile,
  fatLoss,
  carbs,
  adjustments,
  today,
  session,
  foodLogs,
  onEnsureLoaded,
  onSaveFoodDay,
  myFoods,
  onSaveMyFood,
  onRemoveMyFood,
  habits,
  habitLogs,
  onSaveHabits,
  fasting,
  onFastingChange,
  notifications,
  onNavigate,
  section,
  onSectionChange: setSection,
}: MacrosTabProps) {
  const [date, setDate] = React.useState(today);
  const [meal, setMeal] = React.useState<MealId>(() => defaultMeal(new Date().getHours()));
  const [mode, setMode] = React.useState<AddMode>({ kind: "menu" });
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [undo, setUndo] = React.useState<{ date: string; entries: FoodEntry[]; name: string } | null>(null);
  const addRef = React.useRef<HTMLDivElement>(null);

  /* -------------------------------- targets -------------------------------- */

  // The roadmap is the plan; outside its dates, the Carb Cycling weekly plan.
  const targetFor = React.useMemo(
    () => dayTargetFinder(profile, fatLoss, carbs, adjustments),
    [profile, fatLoss, carbs, adjustments],
  );

  const logFor = React.useCallback((d: string) => foodLogs.find((l) => l.date === d)?.entries ?? [], [foodLogs]);
  const entries = logFor(date);
  const totals = sumMacros(entries);
  const target = targetFor(date);
  const recents = React.useMemo(() => recentFoods(foodLogs), [foodLogs]);
  const yesterday = logFor(addDays(date, -1));

  const leftAfter = React.useCallback(
    (m: Macros): Macros | null =>
      target
        ? roundMacros({
            kcal: target.calories - totals.kcal - m.kcal,
            protein: target.protein - totals.protein - m.protein,
            carbs: target.carbs - totals.carbs - m.carbs,
            fat: target.fat - totals.fat - m.fat,
          })
        : null,
    [target, totals],
  );

  /* -------------------------------- saving -------------------------------- */

  // Once a day has food logged, its protein and calorie boxes on the habit
  // scorecard follow the log. Future days aren't scored yet.
  const syncTicks = async (forDate: string, next: FoodEntry[]) => {
    if (forDate > today) return;
    const t = targetFor(forDate);
    if (!t) return;
    const existing = habitLogs.find((l) => l.date === forDate)?.entries ?? {};
    const ticks = applyFoodTicks(habits, existing, targetHits(sumMacros(next), t));
    if (ticks) await onSaveHabits({ date: forDate, entries: ticks });
  };

  const commit = async (forDate: string, next: FoodEntry[]) => {
    if (next.length > MAX_FOOD_ENTRIES_PER_DAY) {
      throw new Error(`A day can hold up to ${MAX_FOOD_ENTRIES_PER_DAY} foods.`);
    }
    setSaveError(null);
    try {
      await onSaveFoodDay(forDate, next);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save. Try again.";
      setSaveError(message);
      throw new Error(message);
    }
    try {
      await syncTicks(forDate, next);
    } catch {
      /* the food is saved; a missed tick isn't worth an error */
    }
  };

  const addEntry = async (entry: FoodEntry) => {
    setUndo(null);
    await commit(date, [...logFor(date), entry]);
  };

  const removeEntry = (id: string) => {
    const before = logFor(date);
    const gone = before.find((e) => e.id === id);
    if (!gone) return;
    setUndo({ date, entries: before, name: gone.name });
    void commit(date, before.filter((e) => e.id !== id)).catch(() => setUndo(null));
  };

  const changeAmount = (id: string, quantity: number) => {
    const before = logFor(date);
    const next = before.map((e) =>
      e.id === id && quantity > 0
        ? { ...e, quantity, ...roundMacros(scaleMacros(e, quantity / e.quantity)) }
        : e,
    );
    void commit(date, next).catch(() => {});
  };

  const copyYesterday = () => {
    void commit(date, [...logFor(date), ...yesterday.map((e) => ({ ...e, id: newId() }))]).catch(() => {});
  };

  React.useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(t);
  }, [undo]);

  const changeDate = (next: string) => {
    setDate(next);
    setUndo(null);
    setSaveError(null);
    onEnsureLoaded(next);
  };

  const openProduct = (p: FoodProduct) => {
    setMode({ kind: "product", product: p });
    addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isToday = date === today;
  const dayLabel = isToday ? "today" : formatShort(date);
  const maxDate = addDays(today, FOOD_DAYS_AHEAD);
  const hits = target && date <= today && entries.length > 0 ? targetHits(totals, target) : null;
  const linked = habits.filter((h) => h.kind === "check" && (h.link === "protein" || h.link === "calories"));

  const nav = (
    <SegmentedControl
      ariaLabel="Nutrition section"
      value={section}
      onValueChange={setSection}
      options={[
        { value: "food" as const, label: "Food log" },
        { value: "fasting" as const, label: "Fasting" },
      ]}
      className="max-w-xs"
    />
  );

  if (section === "fasting") {
    return (
      <div className="space-y-5">
        {nav}
        <div className="lg:max-w-xl">
          <FastingCard settings={fasting} onChange={onFastingChange} notifications={notifications} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {nav}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* --------------------------- day + targets --------------------------- */}
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeDate(addDays(date, -1))} aria-label="Previous day">
                    <ChevronLeft />
                  </Button>
                  <span className="min-w-[6.5rem] text-center text-sm font-semibold" aria-live="polite">
                    {isToday ? "Today" : formatShort(date)}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => changeDate(addDays(date, 1))}
                    disabled={date >= maxDate}
                    aria-label="Next day"
                  >
                    <ChevronRight />
                  </Button>
                  {!isToday ? (
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => changeDate(today)}>
                      Today
                    </Button>
                  ) : null}
                </div>
                {target ? (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", DAY_PILL[target.type])}>
                    {DAY_LABELS[target.type]}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {target ? (
                <>
                  <CalorieSummary eaten={totals.kcal} target={target.calories} />
                  <div className="space-y-3">
                    <MacroBar label="Protein" eaten={totals.protein} target={target.protein} color="bg-macro-protein" text="text-macro-protein" />
                    <MacroBar label="Carbs" eaten={totals.carbs} target={target.carbs} color="bg-macro-carb" text="text-macro-carb" />
                    <MacroBar label="Fat" eaten={totals.fat} target={target.fat} color="bg-macro-fat" text="text-macro-fat" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {target.source === "roadmap"
                      ? "Targets from your Roadmap for this day."
                      : "This day is outside your Roadmap, so targets come from your Carb Cycling weekly plan."}
                  </p>
                  {linked.length > 0 ? (
                    <div className="space-y-1.5 rounded-md border border-border px-3 py-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium">
                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                        Habit scorecard
                      </p>
                      {hits ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={hits.protein ? "success" : "secondary"}>
                            {hits.protein ? <Check /> : null}
                            Protein {hits.protein ? "hit" : "not yet"}
                          </Badge>
                          <Badge variant={hits.calories ? "success" : "secondary"}>
                            {hits.calories ? <Check /> : null}
                            Calories {hits.calories ? "hit" : "not yet"}
                          </Badge>
                        </div>
                      ) : null}
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Protein within ±{PROTEIN_TOLERANCE_G} g and calories within ±{CALORIE_TOLERANCE_KCAL} kcal tick
                        those boxes on your{" "}
                        <button type="button" className="underline underline-offset-2" onClick={() => onNavigate("checkin")}>
                          Check-in
                        </button>{" "}
                        scorecard automatically. Once you log food for a day, those two boxes follow this log.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  <CalorieSummary eaten={totals.kcal} target={null} />
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Set up your plan to see daily targets here.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("timeline")}>
                    Go to Fat Loss Timeline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <AddFoodCard
            ref={addRef}
            mode={mode}
            setMode={setMode}
            meal={meal}
            setMeal={setMeal}
            dayLabel={dayLabel}
            myFoods={myFoods}
            recents={recents}
            leftAfter={leftAfter}
            onAdd={addEntry}
            onSaveMyFood={onSaveMyFood}
          />
        </div>

        <div className="space-y-5">
          {/* ------------------------------ day log ------------------------------ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-4 w-4 text-primary" />
                {isToday ? "Today’s food" : `Food for ${formatShort(date)}`}
              </CardTitle>
              <CardDescription>
                {entries.length > 0 ? <MacroLine m={totals} /> : "Nothing logged yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {undo && undo.date === date ? (
                <p role="status" className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">Removed {undo.name}.</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2"
                    onClick={() => {
                      const restore = undo;
                      setUndo(null);
                      void commit(restore.date, restore.entries).catch(() => {});
                    }}
                  >
                    <Undo2 />
                    Undo
                  </Button>
                </p>
              ) : null}

              {saveError ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {saveError}
                </p>
              ) : null}

              {entries.length === 0 ? (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Scan, search or quick-add a food to start {isToday ? "today’s" : "this day’s"} log.
                    {date > today ? " Logging ahead counts as pre-logging your meals." : ""}
                  </p>
                  {yesterday.length > 0 ? (
                    <Button variant="outline" size="sm" onClick={copyYesterday}>
                      <Copy />
                      Copy the day before ({yesterday.length} {yesterday.length === 1 ? "food" : "foods"})
                    </Button>
                  ) : null}
                </div>
              ) : (
                MEALS.map((m) => {
                  const items = entries.filter((e) => e.meal === m.id);
                  if (items.length === 0) return null;
                  return (
                    <section key={m.id} aria-label={m.label} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border pb-1">
                        <h3 className="text-sm font-semibold">{m.label}</h3>
                        <MacroLine m={sumMacros(items)} />
                      </div>
                      <ul className="divide-y divide-border/60">
                        {items.map((e) => (
                          <EntryRow
                            key={e.id}
                            entry={e}
                            onRemove={() => removeEntry(e.id)}
                            onAmount={(q) => changeAmount(e.id, q)}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}
            </CardContent>
          </Card>

          <MyFoodsCard foods={myFoods} onPick={openProduct} onRemove={onRemoveMyFood} />

          <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
            {session.mode === "cloud" ? (
              <>
                <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                Your food log and saved foods are synced to your Whop account.
              </>
            ) : (
              <>
                <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Your food log is saved on this device only — clearing site data or switching devices loses it. Delete it any
                time from Settings (the gear at the top left).
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- summaries -------------------------------- */

function CalorieSummary({ eaten, target }: { eaten: number; target: number | null }) {
  const left = target === null ? null : target - eaten;
  const pct = target ? Math.min((eaten / target) * 100, 100) : 0;
  const over = left !== null && left < -CALORIE_TOLERANCE_KCAL;
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Calories eaten</p>
          <p className="tabular text-3xl font-semibold leading-none">
            {Math.round(eaten).toLocaleString()}
            {target !== null ? (
              <span className="text-base font-normal text-muted-foreground"> / {target.toLocaleString()}</span>
            ) : null}
          </p>
        </div>
        {left !== null ? (
          <p className={cn("tabular text-right text-sm font-medium", over ? "text-warning" : "text-primary")}>
            {left >= 0 ? `${Math.round(left).toLocaleString()} left` : `${Math.round(-left).toLocaleString()} over`}
          </p>
        ) : null}
      </div>
      {target !== null ? (
        <div
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Calories"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.round(eaten)}
        >
          <div className={cn("h-full rounded-full transition-[width]", over ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MacroBar({
  label,
  eaten,
  target,
  color,
  text,
}: {
  label: string;
  eaten: number;
  target: number;
  color: string;
  text: string;
}) {
  const pct = target > 0 ? Math.min((eaten / target) * 100, 100) : 0;
  const left = target - eaten;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn("font-semibold", text)}>{label}</span>
        <span className="tabular text-muted-foreground">
          <span className="font-medium text-foreground">{fmt(eaten)}</span> / {target} g
          <span className="ml-2">{left >= 0 ? `${fmt(left)} to go` : `${fmt(-left)} over`}</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(eaten)}
      >
        <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* -------------------------------- entries -------------------------------- */

function EntryRow({
  entry,
  onRemove,
  onAmount,
}: {
  entry: FoodEntry;
  onRemove: () => void;
  onAmount: (quantity: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(String(entry.quantity));
  const inputId = React.useId();
  const amount =
    entry.unit === "serving"
      ? `${fmt(entry.quantity)} ${unitLabel("serving", entry.quantity)}${entry.servingLabel ? ` (${entry.servingLabel})` : ""}`
      : `${fmt(entry.quantity)} ${entry.unit}`;

  const save = () => {
    const q = Number(text);
    if (Number.isFinite(q) && q > 0 && q !== entry.quantity) onAmount(Math.round(q * 100) / 100);
    setEditing(false);
  };

  return (
    <li className="space-y-1.5 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.brand ? `${entry.brand} · ` : ""}
            {amount}
          </p>
          <MacroLine m={entry} className="block truncate" />
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Change amount of ${entry.name}`}
            aria-expanded={editing}
            onClick={() => {
              setText(String(entry.quantity));
              setEditing((v) => !v);
            }}
          >
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" aria-label={`Remove ${entry.name}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Amount in {entry.unit === "serving" ? "servings" : entry.unit}
          </label>
          <div className="relative w-36">
            <Input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-8 pr-16"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              {entry.unit === "serving" ? unitLabel("serving", Number(text)) : entry.unit}
            </span>
          </div>
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/* -------------------------------- my foods -------------------------------- */

function MyFoodsCard({
  foods,
  onPick,
  onRemove,
}: {
  foods: FoodProduct[];
  onPick: (p: FoodProduct) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const filterId = React.useId();
  const q = filter.trim().toLowerCase();
  const matching = q ? foods.filter((f) => `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(q)) : foods;
  const shown = showAll || q ? matching : matching.slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          My foods
        </CardTitle>
        <CardDescription>
          Foods you entered yourself. A saved barcode uses your numbers instead of the database&apos;s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {foods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. When you type in a food from its label, tick <strong>Save to My foods</strong> to keep it here.
          </p>
        ) : (
          <>
            {foods.length > 6 ? (
              <>
                <label htmlFor={filterId} className="sr-only">
                  Filter my foods
                </label>
                <Input
                  id={filterId}
                  type="search"
                  placeholder="Filter my foods"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-9"
                />
              </>
            ) : null}
            <ul className="divide-y divide-border/60">
              {shown.map((f) => {
                const id = myFoodId(f);
                const per = f.perServing ?? f.per100;
                return (
                  <li key={f.key} className="flex items-center gap-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => onPick(f)}
                      className="min-w-0 flex-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-sm font-medium">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[f.brand, f.servingLabel ? `per ${f.servingLabel}` : f.perServing ? "per serving" : `per 100 ${f.baseUnit}`, f.barcode ? `#${f.barcode}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {per ? <MacroLine m={roundMacros(per)} className="block truncate" /> : null}
                    </button>
                    {id ? (
                      <ConfirmButton
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        icon={<Trash2 />}
                        label={null}
                        ariaLabel={`Delete ${f.name} from My foods`}
                        confirmLabel="Delete"
                        onConfirm={() => onRemove(id)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {!q && matching.length > 6 ? (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${matching.length}`}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
