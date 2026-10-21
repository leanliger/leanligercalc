"use client";

import * as React from "react";
import { BellRing, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatShort } from "@/lib/dates";
import { NUDGE_DAYS_MAX, NUDGE_DAYS_MIN, NUDGE_INFO, NUDGE_MESSAGE_MAX, type NudgeKind, type NudgeRule } from "@/lib/nudges";
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

interface NudgesData {
  rules: NudgeRule[];
  recent: { userId: string; kind: NudgeKind; sentAt: string }[];
}

/**
 * Coach dashboard → Library → Automatic nudges: rules like "no food logged
 * for 3 days → send a message", each with a switch, the number of days and
 * the message members get (src/lib/nudges.ts, worker/nudges.ts).
 */
export function CoachNudges({ companyId, names }: { companyId: string; names: ReadonlyMap<string, string> }) {
  const [data, setData] = React.useState<NudgesData | null>(null);
  const [rules, setRules] = React.useState<NudgeRule[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    let live = true;
    call<NudgesData>(`/api/coach/nudges?company=${encodeURIComponent(companyId)}`)
      .then((r) => {
        if (!live) return;
        setData(r);
        setRules(r.rules);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load your nudges."));
    return () => {
      live = false;
    };
  }, [companyId]);

  const dirty = data !== null && JSON.stringify(rules) !== JSON.stringify(data.rules);
  const update = (kind: NudgeKind, patch: Partial<NudgeRule>) => {
    setMessage(null);
    setRules((prev) => prev.map((r) => (r.kind === kind ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const r = await call<NudgesData>("/api/coach/nudges", { method: "PUT", body: JSON.stringify({ company: companyId, rules }) });
      setData(r);
      setRules(r.rules);
      const on = r.rules.filter((x) => x.enabled).length;
      setMessage({ ok: true, text: on === 0 ? "Saved. All nudges are off." : `Saved. ${on} ${on === 1 ? "nudge is" : "nudges are"} on; they're checked once a day.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          Automatic nudges
        </CardTitle>
        <CardDescription>
          Switch a rule on and members who go quiet get your message as a Whop notification. Checked once a day, early afternoon US
          Eastern time. Only members sharing their progress with you, never on a day they paused, at most one nudge a day, and one per
          gap (someone who last logged food on Tuesday hears about it once, not every day).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !data ? (
          <div className="h-40 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
        ) : (
          <>
            <ul className="space-y-3">
              {rules.map((r) => {
                const info = NUDGE_INFO[r.kind];
                const id = `nudge-${r.kind}`;
                return (
                  <li key={r.kind} className={cn("space-y-2 rounded-md border p-3", r.enabled ? "border-primary/40" : "border-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`${id}-on`} className="text-sm font-semibold">
                        {info.label}
                      </label>
                      <Switch id={`${id}-on`} checked={r.enabled} onCheckedChange={(v) => update(r.kind, { enabled: v })} />
                    </div>
                    <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {info.what}
                      <Input
                        type="number"
                        min={NUDGE_DAYS_MIN}
                        max={NUDGE_DAYS_MAX}
                        value={r.days}
                        onChange={(e) =>
                          update(r.kind, { days: Math.max(NUDGE_DAYS_MIN, Math.min(NUDGE_DAYS_MAX, Math.round(Number(e.target.value) || NUDGE_DAYS_MIN))) })
                        }
                        className="h-8 w-16"
                        aria-label={`${info.label}: days`}
                      />
                      days
                    </label>
                    <div className="space-y-1">
                      <label htmlFor={`${id}-msg`} className="block text-xs">
                        Message
                      </label>
                      <textarea
                        id={`${id}-msg`}
                        value={r.message}
                        onChange={(e) => update(r.kind, { message: e.target.value })}
                        maxLength={NUDGE_MESSAGE_MAX}
                        rows={2}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <p className="tabular text-right text-[11px] text-muted-foreground">
                        {r.message.length}/{NUDGE_MESSAGE_MAX}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                <Save />
                {saving ? "Saving…" : "Save nudges"}
              </Button>
              {message ? (
                <p role={message.ok ? "status" : "alert"} className={cn("text-xs", message.ok ? "text-success" : "text-destructive")}>
                  {message.text}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold">Sent lately</p>
              {data.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No nudges sent yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.recent.map((n, i) => (
                    <li key={`${n.userId}-${n.kind}-${i}`} className="flex flex-wrap justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {names.get(n.userId) ?? "A member"} · <span className="text-muted-foreground">{NUDGE_INFO[n.kind].label}</span>
                      </span>
                      <span className="tabular text-xs text-muted-foreground">{formatShort(n.sentAt.slice(0, 10))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
