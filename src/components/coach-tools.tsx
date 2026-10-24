"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, ClipboardCheck, Loader2, NotebookPen, PieChart, Send, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHECKIN_REPLY_MAX, CHECKIN_SCALES, type Checkin, type CheckinStats } from "@/lib/checkins";
import { COACH_STYLE_MAX } from "@/lib/checkin-draft";
import { FLAG_LABELS, type Flag, type MemberSummary } from "@/lib/coach";
import { macroKcal, type CoachMacros } from "@/lib/coach-macros";
import { formatShort } from "@/lib/dates";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";
import { VoicePlayer, VoiceRecorder } from "@/components/voice-reply";
import { SavedRepliesButton } from "@/components/saved-replies";
import { CheckinReportPanel } from "@/components/checkin-report";
import { ProgressCheckNow } from "@/components/coach-send-now";

/** Coach dashboard pieces: private notes, check-ins, set macros, and the "look at today" list. */

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

const qs = (company: string, member: string) => `company=${encodeURIComponent(company)}&member=${encodeURIComponent(member)}`;
const first = (name: string) => name.split(" ")[0] || name;

/* ============================== look at today ============================== */

export const FLAG_VARIANT: Record<Flag, "danger" | "warning" | "secondary" | "default"> = {
  reply: "default",
  "too-fast": "danger",
  "under-floor": "danger",
  behind: "warning",
  plateau: "warning",
  red: "danger",
  "no-weigh-in": "warning",
  "no-workouts": "warning",
  slipping: "warning",
  "goal-slipping": "warning",
  "muscle-loss": "danger",
  "drop-off": "danger",
  checkin: "secondary",
  inactive: "secondary",
  "no-plan": "secondary",
};

const TODAY_LIMIT = 6;

/** The members to look at today, each with why. */
export function AttentionList({
  members,
  onOpen,
  onShowAll,
}: {
  members: MemberSummary[];
  onOpen: (userId: string) => void;
  onShowAll: () => void;
}) {
  const list = members.filter((m) => m.flags.length > 0);
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Look at today
        </CardTitle>
        <CardDescription>
          {list.length === 0
            ? "Everyone sharing with you is on track. Nothing needs you today."
            : `${list.length} member${list.length === 1 ? "" : "s"} need${list.length === 1 ? "s" : ""} a look, most urgent first.`}
        </CardDescription>
      </CardHeader>
      {list.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.slice(0, TODAY_LIMIT).map((m) => (
              <li key={m.data.userId}>
                <button
                  type="button"
                  onClick={() => onOpen(m.data.userId)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.displayName}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {m.flags.map((f) => (
                        <Badge key={f} variant={FLAG_VARIANT[f]} className="px-2 py-0 text-[11px]">
                          {FLAG_LABELS[f]}
                        </Badge>
                      ))}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {list.length > TODAY_LIMIT ? (
            <Button variant="ghost" size="sm" className="w-full" onClick={onShowAll}>
              Show all {list.length}
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

/* ================================== notes ================================== */

export function CoachNotesCard({ companyId, memberId }: { companyId: string; memberId: string }) {
  const [note, setNote] = React.useState("");
  const [saved, setSaved] = React.useState<{ note: string; at: string | null } | null>(null);
  const [state, setState] = React.useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setSaved(null);
    setError(null);
    call<{ note: string; updatedAt: string | null }>(`/api/coach/notes?${qs(companyId, memberId)}`)
      .then((r) => {
        if (!live) return;
        setNote(r.note);
        setSaved({ note: r.note, at: r.updatedAt });
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load your note."));
    return () => {
      live = false;
    };
  }, [companyId, memberId]);

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const r = await call<{ note: string; updatedAt: string | null }>("/api/coach/notes", {
        method: "PUT",
        body: JSON.stringify({ company: companyId, member: memberId, note }),
      });
      setNote(r.note);
      setSaved({ note: r.note, at: r.updatedAt });
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setState("error");
    }
  };
  const dirty = saved !== null && note.trim() !== saved.note;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="h-4 w-4 text-primary" />
          Coach notes
        </CardTitle>
        <CardDescription>Private: only you and the other admins of your whop see these. The member never does.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label htmlFor={`notes-${memberId}`} className="sr-only">
          Notes about this member
        </label>
        <textarea
          id={`notes-${memberId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={4}
          disabled={saved === null}
          placeholder={saved === null ? "Loading…" : "e.g. Knee issue: avoid deep lunges. Prefers morning check-ins."}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={!dirty || state === "saving"}>
            {state === "saving" ? "Saving…" : "Save note"}
          </Button>
          <span className="text-[12px] text-muted-foreground" role="status">
            {error ? <span className="text-destructive">{error}</span> : dirty ? "Not saved yet" : saved?.at ? `Saved ${formatShort(saved.at.slice(0, 10))}` : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================ check-ins ================================ */

function weightLine(s: CheckinStats, unit: WeightUnit): string {
  if (s.avgWeightLb === null) return "No weigh-ins";
  const v = Math.round(fromLb(s.avgWeightLb, unit) * 10) / 10;
  if (s.prevAvgWeightLb === null) return `${v} ${unit} avg`;
  const d = Math.round(fromLb(s.avgWeightLb - s.prevAvgWeightLb, unit) * 10) / 10;
  return `${v} ${unit} avg (${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)} vs last week)`;
}

/** The numbers filled in with a check-in, as a compact grid. */
export function CheckinStatsGrid({ stats: s, unit }: { stats: CheckinStats; unit: WeightUnit }) {
  const cells: [string, string][] = [
    ["Weight", weightLine(s, unit)],
    ["Weigh-ins", `${s.weighIns} of 7 days`],
    ["Workouts", String(s.workouts)],
    ["Steps", s.avgSteps === null ? "—" : `${s.avgSteps.toLocaleString()} / day`],
    ["Food", s.avgKcal === null ? "Not logged" : `${s.avgKcal.toLocaleString()} kcal · ${s.avgProtein} g protein (${s.foodDays} day${s.foodDays === 1 ? "" : "s"})`],
    ["Habits", s.habitPercent === null ? "—" : `${s.habitPercent}%`],
    ["Photos", String(s.photos)],
  ];
  return (
    <dl className="tabular grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
      {cells.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The five 1–5 ratings as small bars. */
export function CheckinRatings({ c }: { c: Checkin }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {CHECKIN_SCALES.map((s) => {
        const v = c.answers.ratings[s.key];
        return (
          <div key={s.key} className="space-y-1 text-center">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className={cn("tabular text-sm font-semibold", v <= 2 ? "text-destructive" : v >= 4 ? "text-success" : "")}>{v}/5</p>
          </div>
        );
      })}
    </div>
  );
}

export function CheckinAnswersText({ c }: { c: Checkin }) {
  const rows: [string, string][] = [
    ["Wins", c.answers.wins],
    ["Struggles", c.answers.struggles],
    ["Focus for next week", c.answers.focus ?? ""],
    ["Question for you", c.answers.question],
  ];
  return (
    <div className="space-y-1.5">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="whitespace-pre-wrap text-sm">{v}</p>
          </div>
        ))}
    </div>
  );
}

export function MemberCheckinsCard({
  companyId,
  memberId,
  memberName,
  unit,
  onReplied,
  sendLabel,
  summary,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  unit: WeightUnit;
  /** Their dashboard summary: turns on the one-click report. */
  summary?: MemberSummary;
  /** A reply (written or voice) went out: the inbox moves on to the next check-in. */
  onReplied?: () => void;
  /** The send button's words ("Send & next" in the inbox). */
  sendLabel?: string;
}) {
  const [checkins, setCheckins] = React.useState<Checkin[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");
  // Focus items from the one-click report, when its reply was moved into the box to edit.
  const [focus, setFocus] = React.useState<string[]>([]);
  // The one-click report as text (for "Draft with AI"), and its focus types and mid-week choice.
  const [brief, setBrief] = React.useState("");
  const [choices, setChoices] = React.useState<{ kinds: string[]; midweek: boolean }>({ kinds: [], midweek: true });
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [drafting, setDrafting] = React.useState(false);
  const [drafted, setDrafted] = React.useState(false);
  const [style, setStyle] = useCoachStyle();

  /** An AI draft from this check-in (worker/checkin-drafts.ts), into the reply box to edit. */
  const draft = async (weekStart: string) => {
    setDrafting(true);
    setMessage(null);
    try {
      const r = await call<{ draft: string; left: number }>("/api/coach/checkins/draft", {
        method: "POST",
        body: JSON.stringify({ company: companyId, member: memberId, weekStart, name: memberName, unit, style, report: brief }),
      });
      setReply(r.draft);
      setDrafted(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't draft a reply. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  React.useEffect(() => {
    let live = true;
    setCheckins(null);
    setError(null);
    setMessage(null);
    call<{ checkins: Checkin[] }>(`/api/coach/checkins?${qs(companyId, memberId)}`)
      .then((r) => {
        if (!live) return;
        setCheckins(r.checkins);
        setOpen(r.checkins[0]?.weekStart ?? null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load check-ins."));
    return () => {
      live = false;
    };
  }, [companyId, memberId]);

  const send = async (weekStart: string) => {
    setSending(true);
    setMessage(null);
    try {
      const r = await call<{ checkins: Checkin[]; notified: boolean }>("/api/coach/checkins/reply", {
        method: "POST",
        body: JSON.stringify({
          company: companyId,
          member: memberId,
          weekStart,
          reply,
          focus,
          focusKinds: focus.length > 0 ? choices.kinds : [],
          midweek: choices.midweek,
        }),
      });
      setCheckins(r.checkins);
      setReply("");
      setFocus([]);
      setMessage(r.notified ? `Sent. ${first(memberName)} got a notification.` : `Sent. ${first(memberName)} sees it next time they open the app.`);
      onReplied?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Weekly check-ins
        </CardTitle>
        <CardDescription>
          {checkins === null
            ? error ?? "Loading…"
            : checkins.length === 0
              ? `${first(memberName)} hasn't sent a check-in yet. They send one from Progress → Check-in in their app.`
              : "Their answers, with the week's numbers filled in from their logs. Reply and they get a notification."}
        </CardDescription>
      </CardHeader>
      {checkins && checkins.length > 0 ? (
        <CardContent className="space-y-2">
          {checkins.slice(0, 8).map((c) => {
            const isOpen = open === c.weekStart;
            return (
              <div key={c.weekStart} className="rounded-md border border-border">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : c.weekStart);
                    setReply("");
                    setFocus([]);
                    setBrief("");
                    setDrafted(false);
                    setMessage(null);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
                >
                  <span className="text-sm font-medium">Week of {formatShort(c.weekStart)}</span>
                  <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    sent {formatShort(c.submittedAt.slice(0, 10))}
                    {c.reply !== null || c.replyAudio ? <Badge variant="success">Replied</Badge> : <Badge variant="default">To review</Badge>}
                  </span>
                </button>
                {isOpen ? (
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    <CheckinRatings c={c} />
                    <CheckinStatsGrid stats={c.stats} unit={unit} />
                    <CheckinAnswersText c={c} />
                    {c.replyAudio ? (
                      <VoicePlayer
                        src={`/api/coach/checkins/voice?${qs(companyId, memberId)}&weekStart=${c.weekStart}`}
                        seconds={c.replyAudio.seconds}
                        label="Your voice reply"
                      />
                    ) : null}
                    {c.reply ? (
                      <div className="rounded-md bg-primary/5 p-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Your reply · {formatShort((c.repliedAt ?? "").slice(0, 10))}</p>
                        <p className="whitespace-pre-wrap text-sm">{c.reply}</p>
                        {c.coachFocus?.length ? (
                          <div className="mt-2 border-t border-primary/15 pt-2">
                            <ProgressCheckNow companyId={companyId} memberId={memberId} memberName={memberName} weekStart={c.weekStart} />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {summary && !c.replyAudio ? (
                          <CheckinReportPanel
                            companyId={companyId}
                            memberId={memberId}
                            summary={summary}
                            checkin={c}
                            previous={checkins[checkins.indexOf(c) + 1] ?? null}
                            unit={unit}
                            onSent={(r) => {
                              setCheckins(r.checkins);
                              setReply("");
                              setFocus([]);
                              setMessage(
                                r.notified ? `Sent. ${first(memberName)} got a notification.` : `Sent. ${first(memberName)} sees it next time they open the app.`,
                              );
                              onReplied?.();
                            }}
                            onReport={(b, c) => {
                              setBrief(b);
                              setChoices({ kinds: c.kinds, midweek: c.midweek });
                            }}
                            onEdit={(text, items) => {
                              setReply(text);
                              setFocus(items);
                              requestAnimationFrame(() => document.getElementById(`reply-${c.weekStart}`)?.focus());
                            }}
                          />
                        ) : null}
                        <Label htmlFor={`reply-${c.weekStart}`} className="text-xs">
                          Your reply
                        </Label>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void draft(c.weekStart)}
                            disabled={drafting || sending}
                          >
                            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            {drafting ? "Drafting…" : reply.trim() ? "Redraft with AI" : "Draft with AI"}
                          </Button>
                          {/* Saved replies drop in below what's written (or replace an empty box). */}
                          <SavedRepliesButton
                            companyId={companyId}
                            firstName={first(memberName)}
                            current={reply}
                            onInsert={(text) => setReply((r) => (r.trim() ? `${r.trimEnd()}\n\n${text}` : text))}
                          />
                        </div>
                        <textarea
                          id={`reply-${c.weekStart}`}
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          maxLength={CHECKIN_REPLY_MAX}
                          rows={drafted ? 9 : 4}
                          placeholder="Great week. Keep steps at 10k and add 10 g protein at breakfast…"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        {drafted ? (
                          <p className="text-[12px] text-muted-foreground">
                            AI draft from their answers and numbers. Read it and make it yours before sending.
                          </p>
                        ) : null}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">Your style for AI drafts (optional)</summary>
                          <textarea
                            value={style}
                            onChange={(e) => setStyle(e.target.value)}
                            maxLength={COACH_STYLE_MAX}
                            rows={2}
                            placeholder="e.g. Direct and upbeat. Short sentences. Call them 'champ'. End with 'Let's go!'"
                            className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <span className="text-muted-foreground">Kept on this device. Drafts also follow how you replied to them before.</span>
                        </details>
                        <Button size="sm" onClick={() => void send(c.weekStart)} disabled={!reply.trim() || sending}>
                          <Send />
                          {sending ? "Sending…" : c.replyAudio ? "Add a written reply" : (sendLabel ?? "Send reply")}
                        </Button>
                        {!c.replyAudio ? (
                          <VoiceRecorder
                            uploadUrl={`/api/coach/checkins/voice?${qs(companyId, memberId)}&weekStart=${c.weekStart}`}
                            onSent={(notified) => {
                              setMessage(notified ? `Voice reply sent. ${first(memberName)} got a notification.` : `Voice reply sent. ${first(memberName)} hears it next time they open the app.`);
                              onReplied?.();
                              void call<{ checkins: Checkin[] }>(`/api/coach/checkins?${qs(companyId, memberId)}`).then((r) => setCheckins(r.checkins));
                            }}
                          />
                        ) : null}
                      </div>
                    )}
                    {message && isOpen ? (
                      <p role="status" className="text-[12px] text-muted-foreground">
                        {message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      ) : null}
    </Card>
  );
}

/** The coach's style note for AI drafts, kept on this device. */
function useCoachStyle(): [string, (s: string) => void] {
  const KEY = "prep-calculator:coach-style:v1";
  const [style, setStyle] = React.useState("");
  React.useEffect(() => {
    try {
      setStyle(window.localStorage.getItem(KEY) ?? "");
    } catch {
      /* storage blocked */
    }
  }, []);
  const save = (s: string) => {
    setStyle(s);
    try {
      window.localStorage.setItem(KEY, s);
    } catch {
      /* fine: it lasts for this visit */
    }
  };
  return [style, save];
}

/* ================================== macros ================================== */

export function MemberMacrosCard({ companyId, memberId, memberName }: { companyId: string; memberId: string; memberName: string }) {
  const [current, setCurrent] = React.useState<CoachMacros | null | undefined>(undefined);
  const [form, setForm] = React.useState({ protein: "", carbs: "", fat: "", note: "" });
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const name = first(memberName);

  React.useEffect(() => {
    let live = true;
    setCurrent(undefined);
    setEditing(false);
    setMessage(null);
    call<{ macros: CoachMacros | null }>(`/api/coach/macros?${qs(companyId, memberId)}`)
      .then((r) => live && setCurrent(r.macros))
      .catch(() => live && setCurrent(null));
    return () => {
      live = false;
    };
  }, [companyId, memberId]);

  const startEdit = () => {
    setForm(
      current
        ? { protein: String(current.protein), carbs: String(current.carbs), fat: String(current.fat), note: current.note }
        : { protein: "", carbs: "", fat: "", note: "" },
    );
    setEditing(true);
    setMessage(null);
  };
  const g = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const grams = { protein: g(form.protein), carbs: g(form.carbs), fat: g(form.fat) };
  const valid = Object.values(grams).every((v) => Number.isFinite(v) && v >= 0);
  const kcal = valid ? macroKcal(grams) : null;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await call<{ macros: CoachMacros; notified: boolean }>("/api/coach/macros", {
        method: "PUT",
        body: JSON.stringify({ company: companyId, member: memberId, ...grams, note: form.note }),
      });
      setCurrent(r.macros);
      setEditing(false);
      setMessage({ ok: true, text: r.notified ? `Saved. ${name} got a notification.` : `Saved. ${name}'s app uses them next time it opens.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await call(`/api/coach/macros?${qs(companyId, memberId)}`, { method: "DELETE" });
      setCurrent(null);
      setEditing(false);
      setMessage({ ok: true, text: `Cleared. ${name} is back on their own plan's numbers.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't clear. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PieChart className="h-4 w-4 text-primary" />
          Macros
        </CardTitle>
        <CardDescription>
          {current
            ? `You set ${name}'s daily targets. They replace their plan's numbers in their Food log and Today, the same every day.`
            : `${name} is on their own plan's numbers. Set macros here to replace them with yours.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {current === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {current && !editing ? (
          <div className="space-y-1">
            <p className="tabular text-lg font-semibold">
              {current.kcal.toLocaleString()} kcal
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                P {current.protein} g · C {current.carbs} g · F {current.fat} g
              </span>
            </p>
            {current.note ? <p className="text-xs text-muted-foreground">&ldquo;{current.note}&rdquo;</p> : null}
            <p className="text-[12px] text-muted-foreground">Set {formatShort(current.setAt.slice(0, 10))}</p>
          </div>
        ) : null}
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["protein", "carbs", "fat"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`m-${k}-${memberId}`} className="text-xs capitalize">
                    {k} (g)
                  </Label>
                  <Input
                    id={`m-${k}-${memberId}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="tabular text-sm">
              = <span className="font-semibold">{kcal === null ? "—" : `${kcal.toLocaleString()} kcal`}</span>
              <span className="text-xs text-muted-foreground"> a day (4 / 4 / 9 kcal per gram)</span>
            </p>
            <div className="space-y-1">
              <Label htmlFor={`m-note-${memberId}`} className="text-xs">
                Note for {name} (optional)
              </Label>
              <Input
                id={`m-note-${memberId}`}
                value={form.note}
                maxLength={300}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Carbs up for the refeed week"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void save()} disabled={!valid || busy}>
                {busy ? "Saving…" : "Save and notify"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : current !== undefined ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={startEdit}>
              {current ? "Change macros" : "Set macros"}
            </Button>
            {current ? (
              <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={busy}>
                Back to their plan
              </Button>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <p role="status" className={cn("text-[12px]", message.ok ? "text-muted-foreground" : "text-destructive")}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
