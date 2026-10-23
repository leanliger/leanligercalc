"use client";

import * as React from "react";
import { BellRing, Clock, Megaphone, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatShort } from "@/lib/dates";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, DIGEST_HOUR, NOTIFICATIONS_DAYS, formatSendAt, type Announcement } from "@/lib/messages";
import type { MemberTag } from "@/lib/member-tags";

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
 * Coach dashboard → Library → Announcements: post to everyone, or to members
 * with one tag. It shows in their notification bell and goes out as a Whop
 * notification.
 */
export function CoachAnnouncements({ companyId, tags }: { companyId: string; tags: readonly MemberTag[] }) {
  const [list, setList] = React.useState<Announcement[] | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [tagId, setTagId] = React.useState("");
  // Send later: the picker's value (local time), or null to post now.
  const [later, setLater] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "posting">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const id = React.useId();
  const q = `company=${encodeURIComponent(companyId)}`;

  React.useEffect(() => {
    call<{ announcements: Announcement[] }>(`/api/coach/announcements?${q}`)
      .then((r) => setList(r.announcements))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load announcements."));
  }, [q]);

  const post = async () => {
    setState("posting");
    setError(null);
    setStatus(null);
    try {
      const r = await call<{ announcement: Announcement; notified: number }>("/api/coach/announcements", {
        method: "POST",
        body: JSON.stringify({ company: companyId, title, body, tagId: tagId || null, sendAt: later ? new Date(later).toISOString() : null }),
      });
      setList((prev) => [r.announcement, ...(prev ?? [])]);
      setTitle("");
      setBody("");
      setLater(null);
      setStatus(
        r.announcement.scheduledFor
          ? `Scheduled for ${formatSendAt(r.announcement.scheduledFor)}. It shows in their bell and goes out on Whop then.`
          : `Posted. ${r.notified} member${r.notified === 1 ? "" : "s"} notified on Whop; everyone it's for sees it in their bell.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post it.");
    } finally {
      setState("idle");
    }
  };

  const remove = async (a: Announcement) => {
    try {
      await call(`/api/coach/announcements/${a.id}?${q}`, { method: "DELETE" });
      setList((prev) => (prev ?? []).filter((x) => x.id !== a.id));
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete it.");
    }
  };

  const tagName = (t: string | null) => (t ? (tags.find((x) => x.id === t)?.name ?? "a tag") : "Everyone");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          Announcements
        </CardTitle>
        <CardDescription>
          News for your members: a new challenge, a schedule change, a reminder. It shows in the bell at the top of their app for{" "}
          {NOTIFICATIONS_DAYS} days and goes out as a Whop notification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-3 rounded-2xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`${id}-title`} className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_TITLE_MAX} placeholder="e.g. New 6-week challenge starts Monday" />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-body`} className="text-xs font-medium text-muted-foreground">
              Message
            </label>
            <textarea
              id={`${id}-body`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={ANNOUNCEMENT_BODY_MAX}
              rows={4}
              placeholder="What do they need to know?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">
                Send to
              </label>
              <select
                id={`${id}-to`}
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Everyone</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    Members tagged {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">When</span>
              <span className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="When to post it"
                  value={later === null ? "now" : "later"}
                  onChange={(e) => {
                    if (e.target.value === "now") setLater(null);
                    else {
                      const d = new Date(Date.now() + 60 * 60_000);
                      d.setMinutes(0, 0, 0);
                      setLater(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
                    }
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="now">Now</option>
                  <option value="later">Later…</option>
                </select>
                {later !== null ? (
                  <input
                    type="datetime-local"
                    aria-label="Post it on"
                    value={later}
                    onChange={(e) => setLater(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : null}
              </span>
            </div>
            <Button type="submit" disabled={!title.trim() || !body.trim() || state === "posting" || (later !== null && !later)} className="ml-auto">
              {later !== null ? <Clock /> : <Megaphone />}
              {state === "posting" ? "Posting…" : later !== null ? "Schedule announcement" : "Post announcement"}
            </Button>
          </div>
          <p role="status" className="text-[12px]">
            {error ? <span className="text-destructive">{error}</span> : status ? <span className="text-muted-foreground">{status}</span> : null}
          </p>
        </form>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Posted</h3>
          {list === null ? (
            <div className="h-20 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {list.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.title}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {a.scheduledFor ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          <Clock className="h-3 w-3" aria-hidden />
                          Scheduled for {formatSendAt(a.scheduledFor)}
                        </span>
                      ) : (
                        formatShort(a.at.slice(0, 10))
                      )}{" "}
                      · {tagName(a.tagId)}
                    </p>
                  </div>
                  {confirmId === a.id ? (
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="destructive" onClick={() => void remove(a)}>
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Delete "${a.title}"`} onClick={() => setConfirmId(a.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Deleting removes it from members&apos; bells (and cancels it if it hasn&apos;t gone out yet). A Whop notification already sent stays sent.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Today → "Daily digest": one Whop notification each morning at 8am (this
 * device's time zone) summing up what needs the coach.
 */
export function CoachDigestToggle({ companyId }: { companyId: string }) {
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const q = `company=${encodeURIComponent(companyId)}`;

  React.useEffect(() => {
    call<{ enabled: boolean }>(`/api/coach/digest?${q}`)
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(null));
  }, [q]);

  const change = async (on: boolean) => {
    const before = enabled;
    setEnabled(on);
    setError(null);
    try {
      const r = await call<{ enabled: boolean }>("/api/coach/digest", {
        method: "PUT",
        body: JSON.stringify({ company: companyId, enabled: on, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      setEnabled(r.enabled);
    } catch (e) {
      setEnabled(before);
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-primary/15 p-4">
      <BellRing className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={id} className="block text-sm font-semibold">
          Daily digest
        </label>
        <p className="text-[12px] text-muted-foreground">
          A Whop notification at {DIGEST_HOUR}am your time: check-ins to reply to, members to reach out to, slipping lifts, wins and unread
          messages. Skipped on days nothing needs you.
        </p>
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Switch id={id} checked={enabled === true} disabled={enabled === null} onCheckedChange={(v) => void change(v)} />
    </div>
  );
}
