"use client";

import * as React from "react";
import { Activity, Camera, ClipboardCheck, Dumbbell, Ruler, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatMedium, formatShort } from "@/lib/dates";
import { fromInches, lengthUnit } from "@/lib/measurements";
import type { ProgressReport, ReportPhoto } from "@/lib/progress-report";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * One page of before and after (src/lib/progress-report.ts), laid out to look
 * good in a screenshot: weight, photos, measurements, strength, consistency.
 * Shown to coaches on a member's page and to members on Progress → Check-in.
 */

const POSE: Record<string, string> = { front: "Front", side: "Side", back: "Back" };

export function ProgressReportView({
  report: r,
  name,
  unit,
  photoSrc,
}: {
  report: ProgressReport;
  name: string;
  unit: WeightUnit;
  photoSrc: (p: ReportPhoto) => string;
}) {
  const w = (lb: number) => Math.round(fromLb(lb, unit) * 10) / 10;
  const signed = (v: number, suffix: string) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}${suffix}`;
  const lu = lengthUnit(unit);
  const len = (inches: number) => Math.round(fromInches(inches, unit) * 10) / 10;
  const empty = !r.weight && r.measurements.length === 0 && r.lifts.length === 0 && !r.photos;

  return (
    <Card className="overflow-hidden">
      <div className="bg-primary/10 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Progress report</p>
        <h2 className="text-xl font-semibold">{name}</h2>
        <p className="tabular text-xs text-muted-foreground">
          {r.from && r.to ? `${formatMedium(r.from)} – ${formatMedium(r.to)} · ${r.weeks} week${r.weeks === 1 ? "" : "s"}` : "Nothing logged yet"}
        </p>
      </div>
      <CardContent className="space-y-5 p-5">
        {empty ? (
          <p className="text-sm text-muted-foreground">
            The report fills in as weigh-ins, measurements, workouts and photos are logged. Two of each is enough to show a change.
          </p>
        ) : null}

        {/* ---------------------------- weight ---------------------------- */}
        {r.weight ? (
          <section className="space-y-2">
            <Heading icon={<Scale className="h-4 w-4" />}>Body weight</Heading>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <Big label={`Start · ${formatShort(r.weight.startDate)}`} value={`${w(r.weight.startLb)} ${unit}`} />
              <Big label={`Now · ${formatShort(r.weight.latestDate)}`} value={`${w(r.weight.latestLb)} ${unit}`} />
              <div>
                <p className="text-[11px] text-muted-foreground">Change</p>
                <p
                  className={cn(
                    "tabular flex items-center gap-1 text-2xl font-bold",
                    r.weight.changeLb < 0 ? "text-success" : r.weight.changeLb > 0 ? "text-warning" : "",
                  )}
                >
                  {r.weight.changeLb < 0 ? <TrendingDown className="h-5 w-5" /> : r.weight.changeLb > 0 ? <TrendingUp className="h-5 w-5" /> : null}
                  {signed(w(r.weight.changeLb), ` ${unit}`)}
                </p>
              </div>
            </div>
            {r.weight.weekly.length > 1 ? (
              <div className="h-20 w-full" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={r.weight.weekly.map((p) => ({ ...p, v: w(p.lb) }))} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                    <Line dataKey="v" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <p className="tabular text-[11px] text-muted-foreground">
              Lowest {w(r.weight.lowestLb)} {unit}
              {r.goalLb ? ` · goal ${w(r.goalLb)} ${unit}` : ""} · {r.weighIns} weigh-ins
            </p>
          </section>
        ) : null}

        {/* ---------------------------- photos ---------------------------- */}
        {r.photos ? (
          <section className="space-y-2">
            <Heading icon={<Camera className="h-4 w-4" />}>Before and after</Heading>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Before", r.photos.before],
                ["After", r.photos.after],
              ].map(([label, p]) => {
                const photo = p as ReportPhoto;
                return (
                  <figure key={label as string} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoSrc(photo)}
                      alt={`${label}: ${POSE[photo.pose] ?? photo.pose}, ${formatShort(photo.date)}`}
                      className="aspect-[3/4] w-full rounded-md border border-border object-cover"
                    />
                    <figcaption className="text-center text-[11px] text-muted-foreground">
                      {label as string} · {formatShort(photo.date)}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ------------------------- measurements ------------------------- */}
        {r.measurements.length > 0 ? (
          <section className="space-y-2">
            <Heading icon={<Ruler className="h-4 w-4" />}>Measurements</Heading>
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="pb-1 text-left font-medium" />
                  <th className="pb-1 text-right font-medium">Start</th>
                  <th className="pb-1 text-right font-medium">Now</th>
                  <th className="pb-1 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {r.measurements.map((m) => (
                  <tr key={m.site} className="border-t border-border">
                    <td className="py-1">{m.label}</td>
                    <td className="py-1 text-right">{len(m.firstIn)}</td>
                    <td className="py-1 text-right">{len(m.latestIn)}</td>
                    <td className={cn("py-1 text-right font-semibold", m.changeIn < 0 ? "text-success" : "")}>{signed(len(m.changeIn), ` ${lu}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* ---------------------------- strength ---------------------------- */}
        {r.lifts.length > 0 ? (
          <section className="space-y-2">
            <Heading icon={<Dumbbell className="h-4 w-4" />}>Strength (estimated 1-rep max)</Heading>
            <ul className="space-y-1.5">
              {r.lifts.map((l) => {
                const pct = l.firstLb > 0 ? Math.round(((l.bestLb - l.firstLb) / l.firstLb) * 100) : 0;
                return (
                  <li key={l.exerciseId} className="tabular flex items-baseline gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="text-muted-foreground">
                      {w(l.firstLb)} → <span className="font-semibold text-foreground">{w(l.bestLb)}</span> {unit}
                    </span>
                    <span className={cn("w-12 text-right text-xs font-semibold", pct > 0 ? "text-success" : "text-muted-foreground")}>
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* --------------------------- consistency --------------------------- */}
        {!empty ? (
          <section className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <Tally icon={<Activity className="h-3.5 w-3.5" />} value={r.weeks} label={r.weeks === 1 ? "week" : "weeks"} />
            <Tally icon={<Dumbbell className="h-3.5 w-3.5" />} value={r.workouts} label={r.workouts === 1 ? "workout" : "workouts"} />
            <Tally icon={<ClipboardCheck className="h-3.5 w-3.5" />} value={r.checkins} label={r.checkins === 1 ? "check-in" : "check-ins"} />
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Heading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {children}
    </h3>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Tally({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-md bg-muted/40 py-2">
      <p className="tabular flex items-center justify-center gap-1 text-lg font-semibold">
        <span className="text-primary">{icon}</span>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Loads a report and shows it, for either side. */
export function ProgressReportLoader({
  url,
  name,
  unit,
  photoSrc,
  actions,
}: {
  url: string;
  name: string;
  unit: WeightUnit;
  photoSrc: (p: ReportPhoto) => string;
  actions?: React.ReactNode;
}) {
  const [report, setReport] = React.useState<ProgressReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { report?: ProgressReport; error?: string } | null;
        if (!res.ok || !body?.report) throw new Error(body?.error ?? "Couldn't load the report.");
        if (live) setReport(body.report);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load the report."));
    return () => {
      live = false;
    };
  }, [url]);
  if (error) return <p className="rounded-md border border-border p-4 text-sm text-destructive">{error}</p>;
  if (!report) return <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Building the report…</p>;
  return (
    <div className="space-y-3">
      <ProgressReportView report={report} name={name} unit={unit} photoSrc={photoSrc} />
      {actions}
    </div>
  );
}
