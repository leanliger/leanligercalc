"use client";

import * as React from "react";
import { Check, ChevronDown, PenLine, Send, Sparkles, Utensils, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Checkin } from "@/lib/checkins";
import { FOCUS_DEFAULT, FOCUS_MAX, FOCUS_TEXT_MAX, buildCheckinReport, composeReportReply, type MetricStatus } from "@/lib/checkin-report";
import type { MemberSummary } from "@/lib/coach";
import type { CoachMacros } from "@/lib/coach-macros";
import { addDays } from "@/lib/dates";
import { dayTargetFinder } from "@/lib/day-targets";
import { milestoneLabel } from "@/lib/milestones";
import { currentPlanWeek, effectiveCarbInputs } from "@/lib/plan-link";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<MetricStatus, string> = {
  good: "border-success/40 bg-success/[0.07]",
  ok: "border-warning/40 bg-warning/[0.06]",
  low: "border-destructive/40 bg-destructive/[0.06]",
  none: "border-border",
};
const STATUS_DOT: Record<MetricStatus, string> = { good: "bg-success", ok: "bg-warning", low: "bg-destructive", none: "bg-muted-foreground/40" };

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

/**
 * A check-in, scored against the member's plan and last week, with the wins,
 * the changes most likely to help next week and (when the app has one) a
 * calorie change, sent as a reply in one click. Their focus items then sit on
 * their Today page until the next check-in.
 */
export function CheckinReportPanel({
  companyId,
  memberId,
  summary,
  checkin,
  previous,
  unit,
  onSent,
  onEdit,
}: {
  companyId: string;
  memberId: string;
  summary: MemberSummary;
  checkin: Checkin;
  previous: Checkin | null;
  unit: WeightUnit;
  onSent: (r: { checkins: Checkin[]; notified: boolean }) => void;
  /** Put the composed reply in the reply box to edit (focus items go with it). */
  onEdit: (text: string, focus: string[]) => void;
}) {
  const first = summary.displayName.split(" ")[0] || summary.displayName;
  const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;
  const [coachMacros, setCoachMacros] = React.useState<CoachMacros | null | undefined>(undefined);
  React.useEffect(() => {
    let live = true;
    call<{ macros: CoachMacros | null }>(`/api/coach/macros?${qs}`)
      .then((r) => live && setCoachMacros(r.macros))
      .catch(() => live && setCoachMacros(null));
    return () => {
      live = false;
    };
  }, [qs]);

  // Their targets over the check-in week (carb-cycling days averaged), as their Food log showed them.
  const plan = summary.state;
  const targetFor = React.useMemo(() => {
    if (!summary.hasPlan || coachMacros === undefined) return null;
    try {
      const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, checkin.stats.to);
      return dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros);
    } catch {
      return null;
    }
  }, [summary.hasPlan, plan, checkin.stats.to, coachMacros]);
  const weekTargets = React.useMemo(() => {
    if (!targetFor) return null;
    const days = Array.from({ length: 7 }, (_, i) => targetFor(addDays(checkin.stats.from, i))).filter((d) => d !== null);
    if (days.length === 0) return null;
    const avg = (k: "calories" | "protein") => Math.round(days.reduce((s, d) => s + d![k], 0) / days.length);
    return { calories: avg("calories"), protein: avg("protein"), steps: plan.fatLoss.activitySource === "steps" ? plan.fatLoss.dailySteps : null };
  }, [targetFor, checkin.stats.from, plan.fatLoss]);
  const today = targetFor ? targetFor(checkin.stats.to) : null;

  // Workouts a week they usually do, from the three weeks before this check-in.
  const usualWorkouts = React.useMemo(() => {
    const from = addDays(checkin.stats.from, -21);
    const before = summary.data.workoutDates.filter((d) => d >= from && d < checkin.stats.from).length;
    return summary.data.workoutDates.length >= 3 ? before / 3 : null;
  }, [summary.data.workoutDates, checkin.stats.from]);

  const report = React.useMemo(
    () =>
      buildCheckinReport({
        firstName: first,
        unit,
        checkin,
        previous,
        targets: weekTargets,
        plannedRateLb: summary.progress?.plannedRate ?? null,
        observedRateLb: summary.progress?.observedRate ?? null,
        bodyWeightLb: summary.latestWeightLb,
        tooFast: summary.flags.includes("too-fast"),
        underFloor: summary.flags.includes("under-floor"),
        plateau: summary.flags.includes("plateau"),
        slipping: summary.data.slipping ?? [],
        usualWorkouts,
        milestones: (summary.data.milestones ?? []).map((m) => milestoneLabel(m, unit)),
        recommendation: summary.progress?.recommendation ?? null,
      }),
    [first, unit, checkin, previous, weekTargets, summary, usualWorkouts],
  );

  // The coach's picks: the top suggestions ticked, each editable.
  const [picked, setPicked] = React.useState<Record<string, boolean>>({});
  const [texts, setTexts] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setPicked(Object.fromEntries(report.focus.map((f, i) => [f.id, i < FOCUS_DEFAULT])));
    setTexts(Object.fromEntries(report.focus.map((f) => [f.id, f.text])));
  }, [report.focus]);
  const chosen = report.focus.filter((f) => picked[f.id]).map((f) => (texts[f.id] ?? f.text).trim()).filter(Boolean);
  const [answer, setAnswer] = React.useState("");
  const question = checkin.answers.question.trim();

  // The calorie change: only as one daily target (coach macros, or a plan without carb cycling).
  const canChangeMacros = !!report.macro && !!today && (coachMacros !== null || today.steady);
  const [applyMacro, setApplyMacro] = React.useState(true);
  const macroOut =
    canChangeMacros && applyMacro && report.macro && today
      ? (() => {
          const base = coachMacros ?? { kcal: today.calories, protein: today.protein, carbs: today.carbs, fat: today.fat };
          const carbs = Math.max(0, base.carbs + Math.round(report.macro.kcal / 4));
          return { kcal: report.macro.kcal, newKcal: base.protein * 4 + carbs * 4 + base.fat * 9, protein: base.protein, carbs, fat: base.fat };
        })()
      : null;

  const text = composeReportReply(report, {
    firstName: first,
    focus: chosen,
    macro: macroOut ? { kcal: macroOut.kcal, newKcal: macroOut.newKcal } : null,
    answer,
    theirFocus: checkin.answers.focus ?? "",
  });

  const [showReply, setShowReply] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "sending">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const needsAnswer = question !== "" && answer.trim() === "";

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      if (macroOut) {
        await call(`/api/coach/macros`, {
          method: "PUT",
          body: JSON.stringify({
            company: companyId,
            member: memberId,
            protein: macroOut.protein,
            carbs: macroOut.carbs,
            fat: macroOut.fat,
            note: `From your check-in: ${macroOut.kcal > 0 ? "+" : "−"}${Math.abs(macroOut.kcal)} kcal a day (carbs).`,
          }),
        });
      }
      const r = await call<{ checkins: Checkin[]; notified: boolean }>("/api/coach/checkins/reply", {
        method: "POST",
        body: JSON.stringify({ company: companyId, member: memberId, weekStart: checkin.weekStart, reply: text, focus: chosen }),
      });
      onSent(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setState("idle");
    }
  };

  return (
    <section aria-label="Check-in report" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-4 w-4 text-primary" aria-hidden />
        <h4 className="text-sm font-bold">One-click reply</h4>
        <span className="text-[12px] text-muted-foreground">from {first}&apos;s numbers, their plan and last week</span>
      </div>

      <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {report.metrics.map((m) => (
          <div key={m.key} className={cn("rounded-xl border px-2.5 py-1.5", STATUS_STYLE[m.status])}>
            <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[m.status])} aria-hidden />
              {m.label}
            </dt>
            <dd className="tabular text-sm font-bold">{m.value}</dd>
            <dd className="truncate text-[11px] text-muted-foreground" title={m.detail}>
              {m.detail}
            </dd>
          </div>
        ))}
      </dl>

      {report.wins.length > 0 ? (
        <p className="text-sm">
          <span className="font-semibold text-success">Wins: </span>
          {report.wins.join(" · ")}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold">
          Focus for next week <span className="font-normal text-muted-foreground">(up to {FOCUS_MAX}; shown on their Today page)</span>
        </p>
        {report.focus.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nothing stands out: every number is on target. The reply says keep going.</p>
        ) : (
          <ul className="space-y-1.5">
            {report.focus.map((f) => {
              const on = !!picked[f.id];
              const full = !on && chosen.length >= FOCUS_MAX;
              return (
                <li key={f.id} className={cn("rounded-xl border p-2", on ? "border-primary/40 bg-card" : "border-border")}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                      checked={on}
                      disabled={full}
                      onChange={(e) => setPicked((p) => ({ ...p, [f.id]: e.target.checked }))}
                    />
                    <span className="min-w-0 flex-1">
                      {on ? (
                        <textarea
                          value={texts[f.id] ?? f.text}
                          onChange={(e) => setTexts((t) => ({ ...t, [f.id]: e.target.value }))}
                          maxLength={FOCUS_TEXT_MAX}
                          rows={2}
                          aria-label="Focus item"
                          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <span className="block text-sm text-muted-foreground">{f.text}</span>
                      )}
                      <span className="block text-[11px] text-muted-foreground">Why: {f.why}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {report.macro ? (
        canChangeMacros && macroOut !== null ? (
          <label className="flex items-start gap-2 rounded-xl border border-border p-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={applyMacro} onChange={(e) => setApplyMacro(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Utensils className="h-3.5 w-3.5 text-primary" aria-hidden />
                {report.macro.kcal > 0 ? "Add" : "Take"} {Math.abs(report.macro.kcal)} kcal a day (carbs): new target {macroOut.newKcal.toLocaleString("en-US")} kcal
              </span>
              <span className="block text-[12px] text-muted-foreground">{report.macro.reason} Sets their macros, like Set macros does.</span>
            </span>
          </label>
        ) : canChangeMacros ? (
          <label className="flex items-start gap-2 rounded-xl border border-border p-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={applyMacro} onChange={(e) => setApplyMacro(e.target.checked)} />
            <span>
              {report.macro.kcal > 0 ? "Add" : "Take"} {Math.abs(report.macro.kcal)} kcal a day (carbs)
              <span className="block text-[12px] text-muted-foreground">{report.macro.reason}</span>
            </span>
          </label>
        ) : (
          <p className="rounded-xl border border-border p-2 text-[12px] text-muted-foreground">
            The app suggests {report.macro.kcal > 0 ? "+" : "−"}
            {Math.abs(report.macro.kcal)} kcal a day ({report.macro.reason}) {first} can apply it from their Progress tab; it isn&apos;t
            sent from here because they carb cycle.
          </p>
        )
      ) : null}

      {question ? (
        <div className="space-y-1">
          <label htmlFor={`answer-${checkin.weekStart}`} className="block text-xs font-semibold">
            They asked: <span className="font-normal italic">“{question}”</span>
          </label>
          <Input
            id={`answer-${checkin.weekStart}`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer, added to the reply"
            className="h-9"
          />
        </div>
      ) : null}

      <div>
        <button
          type="button"
          aria-expanded={showReply}
          onClick={() => setShowReply((v) => !v)}
          className="flex items-center gap-1 text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showReply && "-rotate-90")} aria-hidden />
          {showReply ? "Hide the reply" : "See the reply"}
        </button>
        {showReply ? <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-border bg-card p-2.5 text-sm">{text}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void send()} disabled={state === "sending" || needsAnswer}>
          {state === "sending" ? <Sparkles className="animate-pulse" /> : <Send />}
          {state === "sending" ? "Sending…" : needsAnswer ? "Answer their question to send" : "Send 1-click reply"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(text, chosen)}>
          <PenLine />
          Edit first
        </Button>
        {macroOut ? (
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden />
            with the calorie change
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
