"use client";

import * as React from "react";
import { BedDouble, FileText, Gauge, Loader2, Printer, Send, Target, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhotoImage } from "@/components/photos-card";
import { FLAG_LABELS, type MemberSummary } from "@/lib/coach";
import type { CoachMacros } from "@/lib/coach-macros";
import { formatShort, addDays } from "@/lib/dates";
import { dayTargetFinder } from "@/lib/day-targets";
import type { InsightsInput } from "@/lib/member-insights";
import { forecast, muscleCheck, patterns } from "@/lib/member-insights";
import { weightChangeOver } from "@/lib/muscle-check";
import { changeEffects, dietBreakAdvice, type ChangeEffect, type CoachChange, type DietBreakAdvice } from "@/lib/needle";
import { dietStartToday } from "@/lib/plateau";
import { currentPlanWeek, effectiveCarbInputs } from "@/lib/plan-link";
import { strengthTrends } from "@/lib/strength-trends";
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

function Send1({ companyId, memberId, text, label }: { companyId: string; memberId: string; text: string; label: string }) {
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

/* -------------------------------- 7. drop-off risk -------------------------------- */

export function RiskCard({ summary, companyId }: { summary: MemberSummary; companyId: string }) {
  const r = summary.risk;
  const first = summary.displayName.split(" ")[0] || summary.displayName;
  const tone = r.level === "high" ? "border-destructive/50" : r.level === "medium" ? "border-warning/50" : "";
  const chip = r.level === "high" ? "bg-destructive/15 text-destructive" : r.level === "medium" ? "bg-warning/15 text-warning" : "bg-success/15 text-success";
  return (
    <Card className={tone}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Drop-off risk
          <span className={cn("tabular rounded-full px-2 py-0.5 text-[11px] font-bold", chip)}>
            {r.level === "high" ? "High" : r.level === "medium" ? "Medium" : "Low"} · {r.score}/100
          </span>
        </CardTitle>
        <CardDescription>The signs that come before members go quiet: logging falling off their usual, days without a log, not opening your whop, stopped check-ins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {r.reasons.length ? (
          <ul className="list-disc space-y-0.5 pl-5">
            {r.reasons.map((x) => (
              <li key={x.text}>{x.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No warning signs: {first} is engaged.</p>
        )}
        {r.level !== "low" ? (
          <>
            <p>
              <span className="font-semibold">Best next step: </span>
              {r.action}
            </p>
            <Send1
              companyId={companyId}
              memberId={summary.data.userId}
              label={`Send ${first} a personal check-in`}
              text={`Hey ${first}, haven't seen you in the app much lately. How are things going? No pressure on the plan: if life's busy, we can pause or simplify things for a couple of weeks. Just let me know.`}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- 9. diet break -------------------------------- */

export function DietBreakCard({
  summary,
  input,
  companyId,
  coachMacros,
  today,
}: {
  summary: MemberSummary;
  input: InsightsInput;
  companyId: string;
  coachMacros: CoachMacros | null;
  today: string;
}) {
  const first = summary.displayName.split(" ")[0] || summary.displayName;
  const advice: DietBreakAdvice = React.useMemo(
    () =>
      dietBreakAdvice({
        today,
        dietStart: dietStartToday(summary.timeline, today),
        weighIns: input.weighIns,
        plateau: summary.flags.includes("plateau"),
        slipping: summary.data.slipping?.length ?? 0,
        checkins: input.checkins,
        maintenance: summary.progress?.estimatedMaintenance ?? null,
      }),
    [summary, input, today],
  );
  const [set, setSet] = React.useState<string | null>(null);
  const plan = summary.state;
  const target = React.useMemo(() => {
    if (!summary.hasPlan) return null;
    try {
      const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, today);
      return dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros)(today);
    } catch {
      return null;
    }
  }, [summary.hasPlan, plan, today, coachMacros]);
  const maint = advice.maintenance ? Math.round(advice.maintenance / 50) * 50 : null;
  const canSet = advice.verdict === "break" && maint !== null && target !== null && (coachMacros !== null || target.steady);
  const backOn = addDays(today, 14);

  const setMaintenance = async () => {
    if (!target || maint === null) return;
    const b = coachMacros ?? { protein: target.protein, carbs: target.carbs, fat: target.fat };
    const carbs = Math.max(0, Math.round((maint - b.protein * 4 - b.fat * 9) / 4));
    await call("/api/coach/macros", {
      method: "PUT",
      body: JSON.stringify({
        company: companyId,
        member: summary.data.userId,
        protein: b.protein,
        carbs,
        fat: b.fat,
        note: `Diet break at maintenance until ${formatShort(backOn)}, then back to your cut.`,
      }),
    });
    setSet(`Set to maintenance (${(b.protein * 4 + carbs * 4 + b.fat * 9).toLocaleString("en-US")} kcal). Set their cut macros back on ${formatShort(backOn)}: Nutrition → Set macros.`);
  };

  const message =
    advice.verdict === "break"
      ? `${first}, you've earned a diet break. For the next 2 weeks, eat at maintenance (${maint ? `about ${maint.toLocaleString("en-US")} kcal` : "your maintenance calories"}), keep protein and training the same, and keep weighing in. Expect the scale to go up a little from water and glycogen: that's normal and comes off when we go back to the cut. You'll come back with more energy and better lifts.`
      : `${first}, let's add refeed days: 1–2 days a week (your heaviest training days) at maintenance${maint ? ` (about ${maint.toLocaleString("en-US")} kcal)` : ""}, with the extra calories from carbs. Protein stays the same. It helps energy, training and hunger without slowing the cut much.`;

  return (
    <Card className={advice.verdict === "break" ? "border-warning/50" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BedDouble className="h-4 w-4 text-primary" />
          Diet break timing
        </CardTitle>
        <CardDescription>From weeks in a deficit, the rate slowing, hunger, energy and sleep in check-ins, and slipping lifts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-semibold">{advice.title}</p>
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {advice.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {advice.verdict === "break" || advice.verdict === "refeed" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Send1 companyId={companyId} memberId={summary.data.userId} text={message} label={`Send plan to ${first}`} />
            {canSet ? (
              <Button size="sm" variant="outline" onClick={() => void setMaintenance().catch(() => setSet("Couldn't set it. Try again."))}>
                Set maintenance macros for 2 weeks
              </Button>
            ) : null}
          </div>
        ) : null}
        {set ? <p className="text-[12px] text-muted-foreground">{set}</p> : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- 10. what moved the needle -------------------------------- */

export function NeedleCard({ effects, loading, unit }: { effects: ChangeEffect[]; loading: boolean; unit: WeightUnit }) {
  const style: Record<ChangeEffect["verdict"], string> = {
    helped: "text-success",
    hurt: "text-destructive",
    "no-change": "text-muted-foreground",
    "too-soon": "text-muted-foreground",
    "no-data": "text-muted-foreground",
  };
  void unit;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          What moved the needle
        </CardTitle>
        <CardDescription>
          Each change you made, with their weekly rate and logging in the 2 weeks before against the 2 weeks after. Changes within 3 days are judged
          together. A link, not proof. Macro changes count in full from today; before that only the latest shows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
        ) : effects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes in the last 6 months to judge yet (macros, programs, program edits or focus items).</p>
        ) : (
          effects.map((e) => (
            <div key={e.date + e.changes[0]!.title} className="rounded-2xl border border-border p-3 text-sm">
              <p className="text-[12px] text-muted-foreground">{formatShort(e.date)}</p>
              {e.changes.map((c) => (
                <p key={c.title} className="font-semibold">
                  {c.title}
                </p>
              ))}
              <p className={cn("mt-0.5 text-[13px]", style[e.verdict])}>{e.text}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function useNeedle(companyId: string, summary: MemberSummary, input: InsightsInput | null, today: string, unit: WeightUnit) {
  const [changes, setChanges] = React.useState<CoachChange[] | null>(null);
  React.useEffect(() => {
    let live = true;
    call<{ changes: CoachChange[] }>(`/api/coach/member-changes?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(summary.data.userId)}`)
      .then((r) => live && setChanges(r.changes))
      .catch(() => live && setChanges([]));
    return () => {
      live = false;
    };
  }, [companyId, summary.data.userId]);
  const effects = React.useMemo(() => {
    if (!changes || !input) return [];
    const logDates = new Set<string>([
      ...input.weighIns.map((w) => w.date),
      ...input.habitLogs.filter((l) => Object.keys(l.entries).length > 0).map((l) => l.date),
      ...input.food.filter((f) => f.kcal > 0).map((f) => f.date),
      ...input.workouts.filter((w) => w.finishedAt !== null).map((w) => w.date),
    ]);
    const plan = summary.state;
    const gaining = (summary.progress?.plannedRate ?? 1) < 0 || (plan.fatLoss.goalType === "weight" && summary.latestWeightLb !== null && plan.fatLoss.targetWeight > summary.latestWeightLb);
    return changeEffects({ changes, weighIns: input.weighIns, logDates, today, direction: gaining ? 1 : -1, unit });
  }, [changes, input, summary, today, unit]);
  return { effects, loading: changes === null };
}

/* -------------------------------- 8. client file -------------------------------- */

/**
 * One page with everything about a member, to print or save as a PDF:
 * renewals, handovers to another coach, or a sit-down review.
 */
export function ClientFile({
  summary,
  input,
  companyId,
  unit,
  today,
  effects,
  onClose,
}: {
  summary: MemberSummary;
  input: InsightsInput;
  companyId: string;
  unit: WeightUnit;
  today: string;
  effects: ChangeEffect[];
  onClose: () => void;
}) {
  const [note, setNote] = React.useState<string | null>(null);
  React.useEffect(() => {
    call<{ note: string }>(`/api/coach/notes?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(summary.data.userId)}`)
      .then((r) => setNote(r.note))
      .catch(() => setNote(""));
  }, [companyId, summary.data.userId]);
  const d = summary.data;
  const plan = summary.state;
  const w = (lb: number) => `${r1(fromLb(lb, unit))} ${unit}`;
  const ws = [...d.weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const first = ws[0] ?? null;
  const p = summary.progress;
  // The plan's measured rate, else six weeks of weigh-ins (as the forecast does).
  const sixWeeks = weightChangeOver(d.weighIns, today);
  const rate = p?.observedRate ?? (sixWeeks === null ? null : -sixWeeks / 6);
  const trendNow = p?.trendWeight ?? summary.latestWeightLb;
  const goalLb = plan.fatLoss.goalType === "weight" ? plan.fatLoss.targetWeight : null;
  const projected = forecast({ today, trendLb: trendNow, rateLb: rate, goalLb, kcalDelta: 0, stepsDelta: 0 }).date;
  const lifts = strengthTrends(input.workouts, today)
    .filter((t) => t.status !== "new" && !t.bodyweight)
    .sort((a, b) => (b.allTimePct ?? 0) - (a.allTimePct ?? 0))
    .slice(0, 8);
  const ms = [...d.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const waistFirst = ms.find((m) => m.waist !== null);
  const waistLast = [...ms].reverse().find((m) => m.waist !== null);
  const muscle = muscleCheck(input);
  const works = patterns(input).insights.slice(0, 4);
  const latestC = [...input.checkins].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  const photos = d.photos ? [...d.photos].filter((x) => x.pose === "front").sort((a, b) => a.date.localeCompare(b.date)) : [];
  const photo = (id: string) => `/api/coach/photo?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(d.userId)}&id=${encodeURIComponent(id)}`;
  const len = (inches: number) => (unit === "kg" ? `${r1(inches * 2.54)} cm` : `${r1(inches)} in`);

  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 border-b border-neutral-200 py-1 text-[13px]">
      <span className="text-neutral-500">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a6b12]">{children}</h3>;

  return (
    <div role="dialog" aria-label={`Client file: ${summary.displayName}`} className="client-file-overlay fixed inset-0 z-[70] overflow-y-auto bg-black/70 p-3 sm:p-6">
      <style>{`@media print { body * { visibility: hidden !important; } .client-file-sheet, .client-file-sheet * { visibility: visible !important; } .client-file-sheet { position: absolute; inset: 0; margin: 0 !important; box-shadow: none !important; max-width: none !important; } .client-file-tools { display: none !important; } }`}</style>
      <div className="client-file-tools mx-auto mb-3 flex max-w-3xl flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          Print or save as PDF
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-white hover:bg-white/10" onClick={onClose}>
          <X />
          Close
        </Button>
      </div>
      <article className="client-file-sheet mx-auto max-w-3xl rounded-lg bg-white p-6 text-neutral-900 shadow-2xl sm:p-10">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#c9952f] pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a6b12]">Client file</p>
            <h2 className="text-2xl font-extrabold">{summary.displayName}</h2>
            <p className="text-[12px] text-neutral-500">
              {[d.username ? `@${d.username}` : null, d.joinedAt ? `joined ${formatShort(d.joinedAt.slice(0, 10))}` : null, d.sharing.since ? `sharing since ${formatShort(d.sharing.since.slice(0, 10))}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <p className="text-[12px] text-neutral-500">Prepared {formatShort(today)}</p>
        </header>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <section>
            <H>Goal and progress</H>
            <Row k="Goal" v={plan.fatLoss.goalType === "weight" ? w(plan.fatLoss.targetWeight) : `${plan.fatLoss.targetBodyFat}% body fat`} />
            <Row k="Start" v={first ? `${w(first.weightLb)} (${formatShort(first.date)})` : "—"} />
            <Row k="Now (trend)" v={p?.trendWeight != null ? w(p.trendWeight) : summary.latestWeightLb !== null ? w(summary.latestWeightLb) : "—"} />
            <Row k="Rate" v={rate !== null ? `${rate >= 0 ? "−" : "+"}${w(Math.abs(rate))}/wk${p?.plannedRate != null ? ` (plan ${w(Math.abs(p.plannedRate))})` : ""}` : "—"} />
            <Row k="Projected goal date" v={projected ? formatShort(projected) : "—"} />
            <Row k="Maintenance (measured)" v={p?.estimatedMaintenance ? `${Math.round(p.estimatedMaintenance).toLocaleString("en-US")} kcal` : "—"} />
            <Row k="Waist" v={waistFirst && waistLast && waistFirst !== waistLast ? `${len(waistFirst.waist!)} → ${len(waistLast.waist!)}` : waistLast ? len(waistLast.waist!) : "—"} />
          </section>
          <section>
            <H>Adherence and engagement</H>
            <Row k="Health score" v={summary.health ? `${summary.health.score}/100` : "Paused"} />
            <Row k="Habit score this week" v={summary.week.percent !== null ? `${summary.week.percent}%` : "—"} />
            <Row k="Food logged (7 days)" v={summary.food7 ? `${summary.food7.days}/7 · ${Math.round(summary.food7.kcal).toLocaleString("en-US")} kcal · ${Math.round(summary.food7.protein)} g protein` : "—"} />
            <Row k="Workouts (7 days)" v={summary.workouts7} />
            <Row k="Check-ins" v={`${input.checkins.length} sent`} />
            <Row k="Drop-off risk" v={`${summary.risk.level} (${summary.risk.score}/100)`} />
            <Row k="Flags" v={summary.flags.length ? summary.flags.map((f) => FLAG_LABELS[f]).join(", ") : "None"} />
          </section>
        </div>

        <H>Strength</H>
        <p className="text-[13px]">{muscle.text}</p>
        {lifts.length ? (
          <table className="mt-1 w-full text-[13px]">
            <tbody>
              {lifts.map((t) => (
                <tr key={t.exerciseId} className="border-b border-neutral-200">
                  <td className="py-1">{t.name}</td>
                  <td className="py-1 text-right">{w(t.current)} est. max</td>
                  <td className={cn("py-1 text-right", (t.allTimePct ?? 0) >= 0 ? "text-emerald-700" : "text-red-700")}>
                    {t.allTimePct === null ? "—" : `${t.allTimePct >= 0 ? "+" : "−"}${r1(Math.abs(t.allTimePct))}% since ${formatShort(t.firstDate)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {works.length ? (
          <>
            <H>What works for them</H>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              {works.map((x) => (
                <li key={x.id}>
                  <span className="font-semibold">{x.title}:</span> {x.detail}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {effects.some((e) => e.verdict === "helped" || e.verdict === "hurt") ? (
          <>
            <H>What moved the needle</H>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              {effects
                .filter((e) => e.verdict === "helped" || e.verdict === "hurt")
                .slice(0, 5)
                .map((e) => (
                  <li key={e.date}>
                    {formatShort(e.date)}: {e.changes.map((c) => c.title).join(" + ")}. <span className={e.verdict === "helped" ? "text-emerald-700" : "text-red-700"}>{e.text}</span>
                  </li>
                ))}
            </ul>
          </>
        ) : null}

        {latestC ? (
          <>
            <H>Latest check-in ({formatShort(latestC.weekStart)})</H>
            <p className="text-[13px]">
              Ratings: {Object.entries(latestC.answers.ratings).map(([k, v]) => `${k} ${v}/5`).join(" · ")}
            </p>
            {latestC.answers.wins ? <p className="text-[13px]"><span className="font-semibold">Wins:</span> {latestC.answers.wins}</p> : null}
            {latestC.answers.struggles ? <p className="text-[13px]"><span className="font-semibold">Struggles:</span> {latestC.answers.struggles}</p> : null}
          </>
        ) : null}

        {photos.length >= 2 ? (
          <>
            <H>Photos</H>
            <div className="grid max-w-md grid-cols-2 gap-2">
              <figure>
                <PhotoImage src={photo(photos[0]!.id)} alt="First front photo" className="aspect-[3/4] w-full" />
                <figcaption className="text-[11px] text-neutral-500">{formatShort(photos[0]!.date)}</figcaption>
              </figure>
              <figure>
                <PhotoImage src={photo(photos.at(-1)!.id)} alt="Latest front photo" className="aspect-[3/4] w-full" />
                <figcaption className="text-[11px] text-neutral-500">{formatShort(photos.at(-1)!.date)}</figcaption>
              </figure>
            </div>
          </>
        ) : null}

        <H>Coach notes</H>
        <p className="whitespace-pre-wrap text-[13px]">{note === null ? "Loading…" : note.trim() || "No notes."}</p>
        <p className="mt-6 text-[10px] text-neutral-400">Lean Stature System · private: for the coach only.</p>
      </article>
    </div>
  );
}

export function ClientFileButton({ onOpen, disabled }: { onOpen: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="outline" onClick={onOpen} disabled={disabled}>
      <FileText />
      Client file
    </Button>
  );
}
