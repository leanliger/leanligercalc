"use client";

import * as React from "react";
import { BellRing, Check, ChevronLeft, ChevronRight, GlassWater } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays, formatShort } from "@/lib/dates";
import { weekStartOf, type HabitDef, type HabitEntries, type HabitLog } from "@/lib/habits";
import type { WeightUnit } from "@/lib/types";
import {
  BOTTLE_ML,
  BOTTLE_OZ,
  WATER_GOAL_BOTTLES,
  WATER_GOAL_OZ,
  bottlesOn,
  liters,
  ounces,
  tapBottle,
  withBottles,
} from "@/lib/water";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { clock12, experienceIdFromPath } from "@/lib/fasting";
import {
  DEFAULT_WATER_REMINDERS,
  WATER_INTERVALS,
  nextWaterReminder,
  type WaterInterval,
  type WaterReminderPrefs,
} from "@/lib/water-reminders";

const SAVE_DEBOUNCE_MS = 400;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface WaterCardProps {
  today: string;
  unit: WeightUnit;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  /** Whop notifications are available (cloud mode with the API key). */
  notifications: boolean;
}

/** "50.7 oz" or "1.5 L", by the member's unit system. */
function amount(bottles: number, unit: WeightUnit): string {
  return unit === "kg" ? `${liters(bottles)} L` : `${ounces(bottles)} oz`;
}

/** Food → Water: six bottles a day, ticking the hydration habit at the goal. */
export function WaterCard({ today, unit, habits, habitLogs, onSaveHabits, notifications }: WaterCardProps) {
  const [date, setDate] = React.useState(today);
  const saved = React.useMemo(() => habitLogs.find((l) => l.date === date)?.entries ?? {}, [habitLogs, date]);
  const [draft, setDraft] = React.useState<HabitEntries>(saved);
  const [status, setStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!dirty.current) setDraft(saved);
  }, [saved]);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const changeDate = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    setStatus("idle");
    setDraft(habitLogs.find((l) => l.date === next)?.entries ?? {});
    setDate(next);
  };

  const bottles = bottlesOn(draft);
  const setBottles = (n: number) => {
    const next = withBottles(draft, habits, n);
    setDraft(next);
    dirty.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    const forDate = date;
    timer.current = setTimeout(() => {
      onSaveHabits({ date: forDate, entries: next })
        .then(() => setStatus("idle"))
        .catch(() => setStatus("error"))
        .finally(() => {
          dirty.current = false;
        });
    }, SAVE_DEBOUNCE_MS);
  };

  const hydration = habits.find((h) => h.link === "water");
  const done = bottles >= WATER_GOAL_BOTTLES;
  const pct = Math.min(100, (bottles / WATER_GOAL_BOTTLES) * 100);
  const isToday = date === today;

  // This Mon–Sun week, for a glance at consistency.
  const weekStart = weekStartOf(date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const n = d === date ? bottles : bottlesOn(habitLogs.find((l) => l.date === d)?.entries);
    return { date: d, bottles: n, future: d > today };
  });

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <GlassWater className="h-4 w-4 text-primary" />
            Water
          </CardTitle>
          <CardDescription>
            Tick a bottle each time you finish one: {unit === "kg" ? `${BOTTLE_ML} ml` : `${BOTTLE_OZ} oz`} each, six for{" "}
            {unit === "kg" ? `${liters(WATER_GOAL_BOTTLES)} L` : `${WATER_GOAL_OZ}+ oz`}.
          </CardDescription>
        </div>
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
            disabled={date >= today}
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-6 gap-2" role="group" aria-label="Bottles of water">
          {Array.from({ length: WATER_GOAL_BOTTLES }, (_, i) => {
            const full = i < bottles;
            return (
              <button
                key={i}
                type="button"
                role="checkbox"
                aria-checked={full}
                aria-label={`Bottle ${i + 1}${full ? ", done" : ""}`}
                onClick={() => setBottles(tapBottle(bottles, i))}
                className={cn(
                  "flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  full ? "border-primary bg-primary/15 text-primary" : "border-dashed border-border text-muted-foreground hover:bg-muted/40",
                )}
              >
                {full ? <Check className="h-5 w-5" /> : <GlassWater className="h-5 w-5 opacity-60" />}
                <span className="tabular text-[12px] font-medium">{i + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <div className="tabular flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {bottles} of {WATER_GOAL_BOTTLES} bottles
            </span>
            <span className="text-muted-foreground">
              {amount(bottles, unit)} / {unit === "kg" ? `${liters(WATER_GOAL_BOTTLES)} L` : `${WATER_GOAL_OZ} oz`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          <p role="status" className={cn("text-xs", done ? "text-success" : "text-muted-foreground")}>
            {status === "error"
              ? "Couldn't save. Tap a bottle to try again."
              : done
                ? hydration
                  ? `Goal hit. "${hydration.name}" is ticked on your scorecard.`
                  : "Goal hit."
                : `${WATER_GOAL_BOTTLES - bottles} to go${hydration ? `. "${hydration.name}" ticks itself at ${WATER_GOAL_BOTTLES}.` : "."}`}
          </p>
        </div>

        <WaterReminders notifications={notifications} doneToday={isToday ? done : bottlesOn(habitLogs.find((l) => l.date === today)?.entries) >= WATER_GOAL_BOTTLES} />

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Week of {formatShort(weekStart)}
          </p>
          <ul className="grid grid-cols-7 gap-1.5">
            {week.map((d, i) => (
              <li key={d.date} className="flex flex-col items-center gap-1" title={`${formatShort(d.date)}: ${d.bottles} bottles`}>
                <div className="flex h-14 w-full items-end overflow-hidden rounded bg-muted/50">
                  <div
                    className={cn("w-full rounded", d.bottles >= WATER_GOAL_BOTTLES ? "bg-success" : "bg-primary/70")}
                    style={{ height: `${Math.min(100, (d.bottles / WATER_GOAL_BOTTLES) * 100)}%` }}
                  />
                </div>
                <span className={cn("text-[11px]", d.date === date ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {WEEKDAYS[i]}
                </span>
                <span className="tabular text-[11px] text-muted-foreground">{d.future ? "" : d.bottles}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

const INTERVAL_LABEL: Record<WaterInterval, string> = { 60: "1 h", 90: "1½ h", 120: "2 h", 180: "3 h" };

/** "1 h 5 min" / "42 min". */
function inWords(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Hydration reminders (worker/water-reminders.ts): a Whop notification every
 * so often between two times, until the day's bottles are all ticked, with a
 * countdown to the next one. Saved on the server, not in the plan.
 */
function WaterReminders({ notifications, doneToday }: { notifications: boolean; doneToday: boolean }) {
  const [prefs, setPrefs] = React.useState<WaterReminderPrefs | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const experienceId = typeof window === "undefined" ? null : experienceIdFromPath(window.location.pathname);

  React.useEffect(() => {
    if (!notifications) return;
    let live = true;
    fetch("/api/water-reminders", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Partial<WaterReminderPrefs> | null) => {
        if (!live) return;
        setPrefs(b?.on ? { ...DEFAULT_WATER_REMINDERS, ...b, on: true } as WaterReminderPrefs : DEFAULT_WATER_REMINDERS);
      })
      .catch(() => live && setPrefs(DEFAULT_WATER_REMINDERS));
    return () => {
      live = false;
    };
  }, [notifications]);

  // The countdown, refreshed every half minute.
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  React.useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const save = (next: WaterReminderPrefs) => {
    setPrefs(next);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = next.on
          ? await fetch("/api/water-reminders", {
              method: "PUT",
              credentials: "same-origin",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: JSON.stringify({
                experienceId,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                every: next.every,
                start: next.start,
                end: next.end,
              }),
            })
          : await fetch("/api/water-reminders", { method: "DELETE", credentials: "same-origin" });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? "Couldn't save your reminders. Try again.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your reminders.");
      } finally {
        setSaving(false);
      }
    }, 500);
  };

  if (!notifications || !experienceId) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <BellRing className="h-3.5 w-3.5 shrink-0" />
        Open the app inside Whop to get hydration reminders.
      </p>
    );
  }
  if (!prefs) return <div className="h-14 animate-pulse rounded-md bg-muted/30" aria-busy="true" />;

  const minute = now.getHours() * 60 + now.getMinutes();
  const next = nextWaterReminder(minute, prefs);
  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-start gap-3">
        <BellRing className={cn("mt-0.5 h-4 w-4 shrink-0", prefs.on ? "text-primary" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Hydration reminders</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {!prefs.on
              ? "A nudge to drink, every few hours. They stop once your bottles are done."
              : doneToday
                ? `All done for today. Reminders start again tomorrow at ${clock12(prefs.start)}.`
                : next.tomorrow
                  ? `Done for today. Next one tomorrow at ${clock12(next.at)}.`
                  : `Next reminder at ${clock12(next.at)}, in ${inWords(next.inMinutes)}.`}
            {saving ? " Saving…" : ""}
          </p>
        </div>
        <Switch checked={prefs.on} onCheckedChange={(on) => save({ ...prefs, on })} aria-label="Hydration reminders" />
      </div>
      {prefs.on ? (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Every</p>
            <SegmentedControl
              ariaLabel="How often"
              size="sm"
              value={String(prefs.every)}
              onValueChange={(v) => save({ ...prefs, every: Number(v) as WaterInterval })}
              options={WATER_INTERVALS.map((m) => ({ value: String(m), label: INTERVAL_LABEL[m] }))}
              className="max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              From
              <Input type="time" value={prefs.start} onChange={(e) => e.target.value && save({ ...prefs, start: e.target.value })} className="h-9 w-32" />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              To
              <Input type="time" value={prefs.end} onChange={(e) => e.target.value && save({ ...prefs, end: e.target.value })} className="h-9 w-32" />
            </label>
          </div>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
