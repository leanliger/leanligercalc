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
  MessageCircle,
  MessageSquare,
  Zap,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Send,
  Scale,
  Search,
  StickyNote,
  Sun,
  TrendingUp,
  Users,
  Utensils,
  Workflow,
  X,
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
import { CoachNudges } from "@/components/coach-nudges";
import { MemberProgramCard } from "@/components/coach-member-program";
import { PhysiqueFocusCard } from "@/components/physique-focus-card";
import { CoachComparisonCard, CoachTestimonials } from "@/components/physique-compare-card";
import { CoachProgramResults } from "@/components/coach-program-results";
import { CoachChatPanel, useCoachThreads } from "@/components/chat";
import { CommandPalette, usePaletteShortcut, type PaletteCommand } from "@/components/coach-command-palette";
import { messagePreview, type ChatThread } from "@/lib/messages";
import { CoachAnnouncements, CoachDigestToggle, DigestHistory } from "@/components/coach-announcements";
import { BulkBar } from "@/components/coach-bulk";
import { ClientFileLauncher, KeyInsights, MemberInsights, useInsightsData } from "@/components/coach-member-insights";
import { NeedleCard } from "@/components/coach-coaching-cards";
import { muscleCheck } from "@/lib/member-insights";
import { RoutineReplies, type RoutineItem } from "@/components/coach-routine-replies";
import { reportFor, triageCheckin } from "@/lib/checkin-report-input";
import type { Checkin } from "@/lib/checkins";
import type { CoachMacros } from "@/lib/coach-macros";
import { RemindMenu, useCoachReminders, type SentReminder } from "@/components/coach-remind-menu";
import { suggestedReminders } from "@/lib/coach-reminders";
import { CommunityStatsCard } from "@/components/coach-community-stats";
import { MemberWorkoutsCard } from "@/components/coach-member-workouts";
import { CoachReportPanel } from "@/components/coach-report";
import { MemberTagsCard, TagChips, loadTags, type TagsData } from "@/components/member-tags";
import { TAG_CLASS } from "@/lib/member-tags";
import { CoachNotesCard, FLAG_VARIANT, MemberCheckinsCard, MemberMacrosCard } from "@/components/coach-tools";
import { ActionQueue, Avatar, CoachBottomNav, CoachNav, PhotoStorageMeter, WeekStrip, isAtRisk, type CoachNavItem } from "@/components/coach-today";
import { CoachIntakeChart } from "@/components/coach-member-food";
import { MemberTimelineCard } from "@/components/coach-member-timeline";
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

/** The list's quick filters; "risk" is any flag but a check-in waiting on the coach; "safety" is losing too fast or eating too little. */
type Filter = "all" | "risk" | "ontrack" | "safety" | Flag;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "risk", label: "At risk" },
  { value: "reply", label: "Check-ins to review" },
  { value: "ontrack", label: "On track" },
];

/** The rest, one at a time from a menu. */
const FLAG_FILTERS = [
  "too-fast",
  "under-floor",
  "drop-off",
  "muscle-loss",
  "slipping",
  "behind",
  "plateau",
  "red",
  "no-weigh-in",
  "no-workouts",
  "checkin",
  "inactive",
  "no-plan",
] as const satisfies readonly Flag[];

function matchesFilter(m: MemberSummary, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "risk") return isAtRisk(m);
  if (f === "ontrack") return !isAtRisk(m);
  if (f === "safety") return m.flags.includes("too-fast") || m.flags.includes("under-floor");
  return m.flags.includes(f);
}

type MemberSort = "attention" | "health" | "name";

/** A Members list setup: the quick views below, or one the coach saved. */
interface SavedView {
  id: string;
  name: string;
  filter: Filter;
  tag: string | null;
  sort: MemberSort;
  query: string;
}

const BUILT_IN_VIEWS: SavedView[] = [
  { id: "needs-reply", name: "Needs reply", filter: "reply", tag: null, sort: "attention", query: "" },
  { id: "may-quit", name: "At risk of quitting", filter: "drop-off", tag: null, sort: "attention", query: "" },
  { id: "losing-muscle", name: "Losing muscle", filter: "muscle-loss", tag: null, sort: "attention", query: "" },
  { id: "safety", name: "Safety", filter: "safety", tag: null, sort: "attention", query: "" },
];

/** The dashboard's sections. */
type View = "today" | "inbox" | "members" | "programs" | "automations" | "growth";

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
  const [sort, setSort] = React.useState<MemberSort>("attention");
  const [query, setQuery] = React.useState("");
  // ?member=user_… opens straight onto one member (bookmarkable).
  const [selected, setSelected] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("member"),
  );
  const [unit, setUnit] = React.useState<WeightUnit>("lb");
  // Today (what needs you), Inbox (check-ins and messages), Members (the list, or one member's page),
  // Programs (send programs and habit sets), Automations (what runs by itself), Growth (announcements and marketing).
  const [view, setView] = React.useState<View>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("member") ? "members" : "today",
  );
  const [programsTab, setProgramsTab] = React.useState<"programs" | "results">("programs");
  const [growthTab, setGrowthTab] = React.useState<"announcements" | "stats">("announcements");
  // Inbox: the list, or the routine-replies review.
  const [inboxMode, setInboxMode] = React.useState<"list" | "routine">("list");
  // Ctrl+K: find a member or run a command.
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const togglePalette = React.useCallback(() => setPaletteOpen((v) => !v), []);
  usePaletteShortcut(togglePalette);
  const [modKey, setModKey] = React.useState("Ctrl");
  React.useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setModKey("⌘");
  }, []);
  // Every unanswered check-in with what it needs, for the Inbox badges and routine replies.
  const [waiting, setWaiting] = React.useState<{ memberId: string; checkin: Checkin; previous: Checkin | null; coachMacros: CoachMacros | null }[] | null>(null);
  const loadWaiting = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/checkins/waiting?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (res.ok) setWaiting(((await res.json()) as { items: NonNullable<typeof waiting> }).items);
    } catch {
      /* no badges this time */
    }
  }, [companyId]);
  // Members ticked in the list for bulk actions, and the ones handed to Assign program.
  const [picked, setPicked] = React.useState<string[]>([]);
  const [assignPicked, setAssignPicked] = React.useState<string[]>([]);
  // On-demand reminders sent this week, for the menus beside each member.
  const reminderState = useCoachReminders(companyId);
  // Every chat, for the unread counts on Inbox and on each member's Message button.
  const chats = useCoachThreads(companyId);
  // The check-in open in the inbox.
  const [inboxId, setInboxId] = React.useState<string | null>(null);
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
  const inView = (m: MemberSummary, v: Pick<SavedView, "filter" | "tag" | "query">) => {
    const vq = v.query.trim().toLowerCase();
    if (vq && !`${m.data.name ?? ""} ${m.data.username ?? ""}`.toLowerCase().includes(vq)) return false;
    if (v.tag && !(tagsData?.members[m.data.userId] ?? []).includes(v.tag)) return false;
    return matchesFilter(m, v.filter);
  };
  const filtered = summaries.filter((m) => inView(m, { filter, tag: tagFilter, query }));
  // Everyone's name and photo, sharing or not (for chats).
  const people = React.useMemo(
    () => new Map((overview?.members ?? []).map((m) => [m.userId, { name: memberName(m), avatarUrl: m.avatarUrl }])),
    [overview],
  );
  const nameOf = React.useMemo(() => new Map([...people].map(([id, p]) => [id, p.name])), [people]);
  const shown =
    sort === "health"
      ? [...filtered].sort((a, b) => (a.health?.score ?? 101) - (b.health?.score ?? 101))
      : sort === "name"
        ? [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName))
        : filtered;
  const current = summaries.find((m) => m.data.userId === selected) ?? null;
  const currentNotSharing = current ? null : (notSharing.find((m) => m.userId === selected) ?? null);
  const shownNotSharing = notSharing.filter((m) => !q || `${m.name ?? ""} ${m.username ?? ""}`.toLowerCase().includes(q));

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

  /** Open a member's own page on a tab. */
  const openMember = (id: string, t: DetailTab = "overview") => {
    setView("members");
    setSelected(id);
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  /** Open a member's waiting check-in in the inbox. */
  const openInbox = (id: string | null = null) => {
    setView("inbox");
    setInboxMode("list");
    setSelected(null);
    setInboxId(id);
    window.scrollTo({ top: 0 });
  };
  const showMembers = (f: Filter) => {
    if (f === "reply") return openInbox();
    setView("members");
    setFilter(f);
    setSelected(null);
  };
  const showToday = () => go("today");
  /** Another section, from the top. */
  function go(v: View) {
    setView(v);
    setSelected(null);
    window.scrollTo({ top: 0 });
  }
  /** Scroll to a part of a section once it has loaded (a few tries). */
  const scrollToId = (id: string, tries = 20) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (tries > 0) window.setTimeout(() => scrollToId(id, tries - 1), 100);
  };
  /** After a reply: that check-in is answered (until the next load) and the next one opens. */
  const markReplied = (userId: string) => {
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            members: prev.members.map((m) =>
              m.userId === userId ? { ...m, checkins: m.checkins.map((c, i) => (i === 0 ? { ...c, replied: true } : c)) } : m,
            ),
          }
        : prev,
    );
  };
  /** Kudos from the Celebrate list: a chat message to the member. */
  const sendKudos = async (memberId: string, text: string) => {
    const res = await fetch("/api/coach/messages", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ company: companyId, member: memberId, body: text }),
    });
    if (!res.ok) throw new Error("Couldn't send kudos.");
    void chats.refresh();
  };
  // Each waiting check-in's report and what it needs from you (src/lib/checkin-report-input.ts).
  const triaged = React.useMemo(() => {
    const out = new Map<string, { ready: boolean; reasons: string[]; item: RoutineItem }>();
    for (const w of waiting ?? []) {
      const s = summaries.find((m) => m.data.userId === w.memberId);
      if (!s) continue;
      try {
        const bundle = reportFor(s, w.checkin, w.previous, w.coachMacros, unit);
        out.set(w.memberId, { ...triageCheckin(bundle.report, w.checkin), item: { summary: s, checkin: w.checkin, bundle } });
      } catch {
        /* no badge for this one */
      }
    }
    return out;
  }, [waiting, summaries, unit]);
  const routineItems = [...triaged.values()].filter((t) => t.ready && t.item.summary.flags.includes("reply")).map((t) => t.item);
  // Today and the Inbox both show which check-ins are 1-click ready.
  React.useEffect(() => {
    if (view === "inbox" || view === "today") void loadWaiting();
  }, [view, loadWaiting]);
  // Who's in the Inbox: waiting check-ins and chats, plus anyone you just chose to message.
  const entries = React.useMemo(() => {
    const list = inboxEntries(summaries, chats.threads, people);
    if (inboxId && !list.some((e) => e.id === inboxId)) {
      const s = summaries.find((m) => m.data.userId === inboxId) ?? null;
      const who = people.get(inboxId);
      if (s || who) {
        list.unshift({ id: inboxId, name: s?.displayName ?? who!.name, avatarUrl: s?.data.avatarUrl ?? who?.avatarUrl ?? null, summary: s, checkin: false, thread: null, waitingSince: null });
      }
    }
    return list;
  }, [summaries, chats.threads, people, inboxId]);
  const showRoutine = () => {
    go("inbox");
    setInboxMode("routine");
  };
  const assignTo = (ids: string[]) => {
    setAssignPicked(ids);
    setProgramsTab("programs");
    go("programs");
  };

  // The command palette's list: sections, on-demand actions, then every member with their own actions.
  const commands: PaletteCommand[] = [
    { id: "go-today", group: "Go to", label: "Today", keywords: "home queue", run: showToday },
    { id: "go-inbox", group: "Go to", label: "Inbox", hint: counts.toReview + chats.unread > 0 ? `${counts.toReview + chats.unread} waiting` : undefined, keywords: "check-ins messages chat", run: () => openInbox() },
    { id: "go-members", group: "Go to", label: "Members", run: () => showMembers("all") },
    { id: "go-programs", group: "Go to", label: "Programs & habits", keywords: "assign", run: () => { setProgramsTab("programs"); go("programs"); } },
    { id: "go-results", group: "Go to", label: "Program results", run: () => { setProgramsTab("results"); go("programs"); } },
    { id: "go-nudges", group: "Go to", label: "Automatic nudges", keywords: "automations", run: () => go("automations") },
    { id: "go-digest", group: "Go to", label: "Daily digest", keywords: "automations digests", run: () => { go("automations"); scrollToId("daily-digest"); } },
    { id: "go-announce", group: "Go to", label: "Announcements", keywords: "growth broadcast", run: () => { setGrowthTab("announcements"); go("growth"); } },
    { id: "go-stats", group: "Go to", label: "Community stats & testimonials", keywords: "growth marketing wins", run: () => { setGrowthTab("stats"); go("growth"); } },
    ...(routineItems.length > 0
      ? [{ id: "do-routine", group: "Actions" as const, label: `Send routine replies (${routineItems.length})`, keywords: "1-click check-ins", run: showRoutine }]
      : []),
    { id: "do-nudges", group: "Actions", label: "Run nudges now", run: () => { go("automations"); scrollToId("run-nudges"); } },
    { id: "do-digest", group: "Actions", label: "Preview my digest", keywords: "send digest", run: () => { go("automations"); scrollToId("daily-digest"); } },
    { id: "do-refresh", group: "Actions", label: "Refresh the dashboard", keywords: "reload", run: () => void load() },
    { id: "do-unit", group: "Actions", label: `Show weights in ${unit === "lb" ? "kg" : "lb"}`, keywords: "units", run: () => setUnit(unit === "lb" ? "kg" : "lb") },
    ...summaries.flatMap((m): PaletteCommand[] => {
      const id = m.data.userId;
      const name = m.displayName;
      const hint = m.data.username ? `@${m.data.username}` : undefined;
      const kw = `${m.data.username ?? ""} ${m.data.name ?? ""}`;
      return [
        { id: `open-${id}`, group: "Members", label: name, hint: m.flags.length ? FLAG_LABELS[m.flags[0]!] : hint, keywords: kw, run: () => openMember(id) },
        { id: `msg-${id}`, group: "Members", label: `Message ${name}`, hint, keywords: kw, searchOnly: true, run: () => openInbox(id) },
        { id: `ci-${id}`, group: "Members", label: `Check-ins: ${name}`, hint, keywords: kw, searchOnly: true, run: () => openMember(id, "checkins") },
        { id: `mac-${id}`, group: "Members", label: `Set macros for ${name}`, hint, keywords: kw, searchOnly: true, run: () => openMember(id, "food") },
        { id: `prog-${id}`, group: "Members", label: `Assign a program to ${name}`, hint, keywords: kw, searchOnly: true, run: () => assignTo([id]) },
        { id: `hist-${id}`, group: "Members", label: `History: ${name}`, hint, keywords: kw, searchOnly: true, run: () => openMember(id, "timeline") },
      ];
    }),
    ...notSharing.flatMap((m): PaletteCommand[] => [
      { id: `open-${m.userId}`, group: "Members", label: memberName(m), hint: "not sharing", keywords: m.username ?? "", searchOnly: true, run: () => openMember(m.userId) },
      { id: `msg-${m.userId}`, group: "Members", label: `Message ${memberName(m)}`, hint: "not sharing", keywords: m.username ?? "", searchOnly: true, run: () => openInbox(m.userId) },
    ]),
  ];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const navItems: CoachNavItem[] = [
    { id: "today", label: "Today", icon: <Sun />, active: view === "today", onSelect: showToday },
    { id: "inbox", label: "Inbox", icon: <Inbox />, count: counts.toReview + chats.unread, active: view === "inbox", onSelect: () => openInbox() },
    { id: "members", label: "Members", icon: <Users />, note: summaries.length, active: view === "members", onSelect: () => showMembers("all") },
    { id: "programs", label: "Programs", icon: <ClipboardList />, active: view === "programs", onSelect: () => go("programs") },
    { id: "automations", label: "Automations", icon: <Workflow />, active: view === "automations", onSelect: () => go("automations") },
    { id: "growth", label: "Growth", icon: <TrendingUp />, active: view === "growth", onSelect: () => go("growth") },
  ];

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
            {overview ? (
              <>
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="hidden h-10 w-72 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
                >
                  <Search className="h-4 w-4" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">Search or jump to…</span>
                  <kbd className="rounded border border-border px-1.5 text-[11px]">{modKey} K</kbd>
                </button>
                <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setPaletteOpen(true)} aria-label="Find a member or command">
                  <Search />
                </Button>
              </>
            ) : null}
            <SegmentedControl
              ariaLabel="Units"
              size="sm"
              value={unit}
              onValueChange={setUnit}
              options={[
                { value: "lb" as const, label: "lb" },
                { value: "kg" as const, label: "kg" },
              ]}
              className="hidden w-auto sm:flex"
            />
            <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      <div className={cn(WRAP, "py-6 pb-28 lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pb-6")}>
        {overview ? (
          <>
            <CoachNav className="hidden lg:block" items={navItems} />
            <CoachBottomNav items={navItems} />
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
          </>
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
          ) : view === "programs" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold tracking-tight">Programs</h2>
                <SegmentedControl
                  ariaLabel="Programs section"
                  value={programsTab}
                  onValueChange={setProgramsTab}
                  options={[
                    { value: "programs" as const, label: "Programs & habits" },
                    { value: "results" as const, label: "Program results" },
                  ]}
                  className="w-auto"
                />
              </div>
              {programsTab === "programs" ? (
                <CoachAssignPanel key={assignPicked.join(",")} companyId={companyId} members={overview.members} tags={tagsData} picked={assignPicked} />
              ) : (
                <CoachProgramResults companyId={companyId} names={nameOf} unit={unit} />
              )}
            </div>
          ) : view === "automations" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Automations</h2>
                <p className="text-sm text-muted-foreground">What runs by itself, and the buttons to run it now. You see who gets what before anything is sent.</p>
              </div>
              <CoachNudges companyId={companyId} names={nameOf} />
              <section id="daily-digest" aria-labelledby="daily-digest-title" className="scroll-mt-20 space-y-3">
                <h3 id="daily-digest-title" className="text-base font-semibold">
                  Daily digest
                </h3>
                <CoachDigestToggle companyId={companyId} />
                <DigestHistory companyId={companyId} />
              </section>
              {overview.photoStorage ? (
                <div className="max-w-xs rounded-[1.25rem] border border-primary/15 p-4">
                  <PhotoStorageMeter {...overview.photoStorage} />
                </div>
              ) : null}
            </div>
          ) : view === "growth" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold tracking-tight">Growth</h2>
                <SegmentedControl
                  ariaLabel="Growth section"
                  value={growthTab}
                  onValueChange={setGrowthTab}
                  options={[
                    { value: "announcements" as const, label: "Announcements" },
                    { value: "stats" as const, label: "Community stats & testimonials" },
                  ]}
                  className="w-auto"
                />
              </div>
              {growthTab === "announcements" ? (
                <CoachAnnouncements companyId={companyId} tags={tagsData?.tags ?? []} />
              ) : (
                <div className="space-y-5">
                  <CommunityStatsCard companyId={companyId} unit={unit} />
                  <CoachTestimonials companyId={companyId} names={nameOf} unit={unit} />
                </div>
              )}
            </div>
          ) : view === "inbox" && inboxMode === "routine" ? (
            <RoutineReplies
              companyId={companyId}
              items={routineItems}
              onBack={() => {
                setInboxMode("list");
                void loadWaiting();
              }}
              onSent={markReplied}
            />
          ) : view === "inbox" ? (
            <CoachInbox
              triage={triaged}
              routineCount={routineItems.length}
              onRoutine={() => setInboxMode("routine")}
              entries={entries}
              onMessagesRead={() => void chats.refresh()}
              openId={inboxId}
              onOpenId={setInboxId}
              companyId={companyId}
              unit={unit}
              onReplied={markReplied}
              onOpenProfile={(id) => openMember(id)}
            />
          ) : view === "today" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{greeting}, Coach</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(`${today}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · {counts.total}{" "}
                    member{counts.total === 1 ? "" : "s"} sharing
                    {overview.members.length > counts.total ? ` of ${overview.members.length}` : ""}
                    {counts.attention > 0 ? ` · ${counts.attention} need${counts.attention === 1 ? "s" : ""} you today` : ""}
                  </p>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Updated {new Date(overview.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              {summaries.length > 0 || chats.unread > 0 ? (
                <ActionQueue
                  members={summaries}
                  threads={chats.threads}
                  names={people}
                  triage={triaged}
                  routineCount={routineItems.length}
                  unit={unit}
                  onRoutine={showRoutine}
                  onInbox={(id) => openInbox(id)}
                  onOpen={(id, t) => openMember(id, t)}
                  onKudos={sendKudos}
                  remind={(m) => (
                    <RemindMenu
                      companyId={companyId}
                      members={[{ id: m.data.userId, name: m.displayName }]}
                      suggested={suggestedReminders(m)}
                      recent={reminderState.reminders}
                      onSent={reminderState.setReminders}
                    />
                  )}
                />
              ) : null}
              {summaries.length > 0 ? (
                <>
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
              {summaries.length === 0 ? (
                <EmptyNote>
                  {overview.members.length === 0
                    ? "No members yet. Once people join your whop, they'll appear here."
                    : "Nobody is sharing their progress with you yet. Ask them from Members, or they can turn on sharing in their app's Settings."}
                </EmptyNote>
              ) : null}
              {/* This morning's digest and the ones before, folded away; its settings are in Automations. */}
              <details className="group space-y-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  <span className="transition-transform group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  Daily digests
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      go("automations");
                      scrollToId("daily-digest");
                    }}
                    className="ml-auto text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Digest settings
                  </button>
                </summary>
                <DigestHistory companyId={companyId} />
              </details>
            </div>
          ) : current ? (
            <MemberDetail
              key={current.data.userId}
              tags={<MemberTagsCard companyId={companyId} memberId={current.data.userId} data={tagsData} onChange={setTagsData} />}
              m={current}
              unit={unit}
              today={today}
              companyId={companyId}
              tab={tab}
              onTab={setTab}
              unreadMessages={chats.threads.find((t) => t.memberId === current.data.userId)?.unread ?? 0}
              reminders={reminderState.reminders}
              onReminders={reminderState.setReminders}
              onMessagesRead={() => void chats.refresh()}
              onBack={() => setSelected(null)}
              onStopped={(sharing) => {
                setSharing(current.data.userId, sharing, true);
                setSelected(null);
              }}
            />
          ) : currentNotSharing ? (
            <NotSharingDetail m={currentNotSharing} companyId={companyId} today={today} onBack={() => setSelected(null)} onChange={setSharing} />
          ) : (
            <section
              aria-labelledby="coach-members"
              className="min-w-0 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="coach-members" className="text-base font-semibold">
                  Members
                </h2>
                <SavedViews
                  companyId={companyId}
                  current={{ filter, tag: tagFilter, sort, query }}
                  count={(v) => summaries.filter((m) => inView(m, v)).length}
                  onApply={(v) => {
                    setFilter(v.filter);
                    setTagFilter(v.tag);
                    setSort(v.sort);
                    setQuery(v.query);
                  }}
                />
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
                <>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={shown.length > 0 && shown.every((m) => picked.includes(m.data.userId))}
                    onChange={(e) => {
                      const ids = shown.map((m) => m.data.userId);
                      setPicked((p) => (e.target.checked ? [...new Set([...p, ...ids])] : p.filter((id) => !ids.includes(id))));
                    }}
                  />
                  Select all {shown.length} shown, for bulk actions
                </label>
                <div className="overflow-hidden molten-card rounded-[1.25rem] border border-primary/15 bg-card">
                  <div
                    aria-hidden
                    className={cn(
                      "hidden gap-x-3 border-b border-l-2 border-b-border border-l-transparent py-2 pl-[5.75rem] pr-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid",
                      ROW_GRID,
                    )}
                  >
                    <span>Member</span>
                    <span className="text-center">Health</span>
                    <span className="text-right">Week</span>
                    <span className="text-right">Wt / wk</span>
                    <span>Last log</span>
                    <span>Check-in</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {shown.map((m) => {
                      const ticked = picked.includes(m.data.userId);
                      return (
                        <li key={m.data.userId} className={cn("flex items-stretch", ticked && "bg-primary/[0.06]")}>
                          <label className="flex w-10 shrink-0 cursor-pointer items-center justify-center" title={`Select ${m.displayName}`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[hsl(var(--primary))]"
                              aria-label={`Select ${m.displayName}`}
                              checked={ticked}
                              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.data.userId] : p.filter((id) => id !== m.data.userId)))}
                            />
                          </label>
                          {/* Reminders, on demand: suggested ones (from their flags) show as a count. */}
                          <div className="flex shrink-0 items-center pr-1">
                            <RemindMenu
                              companyId={companyId}
                              members={[{ id: m.data.userId, name: m.displayName }]}
                              suggested={suggestedReminders(m)}
                              recent={reminderState.reminders}
                              onSent={reminderState.setReminders}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <MemberRow
                              m={m}
                              unit={unit}
                              selected={m.data.userId === selected}
                              onOpen={() => openMember(m.data.userId)}
                              tags={<TagChips tags={tagsData?.tags ?? []} ids={tagsData?.members[m.data.userId]} />}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                </>
              )}
              {picked.length > 0 ? (
                <BulkBar
                  companyId={companyId}
                  selected={picked}
                  remind={
                    <RemindMenu
                      variant="button"
                      companyId={companyId}
                      members={picked.map((id) => ({ id, name: summaries.find((s) => s.data.userId === id)?.displayName ?? "Member" }))}
                      recent={reminderState.reminders}
                      onSent={reminderState.setReminders}
                    />
                  }
                  tags={tagsData}
                  onClear={() => setPicked([])}
                  onTagsChanged={setTagsData}
                  onMessaged={() => void chats.refresh()}
                  onAssign={() => assignTo(picked)}
                />
              ) : null}
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
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Members → Views: one tap to the lists you check most (built in: needs a
 * reply, at risk of quitting, losing muscle, safety), and your own: save the
 * filter, tag, order and search you have now under a name. Saved on this
 * device, per whop.
 */
function SavedViews({
  companyId,
  current,
  count,
  onApply,
}: {
  companyId: string;
  current: Pick<SavedView, "filter" | "tag" | "sort" | "query">;
  count: (v: SavedView) => number;
  onApply: (v: SavedView) => void;
}) {
  const key = `prep-calculator:coach-views:${companyId}`;
  const [mine, setMine] = React.useState<SavedView[]>([]);
  const [naming, setNaming] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(raw)) setMine(raw.filter((v): v is SavedView => typeof v?.id === "string" && typeof v?.name === "string"));
    } catch {
      /* none saved */
    }
  }, [key]);
  const store = (next: SavedView[]) => {
    setMine(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* kept until the page closes */
    }
  };
  const same = (v: SavedView) => v.filter === current.filter && v.tag === current.tag && v.sort === current.sort && v.query.trim() === current.query.trim();
  const isDefault = current.filter === "all" && current.tag === null && current.sort === "attention" && current.query.trim() === "";
  const unsaved = !isDefault && ![...BUILT_IN_VIEWS, ...mine].some(same);
  const save = () => {
    const name = (naming ?? "").trim();
    if (!name) return;
    store([...mine, { id: `v${Date.now().toString(36)}`, name: name.slice(0, 40), ...current, query: current.query.trim() }]);
    setNaming(null);
  };
  const chip = (v: SavedView, removable: boolean) => {
    const on = same(v);
    return (
      <span key={v.id} className={cn("inline-flex h-8 items-center rounded-full border text-xs font-medium", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onApply(on ? { ...v, filter: "all", tag: null, sort: "attention", query: "" } : v)}
          className="h-full rounded-full px-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {v.name} <span className="tabular opacity-80">{count(v)}</span>
        </button>
        {removable ? (
          <button
            type="button"
            onClick={() => store(mine.filter((x) => x.id !== v.id))}
            aria-label={`Delete the view ${v.name}`}
            className="-ml-1 mr-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    );
  };
  return (
    <div role="group" aria-label="Views" className="flex w-full flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-muted-foreground">Views:</span>
      {BUILT_IN_VIEWS.map((v) => chip(v, false))}
      {mine.map((v) => chip(v, true))}
      {naming !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor="coach-view-name" className="sr-only">
            Name this view
          </label>
          <Input
            id="coach-view-name"
            autoFocus
            value={naming}
            maxLength={40}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
            placeholder="Name this view"
            className="h-8 w-40 text-xs"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!naming.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setNaming(null)}>
            Cancel
          </Button>
        </form>
      ) : unsaved ? (
        <button type="button" onClick={() => setNaming("")} className="h-8 rounded-full border border-dashed border-primary/50 px-3 text-xs font-semibold text-primary hover:bg-primary/5">
          + Save this view
        </button>
      ) : null}
    </div>
  );
}

/** Member · health · week · weight per week · check-in; on phones the numbers move under the name. */
const ROW_GRID = "grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[minmax(0,1fr)_3rem_3.5rem_4.75rem_5.5rem_5.5rem]";

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
            {m.data.username && m.data.name ? <span className="sm:hidden">@{m.data.username} · </span> : null}
            <span className="sm:hidden">last log {describeDaysAgo(m.daysSinceLog)}</span>
            {m.data.username && m.data.name ? <span className="hidden sm:inline">@{m.data.username}</span> : null}
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
      <span className="hidden text-sm text-muted-foreground sm:block">
        <span className="sr-only">Last log </span>
        {describeDaysAgo(m.daysSinceLog)}
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

type DetailTab = "overview" | "body" | "food" | "training" | "checkins" | "timeline";

type TrainingView = "progress" | "log" | "muscles" | "program";

const TRAINING_VIEWS: { value: TrainingView; label: string }[] = [
  { value: "progress", label: "Lift progress" },
  { value: "log", label: "Workout log" },
  { value: "muscles", label: "Sets per muscle" },
  { value: "program", label: "Program & calendar" },
];

/** Overview first (with the key insights), then the numbers, then the check-ins and everything that happened. */
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "body", label: "Progress" },
  { id: "food", label: "Nutrition" },
  { id: "training", label: "Training" },
  { id: "checkins", label: "Check-ins" },
  { id: "timeline", label: "History" },
];

const RISK_CHIP: Record<"high" | "medium", string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
};

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
  unreadMessages,
  onMessagesRead,
  reminders,
  onReminders,
}: {
  /** On-demand reminders sent this week (the Remind menu). */
  reminders: SentReminder[];
  onReminders: (r: SentReminder[]) => void;
  /** Their tags card. */
  tags?: React.ReactNode;
  /** Messages from them you haven't opened. */
  unreadMessages: number;
  onMessagesRead: () => void;
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
  // Their workouts, food, check-ins and macros: loaded once for the key insights, History and the client file.
  const loaded = useInsightsData(companyId, m, unit, today);
  const muscle = React.useMemo(() => (loaded.input ? muscleCheck(loaded.input) : null), [loaded.input]);
  // Overview → "See all insights".
  const [allInsights, setAllInsights] = React.useState(false);
  // The chat beside the notes: open by itself when they've written and you haven't read it.
  const [chatOpen, setChatOpen] = React.useState(unreadMessages > 0);
  React.useEffect(() => {
    if (unreadMessages > 0) setChatOpen(true);
  }, [unreadMessages]);
  // The side column folds away on a computer, so the charts get the full width (remembered on this device).
  const [notesHidden, setNotesHidden] = React.useState(false);
  React.useEffect(() => {
    try {
      setNotesHidden(localStorage.getItem("prep-calculator:coach-notes-hidden") === "1");
    } catch {
      /* no storage: shown */
    }
  }, []);
  const showNotes = (show: boolean) => {
    setNotesHidden(!show);
    try {
      localStorage.setItem("prep-calculator:coach-notes-hidden", show ? "0" : "1");
    } catch {
      /* not remembered */
    }
  };
  const openChat = () => {
    showNotes(true);
    setChatOpen(true);
    requestAnimationFrame(() => {
      const chat = document.getElementById("member-chat");
      chat?.scrollIntoView({ behavior: "smooth", block: "start" });
      chat?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    });
  };
  // Bumped when the physique focus card sends an edit, so the program card shows it.
  const [programVersion, setProgramVersion] = React.useState(0);
  // Training: lift progress first, then the log, sets per muscle, and the program with its calendar.
  const [trainingView, setTrainingView] = React.useState<TrainingView>("progress");
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

  // What you can do for them: in the side column on a computer, under their name on a phone (or when the column is hidden).
  const actions = (where: "head" | "rail") => (
    <>
      {toReview ? (
        <Button size="sm" className={cn(where === "rail" && "col-span-2")} onClick={() => onTab("checkins")}>
          <MessageSquare />
          Reply to check-in
        </Button>
      ) : null}
      <Button
        size="sm"
        variant={unreadMessages > 0 && !toReview ? "default" : "outline"}
        onClick={openChat}
        aria-expanded={chatOpen}
        aria-controls="member-chat"
      >
        <MessageCircle />
        Message
        {unreadMessages > 0 ? (
          <span className="tabular ml-0.5 rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-[1.125rem] text-destructive-foreground" aria-label={`${unreadMessages} unread`}>
            {unreadMessages}
          </span>
        ) : null}
      </Button>
      <RemindMenu
        variant="button"
        companyId={companyId}
        members={[{ id: m.data.userId, name: m.displayName }]}
        suggested={suggestedReminders(m)}
        recent={reminders}
        onSent={onReminders}
      />
      <Button size="sm" variant="outline" onClick={() => onTab("food")}>
        <Utensils />
        Set macros
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setTrainingView("program");
          onTab("training");
        }}
      >
        <ClipboardList />
        Assign program
      </Button>
      <ClientFileLauncher summary={m} loaded={loaded} companyId={companyId} unit={unit} today={today} />
      {where === "head" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            showNotes(true);
            requestAnimationFrame(() => {
              const notes = document.getElementById("member-notes");
              notes?.scrollIntoView({ behavior: "smooth", block: "start" });
              notes?.querySelector<HTMLTextAreaElement>("#notes-" + m.data.userId)?.focus({ preventScroll: true });
            });
          }}
        >
          <StickyNote />
          Add note
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
        <ArrowLeft />
        All members
      </Button>
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-5 lg:items-start", !notesHidden && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
      <div className="min-w-0 space-y-4">

      <div className="space-y-3 molten-card rounded-[1.25rem] border border-primary/15 bg-card p-4">
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
        {/* The three numbers to know before anything else: health, how likely they are to quit, and whether they're keeping muscle. */}
        <div className="flex flex-wrap gap-1.5">
          {m.health ? (
            <span className={cn("tabular rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", ZONE_RING[healthZone(m.health.score)])}>Health {m.health.score}</span>
          ) : null}
          {m.risk.level !== "low" ? (
            <span className={cn("tabular rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", RISK_CHIP[m.risk.level])} title={m.risk.reasons.map((r) => r.text).join("\n")}>
              Quit risk {m.risk.level} · {m.risk.score}
            </span>
          ) : (
            <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[12px] font-semibold text-success">Quit risk low</span>
          )}
          {muscle && muscle.verdict !== "unknown" ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[12px] font-semibold",
                muscle.verdict === "losing"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : muscle.verdict === "slipping"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : muscle.verdict === "kept"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-muted-foreground",
              )}
              title={muscle.text}
            >
              {muscle.verdict === "losing" ? "Losing muscle" : muscle.verdict === "slipping" ? "Lifts slipping" : muscle.verdict === "kept" ? "Muscle kept" : "Lifts steady"}
            </span>
          ) : null}
        </div>
        {m.flags.length > 0 || m.paused ? (
          <div className="flex flex-wrap gap-1">
            {m.paused ? <Badge variant="secondary">{pausedLabel(m.paused)}</Badge> : null}
            {m.flags.map((f) => (
              <Badge key={f} variant={FLAG_VARIANT[f]}>
                {FLAG_LABELS[f]}
                {/* Which lifts, on the member's own page. */}
                {f === "slipping" && m.data.slipping?.length ? `: ${m.data.slipping.slice(0, 2).join(", ")}${m.data.slipping.length > 2 ? ` +${m.data.slipping.length - 2}` : ""}` : ""}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("contents", !notesHidden && "lg:hidden")}>{actions("head")}</div>
          {notesHidden ? (
            <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => showNotes(true)}>
              <PanelRightOpen />
              Show side column
            </Button>
          ) : null}
          <ConfirmButton
            label="Stop viewing"
            icon={<EyeOff />}
            confirmLabel="Yes, stop viewing"
            variant="ghost"
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
            <KeyInsights summary={m} loaded={loaded} unit={unit} today={today} allOpen={allInsights} onSeeAll={() => setAllInsights((v) => !v)} />
            {allInsights ? (
              <div className="space-y-2 rounded-[1.25rem] border border-primary/15 p-3">
                <div className="flex items-center">
                  <h3 className="text-sm font-semibold">All insights</h3>
                  <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => setAllInsights(false)}>
                    Hide
                  </Button>
                </div>
                <MemberInsights companyId={companyId} summary={m} unit={unit} today={today} loaded={loaded} />
              </div>
            ) : null}
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
                      <ProgressChart timeline={m.timeline} weighIns={m.data.weighIns} unit={unit} today={today} range="recent" height="h-80 sm:h-[26rem]" />
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
        ) : tab === "timeline" ? (
          <>
            <NeedleCard effects={loaded.needle.effects} loading={loaded.needle.loading} unit={unit} />
            <MemberTimelineCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} today={today} />
          </>
        ) : tab === "checkins" ? (
          <MemberCheckinsCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} summary={m} />
        ) : tab === "food" ? (
          <>
            <MemberMacrosCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} />
            <CoachIntakeChart companyId={companyId} memberId={m.data.userId} weighIns={m.data.weighIns} unit={unit} today={today} />
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
            <SegmentedControl ariaLabel="Training section" value={trainingView} onValueChange={setTrainingView} options={TRAINING_VIEWS} />
            {trainingView === "program" ? (
              <>
                <MemberProgramCard key={programVersion} companyId={companyId} memberId={m.data.userId} memberName={m.displayName} />
                <PhysiqueFocusCard
                  companyId={companyId}
                  memberId={m.data.userId}
                  memberName={m.displayName}
                  onSent={() => setProgramVersion((n) => n + 1)}
                />
              </>
            ) : null}
            {/* Kept mounted while on the program, so its workouts load once. */}
            <div className={cn(trainingView === "program" && "hidden")}>
              <MemberWorkoutsCard
                companyId={companyId}
                memberId={m.data.userId}
                memberName={m.displayName}
                unit={unit}
                view={trainingView === "program" ? "progress" : trainingView}
              />
            </div>
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
        ) : null}
      </div>
      </div>
      {/* Notes and tags stay beside the member's page on a computer, under it on a phone. */}
      <aside id="member-notes" aria-label="Actions, chat, notes and tags" className={cn("min-w-0 space-y-4 scroll-mt-20 lg:sticky lg:top-20", notesHidden && "lg:hidden")}>
        <section aria-label={`Do something for ${m.displayName}`} className="hidden space-y-2 rounded-[1.25rem] border border-primary/15 bg-card p-3 lg:block">
          <div className="flex items-center">
            <h3 className="text-sm font-semibold">Do something</h3>
            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-muted-foreground" onClick={() => showNotes(false)} aria-label="Hide this column">
              <PanelRightClose />
              Hide
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 [&>*]:w-full [&_button]:w-full [&_button]:justify-start">{actions("rail")}</div>
        </section>
        {chatOpen ? (
          <CoachChatPanel
            key={m.data.userId}
            className="scroll-mt-20"
            companyId={companyId}
            memberId={m.data.userId}
            memberName={m.displayName}
            onRead={onMessagesRead}
            onClose={() => setChatOpen(false)}
          />
        ) : null}
        <CoachNotesCard companyId={companyId} memberId={m.data.userId} />
        {tags}
      </aside>
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

/* ================================== inbox ================================== */

/** One member in the Inbox: their waiting check-in, their chat, or both. */
interface InboxEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Null for members who don't share their progress (chat only). */
  summary: MemberSummary | null;
  checkin: boolean;
  thread: ChatThread | null;
  /** When they started waiting on you; null when nothing is waiting. */
  waitingSince: string | null;
}

type InboxFilter = "all" | "checkins" | "messages" | "needs" | "ready";

/** Waiting on you, oldest first; then the other chats, newest first. */
function inboxEntries(summaries: MemberSummary[], threads: ChatThread[], names: ReadonlyMap<string, { name: string; avatarUrl: string | null }>): InboxEntry[] {
  const byId = new Map<string, InboxEntry>();
  for (const m of summaries) {
    if (!m.flags.includes("reply")) continue;
    const id = m.data.userId;
    byId.set(id, { id, name: m.displayName, avatarUrl: m.data.avatarUrl, summary: m, checkin: true, thread: null, waitingSince: m.lastCheckin?.submittedAt ?? "" });
  }
  for (const t of threads) {
    const unreadSince = t.unread > 0 && !t.last.fromCoach ? t.last.at : null;
    const e = byId.get(t.memberId);
    if (e) {
      e.thread = t;
      if (unreadSince && (e.waitingSince === null || unreadSince < e.waitingSince)) e.waitingSince = unreadSince;
      continue;
    }
    const s = summaries.find((m) => m.data.userId === t.memberId) ?? null;
    const who = names.get(t.memberId) ?? { name: "A member", avatarUrl: null };
    byId.set(t.memberId, { id: t.memberId, name: s?.displayName ?? who.name, avatarUrl: s?.data.avatarUrl ?? who.avatarUrl, summary: s, checkin: false, thread: t, waitingSince: unreadSince });
  }
  return [...byId.values()].sort((a, b) => {
    if ((a.waitingSince === null) !== (b.waitingSince === null)) return a.waitingSince === null ? 1 : -1;
    if (a.waitingSince !== null && b.waitingSince !== null) return a.waitingSince.localeCompare(b.waitingSince);
    return (b.thread?.last.at ?? "").localeCompare(a.thread?.last.at ?? "");
  });
}

function sentAgoShort(iso: string | null, now: number): string {
  if (!iso) return "";
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "now";
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/**
 * Everything members are waiting on, in one list: check-ins and messages
 * together, one row per member, longest waiting first. The open member shows
 * their check-in (with the numbers, the draft and "Send & next") beside their
 * chat, so a reply and a message are one sitting. On a phone the list and
 * the member take turns.
 */
function CoachInbox({
  entries,
  openId,
  onOpenId,
  companyId,
  unit,
  onReplied,
  onOpenProfile,
  onMessagesRead,
  triage,
  routineCount,
  onRoutine,
}: {
  entries: InboxEntry[];
  /** Per member: 1-click ready, or what needs the coach. */
  triage: ReadonlyMap<string, { ready: boolean; reasons: string[] }>;
  routineCount: number;
  onRoutine: () => void;
  openId: string | null;
  onOpenId: (id: string | null) => void;
  companyId: string;
  unit: WeightUnit;
  onReplied: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onMessagesRead: () => void;
}) {
  const [wide, setWide] = React.useState(false);
  const [show, setShow] = React.useState<InboxFilter>("all");
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const now = Date.now();
  const ready = (e: InboxEntry) => e.checkin && !!triage.get(e.id)?.ready;
  const needs = (e: InboxEntry) => (e.checkin && !ready(e)) || (e.thread !== null && e.thread.unread > 0 && !e.thread.last.fromCoach);
  const match = (e: InboxEntry, f: InboxFilter) =>
    f === "all" ? true : f === "checkins" ? e.checkin : f === "messages" ? e.thread !== null : f === "needs" ? needs(e) : ready(e);
  const list = entries.filter((e) => match(e, show));
  const waiting = entries.filter((e) => e.waitingSince !== null);
  // On a computer the longest waiting opens by itself; on a phone the list shows first.
  const current = entries.find((e) => e.id === openId) ?? (wide ? (list[0] ?? null) : null);
  const nextAfter = (id: string) => {
    const i = waiting.findIndex((e) => e.id === id);
    return waiting[i + 1]?.id ?? waiting.find((e) => e.id !== id)?.id ?? null;
  };
  const filters: { id: InboxFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "checkins", label: "Check-ins" },
    { id: "messages", label: "Messages" },
    { id: "needs", label: "Needs you" },
    { id: "ready", label: "1-click ready" },
  ];
  const checkins = entries.filter((e) => e.checkin).length;
  const unread = entries.reduce((n, e) => n + (e.thread?.unread ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
          <p className="text-sm text-muted-foreground">
            {checkins} check-in{checkins === 1 ? "" : "s"} · {unread} unread message{unread === 1 ? "" : "s"} · longest waiting first
          </p>
        </div>
        {routineCount > 0 ? (
          <Button size="sm" className="ml-auto" onClick={onRoutine}>
            <Zap />
            Send routine replies ({routineCount})
          </Button>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="Show" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={show === f.id}
            onClick={() => setShow(f.id)}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              show === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
            )}
          >
            {f.label} <span className="tabular opacity-80">{entries.filter((e) => match(e, f.id)).length}</span>
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyNote>
          All caught up. No check-ins or messages are waiting. Members can message you from the chat icon in their app, and you can start a chat from
          Message on anyone&apos;s page.
        </EmptyNote>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <ul aria-label="Waiting on you" className={cn("molten-card space-y-1 rounded-[1.25rem] border border-primary/15 bg-card p-2", current && "max-lg:hidden")}>
            {list.length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">Nobody here.</li> : null}
            {list.map((e) => {
              const on = current?.id === e.id;
              const t = triage.get(e.id);
              const unreadHere = e.thread && !e.thread.last.fromCoach ? e.thread.unread : 0;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onOpenId(e.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-primary/[0.14]" : "hover:bg-muted/40",
                    )}
                  >
                    <Avatar name={e.name} url={e.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", e.waitingSince !== null ? "font-bold" : "font-medium")}>{e.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {e.checkin ? "Check-in waiting" : e.thread ? `${e.thread.last.fromCoach ? "You: " : ""}${messagePreview(e.thread.last)}` : ""}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {e.checkin && t ? (
                          t.ready ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                              <Zap className="h-3 w-3" aria-hidden />
                              1-click ready
                            </span>
                          ) : (
                            <span className="max-w-full truncate rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                              Needs you{t.reasons.length ? `: ${t.reasons.join(" · ")}` : ""}
                            </span>
                          )
                        ) : null}
                        {unreadHere > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                            <MessageCircle className="h-3 w-3" aria-hidden />
                            {unreadHere} unread
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {e.waitingSince !== null ? <span className="tabular shrink-0 text-[11px] text-muted-foreground">{sentAgoShort(e.waitingSince, now)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {current ? (
            <div className="min-w-0 space-y-4">
              <Button variant="ghost" size="sm" className="h-8 px-2 lg:hidden" onClick={() => onOpenId(null)}>
                <ArrowLeft />
                Inbox
              </Button>
              <div className="molten-card flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-primary/15 bg-card p-4">
                <Avatar name={current.name} url={current.avatarUrl} size="h-11 w-11" />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-lg font-bold">{current.name}</p>
                  {current.summary ? (
                    <>
                      <p className="tabular text-xs text-muted-foreground">
                        {[
                          current.summary.week.percent === null ? null : `Week ${current.summary.week.percent}%`,
                          current.summary.weekChangeLb === null ? null : `${signedWeight(current.summary.weekChangeLb, unit)} / wk`,
                          current.summary.food7 ? `food ${current.summary.food7.days}/7 days` : "no food logged",
                          `last log ${describeDaysAgo(current.summary.daysSinceLog)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {current.summary.flags.filter((f) => f !== "reply").length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {current.summary.flags
                            .filter((f) => f !== "reply")
                            .map((f) => (
                              <Badge key={f} variant={FLAG_VARIANT[f]} className="px-2 py-0 text-[11px]">
                                {FLAG_LABELS[f]}
                              </Badge>
                            ))}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not sharing their progress with you: chat only.</p>
                  )}
                </div>
                {current.summary ? <HealthPill health={current.summary.health} large /> : null}
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button size="sm" variant="outline" onClick={() => onOpenProfile(current.id)}>
                    Open profile
                  </Button>
                  {waiting.length > 1 ? (
                    <Button size="sm" variant="ghost" onClick={() => onOpenId(nextAfter(current.id))}>
                      Skip for now
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4 xl:items-start", current.checkin && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
                {current.checkin && current.summary ? (
                  <MemberCheckinsCard
                    key={current.id}
                    companyId={companyId}
                    memberId={current.id}
                    memberName={current.name}
                    unit={unit}
                    summary={current.summary}
                    sendLabel={waiting.length > 1 ? "Send & next" : "Send reply"}
                    onReplied={() => {
                      const id = current.id;
                      const next = nextAfter(id);
                      // A moment to see "Sent", then on to the next one.
                      window.setTimeout(() => {
                        onReplied(id);
                        onOpenId(next);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }, 1200);
                    }}
                  />
                ) : null}
                <CoachChatPanel
                  key={`chat-${current.id}`}
                  className="xl:sticky xl:top-20"
                  companyId={companyId}
                  memberId={current.id}
                  memberName={current.name}
                  onRead={onMessagesRead}
                />
              </div>
            </div>
          ) : (
            <p className="hidden rounded-[1.25rem] border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:block">Pick someone.</p>
          )}
        </div>
      )}
    </div>
  );
}
