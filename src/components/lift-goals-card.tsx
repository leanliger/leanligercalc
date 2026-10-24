"use client";

import * as React from "react";
import { Loader2, MessageCircle, Pencil, Plus, Target, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { formatShort } from "@/lib/dates";
import { libraryExercise } from "@/lib/exercises";
import {
  MAX_ACTIVE_GOALS,
  currentValue,
  goalAmount,
  goalProgress,
  goalSeries,
  suggestTarget,
  type GoalProgress,
  type LiftGoal,
  type LiftGoalInput,
  type LiftGoalKind,
} from "@/lib/lift-goals";
import type { Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * Lift goals (src/lib/lift-goals.ts): the member's card on Training →
 * Workouts (MemberLiftGoals) and the coach's on a member's Training tab
 * (CoachLiftGoals), both drawn by LiftGoalsPanel.
 */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw Object.assign(new Error(body?.error ?? "Something went wrong. Try again."), { status: res.status });
  return body;
}

/** Every lift they've logged, most recently trained first, with where they are now. */
function liftOptions(workouts: readonly Workout[]): { exerciseId: string; name: string; bodyweight: boolean; current: number }[] {
  const meta = new Map<string, { name: string; bodyweight: boolean; last: string }>();
  for (const w of workouts) {
    if (w.finishedAt === null || !Array.isArray(w.exercises)) continue;
    for (const e of w.exercises) {
      const m = meta.get(e.exerciseId);
      if (m && m.last > w.date) continue;
      meta.set(e.exerciseId, { name: libraryExercise(e.exerciseId)?.name ?? (e.name || "Exercise"), bodyweight: e.bodyweight, last: w.date });
    }
  }
  return [...meta.entries()]
    .sort((a, b) => b[1].last.localeCompare(a[1].last))
    .flatMap(([exerciseId, m]) => {
      const current = currentValue(goalSeries(workouts, exerciseId, m.bodyweight));
      return current === null ? [] : [{ exerciseId, name: m.name, bodyweight: m.bodyweight, current }];
    });
}

const STATUS: Record<GoalProgress["status"], { label: string; variant: "success" | "warning" | "default" | "secondary" }> = {
  "on-track": { label: "on track", variant: "success" },
  slipping: { label: "slipping", variant: "warning" },
  ahead: { label: "ahead of pace", variant: "success" },
  behind: { label: "behind pace", variant: "warning" },
  building: { label: "in progress", variant: "default" },
  hit: { label: "hit", variant: "success" },
  "no-data": { label: "not logged yet", variant: "secondary" },
};

const BAR: Record<GoalProgress["status"], string> = {
  "on-track": "bg-success",
  slipping: "bg-warning",
  ahead: "bg-primary",
  behind: "bg-warning",
  building: "bg-primary",
  hit: "bg-success",
  "no-data": "bg-muted",
};

const weeks = (days: number) => `${Math.max(1, Math.round(days / 7))} wk`;

function progressText(g: LiftGoal, p: GoalProgress, unit: WeightUnit, mode: "member" | "coach"): string {
  const amt = (v: number) => goalAmount(Math.abs(v), g.bodyweight, unit);
  const change = p.change && Math.abs(p.change.amount) >= (g.bodyweight ? 1 : 1) ? `${p.change.amount > 0 ? "Up" : "Down"} ${amt(p.change.amount)} in ${weeks(p.change.days)}` : null;
  if (p.status === "no-data") return mode === "member" ? "Log it in a workout to start tracking." : "Not logged since the goal was set.";
  if (p.status === "on-track") return [change ?? "Holding", g.bodyweight ? "best set of your last two sessions" : "estimated max from your top sets"].join(" · ");
  if (p.status === "slipping") {
    const under = `${amt(g.target - (p.current ?? 0))} under`;
    return [under, change, mode === "member" ? "check sleep and protein, or ask your coach" : null].filter(Boolean).join(" · ");
  }
  const since = g.start !== null && p.current !== null ? `${p.current - g.start >= 0 ? "+" : "−"}${amt(p.current - g.start)} since you set it` : change;
  if (p.status === "ahead") return [since, "ahead of pace (the marker is where you'd need to be today)"].filter(Boolean).join(" · ");
  if (p.status === "behind") return [since, "behind pace (the marker is where you'd need to be today)"].filter(Boolean).join(" · ");
  return since ?? "In progress";
}

export function LiftGoalsPanel({
  goals,
  workouts,
  unit,
  today,
  cutting,
  mode,
  firstName,
  loading,
  error,
  onSave,
  onDelete,
  onMessage,
  note,
}: {
  goals: LiftGoal[] | null;
  workouts: readonly Workout[];
  unit: WeightUnit;
  today: string;
  /** In the cut: new goals start as Hold. */
  cutting: boolean;
  mode: "member" | "coach";
  /** The member's first name, for the coach's wording. */
  firstName?: string;
  loading?: boolean;
  error?: string | null;
  onSave: (input: LiftGoalInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMessage?: () => void;
  /** A line under the title (e.g. "saved on this device"). */
  note?: string;
}) {
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const list = goals ?? [];
  const active = list.filter((g) => !g.achievedOn);
  const hits = list.filter((g) => g.achievedOn).sort((a, b) => b.achievedOn!.localeCompare(a.achievedOn!));
  const canChange = (g: LiftGoal) => (mode === "coach" ? g.setByCoach : !g.setByCoach);
  const full = active.length >= MAX_ACTIVE_GOALS;
  const who = firstName ?? "them";

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex flex-1 items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            {mode === "coach" ? `${firstName ?? "Their"}'s lift goals` : "Lift goals"}
          </CardTitle>
          {editing === null && !full && goals !== null ? (
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <Plus />
              {mode === "coach" ? `Set a goal for ${who}` : "Add goal"}
            </Button>
          ) : null}
        </div>
        <CardDescription>
          {mode === "member"
            ? cutting
              ? `You're cutting, so new goals start as Hold: keeping your strength is the win. ${active.length} of ${MAX_ACTIVE_GOALS} used.`
              : `Hold a number, or build to a new one. ${active.length} of ${MAX_ACTIVE_GOALS} used.`
            : `${active.length} of ${MAX_ACTIVE_GOALS} used. ${who} changes the goals they set; you change the ones you set.`}
          {note ? ` ${note}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {goals === null || loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
        ) : active.length === 0 && editing === null ? (
          <p className="text-sm text-muted-foreground">
            {mode === "member"
              ? "No goals yet. Pick a lift you log and a number to hold or reach; progress fills in from your workouts."
              : `No goals yet. Set one from the lifts ${who} logs, or they can set their own.`}
          </p>
        ) : null}

        {active.map((g) =>
          editing === g.id ? (
            <GoalForm
              key={g.id}
              goal={g}
              workouts={workouts}
              unit={unit}
              today={today}
              cutting={cutting}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                await onSave(input, g.id);
                setEditing(null);
              }}
            />
          ) : (
            <GoalRow
              key={g.id}
              goal={g}
              progress={goalProgress(g, workouts, today)}
              unit={unit}
              mode={mode}
              firstName={who}
              editable={canChange(g)}
              onEdit={() => setEditing(g.id)}
              onDelete={() => onDelete(g.id)}
              onMessage={onMessage}
            />
          ),
        )}

        {editing === "new" ? (
          <GoalForm
            workouts={workouts}
            unit={unit}
            today={today}
            cutting={cutting}
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await onSave(input, null);
              setEditing(null);
            }}
          />
        ) : null}

        {hits.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            {hits.slice(0, 3).map((g) => (
              <p key={g.id} className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1">
                  Hit: {g.name} {goalAmount(g.target, g.bodyweight, unit)} <span className="text-muted-foreground">· {formatShort(g.achievedOn!)}</span>
                </span>
                {canChange(g) ? (
                  <button
                    type="button"
                    onClick={() => void onDelete(g.id)}
                    aria-label={`Remove the ${g.name} goal`}
                    className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </p>
            ))}
            <p className="text-[12px] text-muted-foreground">
              {hits.length} goal{hits.length === 1 ? "" : "s"} hit
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GoalRow({
  goal: g,
  progress: p,
  unit,
  mode,
  firstName,
  editable,
  onEdit,
  onDelete,
  onMessage,
}: {
  goal: LiftGoal;
  progress: GoalProgress;
  unit: WeightUnit;
  mode: "member" | "coach";
  firstName: string;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onMessage?: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const s = STATUS[p.status];
  const kind = g.kind === "hold" ? "Hold" : g.deadline ? `Build · by ${formatShort(g.deadline)}` : "Build";
  const late = p.status === "slipping" || p.status === "behind";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-semibold">{g.name}</p>
        <Badge variant={s.variant} className="px-2 py-0 text-[11px]">
          {kind} · {s.label}
        </Badge>
        <p className="tabular ml-auto text-sm">
          <span className="font-semibold">{p.current === null ? "—" : goalAmount(p.current, g.bodyweight, unit)}</span>{" "}
          <span className="text-muted-foreground">
            / {g.kind === "hold" ? "keep " : ""}
            {goalAmount(g.target, g.bodyweight, unit)}
            {g.kind === "hold" ? "+" : ""}
          </span>
        </p>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <div className={cn("h-full rounded-full", BAR[p.status])} style={{ width: `${Math.round(p.fillPct)}%` }} />
        {p.pacePct !== null ? (
          <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70" style={{ left: `${Math.round(p.pacePct)}%` }} title="Where you'd need to be today" />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn("min-w-0 flex-1 text-[12px]", late ? "text-warning" : "text-muted-foreground")}>{progressText(g, p, unit, mode)}</p>
        <span className="text-[11px] text-muted-foreground">
          {mode === "member" ? (g.setByCoach ? "Set by your coach" : "") : g.setByCoach ? "Set by you" : `Set by ${firstName}`}
        </span>
        {mode === "coach" && late && onMessage ? (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onMessage}>
            <MessageCircle />
            Message {firstName}
          </Button>
        ) : null}
        {editable ? (
          <span className="flex gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Change the ${g.name} goal`}
              className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onDelete().finally(() => setBusy(false));
              }}
              aria-label={`Remove the ${g.name} goal`}
              className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GoalForm({
  goal,
  workouts,
  unit,
  today,
  cutting,
  onSave,
  onCancel,
}: {
  goal?: LiftGoal;
  workouts: readonly Workout[];
  unit: WeightUnit;
  today: string;
  cutting: boolean;
  onSave: (input: LiftGoalInput) => Promise<void>;
  onCancel: () => void;
}) {
  const options = React.useMemo(() => liftOptions(workouts), [workouts]);
  const [exerciseId, setExerciseId] = React.useState(goal?.exerciseId ?? options[0]?.exerciseId ?? "");
  const [kind, setKind] = React.useState<LiftGoalKind>(goal?.kind ?? (cutting ? "hold" : "build"));
  const lift = options.find((o) => o.exerciseId === exerciseId) ?? null;
  const shown = (lb: number, bodyweight: boolean) => String(bodyweight ? Math.round(lb) : Math.round(fromLb(lb, unit) * 2) / 2);
  const [target, setTarget] = React.useState(() => (goal ? shown(goal.target, goal.bodyweight) : lift ? shown(suggestTarget(kind, lift.current, lift.bodyweight, unit), lift.bodyweight) : ""));
  const [deadline, setDeadline] = React.useState(goal?.deadline ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const bodyweight = lift?.bodyweight ?? goal?.bodyweight ?? false;

  // A new lift or kind suggests a new number (until they type their own).
  const [typed, setTyped] = React.useState(Boolean(goal));
  React.useEffect(() => {
    if (typed || !lift) return;
    setTarget(shown(suggestTarget(kind, lift.current, lift.bodyweight, unit), lift.bodyweight));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggest on choice changes only
  }, [exerciseId, kind]);

  if (!goal && options.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm text-muted-foreground">Log a lift in a workout first: goals are set from the lifts with sessions.</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  const save = async () => {
    setError(null);
    const n = Number(target);
    if (!Number.isFinite(n) || n <= 0) return setError(bodyweight ? "Enter the reps to aim for." : "Enter the weight to aim for.");
    const targetLb = bodyweight ? Math.round(n) : toLb(n, unit);
    const name = lift?.name ?? goal?.name ?? "Exercise";
    if (kind === "build" && lift && targetLb <= lift.current) return setError(`You're already at ${goalAmount(lift.current, bodyweight, unit)}: aim higher, or pick Hold.`);
    setBusy(true);
    try {
      await onSave({
        exerciseId: lift?.exerciseId ?? goal!.exerciseId,
        name,
        bodyweight,
        kind,
        target: targetLb,
        start: goal?.start ?? lift?.current ?? null,
        deadline: kind === "build" && deadline ? deadline : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm font-semibold">{goal ? "Change goal" : "Add a goal"}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-lift`}>Lift</Label>
          <select
            id={`${id}-lift`}
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {goal && !options.some((o) => o.exerciseId === goal.exerciseId) ? <option value={goal.exerciseId}>{goal.name}</option> : null}
            {options.map((o) => (
              <option key={o.exerciseId} value={o.exerciseId}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Type</span>
          <SegmentedControl
            ariaLabel="Goal type"
            size="sm"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "hold" as const, label: cutting ? "Hold (cutting)" : "Hold" },
              { value: "build" as const, label: "Build" },
            ]}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-target`}>
            {kind === "hold" ? "Keep at least" : "Reach"} ({bodyweight ? "reps" : unit})
          </Label>
          <Input
            id={`${id}-target`}
            inputMode="decimal"
            value={target}
            onChange={(e) => {
              setTyped(true);
              setTarget(e.target.value.replace(/[^\d.]/g, ""));
            }}
          />
        </div>
        {kind === "build" ? (
          <div className="space-y-1">
            <Label htmlFor={`${id}-date`}>By (optional)</Label>
            <Input id={`${id}-date`} type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        ) : null}
      </div>
      {lift ? (
        <p className="text-[12px] text-muted-foreground">
          {bodyweight ? "Best set now" : "Estimated max now"}: {goalAmount(lift.current, bodyweight, unit)}.{" "}
          {kind === "hold" ? `Hold goals suggest a little under it.` : "Build goals suggest a step over it."}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save goal
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------- member --------------------------------- */

const LOCAL_KEY = "prep-calculator:lift-goals:v1";

function readLocal(): LiftGoal[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as LiftGoal[]).filter((g) => typeof g?.id === "string" && typeof g?.exerciseId === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(goals: LiftGoal[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(goals));
  } catch {
    /* kept until the page closes */
  }
}

/**
 * Training → Workouts → Lift goals. Saved to their account inside Whop (so
 * their coach sees them); outside Whop, on this device only.
 */
export function MemberLiftGoals({ workouts, unit, today, cutting, cloud }: { workouts: readonly Workout[]; unit: WeightUnit; today: string; cutting: boolean; cloud: boolean }) {
  const [goals, setGoals] = React.useState<LiftGoal[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!cloud) {
      setGoals(readLocal());
      return;
    }
    let live = true;
    call<{ goals: LiftGoal[] }>("/api/lift-goals")
      .then((r) => live && setGoals(r.goals))
      .catch(() => live && (setGoals([]), setError("Couldn't load your goals. They'll show next time.")));
    return () => {
      live = false;
    };
  }, [cloud]);

  // On this device, a Build goal is hit the first time a session reaches it (the server does this inside Whop).
  React.useEffect(() => {
    if (cloud || !goals) return;
    let changed = false;
    const next = goals.map((g) => {
      if (g.kind !== "build" || g.achievedOn) return g;
      const reached = goalSeries(workouts, g.exerciseId, g.bodyweight).find((p) => p.date >= g.createdOn && p.value >= g.target);
      if (!reached) return g;
      changed = true;
      return { ...g, achievedOn: reached.date };
    });
    if (changed) {
      setGoals(next);
      writeLocal(next);
    }
  }, [cloud, goals, workouts]);

  const save = async (input: LiftGoalInput, id: string | null) => {
    setError(null);
    if (!cloud) {
      const list = goals ?? [];
      if (!id && list.filter((g) => !g.achievedOn).length >= MAX_ACTIVE_GOALS) throw new Error(`Up to ${MAX_ACTIVE_GOALS} goals at a time. Remove one first.`);
      const next = id
        ? list.map((g) => (g.id === id ? { ...g, ...input, start: g.start, achievedOn: null } : g))
        : [{ ...input, id: crypto.randomUUID().replace(/-/g, ""), createdOn: today, setByCoach: false, achievedOn: null }, ...list];
      setGoals(next);
      writeLocal(next);
      return;
    }
    const r = await call<{ goals: LiftGoal[] }>(id ? `/api/lift-goals/${id}` : "/api/lift-goals", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({ goal: input, today }),
    });
    setGoals(r.goals);
  };
  const remove = async (id: string) => {
    setError(null);
    if (!cloud) {
      const next = (goals ?? []).filter((g) => g.id !== id);
      setGoals(next);
      writeLocal(next);
      return;
    }
    try {
      const r = await call<{ goals: LiftGoal[] }>(`/api/lift-goals/${id}`, { method: "DELETE" });
      setGoals(r.goals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.");
    }
  };

  return (
    <LiftGoalsPanel
      goals={goals}
      workouts={workouts}
      unit={unit}
      today={today}
      cutting={cutting}
      mode="member"
      error={error}
      onSave={save}
      onDelete={remove}
      note={cloud ? undefined : "Saved on this device only: open the app in Whop to keep them with your account."}
    />
  );
}

/* --------------------------------- coach --------------------------------- */

/** A member's page → Training: their goals, and the ones you set for them. */
export function CoachLiftGoals({
  companyId,
  memberId,
  memberName,
  workouts,
  unit,
  today,
  cutting,
  onMessage,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  /** Their workouts, once loaded. */
  workouts: readonly Workout[] | null;
  unit: WeightUnit;
  today: string;
  cutting: boolean;
  onMessage: () => void;
}) {
  const first = memberName.split(" ")[0] || memberName;
  const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;
  const [goals, setGoals] = React.useState<LiftGoal[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    call<{ goals: LiftGoal[] }>(`/api/coach/lift-goals?${qs}`)
      .then((r) => live && setGoals(r.goals))
      .catch((e: unknown) => live && (setGoals([]), setError(e instanceof Error ? e.message : "Couldn't load their goals.")));
    return () => {
      live = false;
    };
  }, [qs]);
  return (
    <LiftGoalsPanel
      goals={goals}
      workouts={workouts ?? []}
      loading={workouts === null}
      unit={unit}
      today={today}
      cutting={cutting}
      mode="coach"
      firstName={first}
      error={error}
      onMessage={onMessage}
      onSave={async (input, id) => {
        setError(null);
        const r = await call<{ goals: LiftGoal[] }>(id ? `/api/coach/lift-goals/${id}` : "/api/coach/lift-goals", {
          method: id ? "PUT" : "POST",
          body: JSON.stringify({ company: companyId, member: memberId, goal: input, today }),
        });
        setGoals(r.goals);
      }}
      onDelete={async (id) => {
        setError(null);
        try {
          const r = await call<{ goals: LiftGoal[] }>(`/api/coach/lift-goals/${id}?${qs}`, { method: "DELETE" });
          setGoals(r.goals);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't remove it.");
        }
      }}
    />
  );
}
