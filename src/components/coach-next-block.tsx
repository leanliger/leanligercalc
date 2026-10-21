"use client";

import * as React from "react";
import { ListPlus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleFields, scheduleDraftReady } from "@/components/schedule-fields";
import type { SavedProgram } from "@/lib/assignments";
import { addDays, formatShort } from "@/lib/dates";
import { SCHEDULE_NOTE_MAX, nextBlock, scheduleEnd, type ProgramSchedule } from "@/lib/program-schedule";
import type { Program } from "@/lib/training";
import { WEEKDAY_SHORT } from "@/lib/weekday-pattern";
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

/** Where the next block comes from: one of the member's programs, or one of the coach's saved ones. */
type Source = { kind: "theirs"; id: string } | { kind: "saved"; id: string };

/**
 * Coach dashboard → a member → Training program, under a program on a
 * calendar: what comes after it. Queue one of their other programs (it gets
 * dates from the day after this one ends) or one of your saved programs (sent
 * to them as an assignment with those dates). When this block finishes, their
 * app makes the next one active (src/lib/program-schedule.ts blockToActivate).
 */
export function NextBlockPanel({
  companyId,
  memberId,
  first,
  program,
  programs,
  saving,
  onQueueTheirs,
  onSent,
  onOpen,
}: {
  companyId: string;
  memberId: string;
  first: string;
  /** The program on the calendar now. */
  program: Program;
  programs: readonly Program[];
  saving: boolean;
  /** Give one of their programs these dates (a program edit). */
  onQueueTheirs: (p: Program, schedule: ProgramSchedule) => Promise<void>;
  onSent: () => void;
  onOpen: (programId: string) => void;
}) {
  const end = scheduleEnd(program)!;
  const startDate = addDays(end, 1);
  const queued = nextBlock(programs, program);
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState<SavedProgram[] | null>(null);
  const [source, setSource] = React.useState<Source | null>(null);
  const [dates, setDates] = React.useState<ProgramSchedule>({
    startDate,
    weekdays: program.schedule!.weekdays,
    weeks: program.schedule!.weeks,
    note: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  const theirs = programs.filter((p) => p.id !== program.id);
  React.useEffect(() => {
    if (!open || saved) return;
    call<{ programs: SavedProgram[] }>(`/api/coach/programs?company=${encodeURIComponent(companyId)}`)
      .then((r) => setSaved(r.programs))
      .catch(() => setSaved([]));
  }, [open, saved, companyId]);

  const chosen: Program | null =
    source?.kind === "theirs" ? (theirs.find((p) => p.id === source.id) ?? null) : source?.kind === "saved" ? (saved?.find((s) => s.id === source.id)?.program ?? null) : null;

  const pick = (s: Source) => {
    setSource(s);
    setMessage(null);
    // A saved program brings the days and length it usually runs for.
    if (s.kind === "saved") {
      const sp = saved?.find((x) => x.id === s.id);
      if (sp) setDates((d) => ({ ...d, weekdays: sp.weekdays?.length ? sp.weekdays : d.weekdays, weeks: sp.weeks ?? d.weeks }));
    }
  };

  const queue = async () => {
    if (!source || !chosen) return;
    const schedule = { ...dates, note: dates.note.trim() };
    setBusy(true);
    setMessage(null);
    try {
      if (source.kind === "theirs") {
        await onQueueTheirs(chosen, schedule);
        setOpen(false);
        setSource(null);
      } else {
        await call("/api/coach/assignments", {
          method: "POST",
          body: JSON.stringify({
            company: companyId,
            kind: "program",
            program: { ...chosen, schedule },
            habits: [],
            title: "",
            note: schedule.note,
            target: { type: "members", memberIds: [memberId] },
            challenge: false,
          }),
        });
        setOpen(false);
        setSource(null);
        setMessage({
          ok: true,
          text: `Sent “${chosen.name}” to ${first}. Once they tap Add to my training, it waits on their calendar and takes over on ${formatShort(schedule.startDate)}.`,
        });
        onSent();
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't queue it. Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (queued && !open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
        <p className="min-w-0 text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-primary">Next block</span>
          <span className="font-medium">{queued.name}</span>
          <span className="tabular text-muted-foreground">
            {" "}
            · from {formatShort(queued.schedule!.startDate)} · {queued.schedule!.weekdays.map((d) => WEEKDAY_SHORT[d]).join(" · ")} · {queued.schedule!.weeks}{" "}
            {queued.schedule!.weeks === 1 ? "week" : "weeks"}
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={() => onOpen(queued.id)}>
          Open it
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Nothing queued after {formatShort(end)}. Queue the next block so {first} goes straight into it.
          </p>
          <Button variant="outline" size="sm" onClick={() => (setMessage(null), setOpen(true))}>
            <ListPlus />
            Queue the next block
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Next block · starts {formatShort(startDate)}, the day after this one ends</p>
          <div className="space-y-2">
            {theirs.length > 0 ? (
              <ProgramChoices
                label={`${first}'s programs`}
                items={theirs.map((p) => ({ id: p.id, name: p.name, days: p.days.length }))}
                selected={source?.kind === "theirs" ? source.id : null}
                onPick={(id) => pick({ kind: "theirs", id })}
              />
            ) : null}
            {saved === null ? (
              <div className="h-8 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
            ) : saved.length > 0 ? (
              <ProgramChoices
                label="Your saved programs"
                items={saved.map((s) => ({ id: s.id, name: s.name, days: s.program.days.length }))}
                selected={source?.kind === "saved" ? source.id : null}
                onPick={(id) => pick({ kind: "saved", id })}
              />
            ) : theirs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No other programs to queue. Save one in Library → Programs &amp; habits, or build it there and send it with a start date.
              </p>
            ) : null}
          </div>
          {chosen ? (
            <>
              <ScheduleFields value={dates} onChange={(d) => setDates({ ...dates, ...d })} program={chosen} />
              <label className="block space-y-1">
                <span className="block text-xs">Note on their calendar (optional)</span>
                <textarea
                  value={dates.note}
                  onChange={(e) => setDates({ ...dates, note: e.target.value })}
                  maxLength={SCHEDULE_NOTE_MAX}
                  rows={2}
                  placeholder="e.g. New block: heavier, lower reps."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {source?.kind === "saved" ? (
                <p className="text-xs text-muted-foreground">
                  {first} gets it as a program from you with these dates. Their current program stays active until {formatShort(end)}.
                </p>
              ) : null}
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!chosen || !scheduleDraftReady(dates) || busy || saving} onClick={() => void queue()}>
              <Save />
              {busy || saving ? "Saving…" : source?.kind === "saved" ? "Send as next block" : "Queue it"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => (setOpen(false), setSource(null))}>
              <X />
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={cn("text-xs", message.ok ? "text-success" : "text-destructive")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function ProgramChoices({
  label,
  items,
  selected,
  onPick,
}: {
  label: string;
  items: { id: string; name: string; days: number }[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            aria-pressed={selected === it.id}
            onClick={() => onPick(it.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected === it.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {it.name}
            <span className="text-muted-foreground"> · {it.days} {it.days === 1 ? "day" : "days"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
