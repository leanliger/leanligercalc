"use client";

import * as React from "react";
import { Info, Ruler, Save, Trash2 } from "lucide-react";
import {
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/confirm-button";
import { trendSeries } from "@/lib/adaptive";
import { formatShort } from "@/lib/dates";
import {
  SITES,
  SITE_INFO,
  fromInches,
  lengthUnit,
  siteChange,
  toInches,
  type Measurement,
  type Site,
} from "@/lib/measurements";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const r1 = (n: number) => Math.round(n * 10) / 10;

interface MeasurementsCardProps {
  measurements: Measurement[];
  weighIns: WeighIn[];
  unit: WeightUnit;
  today: string;
  /** Read-only (the coach dashboard): no form. */
  readOnly?: boolean;
  onSave?: (m: Measurement) => Promise<void>;
  onDelete?: (date: string) => Promise<void>;
}

export function MeasurementsCard({ measurements, weighIns, unit, today, readOnly, onSave, onDelete }: MeasurementsCardProps) {
  const lu = lengthUnit(unit);
  const sitesWithData = SITES.filter((s) => measurements.some((m) => m[s] !== null));
  const [site, setSite] = React.useState<Site>(sitesWithData[0] ?? "waist");
  const shownSite = sitesWithData.includes(site) ? site : (sitesWithData[0] ?? "waist");

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          Measurements
        </CardTitle>
        <CardDescription>
          {readOnly
            ? "Weekly tape measurements, next to their weight trend."
            : "Measure once a week, same day and time. The scale can stall while your waist keeps coming in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sitesWithData.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SITES.map((s) => {
              const c = siteChange(measurements, s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => c && setSite(s)}
                  disabled={!c}
                  aria-pressed={shownSite === s}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    shownSite === s && c ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="block text-[11px] text-muted-foreground">{SITE_INFO[s].label}</span>
                  <span className="tabular block text-sm font-semibold">
                    {c ? `${r1(fromInches(c.latest, unit))} ${lu}` : "—"}
                  </span>
                  {c && c.change !== 0 ? (
                    <span className="tabular block text-[11px] text-muted-foreground">
                      {c.change > 0 ? "+" : "−"}
                      {r1(Math.abs(fromInches(c.change, unit)))} since {formatShort(c.since)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <MeasurementChart measurements={measurements} weighIns={weighIns} unit={unit} site={shownSite} readOnly={readOnly} />

        {!readOnly && onSave ? (
          <MeasurementForm measurements={measurements} unit={unit} today={today} onSave={onSave} onDelete={onDelete} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- chart --------------------------------- */

interface Point {
  t: number;
  date: string;
  site: number | null;
  weight: number | null;
}

function MeasurementChart({
  measurements,
  weighIns,
  unit,
  site,
  readOnly,
}: {
  measurements: Measurement[];
  weighIns: WeighIn[];
  unit: WeightUnit;
  site: Site;
  readOnly?: boolean;
}) {
  const lu = lengthUnit(unit);
  const points = measurements.filter((m) => m[site] !== null);
  if (points.length < 2) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        {points.length === 0
          ? readOnly
            ? "No measurements logged yet."
            : "Log your first measurements below to start the chart."
          : readOnly
            ? "One measurement so far — the trend appears after the next one."
            : "One more week of measurements and the trend chart appears here."}
      </p>
    );
  }
  const from = points[0]!.date;
  const to = points[points.length - 1]!.date;
  const byDate = new Map<string, Point>();
  const toT = (d: string) => Date.parse(`${d}T00:00:00Z`);
  for (const m of points) byDate.set(m.date, { t: toT(m.date), date: m.date, site: r1(fromInches(m[site]!, unit)), weight: null });
  // The weight trend (not raw weigh-ins) over the same weeks, so daily water swings don't drown the comparison.
  for (const tp of trendSeries(weighIns)) {
    if (tp.date < from || tp.date > to) continue;
    const p = byDate.get(tp.date) ?? { t: toT(tp.date), date: tp.date, site: null, weight: null };
    p.weight = r1(fromLb(tp.trend, unit));
    byDate.set(tp.date, p);
  }
  const data = [...byDate.values()].sort((a, b) => a.t - b.t);
  const siteVals = data.flatMap((p) => (p.site === null ? [] : [p.site]));
  const weightVals = data.flatMap((p) => (p.weight === null ? [] : [p.weight]));
  const domain = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 0.5);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  };

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 4, left: -8 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
            tickFormatter={(t: number) => formatShort(new Date(t).toISOString().slice(0, 10))}
          />
          <YAxis yAxisId="site" domain={domain(siteVals)} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40} />
          {weightVals.length > 0 ? (
            <YAxis
              yAxisId="weight"
              orientation="right"
              domain={domain(weightVals)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={40}
            />
          ) : null}
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                  <p className="font-semibold">{formatShort(p.date)}</p>
                  <dl className="tabular mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                    {p.site !== null ? (
                      <>
                        <dt className="text-muted-foreground">{SITE_INFO[site].label}</dt>
                        <dd className="text-right font-medium">{p.site} {lu}</dd>
                      </>
                    ) : null}
                    {p.weight !== null ? (
                      <>
                        <dt className="text-muted-foreground">Weight trend</dt>
                        <dd className="text-right">{p.weight} {unit}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              );
            }}
          />
          <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="site"
            dataKey="site"
            name={`${SITE_INFO[site].label} (${lu}, left)`}
            type="monotone"
            stroke="hsl(var(--macro-carb))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--macro-carb))", stroke: "none" }}
            isAnimationActive={false}
            connectNulls
          />
          {weightVals.length > 0 ? (
            <Line
              yAxisId="weight"
              dataKey="weight"
              name={`Weight trend (${unit}, right)`}
              type="monotone"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------- form ---------------------------------- */

function MeasurementForm({
  measurements,
  unit,
  today,
  onSave,
  onDelete,
}: {
  measurements: Measurement[];
  unit: WeightUnit;
  today: string;
  onSave: (m: Measurement) => Promise<void>;
  onDelete?: (date: string) => Promise<void>;
}) {
  const lu = lengthUnit(unit);
  const [date, setDate] = React.useState(today);
  const existing = measurements.find((m) => m.date === date) ?? null;
  const blank = Object.fromEntries(SITES.map((s) => [s, ""])) as Record<Site, string>;
  const [values, setValues] = React.useState<Record<Site, string>>(blank);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dateId = React.useId();

  // Picking a day that already has measurements loads them for editing.
  React.useEffect(() => {
    setValues(
      Object.fromEntries(
        SITES.map((s) => [s, existing && existing[s] !== null ? String(r1(fromInches(existing[s]!, unit))) : ""]),
      ) as Record<Site, string>,
    );
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved values, not the object
  }, [date, unit, existing?.waist, existing?.hips, existing?.chest, existing?.arms, existing?.thighs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m: Measurement = { date, waist: null, hips: null, chest: null, arms: null, thighs: null };
    for (const s of SITES) {
      const t = values[s].trim();
      if (!t) continue;
      const n = Number(t);
      if (!Number.isFinite(n) || n <= 0) {
        setMessage({ kind: "error", text: `${SITE_INFO[s].label} must be a number.` });
        return;
      }
      m[s] = Math.round(toInches(n, unit) * 100) / 100;
    }
    if (SITES.every((s) => m[s] === null)) {
      setMessage({ kind: "error", text: "Enter at least one measurement." });
      return;
    }
    setBusy(true);
    try {
      await onSave(m);
      setMessage({ kind: "ok", text: `${existing ? "Updated" : "Saved"} ${formatShort(date)}.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor={dateId} className="text-xs">
            Date
          </Label>
          <Input id={dateId} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-[10.5rem]" />
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="flex cursor-pointer items-center gap-1 hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
            How to measure
          </summary>
          <ul className="mt-2 space-y-1">
            {SITES.map((s) => (
              <li key={s}>
                <span className="font-medium text-foreground">{SITE_INFO[s].label}:</span> {SITE_INFO[s].how}
              </li>
            ))}
            <li>Same tape, same spot, snug but not tight. Morning, before eating.</li>
          </ul>
        </details>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SITES.map((s) => (
          <MeasureInput key={s} site={s} unit={lu} value={values[s]} onChange={(v) => setValues((prev) => ({ ...prev, [s]: v }))} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          <Save />
          {existing ? "Update" : "Save"} measurements
        </Button>
        {existing && onDelete ? (
          <ConfirmButton
            size="sm"
            icon={<Trash2 />}
            label="Delete"
            confirmLabel="Delete this day"
            onConfirm={async () => {
              await onDelete(date);
              setMessage({ kind: "ok", text: `Deleted ${formatShort(date)}.` });
            }}
          />
        ) : null}
        {message ? (
          <span role={message.kind === "error" ? "alert" : "status"} className={cn("text-xs", message.kind === "error" ? "text-destructive" : "text-success")}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function MeasureInput({ site, unit, value, onChange }: { site: Site; unit: string; value: string; onChange: (v: string) => void }) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs" title={SITE_INFO[site].how}>
        {SITE_INFO[site].label}
      </Label>
      <div className="relative">
        <Input id={id} type="number" inputMode="decimal" min={0} step="0.1" value={value} placeholder="—" onChange={(e) => onChange(e.target.value)} className="h-9 pr-9" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
