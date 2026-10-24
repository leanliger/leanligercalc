"use client";

import * as React from "react";
import { CalendarClock, Download, Dumbbell, Lightbulb, Loader2, PartyPopper, Scale, Send, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { PhotoImage } from "@/components/photos-card";
import type { Checkin } from "@/lib/checkins";
import type { MemberSummary } from "@/lib/coach";
import type { FoodDay } from "@/lib/coach-api";
import type { CoachMacros } from "@/lib/coach-macros";
import { formatShort } from "@/lib/dates";
import { dayTargetFinder } from "@/lib/day-targets";
import {
  PATTERN_MIN_WEEKS,
  forecast,
  monthRecap,
  muscleCheck,
  patterns,
  recapMessage,
  weightJumps,
  type InsightsInput,
  type MonthRecap,
} from "@/lib/member-insights";
import { currentPlanWeek, effectiveCarbInputs } from "@/lib/plan-link";
import { weightChangeOver } from "@/lib/muscle-check";
import { ClientFile, ClientFileButton, DietBreakCard, NeedleCard, RiskCard, useNeedle } from "@/components/coach-coaching-cards";
import type { Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** A button that sends the member a chat message, then says so. */
function SendButton({ companyId, memberId, text, label }: { companyId: string; memberId: string; text: string; label: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle");
  return (
    <Button
      size="sm"
      variant={state === "sent" ? "ghost" : "outline"}
      disabled={state === "sending" || state === "sent"}
      onClick={async () => {
        setState("sending");
        try {
          await call("/api/coach/messages", { method: "POST", body: JSON.stringify({ company: companyId, member: memberId, body: text }) });
          setState("sent");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "sending" ? <Loader2 className="animate-spin" /> : <Send />}
      {state === "sent" ? "Sent in chat" : state === "failed" ? "Couldn't send. Retry" : label}
    </Button>
  );
}

/**
 * Members → a member → Insights: what works for them, a forecast with
 * what-ifs, why the scale jumped, whether their cut is keeping muscle, and a
 * monthly recap to send or save. Worked out here from what they already log
 * (src/lib/member-insights.ts).
 */
export type InsightsData = ReturnType<typeof useInsightsData>;

/**
 * Everything the insights are worked out from: their workouts, food,
 * check-ins and the macros you set, loaded once per member page and shared by
 * the Overview's key insights, History's "What moved the needle" and the
 * client file.
 */
export function useInsightsData(companyId: string, summary: MemberSummary, unit: WeightUnit, today: string) {
  const memberId = summary.data.userId;
  const first = summary.displayName.split(" ")[0] || summary.displayName;
  const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;
  const [data, setData] = React.useState<{ workouts: Workout[]; food: FoodDay[]; checkins: Checkin[]; macros: CoachMacros | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    Promise.all([
      call<{ workouts: Workout[] }>(`/api/coach/member-workouts?${qs}`).catch(() => ({ workouts: [] as Workout[] })),
      call<{ days: FoodDay[] }>(`/api/coach/member-food?${qs}`).catch(() => ({ days: [] as FoodDay[] })),
      call<{ checkins: Checkin[] }>(`/api/coach/checkins?${qs}`).catch(() => ({ checkins: [] as Checkin[] })),
      call<{ macros: CoachMacros | null }>(`/api/coach/macros?${qs}`).catch(() => ({ macros: null })),
    ])
      .then(([w, f, c, m]) => live && setData({ workouts: w.workouts, food: f.days, checkins: c.checkins, macros: m.macros }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load their data."));
    return () => {
      live = false;
    };
  }, [qs]);

  const input: InsightsInput | null = React.useMemo(
    () =>
      data
        ? {
            today,
            unit,
            firstName: first,
            weighIns: summary.data.weighIns,
            food: data.food.length ? data.food : summary.data.foodDays,
            habitLogs: summary.data.habitLogs,
            workouts: data.workouts,
            checkins: data.checkins,
          }
        : null,
    [data, today, unit, first, summary.data],
  );

  // What moved the needle (needs the changes list).
  const needle = useNeedle(companyId, summary, input, today, unit);
  return { data, input, error, needle };
}

/** Overview → Key insights: the four that matter most, each one line; "See all insights" opens the rest. */
export function KeyInsights({
  summary,
  loaded,
  unit,
  today,
  allOpen,
  onSeeAll,
}: {
  summary: MemberSummary;
  loaded: InsightsData;
  unit: WeightUnit;
  today: string;
  /** Every insight is showing below. */
  allOpen: boolean;
  onSeeAll: () => void;
}) {
  const { input, needle } = loaded;
  const r = summary.risk;
  const muscle = React.useMemo(() => (input ? muscleCheck(input) : null), [input]);
  const p = summary.progress;
  const plan = summary.state;
  const goal = plan.fatLoss.goalType === "weight" ? plan.fatLoss.targetWeight : null;
  const sixWeeks = weightChangeOver(summary.data.weighIns, today);
  const rate = p?.observedRate ?? (sixWeeks === null ? null : -sixWeeks / 6);
  const eta = forecast({ today, trendLb: p?.trendWeight ?? summary.latestWeightLb, rateLb: rate, goalLb: goal, kcalDelta: 0, stepsDelta: 0 });
  const lastChange = needle.effects[0] ?? null;
  const tiles: { label: string; value: string; text: string; tone: string }[] = [
    {
      label: "Drop-off risk",
      value: `${r.level === "high" ? "High" : r.level === "medium" ? "Medium" : "Low"} · ${r.score}`,
      text: r.level === "low" ? "No warning signs." : (r.reasons[0]?.text ?? r.action),
      tone: r.level === "high" ? "text-destructive" : r.level === "medium" ? "text-warning" : "text-success",
    },
    {
      label: "Muscle",
      value: !muscle ? "…" : muscle.verdict === "losing" ? "Losing" : muscle.verdict === "kept" ? "Kept" : muscle.verdict === "slipping" ? "Lifts slipping" : muscle.verdict === "steady" ? "Steady" : "Not enough data",
      text: muscle ? (muscle.down.length ? `Slipping: ${muscle.down.slice(0, 3).join(", ")}` : muscle.up.length ? `Up: ${muscle.up.slice(0, 3).join(", ")}` : "Lifts holding.") : "Loading their workouts…",
      tone: muscle?.verdict === "losing" ? "text-destructive" : muscle?.verdict === "slipping" ? "text-warning" : muscle?.verdict === "kept" ? "text-success" : "text-foreground",
    },
    {
      label: "Goal date",
      value: eta.date ? formatShort(eta.date) : "—",
      text: eta.date
        ? `At ${eta.rate === null ? "their" : `${r1(fromLb(Math.abs(eta.rate), unit))} ${unit}`} a week, about ${Math.max(0, Math.round(eta.weeks ?? 0))} weeks.`
        : goal === null
          ? "No goal weight set."
          : "Not heading toward the goal at this rate.",
      tone: "text-foreground",
    },
    {
      label: "Last change you made",
      value: needle.loading ? "…" : lastChange ? (lastChange.verdict === "helped" ? "Helped" : lastChange.verdict === "hurt" ? "Hurt" : lastChange.verdict === "too-soon" ? "Too soon" : "No change") : "None yet",
      text: lastChange ? `${formatShort(lastChange.date)}: ${lastChange.changes[0]!.title}` : "Macros, programs or focus items you set show here.",
      tone: lastChange?.verdict === "helped" ? "text-success" : lastChange?.verdict === "hurt" ? "text-destructive" : "text-foreground",
    },
  ];
  return (
    <section aria-label="Key insights" className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Key insights</h3>
        <button type="button" onClick={onSeeAll} aria-expanded={allOpen} className="ml-auto text-[12px] font-semibold text-primary underline-offset-2 hover:underline">
          {allOpen ? "Hide all insights" : "See all insights"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 space-y-0.5 bg-card px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className={cn("tabular text-base font-semibold", t.tone)}>{t.value}</p>
            <p className="text-[12px] leading-snug text-muted-foreground">{t.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every insight about a member, from the data the page already loaded. */
export function MemberInsights({ companyId, summary, unit, today, loaded }: { companyId: string; summary: MemberSummary; unit: WeightUnit; today: string; loaded: InsightsData }) {
  const memberId = summary.data.userId;
  const first = summary.displayName.split(" ")[0] || summary.displayName;
  const { data, input, error, needle } = loaded;
  // The printable client file.
  const [fileOpen, setFileOpen] = React.useState(false);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!input || !data) return <div className="h-64 animate-pulse rounded-[1.25rem] bg-muted/30" aria-busy="true" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Worked out from what {first} logs. Nothing here is shown to them unless you send it.</p>
        <span className="ml-auto">
          <ClientFileButton onOpen={() => setFileOpen(true)} />
        </span>
      </div>
      <RiskCard summary={summary} companyId={companyId} />
      <MuscleCard input={input} />
      <PatternsCard input={input} companyId={companyId} memberId={memberId} first={first} />
      <DietBreakCard summary={summary} input={input} companyId={companyId} coachMacros={data.macros} today={today} />
      <ForecastCard summary={summary} today={today} unit={unit} companyId={companyId} memberId={memberId} first={first} coachMacros={data.macros} />
      <NeedleCard effects={needle.effects} loading={needle.loading} unit={unit} />
      <JumpsCard input={input} />
      <RecapCard input={input} summary={summary} companyId={companyId} memberId={memberId} first={first} unit={unit} today={today} />
      {fileOpen ? (
        <ClientFile summary={summary} input={input} companyId={companyId} unit={unit} today={today} effects={needle.effects} onClose={() => setFileOpen(false)} />
      ) : null}
    </div>
  );
}

/* -------------------------------- muscle kept -------------------------------- */

function MuscleCard({ input }: { input: InsightsInput }) {
  const m = React.useMemo(() => muscleCheck(input), [input]);
  const tone = m.verdict === "losing" ? "border-destructive/50" : m.verdict === "kept" ? "border-success/50" : m.verdict === "slipping" ? "border-warning/50" : "";
  const badge =
    m.verdict === "losing"
      ? ["Losing muscle", "bg-destructive/15 text-destructive"]
      : m.verdict === "kept"
        ? ["Muscle kept", "bg-success/15 text-success"]
        : m.verdict === "slipping"
          ? ["Lifts slipping", "bg-warning/15 text-warning"]
          : m.verdict === "steady"
            ? ["Steady", "bg-muted text-muted-foreground"]
            : ["Not enough data", "bg-muted text-muted-foreground"];
  return (
    <Card className={tone}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Dumbbell className="h-4 w-4 text-primary" />
          Muscle kept?
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", badge[1])}>{badge[0]}</span>
        </CardTitle>
        <CardDescription>Weight change over 6 weeks against how their lifts moved.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{m.text}</p>
        {m.down.length ? <p className="text-[12px] text-destructive">Slipping: {m.down.join(", ")}</p> : null}
        {m.up.length ? <p className="text-[12px] text-success">Up: {m.up.join(", ")}</p> : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- what works -------------------------------- */

function PatternsCard({ input, companyId, memberId, first }: { input: InsightsInput; companyId: string; memberId: string; first: string }) {
  const p = React.useMemo(() => patterns(input), [input]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          What works for {first}
        </CardTitle>
        <CardDescription>
          Patterns from their own weeks. These are links, not proof of cause, and only show with enough weeks behind them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {p.insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {p.weeksWithData < PATTERN_MIN_WEEKS
              ? `Patterns need about ${PATTERN_MIN_WEEKS} weeks of logs; ${first} has ${p.weeksWithData}.`
              : "No clear patterns yet: their weeks look alike on what they log."}
          </p>
        ) : (
          p.insights.map((i) => (
            <div key={i.id} className="space-y-1.5 rounded-2xl border border-border p-3">
              <p className="text-sm font-semibold">{i.title}</p>
              <p className="text-sm">{i.detail}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Based on {i.basis}</span>
                <span className="ml-auto">
                  <SendButton companyId={companyId} memberId={memberId} text={i.message} label={`Send to ${first}`} />
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- forecast -------------------------------- */

function ForecastCard({
  summary,
  today,
  unit,
  companyId,
  memberId,
  first,
  coachMacros,
}: {
  summary: MemberSummary;
  today: string;
  unit: WeightUnit;
  companyId: string;
  memberId: string;
  first: string;
  coachMacros: CoachMacros | null;
}) {
  const [kcal, setKcal] = React.useState(0);
  const [steps, setSteps] = React.useState(0);
  const [applied, setApplied] = React.useState<string | null>(null);
  const p = summary.progress;
  const plan = summary.state;
  const goal = plan.fatLoss.goalType === "weight" ? plan.fatLoss.targetWeight : null;
  const trend = p?.trendWeight ?? summary.latestWeightLb;
  // Their plan's measured rate; without one, the last six weeks' trend.
  const sixWeeks = weightChangeOver(summary.data.weighIns, today);
  const rate = p?.observedRate ?? (sixWeeks === null ? null : -sixWeeks / 6);
  const base = forecast({ today, trendLb: trend, rateLb: rate, goalLb: goal, kcalDelta: 0, stepsDelta: 0 });
  const what = forecast({ today, trendLb: trend, rateLb: rate, goalLb: goal, kcalDelta: kcal, stepsDelta: steps });
  const w = (lb: number) => `${r1(fromLb(lb, unit))} ${unit}`;

  // A calorie change goes out as macros, like Set macros (one daily target only).
  const target = React.useMemo(() => {
    if (!summary.hasPlan) return null;
    try {
      const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, today);
      return dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros)(today);
    } catch {
      return null;
    }
  }, [summary.hasPlan, plan, today, coachMacros]);
  const canApply = !!target && (coachMacros !== null || target.steady);
  const applyKcal = async () => {
    if (!target) return;
    const b = coachMacros ?? { protein: target.protein, carbs: target.carbs, fat: target.fat };
    const carbs = Math.max(0, b.carbs + Math.round(kcal / 4));
    await call("/api/coach/macros", {
      method: "PUT",
      body: JSON.stringify({ company: companyId, member: memberId, protein: b.protein, carbs, fat: b.fat, note: `${kcal > 0 ? "+" : "−"}${Math.abs(kcal)} kcal a day (carbs).` }),
    });
    setApplied(`Set: ${(b.protein * 4 + carbs * 4 + b.fat * 9).toLocaleString("en-US")} kcal a day. ${first} got a notification.`);
  };
  const sooner = base.date && what.date ? Math.round((Date.parse(base.date) - Date.parse(what.date)) / 86_400_000) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" />
          Forecast and what-if
        </CardTitle>
        <CardDescription>From their real rate and measured maintenance, not a formula. Steps assume about {r1(0.0005 * (trend ?? 180) * 0.4536 * 1000)} kcal per 1,000.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rate === null || trend === null ? (
          <p className="text-muted-foreground">Needs a few more weeks of weigh-ins to measure their real rate.</p>
        ) : (
          <>
            <p>
              Real pace: <span className="font-semibold">{rate >= 0 ? "−" : "+"}{w(Math.abs(rate))} a week</span>
              {p?.estimatedMaintenance ? ` · maintenance about ${Math.round(p.estimatedMaintenance).toLocaleString("en-US")} kcal` : ""}.
              {goal !== null ? (base.date ? ` Goal ${w(goal)} on ${formatShort(base.date)}.` : ` At this pace they won't reach ${w(goal)}.`) : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="flex justify-between text-[12px] text-muted-foreground">
                  Calories a day <span className="tabular font-semibold text-foreground">{kcal > 0 ? "+" : kcal < 0 ? "−" : ""}{Math.abs(kcal)}</span>
                </span>
                <input type="range" min={-300} max={300} step={50} value={kcal} onChange={(e) => setKcal(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" aria-label="Change in calories a day" />
              </label>
              <label className="space-y-1">
                <span className="flex justify-between text-[12px] text-muted-foreground">
                  Steps a day <span className="tabular font-semibold text-foreground">+{steps.toLocaleString("en-US")}</span>
                </span>
                <input type="range" min={0} max={4000} step={500} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" aria-label="Extra steps a day" />
              </label>
            </div>
            {kcal !== 0 || steps !== 0 ? (
              <p className="rounded-xl border border-primary/30 bg-primary/[0.05] p-2.5">
                With this: <span className="font-semibold">{what.rate! >= 0 ? "−" : "+"}{w(Math.abs(what.rate!))} a week</span>
                {goal !== null ? (what.date ? `, goal on ${formatShort(what.date)}${sooner ? ` (${Math.abs(sooner)} days ${sooner > 0 ? "sooner" : "later"})` : ""}.` : ", and the goal isn't reached at that pace.") : "."}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {kcal !== 0 ? (
                canApply ? (
                  <Button size="sm" onClick={() => void applyKcal().catch(() => setApplied("Couldn't set it. Try again."))}>
                    Set macros {kcal > 0 ? "+" : "−"}{Math.abs(kcal)} kcal
                  </Button>
                ) : (
                  <span className="text-[12px] text-muted-foreground">They carb cycle: change calories from Nutrition → Set macros.</span>
                )
              ) : null}
              {steps > 0 ? (
                <SendButton
                  companyId={companyId}
                  memberId={memberId}
                  label={`Send step goal to ${first}`}
                  text={`${first}, let's add ${steps.toLocaleString("en-US")} steps a day.${goal !== null && sooner && sooner > 0 ? ` On your current numbers that gets you to your goal about ${sooner} days sooner.` : ""} A 15-minute walk after two meals covers most of it.`}
                />
              ) : null}
            </div>
            {applied ? <p className="text-[12px] text-muted-foreground">{applied}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- weight jumps -------------------------------- */

function JumpsCard({ input }: { input: InsightsInput }) {
  const jumps = React.useMemo(() => weightJumps(input), [input]);
  const w = (lb: number) => `${r1(fromLb(lb, input.unit))}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-primary" />
          Why did the scale jump?
        </CardTitle>
        <CardDescription>Rises of 1 lb or more between weigh-ins in the last 5 weeks, with what their logs show around them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {jumps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jumps of 1 lb or more lately.</p>
        ) : (
          jumps.map((j) => (
            <div key={j.date} className="rounded-2xl border border-border p-3 text-sm">
              <p className="font-semibold">
                {formatShort(j.date)}: {w(j.fromLb)} → {w(j.toLb)} {input.unit}{" "}
                <span className="text-destructive">(+{r1(fromLb(j.toLb - j.fromLb, input.unit))})</span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-muted-foreground">
                {j.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {j.settled ? (
                <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-success">
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  {j.settled}: water, not fat.
                </p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- monthly recap -------------------------------- */

const monthOf = (date: string, back: number) => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function RecapCard({
  input,
  summary,
  companyId,
  memberId,
  first,
  unit,
  today,
}: {
  input: InsightsInput;
  summary: MemberSummary;
  companyId: string;
  memberId: string;
  first: string;
  unit: WeightUnit;
  today: string;
}) {
  const [which, setWhich] = React.useState<"last" | "this">("last");
  const month = monthOf(today, which === "last" ? 1 : 0);
  const recap = React.useMemo(
    () => monthRecap({ ...input, measurements: summary.data.measurements, photos: summary.data.photos }, month),
    [input, summary.data.measurements, summary.data.photos, month],
  );
  const photo = (id: string) => `/api/coach/photo?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}&id=${encodeURIComponent(id)}`;
  const [saving, setSaving] = React.useState(false);
  const message = recapMessage(recap, first, unit);
  const change = recap.weightStart !== null && recap.weightEnd !== null ? recap.weightEnd - recap.weightStart : null;
  const stats: [string, string][] = [
    ["Weight", change === null ? "—" : `${change <= 0 ? "−" : "+"}${r1(fromLb(Math.abs(change), unit))} ${unit}`],
    ["Waist", recap.waistChange === null ? "—" : `${recap.waistChange <= 0 ? "−" : "+"}${r1(Math.abs(unit === "kg" ? recap.waistChange * 2.54 : recap.waistChange))} ${unit === "kg" ? "cm" : "in"}`],
    ["Workouts", String(recap.workouts)],
    ["Food logged", `${recap.foodDays}/${recap.days} days`],
    ["Check-ins", String(recap.checkins)],
    ["Habit score", recap.habitAvg === null ? "—" : `${Math.round(recap.habitAvg)}%`],
  ];

  const save = async () => {
    setSaving(true);
    try {
      const blob = await recapImage(recap, first, stats, recap.photos ? [photo(recap.photos.before), photo(recap.photos.after)] : null);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${first.toLowerCase()}-${recap.month}-recap.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PartyPopper className="h-4 w-4 text-primary" />
            Monthly recap
          </CardTitle>
          <SegmentedControl
            ariaLabel="Month"
            size="sm"
            value={which}
            onValueChange={setWhich}
            options={[
              { value: "last" as const, label: "Last month" },
              { value: "this" as const, label: "This month" },
            ]}
            className="w-auto"
          />
        </div>
        <CardDescription>
          {recap.label}: send it to {first} as a chat message, or save the image. Post it publicly only if they&apos;ve allowed testimonials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-2.5">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="tabular text-lg font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
        {recap.bests.length ? (
          <p className="text-sm">
            <span className="font-semibold">New bests: </span>
            {recap.bests.map((b) => `${b.name} +${b.pct}%`).join(" · ")}
          </p>
        ) : null}
        {recap.photos ? (
          <div className="grid max-w-sm grid-cols-2 gap-2">
            <PhotoImage src={photo(recap.photos.before)} alt="Start of the month" className="aspect-[3/4] w-full" />
            <PhotoImage src={photo(recap.photos.after)} alt="End of the month" className="aspect-[3/4] w-full" />
          </div>
        ) : null}
        {recap.quote ? <p className="border-l-2 border-primary/50 pl-3 text-sm italic">“{recap.quote}”</p> : null}
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-background/40 p-2.5 text-[13px] text-muted-foreground">{message}</p>
        <div className="flex flex-wrap gap-2">
          <SendButton key={recap.month} companyId={companyId} memberId={memberId} text={message} label={`Send to ${first}`} />
          <Button size="sm" variant="ghost" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Download />}
            Save image
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The recap as a 1080×1350 image: title, stats, before/after photos when shared. */
async function recapImage(r: MonthRecap, first: string, stats: [string, string][], photos: [string, string] | null): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14110c";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#e7b75f";
  g.font = "800 34px system-ui, sans-serif";
  g.fillText(`${r.label.toUpperCase()} IN REVIEW`, 72, 110);
  g.fillStyle = "#f5efe4";
  g.font = "800 72px system-ui, sans-serif";
  g.fillText(first, 72, 190);
  let y = 250;
  if (photos) {
    const imgs = await Promise.all(
      photos.map(async (src) => {
        try {
          const res = await fetch(src, { credentials: "same-origin" });
          return res.ok ? await createImageBitmap(await res.blob()) : null;
        } catch {
          return null;
        }
      }),
    );
    const pw = 456;
    const ph = 608;
    imgs.forEach((img, i) => {
      const x = 72 + i * (pw + 24);
      g.fillStyle = "#221d15";
      g.fillRect(x, y, pw, ph);
      if (img) {
        const s = Math.max(pw / img.width, ph / img.height);
        const sw = pw / s;
        const sh = ph / s;
        g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, pw, ph);
        img.close();
      }
      // A dark tag so the label reads on any photo.
      g.fillStyle = "rgba(20,17,12,0.85)";
      g.fillRect(x, y + ph - 56, i === 0 ? 118 : 88, 56);
      g.fillStyle = "#e7b75f";
      g.font = "700 26px system-ui, sans-serif";
      g.fillText(i === 0 ? "START" : "END", x + 16, y + ph - 20);
    });
    y += ph + 50;
  }
  const cols = 3;
  const cw = (W - 144) / cols;
  stats.forEach(([k, v], i) => {
    const x = 72 + (i % cols) * cw;
    const yy = y + Math.floor(i / cols) * 130;
    g.fillStyle = "#a89b86";
    g.font = "600 24px system-ui, sans-serif";
    g.fillText(k.toUpperCase(), x, yy);
    g.fillStyle = "#f5efe4";
    g.font = "800 48px system-ui, sans-serif";
    g.fillText(v, x, yy + 56);
  });
  y += Math.ceil(stats.length / cols) * 130 + 10;
  if (r.bests.length && y < H - 80) {
    g.fillStyle = "#e7b75f";
    g.font = "700 30px system-ui, sans-serif";
    g.fillText(`New bests: ${r.bests.map((b) => `${b.name} +${b.pct}%`).join(" · ")}`.slice(0, 60), 72, y);
  }
  g.fillStyle = "#6f6556";
  g.font = "600 22px system-ui, sans-serif";
  g.fillText("Lean Stature System", 72, H - 48);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("image failed"))), "image/png"));
}

/** The member page's "Client file" button: opens the printable file once their data has loaded. */
export function ClientFileLauncher({ summary, loaded, companyId, unit, today }: { summary: MemberSummary; loaded: InsightsData; companyId: string; unit: WeightUnit; today: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <ClientFileButton onOpen={() => setOpen(true)} disabled={!loaded.input} />
      {open && loaded.input ? (
        <ClientFile summary={summary} input={loaded.input} companyId={companyId} unit={unit} today={today} effects={loaded.needle.effects} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
