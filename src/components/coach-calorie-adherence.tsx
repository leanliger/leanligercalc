"use client";

import * as React from "react";
import { Copy, Eye, MessageCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/coach-today";
import type { MemberSummary } from "@/lib/coach";
import { ADHERENCE_DAYS, VERDICT_LABEL, calorieAdherence, memberTargetFinder, type AdherenceVerdict, type CalorieAdherence } from "@/lib/nutrition-report";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard → Calorie adherence (src/lib/nutrition-report.ts): every
 * member sharing their progress against their calorie targets over the last
 * two weeks, off target first, with what's behind it and a message to send.
 */

const ORDER: Record<AdherenceVerdict, number> = { under: 0, over: 1, swinging: 2, "not-logging": 3, "on-track": 4 };
const CHIP: Record<AdherenceVerdict, string> = {
  under: "bg-warning/15 text-warning",
  over: "bg-destructive/15 text-destructive",
  swinging: "bg-warning/15 text-warning",
  "not-logging": "bg-muted text-muted-foreground",
  "on-track": "bg-success/15 text-success",
};

type Filter = "off" | "all" | AdherenceVerdict;

export interface AdherenceRow {
  m: MemberSummary;
  a: CalorieAdherence;
}

/** Everyone with targets, off target first (biggest gap at the top), and how many have none. */
export function adherenceRows(summaries: readonly MemberSummary[], today: string): { rows: AdherenceRow[]; noTargets: number } {
  const rows: AdherenceRow[] = [];
  let noTargets = 0;
  for (const m of summaries) {
    const targetFor = memberTargetFinder(m, m.data.coachMacros ?? null, today);
    if (!targetFor) {
      noTargets++;
      continue;
    }
    rows.push({ m, a: calorieAdherence(m.data.foodDays, targetFor, today, m.displayName.split(" ")[0] || m.displayName) });
  }
  rows.sort((x, y) => ORDER[x.a.verdict] - ORDER[y.a.verdict] || Math.abs(y.a.avgDiffShare ?? 0) - Math.abs(x.a.avgDiffShare ?? 0));
  return { rows, noTargets };
}

export function CoachCalorieAdherence({
  rows,
  noTargets,
  onMessage,
  onOpen,
}: {
  rows: AdherenceRow[];
  noTargets: number;
  onMessage: (memberId: string) => void;
  /** Open their Nutrition tab. */
  onOpen: (memberId: string) => void;
}) {
  const [filter, setFilter] = React.useState<Filter>("off");
  const off = rows.filter((r) => r.a.verdict !== "on-track");
  const shown = filter === "all" ? rows : filter === "off" ? off : rows.filter((r) => r.a.verdict === filter);
  const count = (v: AdherenceVerdict) => rows.filter((r) => r.a.verdict === v).length;
  const filters: { value: Filter; label: string; n: number }[] = [
    { value: "off", label: "Off target", n: off.length },
    { value: "under", label: VERDICT_LABEL.under, n: count("under") },
    { value: "over", label: VERDICT_LABEL.over, n: count("over") },
    { value: "swinging", label: VERDICT_LABEL.swinging, n: count("swinging") },
    { value: "not-logging", label: VERDICT_LABEL["not-logging"], n: count("not-logging") },
    { value: "on-track", label: VERDICT_LABEL["on-track"], n: count("on-track") },
    { value: "all", label: "All", n: rows.length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Calorie adherence</h2>
        <p className="text-sm text-muted-foreground">
          The last {ADHERENCE_DAYS} days of food against each member&apos;s calorie target, with the pattern behind it: under or over, weekends, a meal, or not
          logging. Within 10% of the day&apos;s target counts as on target.
        </p>
      </div>

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
            )}
          >
            {f.label} <span className="tabular opacity-80">{f.n}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            {filter === "off" ? "Off target" : filters.find((f) => f.value === filter)!.label}
          </CardTitle>
          <CardDescription>
            Members sharing their progress with a plan or macros you set.
            {noTargets ? ` ${noTargets} without targets yet aren't shown.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{filter === "off" ? "Everyone with targets is on them. Nice." : "Nobody here."}</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((r) => (
                <AdherenceItem key={r.m.data.userId} row={r} onMessage={onMessage} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdherenceItem({ row: { m, a }, onMessage, onOpen }: { row: AdherenceRow; onMessage: (id: string) => void; onOpen: (id: string) => void }) {
  const [copied, setCopied] = React.useState(false);
  const [showMsg, setShowMsg] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowMsg(true);
    }
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-8 w-8" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {m.displayName}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", CHIP[a.verdict])}>{VERDICT_LABEL[a.verdict]}</span>
          </p>
          <p className="tabular text-[12px] text-muted-foreground">
            {a.full} full day{a.full === 1 ? "" : "s"} logged of {ADHERENCE_DAYS}
            {a.avgDiff !== null && a.verdict !== "not-logging"
              ? ` · average ${a.avgDiff > 0 ? "+" : "−"}${Math.abs(a.avgDiff).toLocaleString()} kcal a day (${a.avgDiffShare! > 0 ? "+" : "−"}${Math.round(Math.abs(a.avgDiffShare!) * 100)}%)`
              : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onOpen(m.data.userId)}>
          <Eye />
          Nutrition
        </Button>
        <Button size="sm" variant={a.verdict === "on-track" ? "outline" : "default"} onClick={() => onMessage(m.data.userId)}>
          <MessageCircle />
          Message
        </Button>
      </div>
      {a.reasons.length ? (
        <ul className="space-y-0.5 pl-11 text-[13px]">
          {a.reasons.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ml-11 rounded-md bg-muted/40 px-3 py-2 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested message</span>
          <button type="button" onClick={() => void copy()} className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => setShowMsg((v) => !v)} className="text-[12px] text-muted-foreground hover:text-foreground" aria-expanded={showMsg}>
            {showMsg ? "Hide" : "Show"}
          </button>
        </div>
        {showMsg ? <p className="mt-1 select-text">{a.message}</p> : null}
      </div>
    </li>
  );
}
