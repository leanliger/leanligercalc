"use client";

import * as React from "react";
import { Bell, BellOff, Check, Clock, Pencil, Plus, Timer, Trash2, Utensils } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/confirm-button";
import {
  FASTING_PRESETS,
  MAX_MEAL_TIMES,
  MEAL_LABEL_MAX,
  fastingSchedule,
  fastingStatus,
  formatCountdown,
  formatDuration,
  mealsFromPreset,
  minutesOf,
  newMealId,
  reminderMinutes,
  sortedMeals,
  timeOf,
  type FastingSettings,
  type MealAt,
  type MealTime,
} from "@/lib/fasting";
import { cn } from "@/lib/utils";

/** The current time, refreshed every `intervalMs`. */
function useNow(intervalMs: number): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const clock = (at: Date) => at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "16:00" → "4:00 PM" in the member's own clock format. */
function clockOf(time: string): string {
  const mins = minutesOf(time);
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return clock(d);
}

/**
 * Whether Whop notifications can be switched on here:
 *   ok             — yes
 *   local          — the app isn't open inside a Whop app (no identity)
 *   no-key         — signed in, but the server has no Whop API key yet
 *   no-experience  — signed in, but not opened from a community (no exp_ id)
 */
export interface NotificationStatus {
  availability: "ok" | "local" | "no-key" | "no-experience";
  /** The last attempt to update the server failed. */
  error: string | null;
}

interface FastingCardProps {
  settings: FastingSettings;
  onChange: (settings: FastingSettings) => void;
  notifications: NotificationStatus;
}

export function FastingCard({ settings, onChange, notifications }: FastingCardProps) {
  const [editing, setEditing] = React.useState(false);
  const hasMeals = settings.meals.length > 0;
  const schedule = fastingSchedule(settings.meals);

  const finishEditing = () => {
    // Tidy up on the way out: in time order, with blank names filled in.
    const meals = sortedMeals(settings.meals).map((m, i) => ({ ...m, label: m.label.trim() || `Meal ${i + 1}` }));
    onChange({ ...settings, meals });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Intermittent fasting
            {schedule && !editing ? (
              <Badge variant="default" className="tabular">
                {schedule.protocol}
              </Badge>
            ) : null}
          </CardTitle>
          {hasMeals ? (
            <Button
              variant={editing ? "default" : "ghost"}
              size="sm"
              className="h-8 shrink-0 px-2"
              onClick={() => (editing ? finishEditing() : setEditing(true))}
            >
              {editing ? <Check /> : <Pencil />}
              {editing ? "Done" : "Meal times"}
            </Button>
          ) : null}
        </div>
        {!hasMeals ? (
          <CardDescription>
            Enter your meal times to get a countdown to your next meal and see where you are in your fast.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {!hasMeals ? (
          <SetupView
            onChange={(meals) => {
              onChange({ meals, notify: false });
              setEditing(true);
            }}
          />
        ) : editing ? (
          <MealTimesEditor
            meals={settings.meals}
            onChange={(meals) => onChange({ ...settings, meals })}
            onClear={() => {
              onChange({ meals: [], notify: false });
              setEditing(false);
            }}
          />
        ) : (
          <div className="space-y-4">
            <TimerView meals={settings.meals} />
            <NotifyRow
              settings={settings}
              status={notifications}
              onToggle={(notify) => onChange({ ...settings, notify })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- setup --------------------------------- */

function SetupView({ onChange }: { onChange: (meals: MealTime[]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Start from a common schedule, then adjust the times:</p>
      <div className="grid grid-cols-2 gap-2">
        {FASTING_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(mealsFromPreset(p.times))}
            className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-sm font-semibold">{p.label}</span>
            <span className="block text-xs text-muted-foreground">{p.hint}</span>
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([{ id: newMealId(), label: "Meal 1", time: "12:00" }])}
      >
        <Plus />
        Enter my own meal times
      </Button>
    </div>
  );
}

/* --------------------------------- editor --------------------------------- */

function MealTimesEditor({
  meals,
  onChange,
  onClear,
}: {
  meals: MealTime[];
  onChange: (meals: MealTime[]) => void;
  onClear: () => void;
}) {
  const schedule = fastingSchedule(meals);
  const times = meals.map((m) => m.time);
  const duplicate = times.some((t, i) => times.indexOf(t) !== i);

  const update = (id: string, patch: Partial<MealTime>) =>
    onChange(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const add = () => {
    const sorted = sortedMeals(meals);
    const last = sorted[sorted.length - 1];
    // Suggest three hours after the current last meal, kept inside the day.
    const suggested = last ? Math.min(minutesOf(last.time) + 180, 23 * 60 + 30) : 12 * 60;
    let time = timeOf(suggested);
    while (times.includes(time) && minutesOf(time) < 23 * 60 + 59) time = timeOf(minutesOf(time) + 15);
    onChange([...meals, { id: newMealId(), label: `Meal ${meals.length + 1}`, time }]);
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {meals.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2">
            <Input
              aria-label={`Name of meal ${i + 1}`}
              value={m.label}
              maxLength={MEAL_LABEL_MAX}
              placeholder={`Meal ${i + 1}`}
              onChange={(e) => update(m.id, { label: e.target.value })}
              className="h-9 min-w-0 flex-1"
            />
            <Input
              type="time"
              aria-label={`Time of ${m.label || `meal ${i + 1}`}`}
              value={m.time}
              required
              onChange={(e) => e.target.value && update(m.id, { time: e.target.value })}
              className="h-9 w-[7.5rem] shrink-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 hover:text-destructive"
              aria-label={`Remove ${m.label || `meal ${i + 1}`}`}
              disabled={meals.length <= 1}
              onClick={() => onChange(meals.filter((x) => x.id !== m.id))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      {duplicate ? (
        <p role="alert" className="text-xs text-warning">
          Two meals share the same time — change one of them.
        </p>
      ) : null}

      <Button variant="outline" size="sm" className="w-full" onClick={add} disabled={meals.length >= MAX_MEAL_TIMES}>
        <Plus />
        Add a meal time
      </Button>

      {schedule ? (
        <p className="tabular rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
          {meals.length === 1 ? (
            <>One meal a day (OMAD) — about a 24-hour fast between meals.</>
          ) : (
            <>
              <span className="font-medium text-foreground">{formatDuration(schedule.windowMinutes * 60_000)}</span> eating
              window, <span className="font-medium text-foreground">{formatDuration(schedule.fastMinutes * 60_000)}</span>{" "}
              fast — <span className="font-medium text-foreground">{schedule.protocol}</span>. Your fast starts after the last meal.
            </>
          )}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Or replace these with a common schedule:</p>
        <div className="flex flex-wrap gap-1.5">
          {FASTING_PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" className="h-7 px-2.5" onClick={() => onChange(mealsFromPreset(p.times))}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <ConfirmButton
        variant="ghost"
        className="w-full text-muted-foreground"
        icon={<Trash2 />}
        label="Turn off fasting timer"
        confirmLabel="Yes, remove my meal times"
        onConfirm={onClear}
      />
    </div>
  );
}

/* ---------------------------------- timer --------------------------------- */

function Ring({ progress, tone, children }: { progress: number; tone: string; children: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", tone)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">{children}</div>
    </div>
  );
}

function TimerView({ meals }: { meals: MealTime[] }) {
  const now = useNow(1000);
  const status = fastingStatus(meals, now);
  if (status.phase === "none") return null;
  const t = now.getTime();

  const span = (from: MealAt, to: MealAt) => Math.max(to.at.getTime() - from.at.getTime(), 1);
  const nextIn = status.next.at.getTime() - t;
  const nextText = `${status.next.meal.label} at ${clock(status.next.at)}`;

  // One sentence for screen readers, which changes only when the phase or
  // the next meal does — not every second.
  const announcement =
    status.phase === "fasting"
      ? `Fasting. Next: ${nextText}.`
      : status.phase === "eating"
        ? `Eating window. Next: ${nextText}.`
        : `Time for ${status.current.meal.label}.`;

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex items-center gap-4">
        {status.phase === "meal-now" ? (
          <Ring progress={1} tone="stroke-success">
            <Utensils className="h-6 w-6 text-success" aria-hidden />
            <span className="mt-1 text-sm font-semibold text-success">Eat now</span>
          </Ring>
        ) : (
          <Ring
            progress={(t - (status.phase === "fasting" ? status.since : status.previous).at.getTime()) / span(status.phase === "fasting" ? status.since : status.previous, status.next)}
            tone={status.phase === "fasting" ? "stroke-primary" : "stroke-macro-carb"}
          >
            <span role="timer" aria-label={`${formatDuration(nextIn)} until ${nextText}`} className="tabular text-2xl font-semibold leading-none">
              {formatCountdown(nextIn)}
            </span>
            <span className="mt-1.5 text-[11px] leading-tight text-muted-foreground">
              {status.phase === "fasting" ? "until you eat" : "to next meal"}
            </span>
          </Ring>
        )}

        <div className="min-w-0 space-y-1.5">
          {status.phase === "fasting" ? (
            <>
              <p className="text-sm font-semibold text-primary">Fasting</p>
              <p className="tabular text-sm">
                <span className="font-medium">{formatDuration(t - status.since.at.getTime())}</span>
                <span className="text-muted-foreground"> of {formatDuration(span(status.since, status.next))}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Break your fast with <span className="font-medium text-foreground">{nextText}</span>.
              </p>
            </>
          ) : status.phase === "eating" ? (
            <>
              <p className="text-sm font-semibold text-macro-carb">Eating window</p>
              <p className="text-xs text-muted-foreground">
                Next: <span className="font-medium text-foreground">{nextText}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {status.next.meal.id === status.windowEnds.meal.id
                  ? "That's your last meal before the fast."
                  : `Window closes at ${clock(status.windowEnds.at)}.`}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-success">Time for {status.current.meal.label}</p>
              <p className="text-xs text-muted-foreground">Scheduled for {clock(status.current.at)}.</p>
              <p className="text-xs text-muted-foreground">
                Then {nextText} <span className="tabular">(in {formatDuration(nextIn)})</span>.
              </p>
            </>
          )}
        </div>
      </div>

      <ScheduleStrip meals={meals} now={now} status={status} />
    </div>
  );
}

/** Today's meals as chips: done, now / next, or later. */
function ScheduleStrip({
  meals,
  now,
  status,
}: {
  meals: MealTime[];
  now: Date;
  status: ReturnType<typeof fastingStatus>;
}) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const highlight = status.phase === "meal-now" ? status.current.meal.id : status.phase !== "none" ? status.next.meal.id : null;
  return (
    <ol aria-label="Today's meal times" className="flex flex-wrap gap-1.5">
      {sortedMeals(meals).map((m) => {
        const done = minutesOf(m.time) <= nowMinutes && m.id !== highlight;
        const current = m.id === highlight;
        return (
          <li
            key={m.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              current
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : done
                  ? "border-border text-muted-foreground"
                  : "border-border text-foreground",
            )}
          >
            {done ? <Check className="h-3 w-3 text-success" aria-hidden /> : <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />}
            <span>{m.label}</span>
            <span className="tabular text-muted-foreground">{clockOf(m.time)}</span>
            {done ? (
              <span className="sr-only">(past)</span>
            ) : current ? (
              <span className="sr-only">{status.phase === "meal-now" ? "(now)" : "(next)"}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ notifications ----------------------------- */

const UNAVAILABLE: Record<Exclude<NotificationStatus["availability"], "ok">, string> = {
  local: "Available when you open this app from inside Whop.",
  "no-key": "Coming soon — notifications aren't switched on for this app yet.",
  "no-experience": "Open the app from your Whop community to turn these on.",
};

function NotifyRow({
  settings,
  status,
  onToggle,
}: {
  settings: FastingSettings;
  status: NotificationStatus;
  onToggle: (notify: boolean) => void;
}) {
  const id = React.useId();
  const available = status.availability === "ok";
  const on = available && settings.notify;
  const sorted = sortedMeals(settings.meals);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const times = first && last ? reminderMinutes({ first, last }) : null;

  return (
    <div className="space-y-1.5 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {on ? <Bell className="h-4 w-4 shrink-0 text-primary" /> : <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <label htmlFor={id} className="min-w-0 flex-1 text-sm font-medium">
          Whop notifications
        </label>
        <Switch id={id} checked={on} disabled={!available} onCheckedChange={onToggle} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {!available
          ? UNAVAILABLE[status.availability as Exclude<NotificationStatus["availability"], "ok">]
          : on && times
            ? `You'll be notified at ${clockOf(timeOf(times.open))} when your eating window opens, and at ${clockOf(timeOf(times.close))} when it closes.`
            : "Get a notification in Whop when your eating window opens and when it closes."}
      </p>
      {available && status.error ? (
        <p role="alert" className="text-xs text-destructive">
          {status.error}
        </p>
      ) : null}
    </div>
  );
}
