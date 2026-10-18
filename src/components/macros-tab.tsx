"use client";

import * as React from "react";
import {
  History,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Cloud,
  Copy,
  GlassWater,
  HardDrive,
  Info,
  ListChecks,
  Pencil,
  Plus,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { SegmentedControl } from "@/components/ui/segmented";
import { dayTargetFinder } from "@/lib/day-targets";
import type { CoachMacros } from "@/lib/coach-macros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { AddFoodCard, MacroLine, type AddMode } from "@/components/add-food-card";
import { FoodAmountEditor, type AmountResult } from "@/components/food-amount-editor";
import { FastingCard, type NotificationStatus } from "@/components/fasting-card";
import { WaterCard } from "@/components/water-card";
import { MacroDonut } from "@/components/macro-donut";
import {
  MAX_SAVED_MEALS,
  MAX_SAVED_MEAL_ITEMS,
  SAVED_MEAL_NAME_MAX,
  addSavedMeal,
  entriesFromMeal,
  mealFromEntries,
  mealTotals,
  type SavedMeal,
} from "@/lib/saved-meals";
import type { FastingSettings } from "@/lib/fasting";
import type { SessionInfo } from "@/lib/checkin-store";
import { DAY_LABELS } from "@/lib/carb-cycling";
import { addDays, formatLong, formatShort } from "@/lib/dates";
import {
  CALORIE_TOLERANCE_KCAL,
  FOOD_DAYS_AHEAD,
  MAX_FOOD_ENTRIES_PER_DAY,
  MEALS,
  PROTEIN_TOLERANCE_G,
  applyFoodTicks,
  basisOfEntry,
  servingSizeFromLabel,
  defaultMeal,
  myFoodId,
  productFromEntry,
  recentFoods,
  recentMeals,
  type RecentMeal,
  roundMacros,
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
import type { BiometricProfile, CarbCyclingInputs, DayType, FatLossInputs, WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bottlesOn, liters, ounces, tapBottle, withBottles, WATER_GOAL_BOTTLES } from "@/lib/water";
import { TrainingCarbsPanel, trainingChipLabel } from "@/components/training-carbs-card";
import type { TrainingToday } from "@/lib/training-carbs";

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
  /** Macros the coach set: every day's targets while set. */
  coachMacros: CoachMacros | null;
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
  /** Which sub-section is open: what you eat, water, or when (the fasting timer). */
  section: NutritionSection;
  onSectionChange: (section: NutritionSection) => void;
  unit: WeightUnit;
  /** "My usual breakfast": groups of foods logged in one tap. */
  savedMeals: SavedMeal[];
  onSavedMealsChange: (meals: SavedMeal[]) => void;
  /** Today's workout, planned, in progress or done, for the training-day carb split. */
  trainingToday: TrainingToday;
}

export type NutritionSection = "food" | "water" | "fasting";

export function MacrosTab({
  coachMacros,
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
  unit,
  savedMeals,
  onSavedMealsChange,
  trainingToday,
}: MacrosTabProps) {
  const [date, setDate] = React.useState(today);
  const [meal, setMeal] = React.useState<MealId>(() => defaultMeal(new Date().getHours()));
  const [mode, setMode] = React.useState<AddMode>({ kind: "menu" });
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Add food: always docked on wide screens; on phones a full-screen panel while open.
  const [addOpen, setAddOpen] = React.useState(false);
  // "Added … to Lunch", on the log after adding from the phone panel.
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 5000);
    return () => clearTimeout(t);
  }, [justAdded]);
  // Where the targets come from, and the scorecard note, behind the ⓘ.
  const [showInfo, setShowInfo] = React.useState(false);
  // Before / after carbs on a training day, from the chip on the summary.
  const [showCarbs, setShowCarbs] = React.useState(false);
  // Foods just added, highlighted in their meal for a few seconds.
  const [fresh, setFresh] = React.useState<string[]>([]);
  const markFresh = (ids: string[]) => setFresh(ids);
  React.useEffect(() => {
    if (fresh.length === 0) return;
    const t = setTimeout(() => setFresh([]), 4000);
    return () => clearTimeout(t);
  }, [fresh]);
  // The last removal or saved-meal add, for Undo.
  const [undo, setUndo] = React.useState<{ date: string; entries: FoodEntry[]; message: string } | null>(null);
  // Which meal in the day's log is being saved as a saved meal.
  const [savingMeal, setSavingMeal] = React.useState<MealId | null>(null);
  const addRef = React.useRef<HTMLDivElement>(null);

  /* -------------------------------- targets -------------------------------- */

  // The roadmap is the plan; outside its dates, the Carb Cycling weekly plan.
  const targetFor = React.useMemo(
    () => dayTargetFinder(profile, fatLoss, carbs, adjustments, coachMacros),
    [profile, fatLoss, carbs, adjustments, coachMacros],
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
    setUndo({ date, entries: before, message: `Removed ${gone.name}.` });
    void commit(date, before.filter((e) => e.id !== id)).catch(() => setUndo(null));
  };

  /** A logged food's new amount (maybe in another unit) and nutrition, from its edit. */
  const updateEntry = (id: string, a: AmountResult) => {
    const before = logFor(date);
    const next = before.map((e) => (e.id === id ? { ...e, ...a } : e));
    void commit(date, next).catch(() => {});
  };

  /** Log a saved meal into the meal picked in "Add food". */
  const logSavedMeal = (sm: SavedMeal) => {
    const before = logFor(date);
    const added = entriesFromMeal(sm, meal, newId);
    void commit(date, [...before, ...added])
      .then(() => setUndo({ date, entries: before, message: `Added ${sm.name} to ${MEALS.find((m) => m.id === meal)?.label ?? "your log"}.` }))
      .catch(() => {});
  };

  const saveAsMeal = (slot: MealId, name: string) => {
    const items = entries.filter((e) => e.meal === slot);
    if (items.length === 0 || !name.trim()) return;
    onSavedMealsChange(addSavedMeal(savedMeals, mealFromEntries(newId(), name, items)));
    setSavingMeal(null);
  };

  const copyYesterday = () => {
    void commit(date, [...logFor(date), ...yesterday.map((e) => ({ ...e, id: newId() }))]).catch(() => {});
  };

  /** Log the same foods again into a meal of this day, with undo. */
  const repeatMeal = (items: FoodEntry[], slot: MealId, what: string) => {
    const before = logFor(date);
    const added = items.map((e) => ({ ...e, id: newId(), meal: slot }));
    void commit(date, [...before, ...added])
      .then(() => setUndo({ date, entries: before, message: `Added ${what} to ${MEALS.find((m) => m.id === slot)?.label ?? "your log"}.` }))
      .catch(() => {});
  };
  const recent = React.useMemo(() => recentMeals(foodLogs, date), [foodLogs, date]);

  React.useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(t);
  }, [undo]);

  const changeDate = (next: string) => {
    setDate(next);
    setUndo(null);
    setSavingMeal(null);
    setSaveError(null);
    onEnsureLoaded(next);
  };

  // Once Add food scrolls out of view, a floating button brings it back.
  // On phones the panel is hidden until opened, so the button shows whenever it is closed.
  const [addInView, setAddInView] = React.useState(true);
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  React.useEffect(() => {
    const el = addRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setAddInView(!!e?.isIntersecting), { rootMargin: "0px 0px -96px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [section]);

  const openProduct = (p: FoodProduct) => {
    setMode({ kind: "product", product: p });
    setAddOpen(true);
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
        { value: "water" as const, label: "Water" },
        { value: "fasting" as const, label: "Fasting" },
      ]}
      className="max-w-sm"
    />
  );

  if (section === "water") {
    return (
      <div className="space-y-5">
        {nav}
        <div className="lg:max-w-xl">
          <WaterCard
            today={today}
            unit={unit}
            habits={habits}
            habitLogs={habitLogs}
            onSaveHabits={onSaveHabits}
            notifications={session.mode === "cloud" && session.notifications === true}
          />
        </div>
      </div>
    );
  }

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

  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? "your log";
  const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  /** Open Add food for a meal: the docked panel on wide screens, a full-screen panel on phones. */
  const openAdd = (slot?: MealId) => {
    if (slot) setMeal(slot);
    setMode({ kind: "menu" });
    setAddOpen(true);
    if (isWide()) addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  /** After adding on a phone, back to the log, where the new food shows. */
  const noteAdded = (text: string) => {
    setJustAdded(text);
    if (!isWide()) setAddOpen(false);
  };
  const aiNote =
    session.mode !== "cloud"
      ? "Describe and Photo work when you open the app inside Whop."
      : session.mealPhotos !== true
        ? "Describe and Photo aren't switched on for this app yet."
        : null;
  const addAndClose = async (entry: FoodEntry) => {
    await addEntry(entry);
    markFresh([entry.id]);
    noteAdded(`Added ${entry.name} to ${MEALS.find((m) => m.id === entry.meal)?.label ?? mealLabel}.`);
  };

  return (
    <div className="space-y-5">
      {nav}
      {!addOpen && (!wide || !addInView) ? (
        <Button
          className="fixed bottom-[calc(6.75rem+env(safe-area-inset-bottom))] right-4 z-30 h-12 animate-fade-in rounded-full px-5 shadow-lg sm:bottom-6"
          onClick={() => openAdd()}
        >
          <Plus />
          Log food
        </Button>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start">
        <div className="space-y-4">
          {/* --------------------------- day + targets --------------------------- */}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" onClick={() => changeDate(addDays(date, -1))} aria-label="Previous day">
              <ChevronLeft />
            </Button>
            <div className="flex min-w-0 flex-col items-center" aria-live="polite">
              <span className="text-base font-semibold">{isToday ? "Today" : formatShort(date)}</span>
              <span className="text-[12px] text-muted-foreground">
                {isToday ? formatLong(date) : <button type="button" className="underline underline-offset-2" onClick={() => changeDate(today)}>Back to today</button>}
              </span>
            </div>
            <Button variant="outline" size="icon" onClick={() => changeDate(addDays(date, 1))} disabled={date >= maxDate} aria-label="Next day">
              <ChevronRight />
            </Button>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              {target ? (
                <>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
                    <CalorieRing eaten={totals.kcal} target={target.calories} />
                    <div className="space-y-2.5 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
                      <MacroBar label="Protein" eaten={totals.protein} target={target.protein} color="bg-macro-protein" text="text-macro-protein" />
                      <MacroBar label="Carbs" eaten={totals.carbs} target={target.carbs} color="bg-macro-carb" text="text-macro-carb" />
                      <MacroBar label="Fat" eaten={totals.fat} target={target.fat} color="bg-macro-fat" text="text-macro-fat" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {target && !target.steady ? (
                      <span className={cn("flex min-h-8 items-center rounded-full px-3 text-xs font-semibold", DAY_PILL[target.type])}>
                        {DAY_LABELS[target.type]}
                      </span>
                    ) : null}
                    {isToday && target.carbs > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowCarbs((v) => !v)}
                        aria-expanded={showCarbs}
                        className="flex min-h-8 items-center gap-1.5 rounded-full border border-primary/45 bg-primary/10 px-3 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Dumbbell className="h-3.5 w-3.5" />
                        {trainingChipLabel(trainingToday)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowInfo((v) => !v)}
                      aria-expanded={showInfo}
                      className="flex min-h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="h-3.5 w-3.5" />
                      {SOURCE_CHIP[target.source] ?? "Targets"} · Protein{" "}
                      {target.protein - totals.protein <= PROTEIN_TOLERANCE_G ? "hit" : `${fmt(target.protein - totals.protein)} g to go`}
                    </button>
                  </div>
                  {showCarbs && isToday ? <TrainingCarbsPanel training={trainingToday} target={target} /> : null}
                  {showInfo ? (
                  <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <p className="text-[12px] text-muted-foreground">
                    {target.source === "coach"
                      ? "Targets your coach set for you."
                      : target.source === "roadmap"
                      ? "Targets from your Roadmap for this day."
                      : target.source === "after"
                      ? `Your plan is done: ${(target.label ?? "maintenance").toLowerCase()}, set on Plan → Timeline.`
                      : "This day is outside your Roadmap, so targets come from Plan → Macros."}
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
                      <Hint id="food-scorecard">
                        Protein within ±{PROTEIN_TOLERANCE_G} g and calories within ±{CALORIE_TOLERANCE_KCAL} kcal tick
                        those boxes on your{" "}
                        <button type="button" className="underline underline-offset-2" onClick={() => onNavigate("checkin")}>
                          Check-in
                        </button>{" "}
                        scorecard automatically. Once you log food for a day, those two boxes follow this log.
                      </Hint>
                    </div>
                  ) : null}
                  </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  <CalorieSummary eaten={totals.kcal} target={null} />
                  {entries.length > 0 ? <MacroDonut eaten={totals} kcal={totals.kcal} /> : null}
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Set up your plan to see daily targets here.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => onNavigate("timeline")}>
                    Go to Plan
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {date <= today ? (
            <WaterStrip date={date} unit={unit} habits={habits} habitLogs={habitLogs} onSaveHabits={onSaveHabits} onOpen={() => setSection("water")} />
          ) : null}

          {/* ------------------------------ day log ------------------------------ */}
          <div className="space-y-2.5">
            {justAdded ? (
              <p role="status" className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {justAdded}
              </p>
            ) : null}
            {undo && undo.date === date ? (
              <p role="status" className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="min-w-0 truncate">{undo.message}</span>
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
            {entries.length === 0 && yesterday.length > 0 ? (
              <Button variant="outline" size="sm" onClick={copyYesterday}>
                <Copy />
                Copy the whole day before ({yesterday.length} {yesterday.length === 1 ? "food" : "foods"})
              </Button>
            ) : null}
            {entries.length === 0 && date > today ? (
              <p className="text-xs text-muted-foreground">Logging ahead counts as pre-logging your meals.</p>
            ) : null}

            {MEALS.map((m) => {
              const items = entries.filter((e) => e.meal === m.id);
              const fromYesterday = yesterday.filter((e) => e.meal === m.id);
              return (
                <section key={m.id} aria-label={m.label} className={cn("overflow-hidden molten-card rounded-[1.25rem] border bg-card", items.length > 0 ? "border-border" : "border-border/60")}>
                  <div className="flex items-center gap-2 py-2.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{m.label}</h3>
                      {items.length > 0 ? (
                        <MacroLine m={sumMacros(items)} className="block truncate text-[12px]" />
                      ) : (
                        <p className="text-[12px] text-muted-foreground">Nothing yet</p>
                      )}
                    </div>
                    {items.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground"
                        aria-label={`Save ${m.label.toLowerCase()} as a meal`}
                        title="Save as a meal"
                        aria-expanded={savingMeal === m.id}
                        onClick={() => setSavingMeal(savingMeal === m.id ? null : m.id)}
                      >
                        <BookmarkPlus />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 shrink-0 bg-primary/15 text-primary hover:bg-primary/25"
                      onClick={() => openAdd(m.id)}
                      aria-label={`Add food to ${m.label}`}
                    >
                      <Plus />
                      Add
                    </Button>
                  </div>
                  {savingMeal === m.id ? (
                    <div className="px-3 pb-2">
                      <SaveMealForm
                        defaultName={`My usual ${m.label.toLowerCase()}`}
                        count={items.length}
                        full={savedMeals.length >= MAX_SAVED_MEALS}
                        onSave={(name) => saveAsMeal(m.id, name)}
                        onCancel={() => setSavingMeal(null)}
                      />
                    </div>
                  ) : null}
                  {items.length > 0 ? (
                    <ul className="divide-y divide-border/60 border-t border-border/60 px-4">
                      {items.map((e) => (
                        <EntryRow key={e.id} entry={e} fresh={fresh.includes(e.id)} onRemove={() => removeEntry(e.id)} onUpdate={(a) => updateEntry(e.id, a)} />
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-col gap-2 px-4 pb-3">
                      <button
                        type="button"
                        onClick={() => openAdd(m.id)}
                        className="h-11 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        + Add {m.label.toLowerCase()}
                      </button>
                      {fromYesterday.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => repeatMeal(fromYesterday, m.id, `yesterday’s ${m.label.toLowerCase()}`)}
                        >
                          <Copy />
                          Copy yesterday’s {m.label.toLowerCase()} ({Math.round(sumMacros(fromYesterday).kcal).toLocaleString()} kcal)
                        </Button>
                      ) : null}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <p className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
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

        {/* ------------------------- add food panel ------------------------- */}
        {addOpen ? <div aria-hidden className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setAddOpen(false)} /> : null}
        <div
          role={addOpen ? "dialog" : undefined}
          aria-modal={addOpen ? true : undefined}
          aria-label="Add food"
          onKeyDown={(e) => {
            if (e.key === "Escape" && addOpen) setAddOpen(false);
          }}
          className={cn(
            "space-y-4 lg:sticky lg:top-4",
            addOpen
              ? "fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto rounded-t-2xl border-t border-border bg-background px-4 pb-24 pt-2 lg:inset-auto lg:z-auto lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
              : "hidden lg:block",
          )}
        >
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border lg:hidden" />
          <AddFoodCard
            ref={addRef}
            mode={mode}
            setMode={setMode}
            meal={meal}
            setMeal={setMeal}
            dayLabel={dayLabel}
            myFoods={myFoods}
            onClose={() => setAddOpen(false)}
            aiNote={aiNote}
            leftAfter={leftAfter}
            onAdd={addAndClose}
            onAddMany={async (added) => {
              setUndo(null);
              await commit(date, [...logFor(date), ...added]);
              markFresh(added.map((e) => e.id));
              noteAdded(`Added ${added.length} food${added.length === 1 ? "" : "s"} to ${mealLabel}.`);
            }}
            onSaveMyFood={onSaveMyFood}
            photoEnabled={session.mode === "cloud" && session.mealPhotos === true}
          />

          {mode.kind === "menu" ? (
          <LibraryTabs
            tabs={[
              {
                id: "recent",
                label: "Recent",
                count: recents.length + recent.length,
                empty: "Foods and meals you log show up here, ready to add again in one tap.",
                node: (
                  <div className="space-y-4">
                    <RecentFoodsList
                      foods={recents}
                      onAdd={(e) => void addAndClose({ ...e, id: newId(), meal })}
                      onOpen={(e) => setMode({ kind: "product", product: productFromEntry(e), quantity: e.quantity, unit: e.unit })}
                    />
                    {recent.length > 0 ? (
                      <RecentMealsCard
                        meals={recent}
                        today={today}
                        onAdd={(r) => {
                          repeatMeal(r.items, r.meal, "it");
                          if (!isWide()) setAddOpen(false);
                        }}
                      />
                    ) : null}
                  </div>
                ),
              },
              {
                id: "saved",
                label: "Saved meals",
                count: savedMeals.length,
                empty: "Save a meal from your log with the bookmark next to it, then log it in one tap.",
                node: (
                  <SavedMealsCard
                    meals={savedMeals}
                    slotLabel={mealLabel}
                    onLog={(sm) => {
                      logSavedMeal(sm);
                      if (!isWide()) setAddOpen(false);
                    }}
                    onRemove={(id) => onSavedMealsChange(savedMeals.filter((m) => m.id !== id))}
                  />
                ),
              },
              {
                id: "mine",
                label: "My foods",
                count: myFoods.length,
                empty: "Foods you type in yourself are kept here.",
                node: <MyFoodsCard foods={myFoods} onPick={openProduct} onRemove={onRemoveMyFood} />,
              },
            ]}
          />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- saved meals ------------------------------- */

function SaveMealForm({
  defaultName,
  count,
  full,
  onSave,
  onCancel,
}: {
  defaultName: string;
  count: number;
  full: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const id = React.useId();
  return (
    <form
      className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <label htmlFor={id} className="text-xs font-medium">
        {count > MAX_SAVED_MEAL_ITEMS
          ? `Save the first ${MAX_SAVED_MEAL_ITEMS} of these ${count} foods as a meal`
          : `Save ${count === 1 ? "this food" : `these ${count} foods`} as a meal`}
      </label>
      <div className="flex gap-2">
        <Input id={id} value={name} maxLength={SAVED_MEAL_NAME_MAX} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus />
        <Button type="submit" size="sm" className="h-8 shrink-0" disabled={!name.trim()}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {full
          ? `You have ${MAX_SAVED_MEALS} saved meals; saving this one replaces the oldest.`
          : "Log it again in one tap from Saved meals. Saving with the same name updates it."}
      </p>
    </form>
  );
}

/** Meals from the last two weeks, to log again in one tap (into the same meal). */
function RecentMealsCard({ meals, today, onAdd }: { meals: RecentMeal[]; today: string; onAdd: (m: RecentMeal) => void }) {
  if (meals.length === 0) return null;
  const when = (d: string) => (d === addDays(today, -1) ? "Yesterday" : d === today ? "Today" : formatShort(d));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Repeat a meal
        </CardTitle>
        <Hint id="food-recent-meals">Meals from the last two weeks. Tap + to log the same foods again, into the same meal.</Hint>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {meals.map((r) => {
            const label = MEALS.find((m) => m.id === r.meal)?.label ?? "Meal";
            return (
              <li key={`${r.date}-${r.meal}`} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.items.map((e) => e.name).join(", ")}</p>
                  <p className="tabular text-[12px] text-muted-foreground">
                    {when(r.date)} · {label} · <MacroLine m={sumMacros(r.items)} />
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Add ${r.items.map((e) => e.name).join(", ")} to ${label.toLowerCase()}`}
                  onClick={() => onAdd(r)}
                >
                  <Plus />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function SavedMealsCard({
  meals,
  slotLabel,
  onLog,
  onRemove,
}: {
  meals: SavedMeal[];
  slotLabel: string;
  onLog: (meal: SavedMeal) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bookmark className="h-4 w-4 text-primary" />
          Saved meals
        </CardTitle>
        <CardDescription>
          {meals.length === 0
            ? "Log a meal, then tap the bookmark next to it to save it here, e.g. “My usual breakfast”."
            : `Tap + to add a whole meal to ${slotLabel} (pick the meal in Add food).`}
        </CardDescription>
      </CardHeader>
      {meals.length > 0 ? (
        <CardContent>
          <ul className="divide-y divide-border/60">
            {meals.map((m) => {
              const t = mealTotals(m);
              return (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {m.items.length} {m.items.length === 1 ? "food" : "foods"} · {Math.round(t.kcal)} kcal · P{Math.round(t.protein)} C
                      {Math.round(t.carbs)} F{Math.round(t.fat)}
                    </p>
                  </div>
                  <ConfirmButton
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    label={<span className="sr-only">Delete {m.name}</span>}
                    icon={<Trash2 />}
                    confirmLabel="Delete"
                    onConfirm={() => onRemove(m.id)}
                  />
                  <Button size="sm" className="h-8 shrink-0" onClick={() => onLog(m)} aria-label={`Add ${m.name} to ${slotLabel}`}>
                    <Plus />
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
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
  fresh = false,
  onRemove,
  onUpdate,
}: {
  entry: FoodEntry;
  /** Just added: highlighted for a moment. */
  fresh?: boolean;
  onRemove: () => void;
  onUpdate: (a: AmountResult) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<AmountResult | null>(null);
  const amount =
    entry.unit === "serving"
      ? `${fmt(entry.quantity)} ${unitLabel("serving", entry.quantity)}${entry.servingLabel ? ` (${entry.servingLabel})` : ""}`
      : `${fmt(entry.quantity)} ${entry.unit}`;

  return (
    <li className={cn("-mx-4 space-y-1.5 px-4 py-2 transition-colors duration-700", fresh && "bg-primary/10")}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="tabular truncate text-xs text-muted-foreground">
            {entry.brand ? `${entry.brand} · ` : ""}
            {amount} · <span className="text-macro-protein">P {fmt(entry.protein)}</span> · <span className="text-macro-carb">C {fmt(entry.carbs)}</span> ·{" "}
            <span className="text-macro-fat">F {fmt(entry.fat)}</span>
          </p>
        </div>
        <span className="tabular shrink-0 text-sm text-foreground/85">{Math.round(entry.kcal).toLocaleString()}</span>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Change amount of ${entry.name}`}
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
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
          className="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft) return;
            onUpdate(draft);
            setEditing(false);
          }}
        >
          <FoodAmountEditor
            basis={basisOfEntry(entry)}
            baseUnit={entry.unit === "ml" ? "ml" : "g"}
            initialQuantity={entry.quantity}
            initialUnit={entry.unit}
            servingSize={servingSizeFromLabel(entry.servingLabel, entry.unit === "ml" ? "ml" : "g")}
            servingLabel={entry.servingLabel}
            onChange={setDraft}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!draft}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
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

/* ------------------------------- water strip ------------------------------- */

/**
 * The day's water on the food log: the six bottles, tappable in place
 * (the same count and habit tick as Food → Water, which has the history and
 * reminders).
 */
function WaterStrip({
  date,
  unit,
  habits,
  habitLogs,
  onSaveHabits,
  onOpen,
}: {
  date: string;
  unit: WeightUnit;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  onOpen: () => void;
}) {
  const entries = React.useMemo(() => habitLogs.find((l) => l.date === date)?.entries ?? {}, [habitLogs, date]);
  const [local, setLocal] = React.useState<number | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => setLocal(null), [date, entries]);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const bottles = local ?? bottlesOn(entries);
  const tap = (i: number) => {
    const n = tapBottle(bottles, i);
    setLocal(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSaveHabits({ date, entries: withBottles(entries, habits, n) }).catch(() => setLocal(null));
    }, 500);
  };
  const amount = unit === "kg" ? `${liters(bottles)} L` : `${ounces(bottles)} oz`;
  return (
    <section aria-label="Water" className="flex items-center gap-2 molten-card rounded-[1.25rem] border border-primary/15 bg-card px-3 py-2">
      <button type="button" onClick={onOpen} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block text-sm font-semibold">Water</span>
        <span className="tabular block text-[12px] text-muted-foreground">
          {bottles} of {WATER_GOAL_BOTTLES} · {amount}
        </span>
      </button>
      <div className="ml-auto flex gap-1">
        {Array.from({ length: WATER_GOAL_BOTTLES }, (_, i) => {
          const on = i < bottles;
          return (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              aria-label={`Bottle ${i + 1}`}
              aria-pressed={on}
              className={cn(
                "flex h-9 w-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-macro-carb/60 bg-macro-carb/15 text-macro-carb" : "border-border text-muted-foreground/60",
              )}
            >
              <GlassWater className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ library tabs ------------------------------ */

/** Recent meals · Saved meals · My foods, as tabs under Add food. */
function LibraryTabs({
  tabs,
}: {
  tabs: { id: string; label: string; count: number; empty: string; node: React.ReactNode }[];
}) {
  const [open, setOpen] = React.useState(tabs[0]!.id);
  const current = tabs.find((t) => t.id === open) ?? tabs[0]!;
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Your foods" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setOpen(t.id)}
              className={cn(
                "-mb-px flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count > 0 ? <span className="tabular text-[11px] text-muted-foreground">{t.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {current.count === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{current.empty}</p> : current.node}
      </div>
    </div>
  );
}

/* ------------------------------ calorie ring ------------------------------ */

const SOURCE_CHIP: Record<string, string> = {
  coach: "Coach's targets",
  roadmap: "Roadmap targets",
  after: "After-goal targets",
  plan: "Plan targets",
};

/** The day's calories as a ring filling toward the target, with what's left in the middle. */
function CalorieRing({ eaten, target }: { eaten: number; target: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, eaten / target) : 0;
  const left = Math.round(target - eaten);
  const over = left < -100;
  return (
    <div
      role="img"
      aria-label={`${Math.round(eaten).toLocaleString()} of ${target.toLocaleString()} kcal eaten, ${left >= 0 ? `${left.toLocaleString()} left` : `${(-left).toLocaleString()} over`}`}
      className="relative h-[120px] w-[120px] shrink-0"
    >
      <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          className={over ? "stroke-warning" : "stroke-primary"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(pct * circ).toFixed(1)} ${circ.toFixed(1)}`}
          style={{ transition: "stroke-dasharray 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-2xl font-bold leading-tight">{left >= 0 ? left.toLocaleString() : `+${(-left).toLocaleString()}`}</span>
        <span className="text-[11px] text-muted-foreground">{left >= 0 ? "kcal left" : "kcal over"}</span>
      </div>
    </div>
  );
}

/* ------------------------------ recent foods ------------------------------ */

/** Foods logged lately: + adds the same amount to the meal; the name opens it to change the amount. */
function RecentFoodsList({
  foods,
  onAdd,
  onOpen,
}: {
  foods: FoodEntry[];
  onAdd: (e: FoodEntry) => void;
  onOpen: (e: FoodEntry) => void;
}) {
  if (foods.length === 0) return null;
  return (
    <ul className="divide-y divide-border/60">
      {foods.slice(0, 10).map((e) => (
        <li key={e.id} className="flex items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => onOpen(e)}
            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block truncate text-sm">{e.name}</span>
            <span className="tabular block truncate text-[12px] text-muted-foreground">
              {fmt(e.quantity)} {e.unit === "serving" ? unitLabel("serving", e.quantity) : e.unit} · {Math.round(e.kcal)} kcal · P {fmt(e.protein)} · C{" "}
              {fmt(e.carbs)} · F {fmt(e.fat)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAdd(e)}
            aria-label={`Add ${e.name}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        </li>
      ))}
    </ul>
  );
}
