"use client";

import * as React from "react";
import { ClipboardCheck, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckinAnswersText, CheckinRatings, CheckinStatsGrid } from "@/components/coach-tools";
import { CHECKIN_SCALES, CHECKIN_TEXT_MAX, type Checkin, type CheckinAnswers, type CheckinScale, type CheckinStats } from "@/lib/checkins";
import { formatShort } from "@/lib/dates";
import { weekStartOf } from "@/lib/habits";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Progress → Weekly: this week's check-in for the coach (src/lib/checkins.ts),
 * the coach's replies, and past weeks. The numbers are filled in from the
 * member's logs by the server when they send it; a preview shows them first.
 */

const EMPTY: CheckinAnswers = {
  ratings: { energy: 0, hunger: 0, sleep: 0, stress: 0, training: 0 },
  wins: "",
  struggles: "",
  question: "",
};

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

export function CheckinCard({ cloud, today, unit }: { cloud: boolean; today: string; unit: WeightUnit }) {
  const [checkins, setCheckins] = React.useState<Checkin[] | null>(null);
  const [preview, setPreview] = React.useState<CheckinStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<CheckinAnswers>(EMPTY);
  const [editing, setEditing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [openPast, setOpenPast] = React.useState<string | null>(null);
  const week = today ? weekStartOf(today) : "";

  React.useEffect(() => {
    if (!cloud || !today) return;
    let live = true;
    call<{ checkins: Checkin[]; preview: CheckinStats | null }>(`/api/checkins?date=${today}`)
      .then((r) => {
        if (!live) return;
        setCheckins(r.checkins);
        setPreview(r.preview);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load your check-ins."));
    return () => {
      live = false;
    };
  }, [cloud, today]);

  const current = checkins?.find((c) => c.weekStart === week) ?? null;
  const past = (checkins ?? []).filter((c) => c.weekStart !== week);
  const showForm = !current || editing;
  const complete = CHECKIN_SCALES.every((s) => answers.ratings[s.key] >= 1);

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await call<{ checkins: Checkin[] }>("/api/checkins", { method: "PUT", body: JSON.stringify({ date: today, answers }) });
      setCheckins(r.checkins);
      setEditing(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Coach check-in
        </CardTitle>
        <CardDescription>
          {!cloud
            ? "Open the app from your Whop community to send your coach a weekly check-in."
            : "Once a week: how it went, in a minute. Your weight, workouts, steps, food and photos are added for you."}
        </CardDescription>
      </CardHeader>
      {cloud ? (
        <CardContent className="space-y-4">
          {checkins === null ? <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p> : null}

          {checkins !== null && current && !editing ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">This week · sent {formatShort(current.submittedAt.slice(0, 10))}</p>
                {current.reply ? <Badge variant="success">Coach replied</Badge> : <Badge variant="secondary">Waiting for your coach</Badge>}
              </div>
              {current.reply ? <CoachReply c={current} /> : null}
              <CheckinRatings c={current} />
              <CheckinStatsGrid stats={current.stats} unit={unit} />
              <CheckinAnswersText c={current} />
              {!current.reply ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAnswers(current.answers);
                    setEditing(true);
                  }}
                >
                  Edit this week&apos;s check-in
                </Button>
              ) : null}
            </div>
          ) : null}

          {checkins !== null && showForm ? (
            <div className="space-y-4">
              <p className="text-sm font-medium">Week of {formatShort(week)}</p>
              <div className="space-y-3">
                {CHECKIN_SCALES.map((s) => (
                  <RatingRow
                    key={s.key}
                    label={s.label}
                    low={s.low}
                    high={s.high}
                    value={answers.ratings[s.key]}
                    onChange={(v) => setAnswers((a) => ({ ...a, ratings: { ...a.ratings, [s.key as CheckinScale]: v } }))}
                  />
                ))}
              </div>
              <TextBox label="Wins this week" value={answers.wins} onChange={(wins) => setAnswers((a) => ({ ...a, wins }))} placeholder="Hit every workout, new bench PR…" />
              <TextBox
                label="Struggles"
                value={answers.struggles}
                onChange={(struggles) => setAnswers((a) => ({ ...a, struggles }))}
                placeholder="Weekend eating, low energy on leg day…"
              />
              <TextBox
                label="Question for your coach (optional)"
                value={answers.question}
                onChange={(question) => setAnswers((a) => ({ ...a, question }))}
                placeholder="Should I add a refeed?"
              />
              {preview ? (
                <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Added for you · {formatShort(preview.from)} – {formatShort(preview.to)}
                  </p>
                  <CheckinStatsGrid stats={preview} unit={unit} />
                </div>
              ) : null}
              {sendError ? (
                <p role="alert" className="text-xs text-destructive">
                  {sendError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void send()} disabled={!complete || sending}>
                  {sending ? "Sending…" : current ? "Update check-in" : "Send to my coach"}
                </Button>
                {editing ? (
                  <Button variant="ghost" onClick={() => setEditing(false)} disabled={sending}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              {!complete ? <p className="text-[11px] text-muted-foreground">Rate all five to send it.</p> : null}
            </div>
          ) : null}

          {past.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Past check-ins</p>
              {past.slice(0, 8).map((c) => {
                const open = openPast === c.weekStart;
                return (
                  <div key={c.weekStart} className="rounded-md border border-border">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenPast(open ? null : c.weekStart)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      Week of {formatShort(c.weekStart)}
                      {c.reply ? (
                        <span className="flex items-center gap-1 text-[11px] text-primary">
                          <MessageSquare className="h-3 w-3" />
                          Coach replied
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No reply</span>
                      )}
                    </button>
                    {open ? (
                      <div className="space-y-3 border-t border-border px-3 py-3">
                        {c.reply ? <CoachReply c={c} /> : null}
                        <CheckinRatings c={c} />
                        <CheckinStatsGrid stats={c.stats} unit={unit} />
                        <CheckinAnswersText c={c} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function CoachReply({ c }: { c: Checkin }) {
  return (
    <div className="rounded-md bg-primary/5 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
        Your coach · {formatShort((c.repliedAt ?? "").slice(0, 10))}
      </p>
      <p className="whitespace-pre-wrap text-sm">{c.reply}</p>
    </div>
  );
}

function RatingRow({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">
          1 {low} · 5 {high}
        </span>
      </div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "tabular h-9 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted/40",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={CHECKIN_TEXT_MAX}
        rows={2}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
