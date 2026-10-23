"use client";

import * as React from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShort } from "@/lib/dates";
import type { ProgramResult } from "@/lib/program-results";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

type Row = ProgramResult & { added: number };

const pct = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);
const perWeek = (lb: number | null, unit: WeightUnit) =>
  lb === null ? "—" : `${lb > 0 ? "+" : lb < 0 ? "−" : ""}${Math.abs(Math.round(fromLb(lb, unit) * 10) / 10)} ${unit}/wk`;
const tone = (p: number | null, goodUp: boolean) =>
  p === null || Math.abs(p) < 0.05 ? "text-muted-foreground" : (p > 0) === goodUp ? "text-success" : "text-destructive";

/**
 * Coach dashboard → Library → Program results: each program you sent, with
 * its members' average strength change on its lifts, weight change a week and
 * workouts finished against its calendar; open one for each member.
 */
export function CoachProgramResults({ companyId, names, unit }: { companyId: string; names: ReadonlyMap<string, string>; unit: WeightUnit }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch(`/api/coach/program-results?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { programs?: Row[]; error?: string } | null;
        if (!res.ok || !body?.programs) throw new Error(body?.error ?? "Couldn't load program results.");
        if (live) setRows(body.programs);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load program results."));
    return () => {
      live = false;
    };
  }, [companyId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Program results
        </CardTitle>
        <CardDescription>
          How members are doing on each program you sent: strength on its lifts (estimated max, first sessions vs latest), weight change a
          week since they added it, and workouts finished against its calendar. Only members sharing their progress are counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : rows === null ? (
          <div className="h-32 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No programs sent in the last year. Send one from Programs &amp; habits.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => {
              const isOpen = open === p.assignmentId;
              return (
                <li key={p.assignmentId} className="rounded-2xl border border-border">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : p.assignmentId)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block truncate font-bold">{p.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        Sent {formatShort(p.sentAt.slice(0, 10))} · {p.added} added it
                        {p.members.length < p.added ? ` · ${p.members.length} sharing` : ""}
                      </span>
                    </span>
                    <span className="grid grid-cols-3 gap-4 text-right">
                      <Stat label="Strength" value={pct(p.avgStrengthPct)} className={tone(p.avgStrengthPct, true)} />
                      <Stat label="Weight" value={perWeek(p.avgWeightPerWeekLb, unit)} className="text-foreground" />
                      <Stat label="Workouts" value={p.adherencePct === null ? "—" : `${Math.round(p.adherencePct)}%`} className={cn(p.adherencePct !== null && p.adherencePct >= 80 && "text-success")} />
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border px-3 pb-3 pt-2">
                      {p.members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {p.added === 0 ? "Nobody has added it yet." : "Nobody who added it shares their progress with you."}
                        </p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                              <th className="py-1 font-medium">Member</th>
                              <th className="py-1 text-right font-medium">Strength</th>
                              <th className="py-1 text-right font-medium">Weight</th>
                              <th className="py-1 text-right font-medium">Workouts</th>
                            </tr>
                          </thead>
                          <tbody className="tabular">
                            {p.members.map((m) => (
                              <tr key={m.userId} className="border-t border-border/60">
                                <td className="py-1.5">
                                  {names.get(m.userId) ?? "A member"}
                                  <span className="block text-[11px] text-muted-foreground">since {formatShort(m.since)}</span>
                                </td>
                                <td className={cn("py-1.5 text-right", tone(m.strengthPct, true))}>{pct(m.strengthPct)}</td>
                                <td className="py-1.5 text-right">{perWeek(m.weightPerWeekLb, unit)}</td>
                                <td className="py-1.5 text-right">{m.planned ? `${Math.min(m.workouts, m.planned)} / ${m.planned}` : m.workouts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="block">
      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("tabular block text-sm font-bold", className)}>{value}</span>
    </span>
  );
}
