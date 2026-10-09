"use client";

import * as React from "react";
import { Bookmark, Check, Copy, Dumbbell, ListChecks, Pencil, Save, Search, Send, Trash2, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import { ProgramEditor } from "@/components/program-editor";
import { HabitEditor } from "@/components/habits-card";
import {
  ASSIGNMENT_NOTE_MAX,
  GROUP_NAME_MAX,
  HABIT_SET_NAME_MAX,
  type AssignmentKind,
  type AssignmentTarget,
  type CoachAssignment,
  type CoachGroup,
  type SavedProgram,
} from "@/lib/assignments";
import type { CoachMemberData } from "@/lib/coach";
import { formatShort } from "@/lib/dates";
import { DEFAULT_HABITS, type HabitDef } from "@/lib/habits";
import { DEFAULT_REST_SEC, TEMPLATES, programFromTemplate, type Program } from "@/lib/training";
import { MAX_SCHEDULE_WEEKS, defaultWeekdays, nextMonday, scheduleEnd, scheduleSessions } from "@/lib/program-schedule";
import { WEEKDAY_SHORT } from "@/lib/weekday-pattern";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const shortId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);

const nameOf = (m: Pick<CoachMemberData, "name" | "username">) => m.name?.trim() || (m.username ? `@${m.username}` : "Member");

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

type Audience = "all" | "group" | "member";

/** Coach dashboard → Assign: send a program or habit set to everyone, a group or one member. */
export function CoachAssignPanel({ companyId, members }: { companyId: string; members: CoachMemberData[] }) {
  const [data, setData] = React.useState<{ assignments: CoachAssignment[]; groups: CoachGroup[] } | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<SavedProgram[]>([]);

  const loadPrograms = React.useCallback(async () => {
    try {
      setSaved((await call<{ programs: SavedProgram[] }>(`/api/coach/programs?company=${encodeURIComponent(companyId)}`)).programs);
    } catch {
      /* the list just stays as it was; saving shows its own errors */
    }
  }, [companyId]);
  React.useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const load = React.useCallback(async () => {
    try {
      setData(await call(`/api/coach/assignments?company=${encodeURIComponent(companyId)}`));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load assignments.");
    }
  }, [companyId]);
  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:items-start">
      <NewAssignment
        companyId={companyId}
        members={members}
        groups={data?.groups ?? []}
        saved={saved}
        onProgramsChanged={loadPrograms}
        onSent={load}
        onGroupsChanged={load}
      />
      <div className="space-y-5">
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        <SentList companyId={companyId} assignments={data?.assignments ?? null} onChanged={load} />
        <GroupsCard companyId={companyId} members={members} groups={data?.groups ?? []} onChanged={load} />
      </div>
    </div>
  );
}

/* ------------------------------- new assignment ------------------------------- */

function NewAssignment({
  companyId,
  members,
  groups,
  saved,
  onProgramsChanged,
  onSent,
  onGroupsChanged,
}: {
  companyId: string;
  members: CoachMemberData[];
  groups: CoachGroup[];
  /** The coach's saved programs, newest first. */
  saved: SavedProgram[];
  onProgramsChanged: () => Promise<void>;
  onSent: () => Promise<void>;
  onGroupsChanged: () => Promise<void>;
}) {
  const [kind, setKind] = React.useState<AssignmentKind>("program");
  const [program, setProgram] = React.useState<Program | null>(null);
  const [habits, setHabits] = React.useState<HabitDef[]>(() => DEFAULT_HABITS.map((h) => ({ ...h })));
  const [habitTitle, setHabitTitle] = React.useState("Daily non-negotiables");
  const [audience, setAudience] = React.useState<Audience>("all");
  const [groupId, setGroupId] = React.useState<string>("");
  const [memberId, setMemberId] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  // The calendar members get with a program.
  const [scheduleOn, setScheduleOn] = React.useState(true);
  const [startDate, setStartDate] = React.useState(() => nextMonday(todayISO()));
  const [weekdays, setWeekdays] = React.useState<number[]>(defaultWeekdays(4));
  const [weeks, setWeeks] = React.useState(6);
  // The saved program being edited (null = a new one), and what it looked like when last saved.
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = React.useState<string | null>(null);
  const [saveMsg, setSaveMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const chooseProgram = (p: Program) => {
    setProgram(p);
    setWeekdays(defaultWeekdays(p.days.length));
    setSavedId(null);
    setSavedSnapshot(null);
    setSaveMsg(null);
  };
  const snapshotOf = (p: Program | null, days: number[], w: number) => JSON.stringify({ p, days, w });
  const chooseSaved = (sp: SavedProgram) => {
    const days = sp.weekdays ?? defaultWeekdays(sp.program.days.length);
    const w = sp.weeks ?? 6;
    setProgram(sp.program);
    setWeekdays(days);
    setWeeks(w);
    setSavedId(sp.id);
    setSavedSnapshot(snapshotOf(sp.program, days, w));
    setSaveMsg(null);
  };
  const changed = savedId === null || snapshotOf(program, weekdays, weeks) !== savedSnapshot;
  const saveProgram = async (asNew: boolean) => {
    if (!program) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updating = savedId !== null && !asNew;
      const r = await call<{ program: SavedProgram | null }>(updating ? `/api/coach/programs/${savedId}` : "/api/coach/programs", {
        method: updating ? "PUT" : "POST",
        body: JSON.stringify({ company: companyId, program: asNew && savedId ? { ...program, name: `${program.name} (copy)` } : program, weekdays, weeks }),
      });
      if (r.program) {
        setProgram(r.program.program);
        setSavedId(r.program.id);
        setSavedSnapshot(snapshotOf(r.program.program, weekdays, weeks));
      }
      setSaveMsg({ ok: true, text: updating ? "Changes saved." : "Saved to your programs." });
      await onProgramsChanged();
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save it. Try again." });
    } finally {
      setSaving(false);
    }
  };
  const resetProgram = () => {
    setProgram(null);
    setSavedId(null);
    setSavedSnapshot(null);
    setSaveMsg(null);
  };
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  const emptyProgram = (): Program => ({ id: shortId(), name: "My program", days: [{ id: "d1", name: "Day 1", exercises: [] }] });
  const programReady = program !== null && program.days.some((d) => d.exercises.length > 0);
  const target: AssignmentTarget | null =
    audience === "all"
      ? { type: "all" }
      : audience === "group"
        ? groupId
          ? { type: "group", groupId }
          : null
        : memberId
          ? { type: "members", memberIds: [memberId] }
          : null;
  const scheduleReady = !scheduleOn || (weekdays.length > 0 && weeks >= 1 && weeks <= MAX_SCHEDULE_WEEKS && /^\d{4}-\d\d-\d\d$/.test(startDate));
  const ready = (kind === "program" ? programReady && scheduleReady : habits.length > 0) && target !== null;
  const scheduled: Program | null =
    program && scheduleOn && scheduleReady ? { ...program, schedule: { startDate, weekdays, weeks, note: "" } } : program;
  // The schedule step only shows once a program is loaded.
  const n = (step: number) => (kind === "program" && program ? step : step - 1);

  const send = async () => {
    if (!target) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await call<{ sent: number; notified: number; audience: string }>("/api/coach/assignments", {
        method: "POST",
        body: JSON.stringify({ company: companyId, kind, program: scheduled, habits, title: habitTitle, note, target }),
      });
      setResult({
        ok: true,
        text: `Sent to ${r.sent} ${r.sent === 1 ? "member" : "members"} (${r.audience}). ${
          r.notified === r.sent
            ? "Everyone got a Whop notification."
            : `${r.notified} got a Whop notification; the rest will see it next time they open the app.`
        }`,
      });
      setNote("");
      if (kind === "program") resetProgram();
      await onSent();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Assign a program or habits
          </CardTitle>
          <CardDescription>
            Members get a Whop notification and a card in their app. One tap adds it; they can also say Not now. You don&apos;t
            need them to share their progress.
          </CardDescription>
        </div>
        <SegmentedControl
          ariaLabel="What to assign"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "program" as const, label: "Training program" },
            { value: "habits" as const, label: "Habit set" },
          ]}
          className="max-w-sm"
        />
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. what */}
        {kind === "program" ? (
          program ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  1. {savedId ? "Your saved program" : "Build the program"}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {savedId ? (
                    <>
                      <Button variant={changed ? "default" : "outline"} size="sm" className="h-8 px-2.5" disabled={saving || !changed} onClick={() => void saveProgram(false)}>
                        {changed ? <Save /> : <Check />}
                        {changed ? "Save changes" : "Saved"}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 px-2" disabled={saving} onClick={() => void saveProgram(true)}>
                        <Copy />
                        Save as new
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={saving} onClick={() => void saveProgram(false)}>
                      <Save />
                      Save to my programs
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={resetProgram}>
                    <X />
                    Start over
                  </Button>
                </div>
              </div>
              {saveMsg ? (
                <p role={saveMsg.ok ? "status" : "alert"} className={cn("text-xs", saveMsg.ok ? "text-success" : "text-destructive")}>
                  {saveMsg.text}
                </p>
              ) : null}
              <ProgramEditor
                program={program}
                custom={[]}
                defaultRest={DEFAULT_REST_SEC}
                onChange={setProgram}
                title="Program to send"
                description="Exercises come from the app's library, so they work in every member's app. Members can change their copy."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {saved.length > 0 ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Bookmark className="h-3.5 w-3.5" />
                    1. Your programs
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {saved.map((sp) => (
                      <li key={sp.id} className="flex items-stretch gap-1 rounded-lg border border-primary/40 bg-primary/[0.03]">
                        <button
                          type="button"
                          onClick={() => chooseSaved(sp)}
                          className="min-w-0 flex-1 space-y-1 rounded-l-lg p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="block truncate text-sm font-semibold">{sp.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{sp.program.days.map((d) => d.name).join(" · ")}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {sp.weekdays ? sp.weekdays.map((d) => WEEKDAY_SHORT[d]).join(" · ") : `${sp.program.days.length} days`}
                            {sp.weeks ? ` · ${sp.weeks} weeks` : ""} · saved {formatShort(sp.updatedAt.slice(0, 10))}
                          </span>
                        </button>
                        <ConfirmButton
                          size="icon"
                          className="m-1 h-8 w-8 shrink-0 text-muted-foreground"
                          label={<span className="sr-only">Delete {sp.name}</span>}
                          icon={<Trash2 />}
                          confirmLabel="Delete"
                          onConfirm={async () => {
                            await call(`/api/coach/programs/${sp.id}?company=${encodeURIComponent(companyId)}`, { method: "DELETE" });
                            await onProgramsChanged();
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs font-medium text-muted-foreground">
                {saved.length > 0 ? "Or start from a template, or build a new one" : "1. Start from a template, or build your own"}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => chooseProgram(programFromTemplate(t, shortId))}
                      className="w-full space-y-1 rounded-lg border border-border p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block text-sm font-semibold">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.days.map((d) => d.name).join(" · ")}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => chooseProgram(emptyProgram())}
                    className="flex h-full w-full items-center gap-2 rounded-lg border border-dashed border-border p-3 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="h-4 w-4 text-primary" />
                    Build my own
                  </button>
                </li>
              </ul>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">1. The habits</p>
            <label className="block space-y-1">
              <span className="text-xs">Name</span>
              <Input value={habitTitle} maxLength={HABIT_SET_NAME_MAX} onChange={(e) => setHabitTitle(e.target.value)} className="h-9 max-w-sm" />
            </label>
            <div className="rounded-lg border border-border p-3">
              <HabitEditor habits={habits} onChange={setHabits} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Members who use it switch to exactly these habits. Their past ticks and streaks stay.
            </p>
          </div>
        )}

        {/* 2. schedule (programs) */}
        {kind === "program" && program ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">2. Schedule</p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Put it on members&apos; calendars
              </label>
            </div>
            {scheduleOn ? (
              <>
                <div className="flex flex-wrap gap-3">
                  <label className="space-y-1">
                    <span className="block text-xs">Starts</span>
                    <Input type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} className="h-9 w-40" />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-xs">Weeks</span>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_SCHEDULE_WEEKS}
                      value={weeks}
                      onChange={(e) => setWeeks(Math.max(1, Math.min(MAX_SCHEDULE_WEEKS, Math.round(Number(e.target.value) || 1))))}
                      className="h-9 w-24"
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  <span className="block text-xs">Training days</span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Training days">
                    {WEEKDAY_SHORT.map((label, d) => {
                      const on = weekdays.includes(d);
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setWeekdays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))}
                          className={cn(
                            "h-8 min-w-[2.75rem] rounded-full border px-2.5 text-xs font-medium",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {scheduled?.schedule ? (
                  <p className="tabular text-xs text-muted-foreground">
                    {scheduleSessions(scheduled).length} workouts · {formatShort(startDate)} – {formatShort(scheduleEnd(scheduled)!)} ·{" "}
                    {program.days.map((d) => d.name).join(", ")} in turn
                  </p>
                ) : (
                  <p className="text-xs text-destructive">Pick at least one training day.</p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Members do the days in order, at their own pace.</p>
            )}
          </div>
        ) : null}

        {/* 3. who */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">{n(3)}. Who gets it</p>
          <SegmentedControl
            ariaLabel="Who gets it"
            value={audience}
            onValueChange={setAudience}
            options={[
              { value: "all" as const, label: `Everyone (${members.length})` },
              { value: "group" as const, label: "A group" },
              { value: "member" as const, label: "One member" },
            ]}
          />
          {audience === "group" ? (
            groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">No groups yet. Make one in Groups (on the right), then pick it here.</p>
            ) : (
              <ul className="space-y-1">
                {groups.map((g) => (
                  <li key={g.id}>
                    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", groupId === g.id ? "border-primary/50 bg-primary/5" : "border-border")}>
                      <input type="radio" name="assign-group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} className="accent-[hsl(var(--primary))]" />
                      <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{g.memberIds.length} members</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : audience === "member" ? (
            <MemberPicker members={members} selected={memberId ? [memberId] : []} onChange={(ids) => setMemberId(ids[ids.length - 1] ?? "")} single />
          ) : null}
        </div>

        {/* 3. note + send */}
        <div className="space-y-2 border-t border-border pt-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{n(4)}. Note (optional)</span>
            <textarea
              className={cn(FIELD, "min-h-[3.5rem] resize-y")}
              value={note}
              maxLength={ASSIGNMENT_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Phase 2 starts Monday. Run this for 6 weeks."
            />
          </label>
          {result ? (
            <p role={result.ok ? "status" : "alert"} className={cn("text-xs", result.ok ? "text-success" : "text-destructive")}>
              {result.text}
            </p>
          ) : null}
          <Button onClick={() => void send()} disabled={!ready || busy}>
            <Send />
            Send {kind === "program" ? "program" : "habits"}
          </Button>
          {!ready ? (
            <p className="text-[11px] text-muted-foreground">
              {kind === "program" && !programReady
                ? "Pick a template or add at least one exercise."
                : kind === "program" && !scheduleReady
                  ? "Pick at least one training day."
                : target === null
                  ? audience === "group"
                    ? "Pick a group."
                    : "Pick a member."
                  : "Add at least one habit."}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Searchable member list with checkboxes (or radios for one member). */
function MemberPicker({
  members,
  selected,
  onChange,
  single = false,
}: {
  members: CoachMemberData[];
  selected: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const shown = members
    .filter((m) => !q || `${m.name ?? ""} ${m.username ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const toggle = (id: string) =>
    onChange(single ? [id] : selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" aria-label="Search members" className="h-9 pl-9" />
      </div>
      <ul className="scrollbar-thin max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {shown.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Nobody matches.</li>
        ) : (
          shown.map((m) => (
            <li key={m.userId}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type={single ? "radio" : "checkbox"}
                  name={single ? "assign-member" : undefined}
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0 flex-1 truncate">{nameOf(m)}</span>
                {m.username && m.name ? <span className="truncate text-xs text-muted-foreground">@{m.username}</span> : null}
              </label>
            </li>
          ))
        )}
      </ul>
      {!single ? <p className="tabular text-[11px] text-muted-foreground">{selected.length} selected</p> : null}
    </div>
  );
}

/* --------------------------------- sent list --------------------------------- */

function SentList({ companyId, assignments, onChanged }: { companyId: string; assignments: CoachAssignment[] | null; onChanged: () => Promise<void> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sent</CardTitle>
        <CardDescription>Who&apos;s used each one so far.</CardDescription>
      </CardHeader>
      <CardContent>
        {assignments === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className={cn("space-y-1.5 rounded-md border px-3 py-2.5", a.cancelled ? "border-dashed border-border opacity-70" : "border-border")}>
                <div className="flex items-start gap-2">
                  {a.kind === "program" ? <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {a.audience} · {formatShort(a.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  {a.cancelled ? <Badge variant="secondary">Cancelled</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="tabular text-success">
                    {a.counts.accepted} of {a.counts.sent} used it
                  </span>
                  {a.counts.declined > 0 ? <span className="tabular text-muted-foreground">{a.counts.declined} not now</span> : null}
                  {!a.cancelled && a.counts.pending > 0 ? <span className="tabular text-muted-foreground">{a.counts.pending} waiting</span> : null}
                  {!a.cancelled && a.counts.pending > 0 ? (
                    <ConfirmButton
                      label="Cancel"
                      confirmLabel="Yes, cancel it"
                      className="ml-auto h-7 px-2 text-muted-foreground"
                      onConfirm={async () => {
                        await call(`/api/coach/assignments/${a.id}?company=${encodeURIComponent(companyId)}`, { method: "DELETE" });
                        await onChanged();
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- groups ---------------------------------- */

function GroupsCard({
  companyId,
  members,
  groups,
  onChanged,
}: {
  companyId: string;
  members: CoachMemberData[];
  groups: CoachGroup[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = React.useState<CoachGroup | "new" | null>(null);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Groups
        </CardTitle>
        <CardDescription>Save sets of members, e.g. &ldquo;Show prep&rdquo; or &ldquo;Beginners&rdquo;, to assign to together.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {editing ? (
          <GroupEditor companyId={companyId} members={members} group={editing === "new" ? null : editing} onDone={async (changed) => {
            setEditing(null);
            if (changed) await onChanged();
          }} />
        ) : (
          <>
            {groups.length > 0 ? (
              <ul className="space-y-1">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
                    <span className="tabular text-xs text-muted-foreground">{g.memberIds.length}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`}>
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      label={<span className="sr-only">Delete {g.name}</span>}
                      icon={<Trash2 />}
                      confirmLabel="Delete"
                      onConfirm={async () => {
                        await call(`/api/coach/groups/${g.id}?company=${encodeURIComponent(companyId)}`, { method: "DELETE" });
                        await onChanged();
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Users />
              New group
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GroupEditor({
  companyId,
  members,
  group,
  onDone,
}: {
  companyId: string;
  members: CoachMemberData[];
  group: CoachGroup | null;
  onDone: (changed: boolean) => Promise<void>;
}) {
  const [name, setName] = React.useState(group?.name ?? "");
  const [selected, setSelected] = React.useState<string[]>(group?.memberIds.filter((id) => members.some((m) => m.userId === id)) ?? []);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(group ? `/api/coach/groups/${group.id}` : "/api/coach/groups", {
        method: group ? "PUT" : "POST",
        body: JSON.stringify({ company: companyId, name, memberIds: selected }),
      });
      await onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the group.");
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Input value={name} maxLength={GROUP_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Group name" aria-label="Group name" className="h-9" />
      <MemberPicker members={members} selected={selected} onChange={setSelected} />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim() || selected.length === 0}>
          Save group
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onDone(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
