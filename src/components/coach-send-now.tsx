"use client";

import * as React from "react";
import { BellRing, Eye, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShort } from "@/lib/dates";
import { NUDGE_INFO, type NudgeKind } from "@/lib/nudges";
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

/** A notification as it would arrive: bold title, then the text. */
function NotificationPreview({ title, content, to }: { title: string; content: string; to: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-primary/30 bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview · Whop notification to {to}</p>
      <p className="text-sm font-bold">{title}</p>
      <p className="text-sm">{content}</p>
    </div>
  );
}

/* -------------------------------- progress check -------------------------------- */

/**
 * A replied check-in with focus items → "Send progress check now": preview the
 * mid-week numbers the member would get, then send (once per check-in).
 */
export function ProgressCheckNow({ companyId, memberId, memberName, weekStart }: { companyId: string; memberId: string; memberName: string; weekStart: string }) {
  const first = memberName.split(" ")[0] || memberName;
  const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}&weekStart=${weekStart}`;
  const [preview, setPreview] = React.useState<{ message: { title: string; content: string }; sentAt: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  const open = async () => {
    setBusy(true);
    setStatus(null);
    try {
      setPreview(await call(`/api/coach/focus-check?${qs}`));
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't load it." });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await call<{ sentAt: string }>("/api/coach/focus-check", { method: "POST", body: JSON.stringify({ company: companyId, member: memberId, weekStart }) });
      setPreview((p) => (p ? { ...p, sentAt: r.sentAt } : p));
      setStatus({ ok: true, text: `Sent to ${first}. The automatic one won't go now.` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {!preview ? (
        <Button size="sm" variant="outline" onClick={() => void open()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Eye />}
          Send progress check now
        </Button>
      ) : (
        <>
          <NotificationPreview title={preview.message.title} content={preview.message.content} to={first} />
          <div className="flex flex-wrap items-center gap-2">
            {preview.sentAt ? (
              <span className="text-[12px] text-muted-foreground">Already sent on {formatShort(preview.sentAt.slice(0, 10))}: it goes once per check-in.</span>
            ) : (
              <Button size="sm" onClick={() => void send()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                Send to {first}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              {preview.sentAt ? "Close" : "Cancel"}
            </Button>
          </div>
        </>
      )}
      {status ? <p className={cn("text-[12px]", status.ok ? "text-success" : "text-destructive")}>{status.text}</p> : null}
    </div>
  );
}

/* -------------------------------- digest -------------------------------- */

/** Today → Daily digest → "Preview my digest": see today's digest, and send it to yourself now if you like. */
export function DigestNow({ companyId }: { companyId: string }) {
  const [preview, setPreview] = React.useState<{ message: { title: string; content: string } | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const open = async () => {
    setBusy(true);
    setStatus(null);
    try {
      setPreview(await call(`/api/coach/digest/preview?company=${encodeURIComponent(companyId)}`));
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't load it." });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      await call("/api/coach/digest/send", { method: "POST", body: JSON.stringify({ company: companyId }) });
      setStatus({ ok: true, text: "Sent to you on Whop." });
      setPreview(null);
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-2">
      {!preview ? (
        <Button size="sm" variant="outline" onClick={() => void open()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Eye />}
          Preview my digest
        </Button>
      ) : (
        <>
          {preview.message ? (
            <NotificationPreview title={preview.message.title} content={preview.message.content} to="you only" />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing needs you today, so there&apos;s no digest.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {preview.message ? (
              <Button size="sm" onClick={() => void send()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                Send to me now
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              Close
            </Button>
          </div>
        </>
      )}
      {status ? <p className={cn("text-[12px]", status.ok ? "text-success" : "text-destructive")}>{status.text}</p> : null}
    </div>
  );
}

/* -------------------------------- nudges -------------------------------- */

/**
 * Library → Automatic nudges → "Run nudges now": who's due a nudge right now
 * and the message each would get; untick anyone, then send. Members nudged
 * today are never included.
 */
export function NudgesNow({ companyId, names }: { companyId: string; names: ReadonlyMap<string, string> }) {
  const [items, setItems] = React.useState<{ memberId: string; kind: NudgeKind; message: string }[] | null>(null);
  const [rulesOn, setRulesOn] = React.useState(0);
  const [keep, setKeep] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const open = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await call<{ items: { memberId: string; kind: NudgeKind; message: string }[]; rulesOn: number }>(`/api/coach/nudges/preview?company=${encodeURIComponent(companyId)}`);
      setItems(r.items);
      setRulesOn(r.rulesOn);
      setKeep(Object.fromEntries(r.items.map((i) => [i.memberId, true])));
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
      const r = await call<{ sent: number }>("/api/coach/nudges/run", { method: "POST", body: JSON.stringify({ company: companyId, members: chosen }) });
      setStatus({ ok: true, text: `Sent to ${r.sent} member${r.sent === 1 ? "" : "s"}.` });
      setItems(null);
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Couldn't send." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-semibold">Run nudges now</p>
        <p className="text-[12px] text-muted-foreground">Check every rule now instead of waiting for the afternoon run. You see who&apos;d get what first.</p>
        {!items ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void open()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Eye />}
            Check who&apos;s due
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setItems(null)} disabled={busy} aria-label="Close">
            <X />
          </Button>
        )}
      </div>
      {items ? (
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rulesOn === 0 ? "No rules are switched on." : "Nobody is due a nudge right now (or they've had one today)."}
          </p>
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
                      <span className="block text-sm font-semibold">
                        {names.get(i.memberId) ?? "A member"} <span className="font-normal text-muted-foreground">· {NUDGE_INFO[i.kind].label}</span>
                      </span>
                      <span className="block text-[13px] text-muted-foreground">“From your coach: {i.message}”</span>
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
