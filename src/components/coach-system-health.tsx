"use client";

import * as React from "react";
import { Activity, Bell, Check, Clock, Database, Loader2, Mail, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachMemberData } from "@/lib/coach-api";
import { formatShort } from "@/lib/dates";
import { JOBS, NOTIFY_DAYS, jobStatus, resultText, type JobStatus, type SystemHealth } from "@/lib/system-health";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard → System health (src/lib/system-health.ts, worker/health.ts):
 * the scheduled jobs, this whop's notifications and digests, and what Whop
 * sends about members.
 */

const STATUS: Record<JobStatus, { label: string; chip: string; icon: React.ReactNode }> = {
  ok: { label: "Running", chip: "bg-success/15 text-success", icon: <Check className="h-3 w-3" /> },
  failed: { label: "Failed", chip: "bg-destructive/15 text-destructive", icon: <X className="h-3 w-3" /> },
  late: { label: "Late", chip: "bg-warning/15 text-warning", icon: <Clock className="h-3 w-3" /> },
  never: { label: "No runs yet", chip: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
};

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function CoachSystemHealth({ companyId, members }: { companyId: string; members: readonly CoachMemberData[] }) {
  const [data, setData] = React.useState<SystemHealth | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/coach/health?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } });
      const body = (await res.json().catch(() => null)) as (SystemHealth & { error?: string }) | null;
      if (!res.ok || !body?.jobs) throw new Error(body?.error ?? "Couldn't load system health.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load system health.");
    } finally {
      setBusy(false);
    }
  }, [companyId]);
  React.useEffect(() => {
    void load();
  }, [load]);

  const now = data ? Date.parse(data.generatedAt) : Date.now();
  const runs = new Map((data?.jobs ?? []).map((j) => [j.id, j]));
  const statuses = JOBS.map((j) => ({ job: j, run: runs.get(j.id), status: jobStatus(j, runs.get(j.id), now) }));
  const sent = data?.notifications.days.reduce((n, d) => n + d.sent, 0) ?? 0;
  const failed = data?.notifications.days.reduce((n, d) => n + d.failed, 0) ?? 0;
  const digestFailed = (data?.digests ?? []).filter((d) => d.status.startsWith("failed")).length;

  // What Whop sends about members, from the overview already loaded.
  const total = members.length;
  const withJoin = members.filter((m) => m.joinedAt).length;
  const withOpened = members.filter((m) => m.lastAccessedAt).length;
  const sharing = members.filter((m) => m.sharing.state === "shared").length;

  const problems =
    statuses.filter((s) => s.status === "failed" || s.status === "late").length + (failed > 0 ? 1 : 0) + (digestFailed > 0 ? 1 : 0) + (total > 0 && withJoin === 0 ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-2xl font-bold tracking-tight">System health</h2>
          <p className="text-sm text-muted-foreground">Whether the app&apos;s background jobs are running, notifications are reaching your members, and Whop is sending what the dashboard needs.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Check again
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {data ? (
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium", problems ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5")}>
          {problems ? <TriangleAlert className="h-4 w-4 text-warning" /> : <Check className="h-4 w-4 text-success" />}
          {problems ? `${problems} thing${problems === 1 ? "" : "s"} to look at below.` : "Everything's working."}
          <span className="ml-auto text-[12px] font-normal text-muted-foreground">Checked {ago(data.generatedAt, Date.now())}</span>
        </div>
      ) : !error ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/30" aria-busy="true" />
      ) : null}

      {/* ------------------------------ scheduled jobs ------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Scheduled jobs
          </CardTitle>
          <CardDescription>The app&apos;s background work, for every whop using it. Late means it hasn&apos;t run when it should have.</CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <ul className="divide-y divide-border">
              {statuses.map(({ job, run, status }) => {
                const st = STATUS[status];
                const did = resultText(run?.lastResult ?? null);
                return (
                  <li key={job.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                    <span className={cn("mt-0.5 flex w-24 shrink-0 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", st.chip)}>
                      {st.icon}
                      {st.label}
                    </span>
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-semibold">{job.label}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {job.what} · {job.when}
                      </p>
                      {status === "failed" && run?.lastError ? <p className="mt-0.5 break-words text-[12px] text-destructive">{run.lastError}</p> : null}
                    </div>
                    <div className="tabular text-right text-[12px] text-muted-foreground sm:w-44">
                      {run ? <p>Ran {ago(run.lastRunAt, now)}</p> : <p>Not since this page was added</p>}
                      {did ? <p className="truncate" title={did}>{did}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------ notifications ------------------------------ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>Whop notifications from this whop in the last {NOTIFY_DAYS} days, and whether Whop took them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data ? (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <p className="text-sm">
                    <span className="tabular text-xl font-semibold">{sent}</span> <span className="text-muted-foreground">sent</span>
                  </p>
                  <p className="text-sm">
                    <span className={cn("tabular text-xl font-semibold", failed && "text-destructive")}>{failed}</span> <span className="text-muted-foreground">refused</span>
                  </p>
                </div>
                <DayBars days={data.notifications.days} />
                {data.notifications.failures.length ? (
                  <ul className="space-y-1.5">
                    {data.notifications.failures.map((f, i) => (
                      <li key={i} className="rounded-md bg-destructive/5 px-2.5 py-1.5 text-[12px]">
                        <p className="font-semibold text-destructive">
                          {f.count}× {f.status === 0 ? "No answer from Whop" : `Whop said ${f.status}`}
                          <span className="font-normal text-muted-foreground"> · last {ago(f.lastAt, now)}</span>
                        </p>
                        {f.reason ? <p className="break-words text-muted-foreground">{f.reason}</p> : null}
                        {f.status === 401 || f.status === 403 ? (
                          <p className="text-muted-foreground">Usually the app&apos;s Whop API key is missing the notification permission.</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : sent === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing sent yet. Results show here from the first notification after this page was added.</p>
                ) : (
                  <p className="text-sm text-success">Whop took every one.</p>
                )}
              </>
            ) : (
              <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
            )}
          </CardContent>
        </Card>

        {/* ------------------------------ daily digest ------------------------------ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              Daily digest
            </CardTitle>
            <CardDescription>Each admin&apos;s 8am digest in the last {NOTIFY_DAYS} days, and what happened to its notification.</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              data.digests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No digests in the last {NOTIFY_DAYS} days. Turn it on under Automations.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.digests.map((d, i) => (
                    <li key={i} className="flex items-center gap-3 py-2 text-sm">
                      <span className="tabular w-16 text-muted-foreground">{formatShort(d.date)}</span>
                      <span className="flex-1">{d.mine ? "You" : "Another admin"}</span>
                      <DigestChip status={d.status} />
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------ whop data ------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            What Whop sends
          </CardTitle>
          <CardDescription>About the {total} member{total === 1 ? "" : "s"} on your dashboard. Missing fields turn features off.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            <DataRow label="Join date" n={withJoin} total={total} needs="First 14 days can't find new members without it." />
            <DataRow label="Last opened" n={withOpened} total={total} needs="“Opened N days ago” and quit risk lean on it." />
            <li className="flex items-center gap-3 py-2">
              <span className="flex-1">Sharing their progress with you</span>
              <span className="tabular text-muted-foreground">
                {sharing} of {total}
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function DataRow({ label, n, total, needs }: { label: string; n: number; total: number; needs: string }) {
  const missing = total > 0 && n === 0;
  return (
    <li className="space-y-0.5 py-2">
      <div className="flex items-center gap-3">
        <span className="flex-1">{label}</span>
        <span className={cn("tabular", missing ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {n} of {total}
        </span>
      </div>
      {missing ? <p className="text-[12px] text-destructive">Whop isn&apos;t sending it. {needs}</p> : null}
    </li>
  );
}

function DigestChip({ status }: { status: string }) {
  const failed = status.startsWith("failed");
  const label =
    status === "sent" ? "Sent" : status === "sent-community" ? "Sent (community)" : status === "off" ? "Notifications off" : status === "nothing" ? "Nothing to send" : failed ? "Failed" : status;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        failed ? "bg-destructive/15 text-destructive" : status.startsWith("sent") ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
      )}
      title={failed ? status.replace(/^failed:?\s*/, "") : undefined}
    >
      {label}
    </span>
  );
}

/** One bar a day: sent (green) with refused (red) on top, to the busiest day's scale. */
function DayBars({ days }: { days: SystemHealth["notifications"]["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.sent + d.failed));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={days.map((d) => `${formatShort(d.date)}: ${d.sent} sent, ${d.failed} refused`).join("; ")}>
      {days.map((d) => (
        <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-20 w-full flex-col justify-end overflow-hidden rounded-sm bg-muted/30">
            {d.failed ? <div className="w-full bg-destructive" style={{ height: `${(d.failed / max) * 100}%` }} /> : null}
            {d.sent ? <div className="w-full bg-success" style={{ height: `${(d.sent / max) * 100}%` }} /> : null}
          </div>
          <span className="tabular text-[10px] text-muted-foreground">{formatShort(d.date).replace(/^\w+ /, "")}</span>
        </div>
      ))}
    </div>
  );
}
