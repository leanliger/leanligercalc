"use client";

import * as React from "react";
import {
  AlertTriangle,
  Beef,
  ChevronLeft,
  ChevronRight,
  Droplet,
  Flag,
  Map as MapIcon,
  Scale,
  Target,
  Wheat,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { WarningList } from "@/components/warnings";
import { predictedWeightOn } from "@/lib/adaptive";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import { DAY_DESCRIPTIONS, DAY_LABELS, STEADY_DAY_DESCRIPTION, STEADY_DAY_LABEL } from "@/lib/carb-cycling";
import {
  addDays,
  addMonths,
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
import { WEEKDAY_LETTER, WEEKDAY_SHORT } from "@/lib/weekday-pattern";

interface RoadmapCalendarProps {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  unit: WeightUnit;
  /** Logged weigh-ins, for predicted-vs-actual. */
  weighIns: WeighIn[];
  /** Calorie changes accepted at check-ins. */
  adjustments: CalorieAdjustment[];
  onCarbsChange?: (patch: Partial<CarbCyclingInputs>) => void;
  onNavigate: (tab: "timeline" | "carbs") => void;
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


const DOT: Record<DayType, string> = { high: "bg-roadmap-high", medium: "bg-roadmap-medium", low: "bg-roadmap-low" };

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
            Set a goal on the Timeline
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



  // The tab-stop for the grid: the selected day if it is on screen, otherwise
  // the first plan day in the visible month.
  const visiblePlanDays = monthGrid(month).filter(
    (iso): iso is string => iso !== null && dayByDate.has(iso),
  );
  const tabStop = visiblePlanDays.includes(selected) ? selected : visiblePlanDays[0];

  const weekText = () =>
    formatWeekText(selectedWeek, weekDays, (lb) => fromLb(lb, unit), unit);

  return (
    <div className="space-y-5">
      <WarningList warnings={roadmap.warnings} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
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
                    className="pb-1 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
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
                      return <div key={c} role="gridcell" aria-hidden className="h-11 sm:h-16" />;
                    }
                    const day = dayByDate.get(iso);
                    const dayNumber = Number(iso.slice(8));
                    if (!day) {
                      return (
                        <div
                          key={iso}
                          role="gridcell"
                          aria-disabled
                          className="flex h-11 items-center justify-center text-[13px] text-muted-foreground/40 sm:h-16"
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

            <Legend steady={!carbs.cycleCarbs} />
          </CardContent>
        </Card>

        {/* ------------------------------ Side panel --------------------------- */}
        <div className="space-y-5">
          <DayDetail
            day={selectedDay}
            isToday={selectedDay.date === today}
            weekNumber={selectedWeek.week + 1}
            totalWeeks={roadmap.weeks.length}
            goalWeight={roadmap.goalWeight}
            goalBodyFat={roadmap.goalBodyFat}
            unit={unit}
            predictedWeight={selectedDay.isGoalDay ? roadmap.goalWeight : predictedWeightOn(timeline, selectedDay.date)}
            loggedWeight={weighInByDate.get(selectedDay.date) ?? null}
            adjustment={selectedDay.isGoalDay ? 0 : selectedWeek.adjustment}
          />

          {!selectedDay.isGoalDay ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  Week {selectedWeek.week + 1} of {roadmap.weeks.length} · {formatShort(weekDays[0]?.date ?? selectedDay.date)}–
                  {formatShort(weekDays[weekDays.length - 1]?.date ?? selectedDay.date)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="tabular grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Weight by the end</dt>
                    <dd className="font-semibold">{formatWeight(roadmap.weeks[selectedWeek.week + 1]?.weight ?? roadmap.goalWeight, unit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Average a day</dt>
                    <dd className="font-semibold">{selectedWeek.targetCalories.toLocaleString()} kcal</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">{carbs.cycleCarbs ? "Days" : "Body fat"}</dt>
                    <dd className="font-semibold">
                      {carbs.cycleCarbs
                        ? `${weekDays.filter((d) => d.type === "high").length} high · ${weekDays.filter((d) => d.type === "medium").length} med · ${weekDays.filter((d) => d.type === "low").length} low`
                        : `${selectedWeek.bodyFat}% at the start`}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {selectedWeek.week === 0
                    ? "The first week."
                    : selectedWeek.calorieChange === 0
                      ? "Same calories as last week."
                      : `${selectedWeek.calorieChange > 0 ? "+" : "−"}${Math.abs(selectedWeek.calorieChange)} kcal a day vs last week.`}{" "}
                  Starts at {formatWeight(selectedWeek.weight, unit)} · {selectedWeek.bodyFat}% body fat.
                </p>
                {selectedWeek.note ? (
                  <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">{selectedWeek.note}</p>
                ) : null}
                <WarningList warnings={selectedWeek.warnings} />
                <div className="flex gap-2">
                  <CopyButton getText={() => formatDayText(selectedDay)} label="Copy day" className="flex-1" />
                  <CopyButton getText={weekText} label="Copy week" className="flex-1" />
                </div>
              </CardContent>
            </Card>
          ) : null}
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
  isWeekStart?: boolean;
  hasWarning: boolean;
  loggedWeight: number | null;
  unit: WeightUnit;
  tabIndex: number;
  onSelect: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const label = [
    formatLong(day.date),
    day.isGoalDay ? "Goal day" : day.steady ? `week ${day.week + 1}` : `${DAY_LABELS[day.type]}, week ${day.week + 1}`,
    `${day.calories} calories`,
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
      aria-pressed={isSelected}
      className={cn(
        "relative flex h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 text-[13px] font-semibold transition-colors sm:h-16",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isSelected ? (day.steady || day.isGoalDay ? "bg-muted" : CELL_TINT[day.type]) : "bg-muted/30 hover:bg-muted/60",
        isToday ? "border-primary" : isSelected ? "border-foreground/40" : "border-transparent",
        day.isGoalDay && "bg-primary/15",
      )}
    >
      <span className="tabular leading-none">{dayNumber}</span>
      {day.isGoalDay ? (
        <Flag className="h-3 w-3 text-primary" aria-hidden />
      ) : (
        <span aria-hidden className={cn("h-1 w-4 rounded-full", day.steady ? "bg-muted-foreground/40" : DOT[day.type])} />
      )}
      <span className="tabular hidden text-[11px] font-normal leading-none text-muted-foreground sm:block">{day.calories.toLocaleString()}</span>
      {loggedWeight !== null ? <Scale aria-hidden className="absolute left-1 top-1 hidden h-2.5 w-2.5 text-muted-foreground sm:block" /> : null}
      {hasWarning ? <AlertTriangle aria-hidden className="absolute right-1 top-1 h-2.5 w-2.5 text-foreground/80" /> : null}
    </button>
  );
}

function Legend({ steady = false }: { steady?: boolean }) {
  const items: { label: string; swatch: React.ReactNode }[] = [
    ...(steady
      ? []
      : [
          { label: "High carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.high)} /> },
          { label: "Medium carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.medium)} /> },
          { label: "Low carb", swatch: <span className={cn("h-3 w-3 rounded-sm", TYPE_BADGE.low)} /> },
        ]),
    { label: "Goal day", swatch: <Flag className="h-3 w-3 text-primary" /> },
    { label: "Week needs attention", swatch: <AlertTriangle className="h-3 w-3 text-foreground/80" /> },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {item.swatch}
          {item.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
          1
        </span>
        Today
      </span>
    </div>
  );
}

function DayDetail({
  day,
  isToday,
  weekNumber,
  totalWeeks,
  goalWeight,
  goalBodyFat,
  unit,
  predictedWeight,
  loggedWeight,
  adjustment,
}: {
  day: RoadmapDay;
  isToday: boolean;
  weekNumber: number;
  totalWeeks: number;
  goalWeight: number;
  goalBodyFat: number;
  unit: WeightUnit;
  predictedWeight: number | null;
  loggedWeight: number | null;
  adjustment: number;
}) {
  return (
    <Card className={cn(day.isGoalDay && "border-primary/60")}>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">
            {formatLong(day.date)}
            {isToday ? <span className="font-normal text-muted-foreground"> · today</span> : null}
          </h3>
          {day.isGoalDay ? (
            <Badge variant="default">
              <Flag />
              Goal day
            </Badge>
          ) : (
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", day.steady ? "bg-muted text-foreground" : TYPE_BADGE[day.type])}>
              {day.steady ? STEADY_DAY_LABEL : DAY_LABELS[day.type]}
            </span>
          )}
        </div>
        <p className="tabular">
          <span className="text-3xl font-bold">{day.calories.toLocaleString()}</span> <span className="text-sm text-muted-foreground">kcal</span>
        </p>
        <p className="tabular text-sm">
          {MACROS.map((m, k) => (
            <React.Fragment key={m.key}>
              {k > 0 ? <span className="text-muted-foreground"> · </span> : null}
              <span className={cn("font-semibold", m.text)}>
                {m.label[0]} {day[m.key]} g
              </span>
            </React.Fragment>
          ))}
        </p>
        <p className="text-xs text-muted-foreground">
          {day.isGoalDay
            ? `After ${totalWeeks} weeks: projected ${formatWeight(goalWeight, unit)} at ${goalBodyFat}% body fat. Hold these numbers today.`
            : day.steady
              ? `Week ${weekNumber} of ${totalWeeks}. ${STEADY_DAY_DESCRIPTION}`
              : `Week ${weekNumber} of ${totalWeeks}. ${DAY_DESCRIPTIONS[day.type]}`}
        </p>
        {predictedWeight !== null ? (
          <div className="tabular flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span>
              <span className="text-muted-foreground">Plan weight </span>
              <span className="font-semibold">{formatWeight(predictedWeight, unit)}</span>
            </span>
            {loggedWeight !== null ? (
              <span>
                <span className="text-muted-foreground">Weighed in </span>
                <span className="font-semibold">{formatWeight(loggedWeight, unit)}</span>
                <span className="text-muted-foreground">
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
            {Math.abs(adjustment)} kcal/day check-in change.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type RoadmapWeekWarnings = React.ComponentProps<typeof WarningList>["warnings"];
