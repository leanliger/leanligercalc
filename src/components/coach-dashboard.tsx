"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  ClipboardList,
  Lock,
  ArrowLeft,
  EyeOff,
  Flame,
  Inbox,
  MessageSquare,
  RefreshCw,
  Send,
  Scale,
  Search,
  Star,
  StickyNote,
  Sun,
  Utensils,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsMenu } from "@/components/settings-menu";
import { ProgressChart } from "@/components/progress-chart";
import { ConsistencyCard } from "@/components/consistency-card";
import { MeasurementsCard } from "@/components/measurements-card";
import { PhotoGallery } from "@/components/photos-card";
import { ConfirmButton } from "@/components/confirm-button";
import { CoachAssignPanel } from "@/components/coach-assign";
import { MemberProgramCard } from "@/components/coach-member-program";
import { PhysiqueFocusCard } from "@/components/physique-focus-card";
import { CoachComparisonCard, CoachTestimonials } from "@/components/physique-compare-card";
import { MemberWorkoutsCard } from "@/components/coach-member-workouts";
import { CoachReportPanel } from "@/components/coach-report";
import { MemberTagsCard, TagChips, loadTags, type TagsData } from "@/components/member-tags";
import { TAG_CLASS } from "@/lib/member-tags";
import { CoachNotesCard, FLAG_VARIANT, MemberCheckinsCard, MemberMacrosCard } from "@/components/coach-tools";
import { Avatar, CoachNav, TodayLanes, WeekStrip, isAtRisk } from "@/components/coach-today";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  FLAG_LABELS,
  OVERVIEW_DAYS,
  describeDaysAgo,
  sortForAttention,
  summarizeMember,
  type CoachMemberData,
  type CoachOverview,
  type Flag,
  type MemberSummary,
  HEALTH_PARTS,
  healthZone,
  type HealthScore,
} from "@/lib/coach";
import type { MemberSharing } from "@/lib/sharing";
import { formatShort, todayISO } from "@/lib/dates";
import { ZONES, type Zone } from "@/lib/habits";
import { PAUSE_REASON_LABELS, type PausePeriod } from "@/lib/pause";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/** The list's quick filters; "risk" is any flag but a check-in waiting on the coach. */
type Filter = "all" | "risk" | "ontrack" | Flag;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "risk", label: "At risk" },
  { value: "reply", label: "Check-ins to review" },
  { value: "ontrack", label: "On track" },
];

/** The rest, one at a time from a menu. */
const FLAG_FILTERS = ["behind", "red", "no-weigh-in", "no-workouts", "checkin", "inactive", "no-plan"] as const satisfies readonly Flag[];

function matchesFilter(m: MemberSummary, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "risk") return isAtRisk(m);
  if (f === "ontrack") return !isAtRisk(m);
  return m.flags.includes(f);
}

/** The page's width: a little wider than `container`, for the menu, list and detail side by side. */
const WRAP = "mx-auto w-full max-w-[1440px] px-4";

const ZONE_TEXT: Record<Zone, string> = { green: "text-success", yellow: "text-warning", red: "text-destructive" };

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "default" }> = {
  "on-track": { label: "On track", variant: "success" },
  behind: { label: "Behind plan", variant: "warning" },
  ahead: { label: "Ahead of plan", variant: "warning" },
  collecting: { label: "Collecting data", variant: "secondary" },
  waiting: { label: "Settling", variant: "default" },
  "no-data": { label: "No weigh-ins", variant: "secondary" },
  "not-started": { label: "Not started", variant: "secondary" },
  "no-plan": { label: "No plan", variant: "secondary" },
};

function weight(lb: number, unit: WeightUnit, decimals = 1): string {
  return `${(Math.round(fromLb(lb, unit) * 10 ** decimals) / 10 ** decimals).toLocaleString()} ${unit}`;
}

function signedWeight(lb: number, unit: WeightUnit): string {
  const v = Math.round(fromLb(lb, unit) * 10) / 10;
  return v === 0 ? `0 ${unit}` : `${v > 0 ? "+" : "−"}${Math.abs(v)} ${unit}`;
}

/* ================================== page ================================== */

export function CoachDashboard({ companyId }: { companyId: string }) {
  const [overview, setOverview] = React.useState<CoachOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<Filter>("all");
  // The whop's member tags, and the tag the list is filtered to.
  const [tagsData, setTagsData] = React.useState<TagsData | null>(null);
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  // List order: most urgent first, lowest health score first, or by name.
  const [sort, setSort] = React.useState<"attention" | "health" | "name">("attention");
  const [query, setQuery] = React.useState("");
  // ?member=user_… opens straight onto one member (bookmarkable).
  const [selected, setSelected] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("member"),
  );
  const [unit, setUnit] = React.useState<WeightUnit>("lb");
  // Members (progress) or Assign (send programs and habit sets).
  const [view, setView] = React.useState<"members" | "assign" | "testimonials">("members");
  const [today] = React.useState(() => todayISO());
  // The open member's tab.
  const [tab, setTab] = React.useState<DetailTab>("overview");

  // Keep the open member in the address bar, so it can be bookmarked or shared with another admin.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("member", selected);
    else url.searchParams.delete("member");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [selected]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/overview?company=${encodeURIComponent(companyId)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      const body = isJson ? ((await res.json()) as CoachOverview & { error?: string }) : null;
      if (!res.ok || !body) {
        setError(
          res.status === 401
            ? "Open the coach dashboard from your Whop dashboard (Apps → Lean Stature System) so Whop can confirm it's you."
            : (body?.error ?? "Couldn't load the dashboard. Try again."),
        );
      } else {
        setOverview(body);
        loadTags(companyId)
          .then(setTagsData)
          .catch(() => {
            /* tags are extra: the dashboard works without them */
          });
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Only members who share their progress have data; the rest are listed separately.
  const summaries = React.useMemo(
    () =>
      overview
        ? sortForAttention(overview.members.filter((m) => m.sharing.state === "shared").map((m) => summarizeMember(m, today)))
        : [],
    [overview, today],
  );
  const notSharing = React.useMemo(
    () =>
      (overview?.members ?? [])
        .filter((m) => m.sharing.state !== "shared")
        .sort((a, b) => SHARING_ORDER[a.sharing.state] - SHARING_ORDER[b.sharing.state] || memberName(a).localeCompare(memberName(b))),
    [overview],
  );

  /** Replace one member's sharing status after asking or stopping. */
  const setSharing = (userId: string, sharing: MemberSharing, clearData = false) =>
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            members: prev.members.map((m) =>
              m.userId !== userId
                ? m
                : clearData
                  ? { ...m, sharing, plan: null, weighIns: [], habitLogs: [], foodDays: [], measurements: [], photos: null }
                  : { ...m, sharing },
            ),
          }
        : prev,
    );

  const q = query.trim().toLowerCase();
  const filtered = summaries.filter((m) => {
    if (q && !`${m.data.name ?? ""} ${m.data.username ?? ""}`.toLowerCase().includes(q)) return false;
    if (tagFilter && !(tagsData?.members[m.data.userId] ?? []).includes(tagFilter)) return false;
    return matchesFilter(m, filter);
  });
  const shown =
    sort === "health"
      ? [...filtered].sort((a, b) => (a.health?.score ?? 101) - (b.health?.score ?? 101))
      : sort === "name"
        ? [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName))
        : filtered;
  const current = summaries.find((m) => m.data.userId === selected) ?? null;
  const currentNotSharing = current ? null : (notSharing.find((m) => m.userId === selected) ?? null);
  const shownNotSharing = notSharing.filter((m) => !q || `${m.name ?? ""} ${m.username ?? ""}`.toLowerCase().includes(q));
  const anyOpen = Boolean(current || currentNotSharing);

  const counts = {
    total: summaries.length,
    attention: summaries.filter((m) => m.flags.length > 0).length,
    loggedWeek: summaries.filter((m) => m.daysSinceLog !== null && m.daysSinceLog < 7).length,
    workouts: summaries.reduce((s, m) => s + m.workouts7, 0),
    training: summaries.filter((m) => m.workouts7 > 0).length,
    checkedIn: summaries.filter((m) => m.checkedIn).length,
    toReview: summaries.filter((m) => m.flags.includes("reply")).length,
  };
  const scored = summaries.filter((m) => m.week.percent !== null);
  const avgWeek = scored.length > 0 ? Math.round(scored.reduce((s, m) => s + (m.week.percent ?? 0), 0) / scored.length) : null;

  /** Open a member on a tab; on narrow screens the detail replaces the list, so start at the top. */
  const openMember = (id: string, t: DetailTab = "overview") => {
    setSelected(id);
    setTab(t);
    if (window.innerWidth < 1280) window.scrollTo({ top: 0 });
  };
  const showMembers = (f: Filter) => {
    setView("members");
    setFilter(f);
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className={cn(WRAP, "flex h-16 items-center gap-3")}>
          <SettingsMenu unit={unit} onUnitChange={setUnit} />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">Coach dashboard</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">Lean Stature System · your members at a glance</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      <div className={cn(WRAP, "py-6 lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:items-start lg:gap-6")}>
        {overview ? (
          <CoachNav
            className={cn("mb-5 lg:mb-0", anyOpen && view === "members" && "hidden lg:block")}
            items={[
              {
                id: "today",
                label: "Today",
                icon: <Sun />,
                active: view === "members" && filter !== "reply",
                onSelect: () => showMembers("all"),
              },
              {
                id: "checkins",
                label: "Check-ins",
                icon: <Inbox />,
                count: counts.toReview,
                active: view === "members" && filter === "reply",
                onSelect: () => showMembers("reply"),
              },
              {
                id: "assign",
                label: "Programs & habits",
                icon: <ClipboardList />,
                active: view === "assign",
                onSelect: () => setView("assign"),
              },
              {
                id: "testimonials",
                label: "Testimonials",
                icon: <Star />,
                active: view === "testimonials",
                onSelect: () => setView("testimonials"),
              },
            ]}
            footer={overview.photoStorage ? <PhotoStorageLine {...overview.photoStorage} /> : null}
          />
        ) : (
          <div aria-hidden className="hidden lg:block" />
        )}

        <main className="min-w-0 space-y-5">
          {error ? (
            <Card className="border-destructive/40">
              <CardContent className="flex gap-3 p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-2">
                  <p className="text-sm">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    Try again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : !overview ? (
            <div aria-busy="true" aria-label="Loading members" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-lg bg-muted/30" />
                ))}
              </div>
              <div className="h-20 animate-pulse rounded-lg bg-muted/30" />
              <div className="h-96 animate-pulse rounded-lg bg-muted/30" />
            </div>
          ) : view === "testimonials" ? (
            <CoachTestimonials
              companyId={companyId}
              names={new Map(overview.members.map((m) => [m.userId, m.name?.trim() || (m.username ? `@${m.username}` : "Member")]))}
              unit={unit}
            />
          ) : view === "assign" ? (
            <CoachAssignPanel companyId={companyId} members={overview.members} tags={tagsData} />
          ) : (
            <>
              <div className={cn("space-y-5", anyOpen && "hidden xl:block")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Today</h2>
                    <p className="text-sm text-muted-foreground">
                      {new Date(`${today}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} ·{" "}
                      {counts.total} of {overview.members.length} member{overview.members.length === 1 ? "" : "s"} sharing with you
                      {counts.attention > 0 ? ` · ${counts.attention} need${counts.attention === 1 ? "s" : ""} you` : ""}
                    </p>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    Updated {new Date(overview.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                {summaries.length > 0 ? (
                  <>
                    <TodayLanes members={summaries} onOpen={openMember} onShowAll={showMembers} />
                    <WeekStrip
                      items={[
                        { label: "Logged this week", value: counts.loggedWeek, of: `of ${counts.total}`, sub: "any log in the last 7 days" },
                        {
                          label: "Avg adherence",
                          value: avgWeek === null ? "—" : `${avgWeek}%`,
                          sub: scored.length > 0 ? `habit scorecard, ${scored.length} scored` : "no habit logs this week",
                        },
                        {
                          label: "Workouts",
                          value: counts.workouts,
                          sub: `last 7 days, ${counts.training} member${counts.training === 1 ? "" : "s"} training`,
                        },
                        {
                          label: "Check-ins",
                          value: counts.checkedIn,
                          of: `of ${counts.total}`,
                          sub: counts.toReview > 0 ? `${counts.toReview} waiting on you` : "last 7 days, all reviewed",
                          emphasis: counts.toReview > 0,
                        },
                      ]}
                    />
                  </>
                ) : null}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
                {/* ------------------------------ list ------------------------------ */}
                <section aria-labelledby="coach-members" className={cn("min-w-0 space-y-3", anyOpen && "hidden xl:block")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="coach-members" className="text-base font-semibold">
                      Members
                    </h2>
                    <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
                      {FILTERS.map((f) => {
                        const n = summaries.filter((m) => matchesFilter(m, f.value)).length;
                        return (
                          <button
                            key={f.value}
                            type="button"
                            role="radio"
                            aria-checked={filter === f.value}
                            onClick={() => setFilter(f.value)}
                            className={cn(
                              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              filter === f.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/40",
                            )}
                          >
                            {f.label} <span className="tabular opacity-80">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-[12rem] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <label htmlFor="coach-search" className="sr-only">
                        Search members
                      </label>
                      <Input
                        id="coach-search"
                        type="search"
                        placeholder="Search by name or username"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <label className="sr-only" htmlFor="coach-flag">
                      Filter by flag
                    </label>
                    <select
                      id="coach-flag"
                      value={(FLAG_FILTERS as readonly string[]).includes(filter) ? filter : ""}
                      onChange={(e) => setFilter((e.target.value || "all") as Filter)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Any flag</option>
                      {FLAG_FILTERS.map((f) => (
                        <option key={f} value={f}>
                          {FLAG_LABELS[f]} ({summaries.filter((m) => m.flags.includes(f)).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <SegmentedControl
                      ariaLabel="Sort members"
                      size="sm"
                      value={sort}
                      onValueChange={setSort}
                      options={[
                        { value: "attention" as const, label: "Most urgent" },
                        { value: "health" as const, label: "Health score" },
                        { value: "name" as const, label: "Name" },
                      ]}
                      className="w-auto"
                    />
                    {tagsData && tagsData.tags.length > 0 ? (
                      <div role="radiogroup" aria-label="Filter by tag" className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] text-muted-foreground">Tags:</span>
                        {tagsData.tags.map((t) => {
                          const n = summaries.filter((m) => (tagsData.members[m.data.userId] ?? []).includes(t.id)).length;
                          const on = tagFilter === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setTagFilter(on ? null : t.id)}
                              className={cn(
                                "rounded-full border px-2.5 py-0.5 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on ? TAG_CLASS[t.color] : "border-border text-muted-foreground hover:bg-muted/40",
                              )}
                            >
                              {t.name} <span className="tabular opacity-80">{n}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {summaries.length === 0 ? (
                    <EmptyNote>
                      {overview.members.length === 0
                        ? "No members yet. Once people join your whop, they'll appear here."
                        : "Nobody is sharing their progress with you yet. Ask a member below, or they can turn on sharing in their app's Settings."}
                    </EmptyNote>
                  ) : shown.length === 0 ? (
                    <EmptyNote>Nobody matches this filter.</EmptyNote>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                      <div
                        aria-hidden
                        className={cn(
                          "hidden gap-x-3 border-b border-l-2 border-b-border border-l-transparent px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid",
                          ROW_GRID,
                        )}
                      >
                        <span>Member</span>
                        <span className="text-center">Health</span>
                        <span className="text-right">Week</span>
                        <span className="text-right">Wt / wk</span>
                        <span>Check-in</span>
                      </div>
                      <ul className="divide-y divide-border">
                        {shown.map((m) => (
                          <li key={m.data.userId}>
                            <MemberRow
                              m={m}
                              unit={unit}
                              selected={m.data.userId === selected}
                              onOpen={() => openMember(m.data.userId)}
                              tags={<TagChips tags={tagsData?.tags ?? []} ids={tagsData?.members[m.data.userId]} />}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notSharing.length > 0 ? (
                    <NotSharingList
                      members={shownNotSharing}
                      total={notSharing.length}
                      selected={selected}
                      companyId={companyId}
                      today={today}
                      onOpen={(id) => openMember(id)}
                      onChange={setSharing}
                    />
                  ) : null}

                  <p className="text-[12px] text-muted-foreground">
                    Read-only: members&apos; plans and logs can only be changed from their own app. You only see members who share their
                    progress with you.
                  </p>
                </section>

                {/* ----------------------------- detail ----------------------------- */}
                <div className={cn("min-w-0", !anyOpen && "hidden xl:block")}>
                  {current ? (
                    <MemberDetail
                      tags={
                        <MemberTagsCard companyId={companyId} memberId={current.data.userId} data={tagsData} onChange={setTagsData} />
                      }
                      m={current}
                      unit={unit}
                      today={today}
                      companyId={companyId}
                      tab={tab}
                      onTab={setTab}
                      onBack={() => setSelected(null)}
                      onStopped={(sharing) => {
                        setSharing(current.data.userId, sharing, true);
                        setSelected(null);
                      }}
                    />
                  ) : currentNotSharing ? (
                    <NotSharingDetail
                      m={currentNotSharing}
                      companyId={companyId}
                      today={today}
                      onBack={() => setSelected(null)}
                      onChange={setSharing}
                    />
                  ) : (
                    <EmptyNote>Select a member to see their progress, check-ins, food and training.</EmptyNote>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * How much of the app-wide progress photo storage is used. Uploads stop at the
 * cap (PHOTO_STORAGE_CAP_BYTES), so this tells the coach before members hit it.
 */
function PhotoStorageLine({ usedBytes, capBytes }: { usedBytes: number; capBytes: number }) {
  const gb = (b: number) => (b / 1024 ** 3).toFixed(b < 1024 ** 3 ? 2 : 1);
  const share = capBytes > 0 ? usedBytes / capBytes : 0;
  const full = share >= 1;
  const nearly = share >= 0.8;
  return (
    <p className={cn("text-xs", nearly ? "text-warning" : "text-muted-foreground")}>
      Progress photo storage: {gb(usedBytes)} of {gb(capBytes)} GB used, across everyone using the app.
      {full ? " Full: members can't add new photos until space is freed or the cap is raised." : nearly ? " Nearly full." : ""}
    </p>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Member · health · week · weight per week · check-in; on phones the numbers move under the name. */
const ROW_GRID = "grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_3rem_3.5rem_4.75rem_5.5rem]";

function checkinStatus(m: MemberSummary): { label: string; className: string } {
  if (m.flags.includes("reply")) return { label: "To review", className: "font-semibold text-primary" };
  if (m.checkedIn) return { label: "Done", className: "text-success" };
  return { label: "None yet", className: "text-muted-foreground" };
}

function MemberRow({
  m,
  unit,
  selected,
  onOpen,
  tags,
}: {
  m: MemberSummary;
  unit: WeightUnit;
  selected: boolean;
  onOpen: () => void;
  /** Their tag chips. */
  tags?: React.ReactNode;
}) {
  const week = m.week.percent === null ? "—" : `${m.week.percent}%`;
  const weekClass = m.week.zone ? ZONE_TEXT[m.week.zone] : "";
  const change = m.weekChangeLb === null ? "—" : signedWeight(m.weekChangeLb, unit);
  const checkin = checkinStatus(m);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid w-full items-center gap-x-3 border-l-2 px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        ROW_GRID,
        selected ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/40",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={m.displayName} url={m.data.avatarUrl} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">{m.displayName}</span>
            {m.streak > 0 ? (
              <span className="tabular inline-flex shrink-0 items-center gap-0.5 text-xs text-primary">
                <Flame className="h-3 w-3" aria-hidden />
                {m.streak}
                <span className="sr-only">-day streak</span>
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[m.data.username && m.data.name ? `@${m.data.username}` : null, `last log ${describeDaysAgo(m.daysSinceLog)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="tabular flex flex-wrap gap-x-3 text-xs text-muted-foreground sm:hidden">
            <span>
              Week <span className={cn("font-semibold", weekClass)}>{week}</span>
            </span>
            <span>{change} / wk</span>
            <span className={checkin.className}>Check-in: {checkin.label.toLowerCase()}</span>
          </span>
          {tags}
          {m.flags.length > 0 || m.paused ? (
            <span className="flex flex-wrap gap-1">
              {m.paused ? (
                <Badge variant="secondary" className="px-2 py-0 text-[11px]">
                  {pausedLabel(m.paused)}
                </Badge>
              ) : null}
              {m.flags.map((f) => (
                <Badge key={f} variant={FLAG_VARIANT[f]} className="px-2 py-0 text-[11px]">
                  {FLAG_LABELS[f]}
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex justify-center">
        <HealthPill health={m.health} />
      </span>
      <span className={cn("tabular hidden text-right text-sm font-semibold sm:block", weekClass)}>
        <span className="sr-only">Week </span>
        {week}
      </span>
      <span className="tabular hidden text-right text-sm sm:block">
        {change}
        <span className="sr-only"> a week</span>
      </span>
      <span className={cn("hidden text-sm sm:block", checkin.className)}>
        <span className="sr-only">Check-in: </span>
        {checkin.label}
      </span>
    </button>
  );
}

const ZONE_RING: Record<Zone, string> = {
  green: "border-success/50 bg-success/10 text-success",
  yellow: "border-warning/50 bg-warning/10 text-warning",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
};

/** The client health score as a small coloured number. */
function HealthPill({ health, large }: { health: HealthScore | null; large?: boolean }) {
  if (!health) return null;
  return (
    <span
      className={cn(
        "tabular flex shrink-0 flex-col items-center justify-center rounded-full border font-semibold",
        large ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm",
        ZONE_RING[healthZone(health.score)],
      )}
      title={`Health score ${health.score}: logging ${health.logging}/${HEALTH_PARTS.logging}, adherence ${health.adherence}/${HEALTH_PARTS.adherence}, trend ${health.trend}/${HEALTH_PARTS.trend}`}
    >
      {health.score}
      <span className="sr-only"> health score out of 100</span>
    </span>
  );
}

/* ============================== coach access ============================== */

const SHARING_ORDER: Record<MemberSharing["state"], number> = { requested: 0, declined: 1, off: 2, shared: 3 };

function memberName(d: Pick<CoachMemberData, "name" | "username">): string {
  return d.name?.trim() || (d.username ? `@${d.username}` : "Member");
}

async function sharingCall<T>(action: "request" | "stop", company: string, member: string): Promise<T> {
  const res = await fetch(`/api/coach/sharing/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ company, member }),
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

function sharingText(s: MemberSharing): string {
  if (s.state === "requested") return `Asked ${s.since ? formatShort(s.since.slice(0, 10)) : ""}`.trim();
  if (s.state === "declined") return `Said not now${s.askAgainFrom ? ` · ask again ${formatShort(s.askAgainFrom)}` : ""}`;
  return "Not sharing";
}

/** Ask a member to share, or cancel a request that hasn't been answered. */
function AskButton({
  m,
  companyId,
  today,
  onChange,
  size = "sm",
}: {
  m: CoachMemberData;
  companyId: string;
  today: string;
  onChange: (userId: string, sharing: MemberSharing) => void;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const waiting = m.sharing.state === "declined" && m.sharing.askAgainFrom !== null && today < m.sharing.askAgainFrom;
  const act = async (action: "request" | "stop") => {
    setBusy(true);
    setNote(null);
    try {
      const r = await sharingCall<{ sharing: MemberSharing; notified?: boolean }>(action, companyId, m.userId);
      onChange(m.userId, r.sharing);
      if (action === "request") setNote(r.notified ? "Sent: they'll get a Whop notification." : "Asked: they'll see it next time they open the app.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-col items-end gap-1">
      {m.sharing.state === "requested" ? (
        <Button variant="ghost" size={size} className="h-8 px-2 text-muted-foreground" disabled={busy} onClick={() => void act("stop")}>
          Cancel request
        </Button>
      ) : (
        <Button variant="outline" size={size} className="h-8 px-2.5" disabled={busy || waiting} onClick={() => void act("request")}>
          <Send />
          Ask to share
        </Button>
      )}
      {note ? (
        <span role="status" className="max-w-[14rem] text-right text-[12px] text-muted-foreground">
          {note}
        </span>
      ) : null}
    </span>
  );
}

function NotSharingList({
  members,
  total,
  selected,
  companyId,
  today,
  onOpen,
  onChange,
}: {
  members: CoachMemberData[];
  total: number;
  selected: string | null;
  companyId: string;
  today: string;
  onOpen: (id: string) => void;
  onChange: (userId: string, sharing: MemberSharing) => void;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          Not sharing with you <span className="tabular font-normal text-muted-foreground">({total})</span>
        </p>
        <p className="text-xs text-muted-foreground">
          You can see their name only. Ask, and they choose whether to share; they can stop any time.
        </p>
      </div>
      {members.length === 0 ? (
        <EmptyNote>Nobody matches your search.</EmptyNote>
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li
              key={m.userId}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                m.userId === selected ? "border-primary/50 bg-primary/5" : "border-border",
              )}
            >
              <button type="button" onClick={() => onOpen(m.userId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={memberName(m)} url={m.avatarUrl} size="h-8 w-8" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{memberName(m)}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{sharingText(m.sharing)}</span>
                </span>
              </button>
              <AskButton m={m} companyId={companyId} today={today} onChange={onChange} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotSharingDetail({
  m,
  companyId,
  today,
  onBack,
  onChange,
}: {
  m: CoachMemberData;
  companyId: string;
  today: string;
  onBack: () => void;
  onChange: (userId: string, sharing: MemberSharing) => void;
}) {
  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="h-8 px-2 lg:hidden" onClick={onBack}>
        <ArrowLeft />
        All members
      </Button>
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Avatar name={memberName(m)} url={m.avatarUrl} size="h-12 w-12" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{memberName(m)}</h2>
              <p className="text-xs text-muted-foreground">{sharingText(m.sharing)}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {m.sharing.state === "requested"
              ? "You've asked. Once they tap Share in their app, their weigh-ins, habits, food totals and plan show up here."
              : m.sharing.state === "declined"
                ? "They chose not to share for now. You can ask again after a week, or they can turn sharing on from their app's Settings."
                : "They haven't shared their progress with you. Ask, and they'll get a notification to choose Share or Not now."}
          </p>
          <AskButton m={m} companyId={companyId} today={today} onChange={onChange} size="default" />
        </CardContent>
      </Card>
    </div>
  );
}

/** "Paused · sick to Oct 15" */
function pausedLabel(p: PausePeriod): string {
  return `Paused · ${PAUSE_REASON_LABELS[p.reason].toLowerCase()} to ${formatShort(p.to)}`;
}

/* ================================= detail ================================= */

type DetailTab = "overview" | "checkins" | "food" | "training" | "body" | "notes";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "checkins", label: "Check-ins" },
  { id: "food", label: "Food" },
  { id: "training", label: "Training" },
  { id: "body", label: "Body" },
  { id: "notes", label: "Notes" },
];

function MemberDetail({
  m,
  unit,
  today,
  companyId,
  tab,
  onTab,
  onBack,
  onStopped,
  tags,
}: {
  /** Their tags card. */
  tags?: React.ReactNode;
  m: MemberSummary;
  unit: WeightUnit;
  today: string;
  companyId: string;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onBack: () => void;
  onStopped: (sharing: MemberSharing) => void;
}) {
  const [stopError, setStopError] = React.useState<string | null>(null);
  // Bumped when the physique focus card sends an edit, so the program card shows it.
  const [programVersion, setProgramVersion] = React.useState(0);
  const p = m.progress;
  const status = STATUS_LABEL[p?.status ?? (m.hasPlan ? "no-data" : "no-plan")] ?? STATUS_LABEL["no-data"]!;
  const weighIns = [...m.data.weighIns].sort((a, b) => (a.date < b.date ? 1 : -1));
  const food = [...m.data.foodDays].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
  const toReview = m.flags.includes("reply");

  // Arrow keys move between tabs (the tab list is one stop for Tab).
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = DETAIL_TABS.findIndex((t) => t.id === tab);
    const next = DETAIL_TABS[(i + (e.key === "ArrowRight" ? 1 : DETAIL_TABS.length - 1)) % DETAIL_TABS.length]!;
    onTab(next.id);
    document.getElementById(`member-tab-${next.id}`)?.focus();
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="h-8 px-2 xl:hidden" onClick={onBack}>
        <ArrowLeft />
        All members
      </Button>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{m.displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {[
                m.data.username && m.data.name ? `@${m.data.username}` : null,
                m.data.joinedAt ? `joined ${formatShort(m.data.joinedAt.slice(0, 10))}` : null,
                `last log ${describeDaysAgo(m.daysSinceLog)}`,
                m.data.sharing.since ? `sharing since ${formatShort(m.data.sharing.since.slice(0, 10))}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <HealthPill health={m.health} large />
        </div>
        {m.flags.length > 0 || m.paused ? (
          <div className="flex flex-wrap gap-1">
            {m.paused ? <Badge variant="secondary">{pausedLabel(m.paused)}</Badge> : null}
            {m.flags.map((f) => (
              <Badge key={f} variant={FLAG_VARIANT[f]}>
                {FLAG_LABELS[f]}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {toReview ? (
            <Button size="sm" onClick={() => onTab("checkins")}>
              <MessageSquare />
              Reply to check-in
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onTab("notes")}>
            <StickyNote />
            Add note
          </Button>
          <ConfirmButton
            label="Stop viewing"
            icon={<EyeOff />}
            confirmLabel="Yes, stop viewing"
            variant="outline"
            onConfirm={async () => {
              try {
                const r = await sharingCall<{ sharing: MemberSharing }>("stop", companyId, m.data.userId);
                onStopped(r.sharing);
              } catch (e) {
                setStopError(e instanceof Error ? e.message : "Couldn't do that. Try again.");
              }
            }}
          />
        </div>
        {stopError ? (
          <p role="alert" className="text-xs text-destructive">
            {stopError}
          </p>
        ) : null}
      </div>

      <div role="tablist" aria-label="Member details" onKeyDown={onTabKey} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
        {DETAIL_TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              id={`member-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="member-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.id)}
              className={cn(
                "-mb-px flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.id === "checkins" && toReview ? (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="waiting for a reply" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="member-tabpanel" aria-labelledby={`member-tab-${tab}`} className="space-y-5">
        {tab === "overview" ? (
          <>
            {m.health ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <HealthPill health={m.health} large />
                <div className="min-w-0 text-xs">
                  <p className="text-sm font-semibold">Health score</p>
                  <p className="tabular text-muted-foreground">
                    Logging {m.health.logging}/{HEALTH_PARTS.logging} · Adherence {m.health.adherence}/{HEALTH_PARTS.adherence} · Trend{" "}
                    {m.health.trend}/{HEALTH_PARTS.trend}
                  </p>
                  <p className="text-[12px] text-muted-foreground">Days logged this week, habit scorecard, and weight vs plan.</p>
                </div>
              </div>
            ) : null}
            <CoachReportPanel companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} />

            <Card>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    Weight vs plan
                  </CardTitle>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                {p ? <CardDescription>{p.headline}</CardDescription> : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {!m.hasPlan ? (
                  <p className="text-sm text-muted-foreground">They haven&apos;t set up a plan in the app yet.</p>
                ) : (
                  <>
                    <div className="tabular grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <Mini label="Latest" value={m.latestWeightLb === null ? "—" : weight(m.latestWeightLb, unit)} />
                      <Mini
                        label="Goal"
                        value={
                          m.state.fatLoss.goalType === "bodyFat"
                            ? `${m.state.fatLoss.targetBodyFat}% body fat`
                            : weight(m.state.fatLoss.targetWeight, unit, 0)
                        }
                      />
                      <Mini label="Losing / wk" value={p?.observedRate == null ? "—" : weight(p.observedRate, unit)} />
                      <Mini label="Plan / wk" value={p?.plannedRate == null ? "—" : weight(p.plannedRate, unit)} />
                    </div>
                    {p?.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{p.detail}</p> : null}
                    {m.timeline && m.data.weighIns.length > 0 ? (
                      <ProgressChart timeline={m.timeline} weighIns={m.data.weighIns} unit={unit} today={today} range="recent" />
                    ) : (
                      <p className="text-sm text-muted-foreground">No weigh-ins in the last {OVERVIEW_DAYS.weighIns} days.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <ConsistencyCard
              habits={m.state.tracking.habits}
              logs={[...m.data.habitLogs].sort((a, b) => (a.date < b.date ? -1 : 1))}
              today={today}
              pauses={m.state.tracking.pauses}
            />

            {weighIns.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Recent weigh-ins</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="tabular divide-y divide-border/60 text-sm">
                    {weighIns.slice(0, 10).map((w) => (
                      <li key={w.date} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span>{formatShort(w.date)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{w.note ?? ""}</span>
                        <span className="font-medium">{weight(w.weightLb, unit)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <p className="text-[12px] text-muted-foreground">
              This week&apos;s scorecard: {m.week.percent === null ? "no habits logged yet" : `${m.week.percent}% (${ZONES[m.week.zone!].label})`}.
            </p>
          </>
        ) : tab === "checkins" ? (
          <MemberCheckinsCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} />
        ) : tab === "food" ? (
          <>
            <MemberMacrosCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-primary" />
                  Food log
                </CardTitle>
                <CardDescription>
                  {m.food7
                    ? `Last 7 days: ${m.food7.days} day${m.food7.days === 1 ? "" : "s"} logged · avg ${Math.round(m.food7.kcal).toLocaleString()} kcal · ${Math.round(m.food7.protein)} g protein`
                    : "No food logged in the last 7 days."}
                </CardDescription>
              </CardHeader>
              {food.length > 0 ? (
                <CardContent>
                  <div className="relative overflow-x-auto">
                    <table className="tabular w-full text-sm">
                      <caption className="sr-only">Daily food totals</caption>
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Day
                          </th>
                          <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                            kcal
                          </th>
                          <th scope="col" className="py-1.5 pr-3 text-right font-medium text-macro-protein">
                            P
                          </th>
                          <th scope="col" className="py-1.5 pr-3 text-right font-medium text-macro-carb">
                            C
                          </th>
                          <th scope="col" className="py-1.5 text-right font-medium text-macro-fat">
                            F
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {food.map((d) => (
                          <tr key={d.date}>
                            <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                              {formatShort(d.date)}
                            </th>
                            <td className="py-1.5 pr-3 text-right">{d.kcal.toLocaleString()}</td>
                            <td className="py-1.5 pr-3 text-right">{d.protein}</td>
                            <td className="py-1.5 pr-3 text-right">{d.carbs}</td>
                            <td className="py-1.5 text-right">{d.fat}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              ) : null}
            </Card>
          </>
        ) : tab === "training" ? (
          <>
            <MemberProgramCard key={programVersion} companyId={companyId} memberId={m.data.userId} memberName={m.displayName} />
            <PhysiqueFocusCard
              companyId={companyId}
              memberId={m.data.userId}
              memberName={m.displayName}
              onSent={() => setProgramVersion((n) => n + 1)}
            />
            <MemberWorkoutsCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} />
          </>
        ) : tab === "body" ? (
          <>
            <MeasurementsCard measurements={m.data.measurements} weighIns={m.data.weighIns} unit={unit} today={today} readOnly />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  Progress photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {m.data.photos === null ? (
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    Not shared. Photos are private unless the member turns on &ldquo;Share my photos with my coach&rdquo;.
                  </p>
                ) : m.data.photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sharing is on, but there are no photos yet.</p>
                ) : (
                  <PhotoGallery
                    photos={m.data.photos}
                    srcFor={(ph) =>
                      `/api/coach/photo?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(m.data.userId)}&id=${encodeURIComponent(ph.id)}`
                    }
                  />
                )}
              </CardContent>
            </Card>
            {m.data.photos !== null ? (
              <CoachComparisonCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} />
            ) : null}
          </>
        ) : (
          <>
            <CoachNotesCard companyId={companyId} memberId={m.data.userId} />
            {tags}
          </>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
