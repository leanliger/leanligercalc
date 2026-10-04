"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  Cloud,
  HardDrive,
  Pencil,
  Scale,
  ShieldCheck,
  Trash2,
  TrendingDown,
  Undo2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stat } from "@/components/stat";
import { ProgressChart } from "@/components/progress-chart";
import { HabitsCard, WeeklyScorecard } from "@/components/habits-card";
import { ConfirmButton } from "@/components/confirm-button";
import { ConsistencyCard } from "@/components/consistency-card";
import { RemindersCard } from "@/components/reminders-card";
import type { NotificationStatus } from "@/components/fasting-card";
import type { ReminderPrefs } from "@/lib/reminders";
import { buildRoadmap } from "@/lib/roadmap";
import { weekStartOf, type HabitDef, type HabitLog } from "@/lib/habits";
import type { WeeklyReview } from "@/lib/reviews";
import { sumMacros, type FoodLog, type Macros } from "@/lib/food";
import { addDays } from "@/lib/dates";
import {
  analyzeProgress,
  predictedWeightOn,
  trendSeries,
  type ProgressAnalysis,
  type Recommendation,
} from "@/lib/adaptive";
import type { SessionInfo } from "@/lib/checkin-store";
import { formatLong, formatShort } from "@/lib/dates";
import { calculateFatLossTimeline } from "@/lib/fat-loss";
import { formatWeight } from "@/lib/format";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import { CALORIE_LIMITS, NOTE_MAX_LENGTH } from "@/lib/tracking";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, WeightUnit } from "@/lib/types";
import { fromLb, round, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

interface CheckinTabProps {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  unit: WeightUnit;
  today: string;
  session: SessionInfo;
  weighIns: WeighIn[];
  adjustments: CalorieAdjustment[];
  carbs: CarbCyclingInputs;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  reviews: WeeklyReview[];
  onSaveReview: (review: WeeklyReview) => Promise<void>;
  onHabitsChange: (habits: HabitDef[]) => void;
  onSave: (weighIn: WeighIn) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
  onApplyAdjustment: (rec: Recommendation, analysis: ProgressAnalysis) => void;
  onRemoveAdjustment: (id: string) => void;
  onDeleteAll: () => Promise<void>;
  /** Food logs, so the protein and calorie habits can show what's been eaten. */
  foodLogs: FoodLog[];
  /** Food-log days and saved foods, for the delete-all count. */
  foodCount: number;
  reminders: ReminderPrefs;
  onRemindersChange: (prefs: ReminderPrefs) => void;
  reminderStatus: NotificationStatus;
  onNavigate: (tab: "timeline" | "roadmap") => void;
}

/* -------------------------------------------------------------------------- */

type BadgeVariant = "default" | "secondary" | "success" | "warning";

const STATUS_STYLE: Record<ProgressAnalysis["status"], { badge: BadgeVariant; label: string }> = {
  "no-plan": { badge: "secondary", label: "No plan" },
  "no-data": { badge: "secondary", label: "Start logging" },
  "not-started": { badge: "secondary", label: "Not started" },
  collecting: { badge: "secondary", label: "Collecting data" },
  waiting: { badge: "default", label: "Settling" },
  "on-track": { badge: "success", label: "On track" },
  behind: { badge: "warning", label: "Behind plan" },
  ahead: { badge: "warning", label: "Ahead of plan" },
};

/* -------------------------------------------------------------------------- */

export function CheckinTab({
  profile,
  fatLoss,
  unit,
  today,
  session,
  weighIns,
  adjustments,
  carbs,
  habits,
  habitLogs,
  onSaveHabits,
  onHabitsChange,
  reviews,
  onSaveReview,
  onSave,
  onDelete,
  onApplyAdjustment,
  onRemoveAdjustment,
  onDeleteAll,
  foodLogs,
  foodCount,
  reminders,
  onRemindersChange,
  reminderStatus,
  onNavigate,
}: CheckinTabProps) {
  const timeline = React.useMemo(() => calculateFatLossTimeline(profile, fatLoss), [profile, fatLoss]);
  const analysis = React.useMemo(
    () => analyzeProgress(profile, timeline, weighIns, adjustments, today),
    [profile, timeline, weighIns, adjustments, today],
  );
  // Roadmap numbers by date, so each habit day can show what to eat.
  const roadmapDays = React.useMemo(() => {
    const r = buildRoadmap(profile, carbs, timeline, adjustments);
    return new Map(r.days.map((d) => [d.date, d]));
  }, [profile, carbs, timeline, adjustments]);
  const dayPlanFor = React.useCallback((d: string) => roadmapDays.get(d) ?? null, [roadmapDays]);
  const eatenFor = React.useCallback(
    (d: string): Macros | null => {
      const log = foodLogs.find((l) => l.date === d);
      return log && log.entries.length > 0 ? sumMacros(log.entries) : null;
    },
    [foodLogs],
  );

  // Average plan targets across a Mon–Sun week, for the scorecard header.
  const weekTargets = React.useCallback(
    (weekStart: string) => {
      const days = Array.from({ length: 7 }, (_, i) => roadmapDays.get(addDays(weekStart, i)))
        .filter((d): d is NonNullable<typeof d> => !!d && !d.isGoalDay);
      if (days.length === 0) return null;
      return {
        calories: Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length),
        protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length),
      };
    },
    [roadmapDays],
  );

  const trendByDate = React.useMemo(
    () => new Map(trendSeries(weighIns).map((t) => [t.date, t.trend])),
    [weighIns],
  );

  /* ------------------------------ entry form ------------------------------ */

  const [date, setDate] = React.useState(today);
  const [weight, setWeight] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const existing = weighIns.find((w) => w.date === date) ?? null;

  // Picking a day that already has an entry loads it for editing.
  React.useEffect(() => {
    if (existing) {
      setWeight(String(round(fromLb(existing.weightLb, unit), 1)));
      setCalories(existing.calories === null ? "" : String(existing.calories));
      setNote(existing.note ?? "");
    } else {
      setWeight("");
      setCalories("");
      setNote("");
    }
    // Keyed on the saved values, not the object, so typing doesn't reset it.
  }, [date, unit, existing?.weightLb, existing?.calories, existing?.note]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const w = Number(weight);
    if (!weight || !Number.isFinite(w) || w <= 0) {
      setMessage({ kind: "error", text: `Enter your weight in ${unit}.` });
      return;
    }
    const kcal = calories.trim() === "" ? null : Number(calories);
    if (kcal !== null && (!Number.isInteger(kcal) || kcal < CALORIE_LIMITS.min || kcal > CALORIE_LIMITS.max)) {
      setMessage({ kind: "error", text: "Calories must be a whole number." });
      return;
    }
    setBusy(true);
    try {
      await onSave({
        date,
        weightLb: round(toLb(w, unit), 2),
        calories: kcal,
        note: note.trim() || null,
      });
      setMessage({ kind: "ok", text: `${existing ? "Updated" : "Saved"} ${formatShort(date)}.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------- render -------------------------------- */

  if (!timeline.feasible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-in</CardTitle>
          <CardDescription>
            Check-ins compare your weigh-ins against your plan. Set a goal below your current weight first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => onNavigate("timeline")}>Set a goal</Button>
        </CardContent>
      </Card>
    );
  }

  const status = STATUS_STYLE[analysis.status];
  const history = [...weighIns].reverse();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------ left -------------------------------- */}
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              Log a weigh-in
            </CardTitle>
            <CardDescription>
              Same time each morning — after the bathroom, before food or water.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wi-date">Date</Label>
                  <Input
                    id="wi-date"
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wi-weight">Weight</Label>
                  <div className="relative">
                    <Input
                      id="wi-weight"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={fromLb(50, unit).toFixed(0)}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="pr-9"
                      placeholder={round(fromLb(analysis.trendWeight ?? profile.weight, unit), 1).toString()}
                      required
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wi-cal">
                  Calories eaten <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="wi-cal"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={0}
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="pr-12"
                    placeholder="e.g. 2150"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    kcal
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Yesterday&apos;s total. Logging it makes the maintenance estimate far more accurate.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wi-note">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="wi-note"
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="High-sodium dinner, poor sleep…"
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                <Check />
                {existing ? `Update ${formatShort(date)}` : "Save weigh-in"}
              </Button>

              <p
                role="status"
                aria-live="polite"
                className={cn(
                  "min-h-4 text-xs",
                  message?.kind === "error" ? "text-destructive" : "text-success",
                )}
              >
                {message?.text ?? (existing ? "This replaces the entry already logged for that day." : "")}
              </p>
            </form>
          </CardContent>
        </Card>

        <HabitsCard
          habits={habits}
          eatenFor={eatenFor}
          logs={habitLogs}
          today={today}
          dayPlanFor={dayPlanFor}
          onSave={onSaveHabits}
          onHabitsChange={onHabitsChange}
        />

        <RemindersCard prefs={reminders} onChange={onRemindersChange} status={reminderStatus} />
      </div>

      {/* ------------------------------ right ------------------------------- */}
      <div className="space-y-5">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.badge}>{status.label}</Badge>
              {analysis.stale ? (
                <Badge variant="warning">
                  <CalendarClock />
                  Last weigh-in over a week ago
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-lg">{analysis.headline}</CardTitle>
            <CardDescription className="max-w-3xl leading-relaxed">{analysis.detail}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {analysis.latest ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Trend weight"
                  emphasis
                  icon={<TrendingDown className="h-3.5 w-3.5" />}
                  value={formatWeight(analysis.trendWeight ?? 0, unit)}
                  sub={
                    analysis.difference === null
                      ? "smoothed"
                      : `${analysis.difference > 0 ? "+" : ""}${round(fromLb(analysis.difference, unit), 1)} ${unit} vs plan`
                  }
                />
                <Stat
                  label="Loss rate"
                  value={analysis.observedRate === null ? "—" : `${round(fromLb(analysis.observedRate, unit), 2)} ${unit}/wk`}
                  sub={
                    analysis.plannedRate === null
                      ? "needs more weigh-ins"
                      : `plan: ${round(fromLb(analysis.plannedRate, unit), 2)} ${unit}/wk`
                  }
                />
                <Stat
                  label="Real maintenance"
                  value={analysis.estimatedMaintenance === null ? "—" : `${analysis.estimatedMaintenance.toLocaleString()} kcal`}
                  sub={
                    analysis.modelMaintenance === null
                      ? "needs more weigh-ins"
                      : `model: ${analysis.modelMaintenance.toLocaleString()} kcal`
                  }
                />
                <Stat
                  label="Goal at this rate"
                  value={analysis.projectedGoalDate ? formatShort(analysis.projectedGoalDate) : "—"}
                  sub={`plan: ${formatShort(timeline.finishDate)}`}
                />
              </div>
            ) : null}

            {analysis.recommendation ? (
              <RecommendationBox
                rec={analysis.recommendation}
                onApply={() => onApplyAdjustment(analysis.recommendation!, analysis)}
              />
            ) : null}

            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">Plan vs actual</h3>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onNavigate("roadmap")}>
                  Open the roadmap
                </Button>
              </div>
              <ProgressChart timeline={timeline} weighIns={weighIns} unit={unit} today={today} range="recent" />
            </div>
          </CardContent>
        </Card>

        <WeeklyScorecard
          habits={habits}
          logs={habitLogs}
          reviews={reviews}
          today={today}
          weekTargets={weekTargets}
          onSaveReview={onSaveReview}
        />

        <ConsistencyCard habits={habits} logs={habitLogs} today={today} />

        {adjustments.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Calorie changes applied</CardTitle>
              <CardDescription>
                Each one shifts the roadmap from the week it starts. Your timeline&apos;s predicted weights stay the same — that&apos;s the line you&apos;re steering back to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className={cn("tabular font-semibold", a.kcal < 0 ? "text-foreground" : "text-success")}>
                      {a.kcal > 0 ? "+" : ""}
                      {a.kcal} kcal/day
                    </span>
                    <span className="text-xs text-muted-foreground">
                      from {formatLong(a.effectiveFrom)} · applied {formatShort(a.appliedOn)}
                    </span>
                    <ConfirmButton
                      className="ml-auto h-7 px-2 text-xs"
                      label="Undo"
                      icon={<Undo2 />}
                      confirmLabel="Remove change"
                      onConfirm={() => onRemoveAdjustment(a.id)}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Weigh-ins</CardTitle>
            <CardDescription>
              {weighIns.length === 0
                ? "Nothing logged yet."
                : `${weighIns.length} logged. Trend is the smoothed weight — judge progress by that, not single days.`}
            </CardDescription>
          </CardHeader>
          {weighIns.length > 0 ? (
            <CardContent>
              <div className="relative scrollbar-thin max-h-[28rem] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Weight</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Trend</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Plan</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">kcal</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Note</th>
                      <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((w) => {
                      const plan = predictedWeightOn(timeline, w.date);
                      const trend = trendByDate.get(w.date);
                      return (
                        <tr key={w.date} className="border-b border-border/60 last:border-0">
                          <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                            {formatShort(w.date)}
                          </th>
                          <td className="tabular px-3 py-2 text-right">{formatWeight(w.weightLb, unit, 1, false)}</td>
                          <td className="tabular px-3 py-2 text-right font-medium">
                            {trend === undefined ? "—" : formatWeight(trend, unit, 1, false)}
                          </td>
                          <td className="tabular px-3 py-2 text-right text-muted-foreground">
                            {plan === null || w.date < timeline.requiredStartDate ? "—" : formatWeight(plan, unit, 1, false)}
                          </td>
                          <td className="tabular px-3 py-2 text-right text-muted-foreground">
                            {w.calories === null ? "—" : w.calories.toLocaleString()}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted-foreground" title={w.note ?? undefined}>
                            {w.note ?? ""}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Edit ${formatShort(w.date)}`}
                              onClick={() => setDate(w.date)}
                            >
                              <Pencil />
                            </Button>
                            <ConfirmButton
                              size="icon"
                              className="h-7 w-7"
                              label={<span className="sr-only">Delete {formatShort(w.date)}</span>}
                              icon={<Trash2 />}
                              confirmLabel="Delete"
                              onConfirm={() => onDelete(w.date)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          ) : null}
        </Card>

        <StorageCard
          session={session}
          count={weighIns.length + habitLogs.length + reviews.length + foodCount}
          onDeleteAll={onDeleteAll}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RecommendationBox({ rec, onApply }: { rec: Recommendation; onApply: () => void }) {
  const food = rec.kcal !== 0;
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Recommended change</span>
        <span className="text-xs text-muted-foreground">from {formatLong(rec.effectiveFrom)}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {food ? (
          <span className="tabular text-2xl font-semibold text-primary">
            {rec.kcal > 0 ? "+" : ""}
            {rec.kcal} <span className="text-sm font-normal text-muted-foreground">kcal/day</span>
          </span>
        ) : null}
        {rec.activityKcal > 0 ? (
          <span className="tabular text-2xl font-semibold text-primary">
            +{rec.activityKcal} <span className="text-sm font-normal text-muted-foreground">kcal/day activity</span>
          </span>
        ) : null}
        <span className="tabular text-sm text-muted-foreground">
          new average: {rec.newIntake.toLocaleString()} kcal/day
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{rec.reason}</p>
      {food ? (
        <Button size="sm" onClick={onApply}>
          <Check />
          Apply to my roadmap
        </Button>
      ) : (
        <p className="text-xs">
          Food is already at its floor, so this one is activity only — there&apos;s nothing to apply to the roadmap.
        </p>
      )}
    </div>
  );
}

function StorageCard({
  session,
  count,
  onDeleteAll,
}: {
  session: SessionInfo;
  count: number;
  onDeleteAll: () => Promise<void>;
}) {
  const cloud = session.mode === "cloud";
  const reasons: Record<string, string> = {
    "not-configured": "Account sync isn't switched on for this app yet.",
    "not-signed-in": "Open this app from inside Whop to sync check-ins to your account.",
    "no-server": "This version of the app has no sync server.",
    offline: "Couldn't reach the sync server.",
  };
  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-center gap-2">
          {cloud ? <Cloud className="h-4 w-4 text-success" /> : <HardDrive className="h-4 w-4 text-warning" />}
          <CardTitle className="text-sm">
            {cloud ? "Synced to your Whop account" : "Saved on this device only"}
          </CardTitle>
        </div>
        <CardDescription className="text-xs leading-relaxed">
          {cloud
            ? "Your weigh-ins, habits and plan follow you to any device where you open this app in Whop."
            : `${reasons[session.reason ?? "not-signed-in"]} For now, check-ins stay in this browser — clearing site data or switching devices loses them.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Your weight, food and habit logs are health data. They&apos;re stored only to run the app, and you can delete
            all of it here at any time.{" "}
            <a href="/privacy/" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
              Privacy policy
            </a>
          </span>
        </p>
        <ConfirmButton
          variant="outline"
          className="w-full"
          icon={<Trash2 />}
          label={`Delete all my data${count ? ` (${count} entries)` : ""}`}
          confirmLabel="Yes, delete everything"
          onConfirm={onDeleteAll}
        />
      </CardContent>
    </Card>
  );
}
