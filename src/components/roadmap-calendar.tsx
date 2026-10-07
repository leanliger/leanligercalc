"use client";

import * as React from "react";
import {
  AlertTriangle,
  Beef,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Flag,
  Map as MapIcon,
  Pencil,
  Scale,
  Target,
  TrendingDown,
  Wheat,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { Stat } from "@/components/stat";
import { WarningList } from "@/components/warnings";
import { WeekdayPatternEditor } from "@/components/weekday-pattern-editor";
import { ProgressChart } from "@/components/progress-chart";
import { predictedWeightOn, trendSeries } from "@/lib/adaptive";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import { DAY_DESCRIPTIONS, DAY_LABELS } from "@/lib/carb-cycling";
import {
  addDays,
  addMonths,
  daysBetween,
  formatLong,
  formatMonthYear,
  formatShort,
  monthGrid,
  monthKeyOf,
  todayISO,
} from "@/lib/dates";
import { calculateFatLossTimeline } from "@/lib/fat-loss";
import { formatWeight } from "@/lib/format";
import { buildRoadmap, formatDayText, formatWeekText } from "@/lib/roadmap";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  DayType,
  FatLossInputs,
  RoadmapDay,
  WeightUnit,
} from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";
import { WEEKDAY_LETTER, WEEKDAY_SHORT, countsFromPattern } from "@/lib/weekday-pattern";

interface RoadmapCalendarProps {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  unit: WeightUnit;
  /** Logged weigh-ins, for predicted-vs-actual. */
  weighIns: WeighIn[];
  /** Calorie changes accepted at check-ins. */
  adjustments: CalorieAdjustment[];
  onCarbsChange: (patch: Partial<CarbCyclingInputs>) => void;
  onNavigate: (tab: "timeline" | "carbs" | "checkin") => void;
}

/**
 * Traffic-light day types — red high, yellow medium, green low — used on this
 * page only. The rest of the app keeps the gold brand ramp (`--day-*`).
 *
 * Badges always pair a fill with its own foreground (see globals.css), and
 * carry a hairline ring: in light mode the yellow fill is only 1.5:1 against a
 * white card, so without the ring its edge disappears.
 */
const CELL_TINT: Record<DayType, string> = {
  high: "bg-roadmap-high/[0.12] border-roadmap-high/40",
  medium: "bg-roadmap-medium/[0.12] border-roadmap-medium/45",
  low: "bg-roadmap-low/[0.12] border-roadmap-low/40",
};

const TYPE_BADGE: Record<DayType, string> = {
  high: "bg-roadmap-high text-roadmap-high-foreground ring-1 ring-inset ring-foreground/10",
  medium: "bg-roadmap-medium text-roadmap-medium-foreground ring-1 ring-inset ring-foreground/10",
  low: "bg-roadmap-low text-roadmap-low-foreground ring-1 ring-inset ring-foreground/10",
};

/** Same palette for the shared weekday editor. */
const EDITOR_STYLES: Record<DayType, { chip: string; letter: string }> = {
  high: { chip: CELL_TINT.high, letter: TYPE_BADGE.high },
  medium: { chip: CELL_TINT.medium, letter: TYPE_BADGE.medium },
  low: { chip: CELL_TINT.low, letter: TYPE_BADGE.low },
};

const TYPE_LETTER: Record<DayType, string> = { high: "H", medium: "M", low: "L" };

const MACROS = [
  { key: "protein" as const, label: "Protein", icon: Beef, text: "text-macro-protein", kcal: 4 },
  { key: "carbs" as const, label: "Carbs", icon: Wheat, text: "text-macro-carb", kcal: 4 },
  { key: "fat" as const, label: "Fat", icon: Droplet, text: "text-macro-fat", kcal: 9 },
];

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export function RoadmapCalendar({
  profile,
  fatLoss,
  carbs,
  unit,
  weighIns,
  adjustments,
  onCarbsChange,
  onNavigate,
}: RoadmapCalendarProps) {
  const timeline = React.useMemo(
    () => calculateFatLossTimeline(profile, fatLoss),
    [profile, fatLoss],
  );
  const roadmap = React.useMemo(
    () => buildRoadmap(profile, carbs, timeline, adjustments),
    [profile, carbs, timeline, adjustments],
  );

  const weighInByDate = React.useMemo(
    () => new Map(weighIns.map((w) => [w.date, w.weightLb])),
    [weighIns],
  );
  const latestTrend = React.useMemo(() => {
    const t = trendSeries(weighIns.filter((w) => w.date >= addDays(timeline.requiredStartDate, -7)));
    return t[t.length - 1] ?? null;
  }, [weighIns, timeline.requiredStartDate]);

  const dayByDate = React.useMemo(
    () => new Map(roadmap.days.map((d) => [d.date, d])),
    [roadmap.days],
  );

  // "Today" is resolved on the client only. The page is statically exported, so
  // anything date-dependent rendered at build time would be stale by the time
  // someone actually opens it.
  const [today, setToday] = React.useState<string | null>(null);
  React.useEffect(() => setToday(todayISO()), []);

  const { startDate, goalDate } = roadmap;
  const inPlan = React.useCallback(
    (iso: string) => iso >= startDate && iso <= goalDate,
    [startDate, goalDate],
  );

  const [selected, setSelected] = React.useState<string>(startDate);
  const [month, setMonth] = React.useState<string>(monthKeyOf(startDate));
  const initialized = React.useRef(false);

  // Land on today the first time, if the diet is under way. After that, only
  // move the selection if a change to the plan pushed it out of range.
  React.useEffect(() => {
    if (!roadmap.feasible || today === null) return;
    const fallback = inPlan(today) ? today : startDate;
    if (!initialized.current || !inPlan(selected)) {
      initialized.current = true;
      setSelected(fallback);
      setMonth(monthKeyOf(fallback));
    }
  }, [roadmap.feasible, today, inPlan, startDate, selected]);

  /* ----------------------- keyboard grid navigation ----------------------- */

  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!pendingFocus.current) return;
    buttons.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const select = (iso: string, focus = false) => {
    const clamped = iso < startDate ? startDate : iso > goalDate ? goalDate : iso;
    setSelected(clamped);
    setMonth(monthKeyOf(clamped));
    if (focus) pendingFocus.current = clamped;
  };

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const weekday = dayByDate.get(selected)?.weekday ?? 0;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    select(addDays(selected, delta), true);
  };

  /* ------------------------------ empty state ------------------------------ */

  if (!roadmap.feasible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-primary" />
            Roadmap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <WarningList warnings={roadmap.warnings} />
          <Button onClick={() => onNavigate("timeline")}>
            <Target />
            Set a goal on the Fat Loss Timeline
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* ------------------------------ derived bits ----------------------------- */

  const startMonth = monthKeyOf(startDate);
  const endMonth = monthKeyOf(goalDate);
  const rows = chunk(monthGrid(month), 7);

  const selectedDay = dayByDate.get(selected) ?? roadmap.days[0]!;
  const selectedWeek =
    roadmap.weeks[Math.min(selectedDay.week, roadmap.weeks.length - 1)]!;
  const weekDays = roadmap.days.filter(
    (d) => d.week === selectedWeek.week && !d.isGoalDay,
  );

  const firstWeek = roadmap.weeks[0]!;
  const lastWeek = roadmap.weeks[roadmap.weeks.length - 1]!;
  const counts = countsFromPattern(roadmap.pattern);

  const todayIndex = today && inPlan(today) ? daysBetween(startDate, today) : null;
  const progress = todayIndex !== null ? Math.min(todayIndex / roadmap.totalDays, 1) : null;

  // The tab-stop for the grid: the selected day if it is on screen, otherwise
  // the first plan day in the visible month.
  const visiblePlanDays = monthGrid(month).filter(
    (iso): iso is string => iso !== null && dayByDate.has(iso),
  );
  const tabStop = visiblePlanDays.includes(selected) ? selected : visiblePlanDays[0];

  const progressLine = (() => {
    if (!latestTrend) {
      return "Log weigh-ins on the Check-in tab and they'll be plotted against the plan here.";
    }
    const planned = predictedWeightOn(timeline, latestTrend.date);
    const head = "Trend " + formatWeight(latestTrend.trend, unit) + " on " + formatShort(latestTrend.date);
    if (planned === null) return head + ".";
    const diff = latestTrend.trend - planned;
    if (Math.abs(diff) < 0.3) return head + " — right on the plan.";
    return head + " — " + formatWeight(Math.abs(diff), unit) + (diff > 0 ? " above" : " below") + " the plan.";
  })();

  const weekText = () =>
    formatWeekText(selectedWeek, weekDays, (lb) => fromLb(lb, unit), unit);

  return (
    <div className="space-y-5">
      {/* ------------------------------ Summary ------------------------------ */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 text-primary" />
              Roadmap to {formatWeight(roadmap.goalWeight, unit)}
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Calories come from your Fat Loss Timeline and step down each week as your
              maintenance falls. The high / medium / low split comes from your Carb
              Cycling settings — every week still averages exactly to its target.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate("timeline")}>
              <Pencil />
              Edit goal
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate("carbs")}>
              <Pencil />
              Edit macros
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Start"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              value={formatShort(startDate)}
              sub={`${formatWeight(profile.weight, unit)} today`}
            />
            <Stat
              label="Goal"
              emphasis
              icon={<Flag className="h-3.5 w-3.5" />}
              value={formatShort(goalDate)}
              sub={`${formatWeight(roadmap.goalWeight, unit)} · ${roadmap.goalBodyFat}% body fat`}
            />
            <Stat
              label="Length"
              icon={<Target className="h-3.5 w-3.5" />}
              value={`${roadmap.weeks.length} weeks`}
              sub={`${roadmap.totalDays} days · ${counts.high}H / ${counts.medium}M / ${counts.low}L`}
            />
            <Stat
              label="Daily intake"
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              value={`${firstWeek.targetCalories.toLocaleString()} → ${lastWeek.targetCalories.toLocaleString()}`}
              sub="kcal/day average, week 1 → final week"
            />
          </div>

          {progress !== null && todayIndex !== null ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Day {todayIndex + 1} of {roadmap.totalDays}
                </span>
                <span className="tabular">{Math.round(progress * 100)}% complete</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="Progress through the plan"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <WarningList warnings={roadmap.warnings} />

          <p className="text-xs text-muted-foreground">
            The daily target and carb deficit on the Weekly plan aren&apos;t used
            here — the timeline sets calories week by week so you arrive on{" "}
            {formatLong(goalDate)}.
          </p>
        </CardContent>
      </Card>

      {/* ------------------------- Predicted vs actual ----------------------- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Plan vs actual</CardTitle>
            <CardDescription>{progressLine}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate("checkin")}>
            <Scale />
            {weighIns.length ? "Check in" : "Log a weigh-in"}
          </Button>
        </CardHeader>
        <CardContent>
          <ProgressChart timeline={timeline} weighIns={weighIns} unit={unit} today={today} range="plan" />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
        {/* ------------------------------ Calendar ----------------------------- */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-base" aria-live="polite">
              {formatMonthYear(month)}
            </CardTitle>
            <div className="flex items-center gap-1">
              {today && inPlan(today) && monthKeyOf(today) !== month ? (
                <Button variant="ghost" size="sm" onClick={() => select(today)}>
                  Today
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={month <= startMonth}
                onClick={() => setMonth(addMonths(month, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={month >= endMonth}
                onClick={() => setMonth(addMonths(month, 1))}
                aria-label="Next month"
              >
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <div
              role="grid"
              aria-label={`${formatMonthYear(month)} eating plan`}
              onKeyDown={onGridKeyDown}
              className="space-y-1"
            >
              <div role="row" className="grid grid-cols-7 gap-1">
                {WEEKDAY_SHORT.map((label, index) => (
                  <div
                    key={label}
                    role="columnheader"
                    aria-label={label}
                    className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    <span className="sm:hidden">{WEEKDAY_LETTER[index]}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                ))}
              </div>

              {rows.map((row, r) => (
                <div key={r} role="row" className="grid grid-cols-7 gap-1">
                  {row.map((iso, c) => {
                    if (iso === null) {
                      return <div key={c} role="gridcell" aria-hidden className="min-h-16 sm:min-h-24" />;
                    }
                    const day = dayByDate.get(iso);
                    const dayNumber = Number(iso.slice(8));
                    if (!day) {
                      return (
                        <div
                          key={iso}
                          role="gridcell"
                          aria-disabled
                          className="min-h-16 rounded-md border border-transparent p-1.5 text-xs text-muted-foreground/40 sm:min-h-24"
                        >
                          {dayNumber}
                        </div>
                      );
                    }
                    return (
                      <div key={iso} role="gridcell" aria-selected={iso === selected}>
                        <DayCell
                          day={day}
                          dayNumber={dayNumber}
                          isToday={iso === today}
                          isSelected={iso === selected}
                          isWeekStart={day.index % 7 === 0 && !day.isGoalDay}
                          hasWarning={
                            !day.isGoalDay &&
                            (roadmap.weeks[day.week]?.warnings.some((w) => w.level !== "info") ||
                              roadmap.weeks[day.week]?.feasible === false)
                          }
                          loggedWeight={weighInByDate.get(iso) ?? null}
                          unit={unit}
                          tabIndex={iso === tabStop ? 0 : -1}
                          onSelect={() => select(iso)}
                          buttonRef={(el) => {
                            if (el) buttons.current.set(iso, el);
                            else buttons.current.delete(iso);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <Legend />
          </CardContent>
        </Card>

        {/* ------------------------------ Side panel --------------------------- */}
        <div className="space-y-5">
          <DayDetail
            day={selectedDay}
            weekTarget={selectedWeek.targetCalories}
            calorieChange={selectedWeek.calorieChange}
            weekNumber={selectedWeek.week + 1}
            totalWeeks={roadmap.weeks.length}
            totalDays={roadmap.totalDays}
            weekWeight={selectedWeek.weight}
            weekBodyFat={selectedWeek.bodyFat}
            note={selectedDay.isGoalDay ? "Goal week — begin reverse dieting" : selectedWeek.note}
            goalWeight={roadmap.goalWeight}
            goalBodyFat={roadmap.goalBodyFat}
            unit={unit}
            warnings={selectedDay.isGoalDay ? [] : selectedWeek.warnings}
            weekText={weekText}
            predictedWeight={selectedDay.isGoalDay ? roadmap.goalWeight : predictedWeightOn(timeline, selectedDay.date)}
            loggedWeight={weighInByDate.get(selectedDay.date) ?? null}
            adjustment={selectedDay.isGoalDay ? 0 : selectedWeek.adjustment}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Week {selectedWeek.week + 1} at a glance</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {weekDays.map((d) => (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => select(d.date)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        d.date === selected && "bg-muted",
                      )}
                    >
                      <span className="w-9 text-xs text-muted-foreground">
                        {WEEKDAY_SHORT[d.weekday]}
                      </span>
                      <span
                        className={cn(
                          "w-5 rounded text-center text-[10px] font-bold leading-4",
                          TYPE_BADGE[d.type],
                        )}
                      >
                        {TYPE_LETTER[d.type]}
                      </span>
                      <span className="tabular ml-auto font-medium">
                        {d.calories.toLocaleString()}
                      </span>
                      <span className="tabular hidden w-28 text-right text-[11px] text-muted-foreground sm:inline">
                        P{d.protein} C{d.carbs} F{d.fat}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Which days are which</CardTitle>
              <CardDescription>Applies to every week of the plan.</CardDescription>
            </CardHeader>
            <CardContent>
              <WeekdayPatternEditor
                styles={EDITOR_STYLES}
                pattern={roadmap.pattern}
                isCustom={carbs.weekdayPattern !== null}
                onChange={(next) => {
                  const c = countsFromPattern(next);
                  onCarbsChange({
                    weekdayPattern: next,
                    highDays: c.high,
                    mediumDays: c.medium,
                    lowDays: c.low,
                  });
                }}
                onReset={() => onCarbsChange({ weekdayPattern: null })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function DayCell({
  day,
  dayNumber,
  isToday,
  isSelected,
  isWeekStart,
  hasWarning,
  loggedWeight,
  unit,
  tabIndex,
  onSelect,
  buttonRef,
}: {
  day: RoadmapDay;
  dayNumber: number;
  isToday: boolean;
  isSelected: boolean;
  isWeekStart: boolean;
  hasWarning: boolean;
  loggedWeight: number | null;
  unit: WeightUnit;
  tabIndex: number;
  onSelect: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const label = [
    formatLong(day.date),
    day.isGoalDay ? "Goal day" : `${DAY_LABELS[day.type]}, week ${day.week + 1}`,
    `${day.calories} calories`,
    `protein ${day.protein} grams, carbs ${day.carbs} grams, fat ${day.fat} grams`,
    isToday ? "today" : null,
    loggedWeight !== null ? "weighed in at " + formatWeight(loggedWeight, unit) : null,
    hasWarning ? "this week has a warning" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={tabIndex}
      onClick={onSelect}
      aria-label={label}
      className={cn(
        "relative flex min-h-16 w-full flex-col rounded-md border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
        "hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        CELL_TINT[day.type],
        day.isGoalDay && "border-primary bg-primary/15",
        isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-start justify-between gap-0.5">
        <span className="flex items-center gap-1">
          <span
            className={cn(
              "tabular text-[11px] font-medium leading-5 sm:text-xs",
              // On phones a cell is ~30px of content wide: a padded pill
              // around a two-digit date pushes the day-type badge out of the
              // cell. Underline there, pill only once there is room.
              isToday &&
                "font-bold text-primary underline decoration-2 underline-offset-2 sm:rounded-full sm:bg-primary sm:px-1.5 sm:text-primary-foreground sm:no-underline",
            )}
          >
            {dayNumber}
          </span>
          {isWeekStart ? (
            <span className="hidden text-[9px] font-medium uppercase leading-5 text-muted-foreground lg:inline">
              Wk {day.week + 1}
            </span>
          ) : null}
        </span>
        {day.isGoalDay ? (
          <Flag className="h-3.5 w-3.5 text-primary" aria-hidden />
        ) : (
          <span
            aria-hidden
            className={cn(
              "rounded px-1 text-[9px] font-bold leading-4 sm:text-[10px]",
              TYPE_BADGE[day.type],
            )}
          >
            {TYPE_LETTER[day.type]}
          </span>
        )}
      </div>

      <div className="mt-auto">
        <div className="tabular text-[11px] font-semibold leading-tight sm:text-sm">
          {day.calories.toLocaleString()}
        </div>
        <div className="tabular hidden text-[10px] leading-tight text-muted-foreground sm:block">
          P{day.protein} C{day.carbs} F{day.fat}
        </div>
        {loggedWeight !== null ? (
          <div
            aria-hidden
            className="tabular mt-0.5 flex items-center gap-0.5 text-[10px] font-medium leading-tight text-foreground"
          >
            <Scale className="hidden h-2.5 w-2.5 sm:inline" />
            {formatWeight(loggedWeight, unit, 1, false)}
          </div>
        ) : null}
      </div>

      {hasWarning ? (
        // Shape, not colour: red, yellow and green are all taken by day types
        // on this page, so an amber dot would read as a medium day.
        <AlertTriangle
          aria-hidden
          className="absolute right-1 top-6 h-3 w-3 text-foreground/80 sm:top-7"
        />
      ) : null}
    </button>
  );
}

function Legend() {
  const items: { label: string; swatch: React.ReactNode }[] = [
    { label: "High carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.high)} /> },
    { label: "Medium carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.medium)} /> },
    { label: "Low carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.low)} /> },
    { label: "Goal day", swatch: <Flag className="h-3 w-3 text-primary" /> },
    { label: "Week needs attention", swatch: <AlertTriangle className="h-3 w-3 text-foreground/80" /> },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {item.swatch}
          {item.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
          1
        </span>
        Today
      </span>
    </div>
  );
}

function DayDetail({
  day,
  weekTarget,
  calorieChange,
  weekNumber,
  totalWeeks,
  totalDays,
  weekWeight,
  weekBodyFat,
  note,
  goalWeight,
  goalBodyFat,
  unit,
  warnings,
  weekText,
  predictedWeight,
  loggedWeight,
  adjustment,
}: {
  predictedWeight: number | null;
  loggedWeight: number | null;
  adjustment: number;
  day: RoadmapDay;
  weekTarget: number;
  calorieChange: number;
  weekNumber: number;
  totalWeeks: number;
  totalDays: number;
  weekWeight: number;
  weekBodyFat: number;
  note: string | null;
  goalWeight: number;
  goalBodyFat: number;
  unit: WeightUnit;
  warnings: RoadmapWeekWarnings;
  weekText: () => string;
}) {
  const total = day.protein * 4 + day.carbs * 4 + day.fat * 9 || 1;

  return (
    <Card className={cn(day.isGoalDay && "border-primary/60")}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {day.isGoalDay ? (
            <Badge variant="default">
              <Flag />
              Goal day
            </Badge>
          ) : (
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-semibold",
                TYPE_BADGE[day.type],
              )}
            >
              {DAY_LABELS[day.type]}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {day.isGoalDay
              ? `After ${totalWeeks} weeks`
              : `Week ${weekNumber} of ${totalWeeks} · Day ${day.index + 1} of ${totalDays}`}
          </span>
        </div>
        <CardTitle className="text-lg">{formatLong(day.date)}</CardTitle>
        <CardDescription>
          {day.isGoalDay
            ? `Projected ${formatWeight(goalWeight, unit)} at ${goalBodyFat}% body fat. Hold these numbers today, then begin adding calories back gradually.`
            : DAY_DESCRIPTIONS[day.type]}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-3xl font-semibold text-primary">
            {day.calories.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">kcal</span>
        </div>

        <dl className="space-y-2">
          {MACROS.map((m) => {
            const Icon = m.icon;
            const grams = day[m.key];
            return (
              <div key={m.key} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Icon className={cn("h-3.5 w-3.5", m.text)} />
                  <dt className="text-muted-foreground">{m.label}</dt>
                  <dd className="tabular ml-auto font-semibold">{grams}g</dd>
                  <dd className="tabular w-16 text-right text-xs text-muted-foreground">
                    {(grams * m.kcal).toLocaleString()} kcal
                  </dd>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", {
                      "bg-macro-protein": m.key === "protein",
                      "bg-macro-carb": m.key === "carbs",
                      "bg-macro-fat": m.key === "fat",
                    })}
                    style={{ width: `${((grams * m.kcal) / total) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </dl>

        {!day.isGoalDay ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Scale className="h-3 w-3" />
                Week {weekNumber} start
              </div>
              <div className="tabular mt-1 font-semibold">
                {formatWeight(weekWeight, unit)}
              </div>
              <div className="tabular text-muted-foreground">{weekBodyFat}% body fat</div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="h-3 w-3" />
                Week average
              </div>
              <div className="tabular mt-1 font-semibold">
                {weekTarget.toLocaleString()} kcal
              </div>
              <div className="tabular text-muted-foreground">
                {weekNumber === 1
                  ? "first week"
                  : calorieChange === 0
                    ? "same as last week"
                    : `${calorieChange > 0 ? "+" : "−"}${Math.abs(calorieChange)} vs last week`}
              </div>
            </div>
          </div>
        ) : null}

        {predictedWeight !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span>
              <span className="text-muted-foreground">Plan weight </span>
              <span className="tabular font-semibold">{formatWeight(predictedWeight, unit)}</span>
            </span>
            {loggedWeight !== null ? (
              <span>
                <span className="text-muted-foreground">Weighed in </span>
                <span className="tabular font-semibold">{formatWeight(loggedWeight, unit)}</span>
                <span className="tabular text-muted-foreground">
                  {" "}
                  ({loggedWeight - predictedWeight >= 0 ? "+" : "−"}
                  {formatWeight(Math.abs(loggedWeight - predictedWeight), unit, 1, false)})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">no weigh-in logged</span>
            )}
          </div>
        ) : null}

        {adjustment !== 0 ? (
          <p className="text-xs text-muted-foreground">
            Includes a {adjustment > 0 ? "+" : "−"}
            {Math.abs(adjustment)} kcal/day check-in adjustment.
          </p>
        ) : null}

        {note ? (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            {note}
          </p>
        ) : null}

        <WarningList warnings={warnings} />

        <div className="flex gap-2">
          <CopyButton getText={() => formatDayText(day)} label="Copy day" className="flex-1" />
          {!day.isGoalDay ? (
            <CopyButton getText={weekText} label="Copy week" className="flex-1" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type RoadmapWeekWarnings = React.ComponentProps<typeof WarningList>["warnings"];
