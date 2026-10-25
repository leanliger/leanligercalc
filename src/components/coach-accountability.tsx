"use client";

import * as React from "react";
import { Check, Eye, LifeBuoy, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/coach-today";
import {
  ANSWER_LABEL,
  CHECK_EVERY_DAYS,
  CHOICE_LABEL,
  DEFAULT_SETTINGS,
  NO_ANSWER_HOURS,
  QUESTION_MAX,
  SEND_HOURS,
  TRIGGERS,
  needsHelp,
  noAnswer,
  type AccountabilityCheck,
  type AccountabilitySettings,
  type TriggerId,
} from "@/lib/accountability";
import type { MemberSummary } from "@/lib/coach";
import { formatShort } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard → Accountability (src/lib/accountability.ts): who needs
 * you after a check, checks waiting for your approval, the settings (with a
 * preview of who'd get one now), this month's numbers and every recent check.
 */

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

const hourText = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

export function CoachAccountability({
  companyId,
  summaries,
  names,
  onMessage,
}: {
  companyId: string;
  summaries: MemberSummary[];
  names: ReadonlyMap<string, { name: string; avatarUrl: string | null }>;
  /** Open their chat in the Inbox. */
  onMessage: (memberId: string) => void;
}) {
  const [settings, setSettings] = React.useState<AccountabilitySettings | null>(null);
  const [saved, setSaved] = React.useState<AccountabilitySettings | null>(null);
  const [checks, setChecks] = React.useState<AccountabilityCheck[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const q = `company=${encodeURIComponent(companyId)}`;

  const load = React.useCallback(async () => {
    try {
      const r = await call<{ settings: AccountabilitySettings; checks: AccountabilityCheck[] }>(`/api/coach/accountability?${q}`);
      setSettings(r.settings);
      setSaved(r.settings);
      setChecks(r.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load it.");
      setSettings(DEFAULT_SETTINGS);
      setChecks([]);
    }
  }, [q]);
  React.useEffect(() => {
    void load();
  }, [load]);

  const byId = React.useMemo(() => new Map(summaries.map((m) => [m.data.userId, m])), [summaries]);
  const who = (id: string) => names.get(id) ?? { name: "A member", avatarUrl: null };
  const now = Date.now();
  const list = checks ?? [];
  const latest = new Map<string, AccountabilityCheck>();
  for (const c of list) if (!latest.has(c.memberId)) latest.set(c.memberId, c);
  const needs = [...latest.values()].filter((c) => {
    const contact = byId.get(c.memberId)?.data.lastCoachContact;
    return needsHelp(c, contact) || noAnswer(c, contact, now);
  });
  const pending = list.filter((c) => c.status === "pending");
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = list.filter((c) => (c.sentAt ?? "").startsWith(month));
  const answered = thisMonth.filter((c) => c.answer);
  const helped = thisMonth.filter((c) => c.answer === "help" || c.answer === "struggling");
  // Back on track: checked this month and their quit risk is low now.
  const back = new Set(thisMonth.filter((c) => byId.get(c.memberId)?.risk.level === "low").map((c) => c.memberId));
  const dirty = settings && saved && JSON.stringify(settings) !== JSON.stringify(saved);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await call<{ settings: AccountabilitySettings; checks: AccountabilityCheck[] }>("/api/coach/accountability", {
        method: "PUT",
        body: JSON.stringify({ company: companyId, ...settings, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      setSettings(r.settings);
      setSaved(r.settings);
      setChecks(r.checks);
      setStatus({ ok: true, text: "Saved." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  };
  const approve = async (ids: string[], skip: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await call<{ done: number }>("/api/coach/accountability/approve", { method: "POST", body: JSON.stringify({ company: companyId, ids, skip }) });
      setStatus({ ok: true, text: skip ? `Skipped ${r.done}.` : `Sent ${r.done}. They'll get a Whop notification and see it on their Today.` });
      await load();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't do that." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Accountability</h2>
        <p className="text-sm text-muted-foreground">
          When someone starts slipping, they get one question with four one-tap answers. Only people who ask for help, or don&apos;t answer, come to you.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {status ? <p className={cn("text-sm", status.ok ? "text-success" : "text-destructive")}>{status.text}</p> : null}

      {/* -------------------------------- needs you -------------------------------- */}
      <Card className={cn(needs.length > 0 && "border-destructive/40")}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4 text-primary" />
            Needs you
            {needs.length ? <span className="tabular rounded-full bg-destructive/15 px-2 text-[12px] font-bold text-destructive">{needs.length}</span> : null}
          </CardTitle>
          <CardDescription>Asked for help or struggling, or no answer after {NO_ANSWER_HOURS} hours. Each one clears when you message them.</CardDescription>
        </CardHeader>
        <CardContent>
          {checks === null ? (
            <div className="h-12 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
          ) : needs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {needs.map((c) => {
                const p = who(c.memberId);
                const help = c.answer === "help" || c.answer === "struggling";
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Avatar name={p.name} url={p.avatarUrl} size="h-8 w-8" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {p.name}
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", help ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>
                          {help ? (c.answer === "help" ? "Asked for help" : "Struggling") : "No answer to check"}
                        </span>
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {help && c.note ? `“${c.note}” · ` : ""}
                        {help ? `answered ${formatShort(c.answeredAt!.slice(0, 10))}` : `sent ${formatShort(c.sentAt!.slice(0, 10))}`}
                        {c.triggers.length ? ` · because: ${c.triggers.join(", ")}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => onMessage(c.memberId)}>
                      <MessageCircle />
                      {help ? "Reply" : "Message"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------- waiting for approval ----------------------------- */}
      {pending.length > 0 ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex-1 text-base">Waiting for your approval ({pending.length})</CardTitle>
              <Button size="sm" onClick={() => void approve(pending.map((c) => c.id), false)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                Send all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void approve(pending.map((c) => c.id), true)} disabled={busy}>
                Skip all
              </Button>
            </div>
            <CardDescription>Found this morning. Each sends &ldquo;{saved?.question}&rdquo; with the four answers.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {pending.map((c) => {
                const p = who(c.memberId);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Avatar name={p.name} url={p.avatarUrl} size="h-8 w-8" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-[12px] text-muted-foreground">{c.triggers.join(" · ")}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void approve([c.id], false)} disabled={busy}>
                      <Check />
                      Send
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void approve([c.id], true)} disabled={busy} aria-label={`Skip ${p.name}`}>
                      <X />
                      Skip
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        {/* -------------------------------- settings -------------------------------- */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="flex-1 text-base">Accountability checks</CardTitle>
              {settings ? (
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
                  aria-label="Accountability checks on"
                />
              ) : null}
            </div>
            <CardDescription>
              {settings?.enabled ? "On." : "Off: nothing is sent or queued."} Checked every hour from {hourText(SEND_HOURS.from)} to {hourText(SEND_HOURS.to)} your time.
            </CardDescription>
          </CardHeader>
          {settings ? (
            <CardContent className="space-y-4 text-sm">
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Send a check when</legend>
                {TRIGGERS.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={settings.triggers.includes(t.id)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          triggers: e.target.checked ? [...settings.triggers, t.id] : settings.triggers.filter((x): x is TriggerId => x !== t.id),
                        })
                      }
                    />
                    {t.label}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">How it&apos;s sent</legend>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="acc-mode" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={settings.mode === "approve"} onChange={() => setSettings({ ...settings, mode: "approve" })} />
                  Queue for me to approve (shown above)
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="acc-mode" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={settings.mode === "auto"} onChange={() => setSettings({ ...settings, mode: "auto" })} />
                  Automatically
                </label>
              </fieldset>
              <div className="space-y-1">
                <label htmlFor="acc-question" className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  The question
                </label>
                <Input id="acc-question" value={settings.question} maxLength={QUESTION_MAX} onChange={(e) => setSettings({ ...settings, question: e.target.value })} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                Once a member every {CHECK_EVERY_DAYS} days at most · never while they&apos;re paused · only members sharing their progress · no answer in {NO_ANSWER_HOURS} h
                comes to you · &ldquo;Pause my plan for a week&rdquo; really pauses it, and tells you.
              </p>
              <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Save
              </Button>
            </CardContent>
          ) : (
            <CardContent>
              <div className="h-40 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
            </CardContent>
          )}
        </Card>

        <div className="space-y-5">
          {/* ---------------------------------- numbers ---------------------------------- */}
          <section aria-label="This month" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {[
              { label: "Sent this month", value: thisMonth.length, tone: "" },
              { label: "Answered", value: answered.length, tone: "" },
              { label: "Asked for help", value: helped.length, tone: helped.length ? "text-destructive" : "" },
              { label: "Back on track", value: back.size, tone: back.size ? "text-success" : "" },
            ].map((x) => (
              <div key={x.label} className="space-y-0.5 bg-card px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{x.label}</p>
                <p className={cn("tabular text-xl font-semibold", x.tone)}>{x.value}</p>
              </div>
            ))}
          </section>
          <p className="-mt-3 text-[12px] text-muted-foreground">Back on track: checked this month, and their quit risk is low now.</p>

          <PreviewNow companyId={companyId} who={who} onSent={() => void load()} />
        </div>
      </div>

      {/* ------------------------------- recent checks ------------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent checks</CardTitle>
          <CardDescription>The last 45 days, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {checks === null ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Switch checks on above, or use Check who&apos;d get one now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.slice(0, 60).map((c) => {
                const p = who(c.memberId);
                const state =
                  c.status === "pending"
                    ? "Waiting for your approval"
                    : c.status === "skipped"
                      ? "Skipped"
                      : c.answer
                        ? `${ANSWER_LABEL[c.answer]}${c.choice ? ` → ${CHOICE_LABEL[c.choice]}` : ""}`
                        : "No answer yet";
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="tabular w-16 shrink-0 text-[12px] text-muted-foreground">{formatShort((c.sentAt ?? c.createdAt).slice(0, 10))}</span>
                    <span className="min-w-0 flex-1 basis-40 font-semibold">{p.name}</span>
                    <span
                      className={cn(
                        "text-[12px]",
                        c.answer === "help" || c.answer === "struggling" ? "font-semibold text-destructive" : c.answer === "on-track" ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {state}
                    </span>
                    {c.note ? <span className="w-full text-[12px] italic text-muted-foreground">&ldquo;{c.note}&rdquo;</span> : null}
                    {c.triggers.length ? <span className="w-full text-[11px] text-muted-foreground">Because: {c.triggers.join(" · ")}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** "Check who'd get one now": the members slipping now, and why; untick anyone, then send. */
function PreviewNow({ companyId, who, onSent }: { companyId: string; who: (id: string) => { name: string; avatarUrl: string | null }; onSent: () => void }) {
  const [items, setItems] = React.useState<{ memberId: string; reasons: string[] }[] | null>(null);
  const [keep, setKeep] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const open = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await call<{ candidates: { memberId: string; reasons: string[] }[] }>(`/api/coach/accountability/preview?company=${encodeURIComponent(companyId)}`);
      setItems(r.candidates);
      setKeep(Object.fromEntries(r.candidates.map((c) => [c.memberId, true])));
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't check." });
    } finally {
      setBusy(false);
    }
  };
  const chosen = (items ?? []).filter((i) => keep[i.memberId]).map((i) => i.memberId);
  const send = async () => {
    setBusy(true);
    try {
      const r = await call<{ sent: number }>("/api/coach/accountability/send", { method: "POST", body: JSON.stringify({ company: companyId, members: chosen }) });
      setStatus({ ok: true, text: `Sent to ${r.sent} member${r.sent === 1 ? "" : "s"}.` });
      setItems(null);
      onSent();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't send." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Check who&apos;d get one now</p>
        <p className="text-[12px] text-muted-foreground">With your ticked reasons, skipping anyone checked in the last {CHECK_EVERY_DAYS} days or paused. Nothing is sent until you press Send.</p>
        {!items ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void open()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Eye />}
            Check now
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setItems(null)} aria-label="Close">
            <X />
          </Button>
        )}
      </div>
      {items ? (
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is slipping right now (or they&apos;ve had a check this week).</p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((i) => (
                <li key={i.memberId}>
                  <label className="flex cursor-pointer items-start gap-2 p-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={!!keep[i.memberId]}
                      onChange={(e) => setKeep((k) => ({ ...k, [i.memberId]: e.target.checked }))}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{who(i.memberId).name}</span>
                      <span className="block text-[12px] text-muted-foreground">{i.reasons.join(" · ")}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={() => void send()} disabled={busy || chosen.length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />}
              Send to {chosen.length} member{chosen.length === 1 ? "" : "s"}
            </Button>
          </>
        )
      ) : null}
      {status ? <p className={cn("text-[12px]", status.ok ? "text-success" : "text-destructive")}>{status.text}</p> : null}
    </div>
  );
}
