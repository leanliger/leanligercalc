"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  ClipboardList,
  Lock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  ChevronDown,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Columns3,
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
  FileText,
  LifeBuoy,
  Sprout,
  HeartPulse,
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
import { CoachAccountability } from "@/components/coach-accountability";
import { CoachFirstDays } from "@/components/coach-first-days";
import { CoachSystemHealth } from "@/components/coach-system-health";
import { CoachCalorieAdherence, adherenceRows } from "@/components/coach-calorie-adherence";
import { healthIssues, type SystemHealth } from "@/lib/system-health";
import {
  COLUMNS,
  DEFAULT_EXTRA,
  OPTIONAL_COLUMNS,
  goalDate,
  parseColumns,
  sortMembers,
  weightTrend,
  type ColumnDef,
  type ColumnGroup,
  GROUP_LABEL,
  type ColumnKey,
  type SortDir,
  COLUMNS_KEY,
} from "@/lib/member-columns";
import { FIRST_DAYS, firstDays } from "@/lib/first-days";
import { EffortResultsChart } from "@/components/combined-charts";
import { needsHelp, noAnswer } from "@/lib/accountability";
import { messagePreview, type ChatThread } from "@/lib/messages";
import { CoachAnnouncements, CoachDigestToggle, DigestHistory } from "@/components/coach-announcements";
import { BulkBar } from "@/components/coach-bulk";
import { ClientFileLauncher, MemberInsights, useInsightsData } from "@/components/coach-member-insights";
import { NeedleCard } from "@/components/coach-coaching-cards";
import type { CoachChange } from "@/lib/needle";
import { muscleCheck } from "@/lib/member-insights";
import { CoachLiftGoals } from "@/components/lift-goals-card";
import { isCutting } from "@/lib/lift-goals";
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
import {
  ActionQueue,
  Avatar,
  CoachBottomNav,
  CoachNav,
  KudosButton,
  PhotoStorageMeter,
  WeekStrip,
  isAtRisk,
  newestWinLabel,
  queueReason,
  QUIET_DAYS,
  type CoachNavItem,
  type QueueKind,
} from "@/components/coach-today";
import { reasonLabel, tallyReasons } from "@/lib/miss-reasons";
import { STATUS_LABEL as ROSTER_STATUS, checkinLabel, rosterInfo, type CoachStatus, type RosterInfo } from "@/lib/roster";
import { CoachIntakeChart, CoachNutritionReport } from "@/components/coach-member-food";
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
import { addDays, daysBetween, formatShort, todayISO } from "@/lib/dates";
import { ZONES, type Zone } from "@/lib/habits";
import { PAUSE_REASON_LABELS, type PausePeriod } from "@/lib/pause";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/** The list's quick filters; "risk" is any flag but a check-in waiting on the coach; "safety" is losing too fast or eating too little. */
// "risk" and "ontrack" stay readable for views saved before the status bar replaced them.
type Filter = "all" | "risk" | "ontrack" | "safety" | "quiet" | Flag;

/** Filters → Show. At risk / On track are the status bar now. */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reply", label: "Check-ins to review" },
];
/** Names for the filters that aren't buttons, for their chip. */
const FILTER_NAMES: Partial<Record<Filter, string>> = { risk: "At risk", ontrack: "On track (old)", safety: "Safety", quiet: `Quiet ${QUIET_DAYS}+ days` };

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
  if (f === "quiet") {
    // No message, check-in reply or reminder from you in QUIET_DAYS (counted from when they started sharing if never).
    const from = (m.data.lastCoachContact ?? m.data.sharing.since)?.slice(0, 10);
    return !!from && daysBetween(from, todayISO()) >= QUIET_DAYS;
  }
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
  /** Saved since the roster: the status bar's filter, the column sort and the columns on. Older views leave them out. */
  status?: CoachStatus | null;
  colSort?: { key: ColumnKey; dir: SortDir } | null;
  columns?: ColumnKey[];
}

/** Views that add something the status bar and filters don't. */
const BUILT_IN_VIEWS: SavedView[] = [
  { id: "needs-reply", name: "Check-ins to review", filter: "reply", tag: null, sort: "attention", query: "" },
  { id: "safety", name: "Safety", filter: "safety", tag: null, sort: "attention", query: "" },
  { id: "quiet", name: `Quiet ${QUIET_DAYS}+ days`, filter: "quiet", tag: null, sort: "attention", query: "", colSort: { key: "contact", dir: -1 } },
];

/** How often the dashboard reloads by itself while it's open and showing. */
const AUTO_REFRESH_MS = 3 * 60_000;

/** The dashboard's sections. */
type View = "today" | "inbox" | "members" | "accountability" | "first-days" | "calories" | "programs" | "automations" | "growth" | "health";

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
  // A column heading's sort (src/lib/member-columns.ts), over the sort buttons until one of them is picked again.
  // Opens sorted by Status, needs attention first.
  const [colSort, setColSort] = React.useState<{ key: ColumnKey; dir: SortDir } | null>({ key: "status", dir: -1 });
  // The status bar's filter (Needs attention / Monitor / On track).
  const [statusFilter, setStatusFilter] = React.useState<CoachStatus | null>(null);
  // The headings scroll sideways with the list (they sit outside it, to stick to the top).
  const headScroll = React.useRef<HTMLDivElement>(null);
  const bodyScroll = React.useRef<HTMLDivElement>(null);
  const barScroll = React.useRef<HTMLDivElement>(null);
  // How wide the list's content is when it doesn't fit (0 when it does): sizes the pinned scrollbar.
  const [listWide, setListWide] = React.useState(0);
  React.useEffect(() => {
    const el = bodyScroll.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setListWide(el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    measure();
    return () => ro.disconnect();
  });
  const chooseSort = (v: MemberSort) => {
    setSort(v);
    setColSort(null);
  };
  const sortByColumn = (key: ColumnKey) =>
    setColSort((c) => (c?.key === key ? { key, dir: c.dir === 1 ? -1 : 1 } : { key, dir: COLUMNS.find((x) => x.key === key)!.firstDir }));
  // The optional columns picked, remembered on this device.
  const [extraCols, setExtraCols] = React.useState<ColumnKey[]>(DEFAULT_EXTRA);
  React.useEffect(() => {
    try {
      setExtraCols(parseColumns(localStorage.getItem(COLUMNS_KEY)));
    } catch {
      /* no storage: the default */
    }
  }, []);
  const setColumns = (next: ColumnKey[]) => {
    const keep = OPTIONAL_COLUMNS.filter((k) => next.includes(k));
    setExtraCols(keep);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(keep));
    } catch {
      /* not remembered */
    }
  };
  const toggleColumn = (key: ColumnKey, on: boolean) => {
    const next = OPTIONAL_COLUMNS.filter((k) => (k === key ? on : extraCols.includes(k)));
    setExtraCols(next);
    if (!on && colSort?.key === key) setColSort(null);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  // Members as the table, or on the Effort vs results chart.
  const [membersAs, setMembersAs] = React.useState<"list" | "chart">("list");
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
  // From the address too (?tab=…), so a refresh or coming back keeps the tab.
  const [tab, setTab] = React.useState<DetailTab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return DETAIL_TABS.some((x) => x.id === t) ? (t as DetailTab) : "overview";
  });

  // Keep the open member and tab in the address bar, so it can be bookmarked or shared with another admin.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("member", selected);
    else url.searchParams.delete("member");
    if (selected && tab !== "overview") url.searchParams.set("tab", tab);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [selected, tab]);

  // When the overview last loaded, for refreshing on coming back to the tab.
  const lastLoad = React.useRef(0);
  /** Load the overview; `silent` (the auto-refresh) keeps what's showing if it fails. */
  const load = React.useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    lastLoad.current = Date.now();
    try {
      const res = await fetch(`/api/coach/overview?company=${encodeURIComponent(companyId)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      const body = isJson ? ((await res.json()) as CoachOverview & { error?: string }) : null;
      if (!res.ok || !body) {
        if (!silent) setError(
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
      if (!silent) setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (!silent) setLoading(false);
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
  const tagNames = (id: string) =>
    (tagsData?.members[id] ?? [])
      .map((t) => tagsData?.tags.find((x) => x.id === t)?.name)
      .filter(Boolean)
      .join(", ");
  // The roster's worked-out columns (src/lib/roster.ts), once per overview.
  const roster = React.useMemo(() => new Map(summaries.map((m) => [m.data.userId, rosterInfo(m, today)])), [summaries, today]);
  const rosterOf = (id: string) => roster.get(id)!;
  // Next action: the member's Today row (queueReason), else a win to celebrate.
  const unreadThreads = new Map(chats.threads.filter((t) => t.unread > 0 && !t.last.fromCoach).map((t) => [t.memberId, t]));
  const nextOf = (m: MemberSummary): NextAction => {
    const r = queueReason(m, { thread: unreadThreads.get(m.data.userId), triage: triaged.get(m.data.userId), now: Date.now(), today });
    // When their calorie misses share a reason (2+ in the last two weeks), say so on the rows it explains.
    const why = tallyReasons((m.data.missReasons ?? []).filter((x) => x.date >= addDays(today, -14)))[0];
    const they = why && why.count >= 2 ? ` · they say: ${why.label.toLowerCase()} (${why.count}×)` : "";
    if (r) return { kind: r.kind, reason: r.kind === "risk" || r.kind === "drop-off" || r.kind === "quiet" ? r.reason + they : r.reason };
    const win = newestWinLabel(m, unit);
    return win ? { kind: "win", reason: win } : null;
  };
  const nextRank = (id: string) => {
    const m = summaries.find((s) => s.data.userId === id);
    const n = m ? nextOf(m) : null;
    return n ? 10 - NEXT_RANK[n.kind] : -1;
  };
  const pool = statusFilter ? filtered.filter((m) => rosterOf(m.data.userId).status === statusFilter) : filtered;
  // A member page's ‹ ›: the next and previous member in the list's order (filters and sort as they are; everyone when they're filtered out).
  const memberNav = (id: string) => {
    const order = (shown.some((m) => m.data.userId === id) ? shown : summaries).map((m) => m.data.userId);
    const i = order.indexOf(id);
    return {
      index: i,
      total: order.length,
      prev: i > 0 ? () => openMember(order[i - 1]!, tab) : null,
      next: i >= 0 && i < order.length - 1 ? () => openMember(order[i + 1]!, tab) : null,
    };
  };
  // Next action's button, the same as on the list.
  const nextButtonFor = (m: MemberSummary): React.ReactNode => {
    const n = nextOf(m);
    return n?.kind === "win" ? (
      <KudosButton m={m} unit={unit} onKudos={sendKudos} />
    ) : n ? (
      <Button size="sm" variant={NEXT_BUTTON[n.kind].primary ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => openInbox(m.data.userId)}>
        {NEXT_BUTTON[n.kind].label}
      </Button>
    ) : null;
  };
  const shown = colSort
    ? sortMembers(pool, colSort.key, colSort.dir, { today, tagNames, roster: rosterOf, next: nextRank })
    : sort === "health"
      ? [...pool].sort((a, b) => (a.health?.score ?? 101) - (b.health?.score ?? 101))
      : sort === "name"
        ? [...pool].sort((a, b) => a.displayName.localeCompare(b.displayName))
        : pool;
  // The list's columns on a computer: the fixed ones and the picks, in the picker's order.
  const visibleCols = COLUMNS.filter((c) => c.fixed || extraCols.includes(c.key));
  // The narrowest the list can be before it scrolls sideways: the select and remind boxes, 13rem for the client, every column and its gap.
  // Column groups: a label over each run of the same group, and a faint line where one starts.
  const groupRuns: { group: ColumnGroup; span: number }[] = [];
  for (const c of visibleCols) {
    const last = groupRuns[groupRuns.length - 1];
    if (last && last.group === c.group) last.span++;
    else groupRuns.push({ group: c.group, span: 1 });
  }
  const groupStarts = new Set(visibleCols.filter((c, i) => i === 0 || visibleCols[i - 1]!.group !== c.group).map((c) => c.key));
  const listMinRem = 5 + 13 + 1.5 + visibleCols.reduce((n, c) => n + parseFloat(c.width) + 0.75, 0);
  const gridStyle = {
    "--member-cols": `minmax(13rem,1fr) ${visibleCols.map((c) => c.width).join(" ")}`,
    "--member-min": `${listMinRem}rem`,
  } as React.CSSProperties;
  const current = summaries.find((m) => m.data.userId === selected) ?? null;
  const hasPlan = React.useCallback((id: string) => summaries.some((m) => m.data.userId === id && m.hasPlan), [summaries]);
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
    setFresh(0);
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
  // Today's rows you marked done or snoozed: "kind:memberId" → the day they show again (worker/coach-queue.ts).
  const [snoozes, setSnoozes] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    fetch(`/api/coach/snoozes?company=${encodeURIComponent(companyId)}&today=${today}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ snoozes: { member: string; kind: string; until: string }[] }>) : null))
      .then((b) => b && setSnoozes(new Map(b.snoozes.map((s) => [`${s.kind}:${s.member}`, s.until]))))
      .catch(() => {
        /* everything shows */
      });
  }, [companyId, today]);
  const snooze = (member: string, kind: string, until: string | null) => {
    setSnoozes((prev) => {
      const next = new Map(prev);
      if (until) next.set(`${kind}:${member}`, until);
      else next.delete(`${kind}:${member}`);
      return next;
    });
    void fetch("/api/coach/snoozes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ company: companyId, member, kind, until }),
    }).catch(() => {});
  };

  // Every few minutes (and on coming back to the tab), the overview reloads quietly; new check-ins get a pill.
  const [fresh, setFresh] = React.useState(0);
  const seenWaiting = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (!overview) return;
    const now = new Set(summaries.filter((m) => m.flags.includes("reply")).map((m) => m.data.userId));
    const before = seenWaiting.current;
    if (before) {
      const added = [...now].filter((id) => !before.has(id)).length;
      if (added > 0) setFresh((n) => n + added);
    }
    seenWaiting.current = now;
  }, [overview, summaries]);
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
      if (view === "today" || view === "inbox") void loadWaiting();
    };
    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > 60_000) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, loadWaiting, view]);

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
    { id: "go-accountability", group: "Go to", label: "Accountability checks", keywords: "slipping help check", run: () => go("accountability") },
    { id: "go-calories", group: "Go to", label: "Calorie adherence", keywords: "nutrition calories under over food", run: () => go("calories") },
    { id: "go-health", group: "Go to", label: "System health", keywords: "jobs notifications digest status errors", run: () => go("health") },
    { id: "go-first-days", group: "Go to", label: `First ${FIRST_DAYS} days`, keywords: "new members onboarding stuck", run: () => go("first-days") },
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
        { id: `ins-${id}`, group: "Members", label: `Insights: ${name}`, hint, keywords: kw, searchOnly: true, run: () => openMember(id, "insights") },
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
  // Accountability checks that need you: asked for help or struggling, or no answer (src/lib/accountability.ts).
  const firstDaysRows = React.useMemo(() => firstDays(overview?.members ?? [], today, hasPlan), [overview, today, hasPlan]);
  const accountabilityNeeds = summaries.filter(
    (m) => needsHelp(m.data.accountability, m.data.lastCoachContact) || noAnswer(m.data.accountability, m.data.lastCoachContact, Date.now()),
  ).length;
  // System health's red dot (src/lib/system-health.ts): checked on load and every 3 minutes while the dashboard shows.
  const [healthIssueList, setHealthIssueList] = React.useState<string[]>([]);
  React.useEffect(() => {
    let live = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/coach/health?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } });
        if (!res.ok) return;
        const h = (await res.json()) as SystemHealth;
        if (live) setHealthIssueList(healthIssues(h, Date.now()));
      } catch {
        /* keep the last answer */
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 180_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [companyId]);
  const members = overview?.members ?? [];
  const healthAlertList = [...healthIssueList, ...(members.length > 0 && !members.some((m) => m.joinedAt) ? ["Whop isn't sending join dates"] : [])];
  const healthAlert = healthAlertList.length ? `System health: ${healthAlertList.join(" · ")}` : null;
  // Calorie adherence over the last two weeks (src/lib/nutrition-report.ts): off target counts on the menu.
  const calorieRows = React.useMemo(() => adherenceRows(summaries, today), [summaries, today]);
  const calorieOff = calorieRows.rows.filter((r) => r.a.verdict !== "on-track").length;
  // New members past a first step's day (src/lib/first-days.ts).
  const newStuck = firstDaysRows.filter((r) => r.status === "stuck").length;
  const navItems: CoachNavItem[] = [
    { id: "today", group: "Daily", label: "Today", icon: <Sun />, active: view === "today", onSelect: showToday },
    { id: "inbox", group: "Daily", label: "Inbox", icon: <Inbox />, count: counts.toReview + chats.unread, active: view === "inbox", onSelect: () => openInbox() },
    { id: "members", group: "Members", label: "Members", icon: <Users />, note: summaries.length, active: view === "members", onSelect: () => showMembers("all") },
    { id: "accountability", group: "Members", label: "Accountability", icon: <LifeBuoy />, count: accountabilityNeeds, active: view === "accountability", onSelect: () => go("accountability") },
    { id: "first-days", group: "Members", label: `First ${FIRST_DAYS} days`, icon: <Sprout />, count: newStuck, active: view === "first-days", onSelect: () => go("first-days") },
    { id: "calories", group: "Members", label: "Calorie adherence", icon: <Scale />, count: calorieOff, active: view === "calories", onSelect: () => go("calories") },
    { id: "programs", group: "Setup", label: "Programs", icon: <ClipboardList />, active: view === "programs", onSelect: () => go("programs") },
    { id: "automations", group: "Setup", label: "Automations", icon: <Workflow />, active: view === "automations", onSelect: () => go("automations") },
    { id: "growth", group: "Setup", label: "Growth", icon: <TrendingUp />, active: view === "growth", onSelect: () => go("growth") },
    { id: "health", group: "Setup", label: "System health", icon: <HeartPulse />, alert: healthAlert, active: view === "health", onSelect: () => go("health") },
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
          {fresh > 0 && overview ? (
            <div role="status" className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                {fresh} new check-in{fresh === 1 ? "" : "s"} since you opened the dashboard
              </span>
              <button type="button" onClick={() => openInbox()} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
                Open inbox
              </button>
              <button type="button" onClick={() => setFresh(0)} aria-label="Dismiss" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
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
          ) : view === "accountability" ? (
            <CoachAccountability companyId={companyId} summaries={summaries} names={people} onMessage={(id) => openInbox(id)} />
          ) : view === "calories" ? (
            <CoachCalorieAdherence
              rows={calorieRows.rows}
              noTargets={calorieRows.noTargets}
              onMessage={(id) => openInbox(id)}
              onOpen={(id) => openMember(id, "food")}
            />
          ) : view === "health" ? (
            <CoachSystemHealth companyId={companyId} members={overview?.members ?? []} />
          ) : view === "first-days" ? (
            <CoachFirstDays
              members={overview?.members ?? []}
              today={today}
              hasPlan={hasPlan}
              names={people}
              onMessage={(id) => openInbox(id)}
              onOpen={(id) => openMember(id)}
            />
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
              tags={tagsData}
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
                  today={today}
                  snoozes={snoozes}
                  onSnooze={snooze}
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
              roster={rosterOf(current.data.userId)}
              next={nextOf(current)}
              nextButton={nextButtonFor(current)}
              tagSummary={tagNames(current.data.userId)}
              nav={memberNav(current.data.userId)}
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
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 id="coach-members" className="text-base font-semibold">
                  Members
                </h2>
                <span className="tabular text-[12px] text-muted-foreground">{summaries.length} sharing</span>
              </div>

              {/* Status at a glance, each a filter (src/lib/roster.ts). */}
              <div role="radiogroup" aria-label="Filter by status" className="grid grid-cols-3 gap-2">
                {(["attention", "monitor", "on-track"] as const).map((s) => {
                  const n = filtered.filter((m) => rosterOf(m.data.userId).status === s).length;
                  const on = statusFilter === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStatusFilter(on ? null : s)}
                      className={cn(
                        "rounded-xl border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? STATUS_RING[s] : "border-border",
                      )}
                    >
                      <span className={cn("tabular block text-xl font-semibold leading-tight", STATUS_TEXT[s])}>{n}</span>
                      <span className="text-[12px] text-muted-foreground">{ROSTER_STATUS[s]}</span>
                    </button>
                  );
                })}
              </div>

              {/* One toolbar: search, then Filters, Views and Columns as menus, and List / Chart. */}
              <div className="flex flex-wrap items-center gap-2">
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
                    className="h-9 pl-9"
                  />
                </div>
                <ToolbarMenu label="Filters" icon={<SlidersHorizontal />} count={(filter !== "all" ? 1 : 0) + (tagFilter ? 1 : 0)} wide>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Show</p>
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
                                "h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                              )}
                            >
                              {f.label} <span className="tabular opacity-80">{n}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="coach-flag" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Flag
                      </label>
                      <select
                        id="coach-flag"
                        value={(FLAG_FILTERS as readonly string[]).includes(filter) ? filter : ""}
                        onChange={(e) => setFilter((e.target.value || "all") as Filter)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Any flag</option>
                        {FLAG_FILTERS.map((f) => (
                          <option key={f} value={f}>
                            {FLAG_LABELS[f]} ({summaries.filter((m) => m.flags.includes(f)).length})
                          </option>
                        ))}
                      </select>
                    </div>
                    {tagsData && tagsData.tags.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tag</p>
                        <div role="radiogroup" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
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
                      </div>
                    ) : null}
                  </div>
                </ToolbarMenu>
                {/* The one sort menu: Status (the default), Name, and every column; headings sort too. */}
                <label className="sr-only" htmlFor="coach-sort">
                  Sort
                </label>
                <select
                  id="coach-sort"
                  value={colSort ? `col:${colSort.key}` : sort}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "name" || v === "attention" || v === "health") chooseSort(v);
                    else {
                      const key = v.slice(4) as ColumnKey;
                      setColSort({ key, dir: COLUMNS.find((c) => c.key === key)!.firstDir });
                    }
                  }}
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="col:status">Sort: Status</option>
                  <option value="name">Sort: Name</option>
                  {/* Only while a saved view from before uses them. */}
                  {!colSort && sort === "attention" ? <option value="attention">Sort: Most urgent</option> : null}
                  {!colSort && sort === "health" ? <option value="health">Sort: Health score</option> : null}
                  {[...visibleCols.filter((c) => c.key !== "status" && c.key !== "contact"), COLUMNS.find((c) => c.key === "contact")!].map((c) => (
                    <option key={c.key} value={`col:${c.key}`}>
                      Sort: {c.label}
                    </option>
                  ))}
                </select>
                <ToolbarMenu label="Views" icon={<Bookmark />} wide>
                  <SavedViews
                    companyId={companyId}
                    current={{ filter, tag: tagFilter, sort, query, status: statusFilter, colSort, columns: extraCols }}
                    count={(v) => summaries.filter((m) => inView(m, v) && (!v.status || rosterOf(m.data.userId).status === v.status)).length}
                    onApply={(v) => {
                      setFilter(v.filter);
                      setTagFilter(v.tag);
                      setQuery(v.query);
                      setStatusFilter(v.status ?? null);
                      // Older views saved the sort buttons; newer ones the column sort.
                      if (v.colSort !== undefined) setColSort(v.colSort);
                      else chooseSort(v.sort);
                      if (v.columns) setColumns(v.columns);
                    }}
                  />
                </ToolbarMenu>
                <ColumnPicker extra={extraCols} onToggle={toggleColumn} />
                <SegmentedControl
                  ariaLabel="Show members as"
                  size="sm"
                  value={membersAs}
                  onValueChange={setMembersAs}
                  options={[
                    { value: "list" as const, label: "List" },
                    { value: "chart" as const, label: "Chart" },
                  ]}
                  className="w-auto"
                />
              </div>

              {/* What's filtering the list, each removable; and how it's sorted. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-muted-foreground">
                {statusFilter ? <FilterChip label={`Status: ${ROSTER_STATUS[statusFilter]}`} onRemove={() => setStatusFilter(null)} /> : null}
                {filter !== "all" ? (
                  <FilterChip
                    label={FILTERS.find((f) => f.value === filter)?.label ?? FILTER_NAMES[filter] ?? `Flag: ${FLAG_LABELS[filter as Flag]}`}
                    onRemove={() => setFilter("all")}
                  />
                ) : null}
                {tagFilter ? (
                  <FilterChip label={`Tag: ${tagsData?.tags.find((t) => t.id === tagFilter)?.name ?? "tag"}`} onRemove={() => setTagFilter(null)} />
                ) : null}
                {statusFilter || filter !== "all" || tagFilter ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => {
                      setStatusFilter(null);
                      setFilter("all");
                      setTagFilter(null);
                    }}
                  >
                    Clear all
                  </button>
                ) : null}
                {membersAs === "list" ? (
                  <span className="ml-auto flex flex-wrap items-center gap-x-2">
                    {colSort ? (
                      <>
                        Sorted by {COLUMNS.find((c) => c.key === colSort.key)!.label.toLowerCase()},{" "}
                        {colSort.key === "status"
                          ? colSort.dir === -1
                            ? "needs attention first"
                            : "on track first"
                          : colSort.key === "contact" || colSort.key === "active"
                            ? colSort.dir === -1
                              ? "longest ago first"
                              : "most recent first"
                            : colSort.dir === 1
                              ? "low to high"
                              : "high to low"}
                        .
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => sortByColumn(colSort.key)}>
                          Reverse
                        </button>
                        {colSort.key !== "status" ? (
                          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setColSort({ key: "status", dir: -1 })}>
                            Back to status
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        Sorted by {sort === "health" ? "health score" : sort === "name" ? "name" : "most urgent"}.
                        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setColSort({ key: "status", dir: -1 })}>
                          Back to status
                        </button>
                      </>
                    )}
                  </span>
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
              ) : membersAs === "chart" ? (
                // Everyone shown (with the filter, tag and search above) on Effort vs results.
                <EffortResultsChart members={shown} onOpen={(id) => openMember(id)} />
              ) : (
                <>
                <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-muted-foreground sm:hidden">
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
                <div className="molten-card rounded-[1.25rem] border border-primary/15 bg-card">
                  {/* Headings: stick under the page header while the list scrolls down, and follow it sideways (synced in onScroll below). */}
                  <div ref={headScroll} className="sticky top-16 z-20 hidden overflow-hidden rounded-t-[1.25rem] border-b border-b-border bg-card sm:block">
                    <div className="min-w-[var(--member-min)] text-[11px] font-medium uppercase tracking-wide text-muted-foreground" style={gridStyle}>
                      {/* Column groups: a label over each run of the same group. */}
                      <div className="flex border-b border-b-border/60">
                        <div className="sticky left-0 z-20 w-20 shrink-0 bg-card" />
                        <div className={cn("grid flex-1 gap-x-3 border-l-2 border-l-transparent px-3 py-1", ROW_GRID)} style={gridStyle}>
                          <span className="sticky left-20 z-20 -ml-3 bg-card pl-3" />
                          {groupRuns.map((g, i) => (
                            <span key={i} style={{ gridColumn: `span ${g.span}` }} className="truncate border-l border-border/60 pl-3 text-[10px] text-muted-foreground/80">
                              {GROUP_LABEL[g.group]}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex">
                        {/* Pinned: select all (over the select boxes), then Client, stay put while the columns scroll. */}
                        <div className="sticky left-0 z-20 flex w-20 shrink-0 items-center bg-card">
                          <label className="flex w-10 cursor-pointer items-center justify-center" title={`Select all ${shown.length} shown, for bulk actions`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[hsl(var(--primary))]"
                              aria-label={`Select all ${shown.length} shown, for bulk actions`}
                              checked={shown.length > 0 && shown.every((m) => picked.includes(m.data.userId))}
                              onChange={(e) => {
                                const ids = shown.map((m) => m.data.userId);
                                setPicked((p) => (e.target.checked ? [...new Set([...p, ...ids])] : p.filter((id) => !ids.includes(id))));
                              }}
                            />
                          </label>
                        </div>
                        <div className={cn("grid flex-1 gap-x-3 border-l-2 border-l-transparent px-3 py-2", ROW_GRID)} style={gridStyle}>
                          <span className="sticky left-20 z-20 -ml-3 bg-card pl-3">Client</span>
                          {visibleCols.map((c) => {
                            const on = colSort?.key === c.key;
                            return (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => sortByColumn(c.key)}
                                aria-label={`Sort by ${c.label}${on ? `, now ${colSort!.dir === 1 ? "low to high" : "high to low"}` : ""}`}
                                className={cn(
                                  "flex items-center gap-0.5 whitespace-nowrap uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  ALIGN_HEAD[c.align],
                                  groupStarts.has(c.key) && GROUP_EDGE,
                                  on && "text-foreground",
                                )}
                              >
                                {c.label}
                                {on ? colSort!.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    ref={bodyScroll}
                    onScroll={(e) => {
                      const x = e.currentTarget.scrollLeft;
                      if (headScroll.current) headScroll.current.scrollLeft = x;
                      if (barScroll.current && barScroll.current.scrollLeft !== x) barScroll.current.scrollLeft = x;
                    }}
                    className={cn(
                      "overflow-hidden rounded-[1.25rem] sm:overflow-x-auto sm:rounded-t-none",
                      // Its own scrollbar hides while the pinned one below shows.
                      listWide && "sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden",
                    )}
                  >
                  {/* The card's width; wider (and scrolling) only when the columns on don't fit. */}
                  <div className="sm:min-w-[var(--member-min)]" style={gridStyle}>
                  <ul className="divide-y divide-border">
                    {shown.map((m) => {
                      const ticked = picked.includes(m.data.userId);
                      const next = nextOf(m);
                      return (
                        <li key={m.data.userId} className={cn("flex items-stretch", ticked && TICKED)}>
                          <div className={cn("flex w-20 shrink-0 items-stretch sm:sticky sm:left-0 sm:z-10 sm:bg-card", ticked && TICKED)}>
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
                          <div className="flex w-10 shrink-0 items-center justify-center">
                            <RemindMenu
                              companyId={companyId}
                              members={[{ id: m.data.userId, name: m.displayName }]}
                              suggested={suggestedReminders(m)}
                              recent={reminderState.reminders}
                              onSent={reminderState.setReminders}
                            />
                          </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <MemberRow
                              m={m}
                              unit={unit}
                              selected={m.data.userId === selected}
                              onOpen={() => openMember(m.data.userId)}
                              tags={<TagChips tags={tagsData?.tags ?? []} ids={tagsData?.members[m.data.userId]} />}
                              cols={visibleCols}
                              gridStyle={gridStyle}
                              today={today}
                              tagNames={tagNames(m.data.userId)}
                              roster={rosterOf(m.data.userId)}
                              next={next}
                              ticked={ticked}
                              groupStarts={groupStarts}
                              nextButton={
                                next?.kind === "win" ? (
                                  <KudosButton m={m} unit={unit} onKudos={sendKudos} />
                                ) : next ? (
                                  <Button size="sm" variant={NEXT_BUTTON[next.kind].primary ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => openInbox(m.data.userId)}>
                                    {NEXT_BUTTON[next.kind].label}
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => openMember(m.data.userId)}>
                                    Open
                                  </Button>
                                )
                              }
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                  </div>
                  {/* When the columns don't fit: a scrollbar pinned to the bottom of the window (above the phone bar), not the bottom of the list. */}
                  {listWide ? (
                    <div
                      ref={barScroll}
                      onScroll={(e) => {
                        const x = e.currentTarget.scrollLeft;
                        if (bodyScroll.current && bodyScroll.current.scrollLeft !== x) bodyScroll.current.scrollLeft = x;
                        if (headScroll.current) headScroll.current.scrollLeft = x;
                      }}
                      aria-hidden
                      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 hidden overflow-x-auto rounded-b-[1.25rem] border-t border-border bg-card/95 backdrop-blur sm:block lg:bottom-0"
                    >
                      <div style={{ width: listWide, height: 1 }} />
                    </div>
                  ) : null}
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
  current: Pick<SavedView, "filter" | "tag" | "sort" | "query" | "status" | "colSort" | "columns">;
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
  // A view matches when what it saved matches (older views saved less, so they match on that).
  const same = (v: SavedView) =>
    v.filter === current.filter &&
    v.tag === current.tag &&
    v.query.trim() === current.query.trim() &&
    (v.status ?? null) === (current.status ?? null) &&
    (v.colSort === undefined ? v.sort === current.sort : JSON.stringify(v.colSort) === JSON.stringify(current.colSort)) &&
    (v.columns === undefined || JSON.stringify(v.columns) === JSON.stringify(current.columns));
  const isDefault =
    current.filter === "all" && current.tag === null && current.query.trim() === "" && !current.status && current.colSort?.key === "status" && current.colSort.dir === -1;
  const unsaved = !isDefault && ![...BUILT_IN_VIEWS, ...mine].some(same);
  const save = () => {
    const name = (naming ?? "").trim();
    if (!name) return;
    store([...mine, { id: `v${Date.now().toString(36)}`, name: name.slice(0, 40), ...current, query: current.query.trim(), status: current.status ?? null, colSort: current.colSort ?? null }]);
    setNaming(null);
  };
  const chip = (v: SavedView, removable: boolean) => {
    const on = same(v);
    return (
      <span key={v.id} className={cn("inline-flex h-8 items-center rounded-full border text-xs font-medium", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onApply(on ? { ...v, filter: "all", tag: null, sort: "attention", query: "", status: null, colSort: { key: "status", dir: -1 }, columns: undefined } : v)}
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
// Phones: name and health; computers: the columns on (`--member-cols`, set where the list is drawn).
const ROW_GRID = "grid-cols-[minmax(0,1fr)] sm:[grid-template-columns:var(--member-cols)]";
/** Flags the row already shows in a column (check-in, last active, habits, goal): left out of the flags chip. */
const SHOWN_IN_ROW: ReadonlySet<Flag> = new Set<Flag>(["reply", "checkin", "inactive", "red", "no-plan"]);
/** No contact from you in this many days turns "you: …" red. */
const CONTACT_LATE_DAYS = 7;
const ALIGN_HEAD = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;
/** How long they've been coached: "day 3", "wk 8". */
const coachingLength = (start: string, today: string) => {
  const d = Math.max(0, daysBetween(start, today));
  return d < 7 ? `day ${d + 1}` : `wk ${Math.floor(d / 7) + 1}`;
};
/** A cell's second line: smaller and muted. */
function Line2({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("mt-0.5 block truncate text-[11px] text-muted-foreground", className)} title={title}>
      {children}
    </span>
  );
}

/** The faint line where a column group starts. */
const GROUP_EDGE = "border-l border-border/60 pl-3";
const STATUS_RING: Record<CoachStatus, string> = {
  attention: "border-destructive/60 ring-1 ring-destructive/40",
  monitor: "border-warning/60 ring-1 ring-warning/40",
  "on-track": "border-success/60 ring-1 ring-success/40",
};
const STATUS_TEXT: Record<CoachStatus, string> = { attention: "text-destructive", monitor: "text-warning", "on-track": "text-success" };

/** An active filter, with × to remove it. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-primary">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * A toolbar button that opens a panel (Filters, Views): under it on a
 * computer, a full-screen sheet on a phone. Closes on a click outside or Escape.
 */
function ToolbarMenu({ label, icon, count, wide, children }: { label: string; icon: React.ReactNode; count?: number; wide?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-3.5 [&_svg]:w-3.5",
          count ? "border-primary/50 text-foreground" : "border-border text-muted-foreground",
        )}
      >
        {icon}
        {label}
        {count ? <span className="tabular rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{count}</span> : null}
      </button>
      {open ? (
        <div
          className={cn(
            "fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] top-20 z-50 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl",
            "sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-[70vh] sm:rounded-xl",
            wide ? "sm:w-[26rem]" : "sm:w-64",
          )}
        >
          <div className="mb-2 flex items-center justify-between sm:hidden">
            <p className="text-sm font-semibold">{label}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/40">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A ticked row's tint, painted over the pinned cells' solid background too. */
const TICKED = "shadow-[inset_0_0_0_999px_hsl(var(--primary)/0.06)]";

/** Members → Next action: the member's Today row, or a win. */
type NextAction = { kind: QueueKind; reason: string } | null;
const NEXT_RANK: Record<QueueKind, number> = { safety: 0, help: 0.5, "drop-off": 1, checkin: 2, message: 3, noanswer: 3.5, muscle: 4, risk: 5, quiet: 6, win: 7 };
const NEXT_LABEL: Record<QueueKind, string> = {
  safety: "Safety",
  help: "Asked for help",
  "drop-off": "May quit",
  checkin: "Check-in",
  message: "Message",
  noanswer: "No answer",
  muscle: "Losing muscle",
  risk: "Drifting",
  quiet: "Quiet",
  win: "Win",
};
const NEXT_BUTTON: Record<QueueKind, { label: string; primary?: boolean }> = {
  safety: { label: "Message", primary: true },
  help: { label: "Reply", primary: true },
  "drop-off": { label: "Message", primary: true },
  checkin: { label: "Reply", primary: true },
  message: { label: "Reply", primary: true },
  noanswer: { label: "Message" },
  muscle: { label: "Message" },
  risk: { label: "Message" },
  quiet: { label: "Message" },
  win: { label: "Kudos" },
};
const STATUS_CHIP: Record<CoachStatus, string> = {
  attention: "bg-destructive/15 text-destructive",
  monitor: "bg-warning/15 text-warning",
  "on-track": "bg-success/15 text-success",
};

/** A percentage with a small bar: green 80+, amber 60–79, red under. */
function PctCell({ value, title }: { value: number | null; title?: string }) {
  if (value === null) return <span className="text-muted-foreground" title={title}>—</span>;
  const tone = value >= 80 ? "bg-success text-success" : value >= 60 ? "bg-warning text-warning" : "bg-destructive text-destructive";
  return (
    <span className="tabular inline-flex items-center gap-1.5" title={title}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/50" aria-hidden>
        <span className={cn("block h-full rounded-full", tone.split(" ")[0])} style={{ width: `${value}%` }} />
      </span>
      <span className={tone.split(" ")[1]}>{value}%</span>
    </span>
  );
}
const ALIGN_CELL = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** The picker for the optional columns (computers only: phones show name and health). */
function ColumnPicker({ extra, onToggle }: { extra: ColumnKey[]; onToggle: (key: ColumnKey, on: boolean) => void }) {
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  // Closes on a click outside it or Escape.
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative hidden sm:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="member-columns"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Columns3 className="h-3.5 w-3.5" aria-hidden />
        Columns
      </button>
      {open ? (
      <div id="member-columns" className="absolute left-0 z-30 mt-1 w-56 space-y-0.5 rounded-xl border border-border bg-card p-3 shadow-xl">
        <p className="text-xs font-semibold">Columns</p>
        <p className="pb-1 text-[11px] text-muted-foreground">Remembered on this device.</p>
        {COLUMNS.map((c) => (
          <label key={c.key} className={cn("flex items-center gap-2 py-0.5 text-sm", c.fixed ? "text-muted-foreground" : "cursor-pointer")}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={c.fixed || extra.includes(c.key)}
              disabled={c.fixed}
              onChange={(e) => onToggle(c.key, e.target.checked)}
            />
            {c.label}
            {c.fixed ? <span className="ml-auto text-[11px]">always</span> : null}
          </label>
        ))}
      </div>
      ) : null}
    </div>
  );
}

/** Their last few weekly averages as a small line: green heading where their plan wants, red the other way, amber flat. */
function TrendLine({ m, today, unit, compact }: { m: MemberSummary; today: string; unit: WeightUnit; compact?: boolean }) {
  const { weeks, changeLb } = weightTrend(m.data.weighIns, today);
  const known = weeks.map((w, i) => [i, w] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (changeLb === null || known.length < 2) return <span className="text-muted-foreground">—</span>;
  const lo = Math.min(...known.map((p) => p[1]));
  const hi = Math.max(...known.map((p) => p[1]));
  const span = Math.max(hi - lo, 0.5);
  const W = compact ? 40 : 44;
  const pts = known.map(([i, v]) => `${(i / (weeks.length - 1)) * W},${1 + (1 - (v - lo) / span) * 12}`).join(" ");
  // Their plan's direction (positive planned rate = losing); no plan: losing is the aim.
  const planned = m.progress?.plannedRate ?? null;
  const wantDown = planned === null || planned > 0.05;
  const maintain = planned !== null && Math.abs(planned) <= 0.05;
  const flat = Math.abs(changeLb) < 0.5;
  const tone = maintain ? (flat ? "text-success" : "text-warning") : flat ? "text-warning" : changeLb < 0 === wantDown ? "text-success" : "text-destructive";
  return (
    <span className="tabular inline-flex items-center gap-1.5" title={`Weekly averages: ${weeks.map((w) => (w === null ? "—" : Math.round(fromLb(w, unit) * 10) / 10)).join(" → ")} ${unit}`}>
      <svg width={W} height={14} viewBox={`-1 0 ${W + 2} 14`} className={tone} aria-hidden>
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span>{signedWeight(changeLb, unit)}</span>
    </span>
  );
}

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
  cols,
  gridStyle,
  today,
  tagNames,
  roster,
  next,
  ticked,
  groupStarts,
  nextButton,
}: {
  m: MemberSummary;
  unit: WeightUnit;
  selected: boolean;
  onOpen: () => void;
  /** Their tag chips. */
  tags?: React.ReactNode;
  /** The columns on, on a computer, and the grid they make. */
  cols: ColumnDef[];
  gridStyle: React.CSSProperties;
  today: string;
  /** Their tags' names, for the Tags column. */
  tagNames: string;
  roster: RosterInfo;
  next: NextAction;
  ticked: boolean;
  /** Columns that start a group, for the faint line between groups. */
  groupStarts: ReadonlySet<ColumnKey>;
  /** Next action's button (Reply, Message, Kudos, Open), inside its cell. */
  nextButton: React.ReactNode;
}) {
  const week = m.week.percent === null ? "—" : `${m.week.percent}%`;
  const r = roster;
  const ci = checkinLabel(r.checkin, today);
  const ciTone =
    r.checkin.kind === "overdue" ? "font-semibold text-destructive" : r.checkin.kind === "review" ? "font-semibold text-primary" : r.checkin.kind === "submitted" ? "text-success" : "text-muted-foreground";
  const activeDays = r.lastActive ? Math.max(0, daysBetween(r.lastActive, today)) : null;
  const weekClass = m.week.zone ? ZONE_TEXT[m.week.zone] : "";
  const checkin = checkinStatus(m);
  const cell = (c: ColumnDef): React.ReactNode => {
    switch (c.key) {
      case "goalType":
        return <span className={r.goal === "No plan" ? "text-muted-foreground" : ""}>{r.goal}</span>;
      case "start":
        return r.start ? (
          <span className="tabular">
            {formatShort(r.start)} <span className="text-muted-foreground">· {coachingLength(r.start, today)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "weight": {
        const lb = m.progress?.trendWeight ?? m.latestWeightLb;
        return <span className="tabular">{lb === null ? "—" : weight(lb, unit)}</span>;
      }
      case "progress":
        return r.progress ? (
          <span className="block">
            <span className="tabular inline-flex items-center gap-1.5">
              <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted/50" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${r.progress.pct}%` }} />
              </span>
              {r.progress.pct}%
            </span>
            <Line2>
              {Math.round(fromLb(r.progress.doneLb, unit) * 10) / 10} of {Math.round(fromLb(r.progress.totalLb, unit) * 10) / 10} {unit}
            </Line2>
          </span>
        ) : (
          <span className="text-muted-foreground">{r.goal === "Recomp" || r.goal === "Maintenance" ? "No weight goal" : "—"}</span>
        );
      case "goalStart":
        return (
          <span className="block">
            <span className={cn("block truncate", r.goal === "No plan" && "text-muted-foreground")}>{r.goal}</span>
            <Line2>{r.start ? `${formatShort(r.start)} · ${coachingLength(r.start, today)}` : "—"}</Line2>
          </span>
        );
      case "weightTrend": {
        const lb = m.progress?.trendWeight ?? m.latestWeightLb;
        return (
          <span className="block">
            <span className="tabular block">{lb === null ? "—" : weight(lb, unit)}</span>
            <Line2>
              <TrendLine m={m} today={today} unit={unit} compact />
            </Line2>
          </span>
        );
      }
      case "adherence": {
        // Their latest answer to "what made it difficult?" under the three (src/lib/miss-reasons.ts).
        const why = m.data.missReasons?.find((x) => x.reason);
        const part = (label: string, v: number | null, title: string) => (
          <span className="flex flex-col" title={title}>
            <span className={cn("tabular text-[13px] font-semibold leading-tight", v === null ? "text-muted-foreground" : v >= 80 ? "text-success" : v >= 60 ? "text-warning" : "text-destructive")}>
              {v === null ? "—" : `${v}%`}
            </span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </span>
        );
        return (
          <span className="block">
            <span className="flex gap-3">
              {part("Nutr", r.nutrition, "Days on their calorie target, last 14")}
              {part("Wkts", r.workouts?.pct ?? null, r.workouts ? `${r.workouts.done} of ${r.workouts.planned} planned workouts, last 14 days` : "No active program")}
              {part("Habits", r.habits, "Habit score, last 14 days")}
            </span>
            {why ? <Line2 title={why.note || undefined}>{reasonLabel(why.reason)} · {formatShort(why.date)}</Line2> : null}
          </span>
        );
      }
      case "engage":
        return (
          <span className="block">
            <span className={cn("block truncate", ciTone)}>{ci}</span>
            <Line2>
              <span className={activeDays !== null && activeDays >= 3 ? "font-semibold text-destructive" : undefined}>
                {activeDays === null ? "—" : `active ${activeDays === 0 ? "today" : `${activeDays}d ago`}`}
              </span>
              {" · "}
              <span className={contactLate ? "font-semibold text-destructive" : undefined} title={`Your last message, check-in reply or reminder: ${contactText.replace(/^you: /, "")}`}>
                {contactShort}
              </span>
            </Line2>
          </span>
        );
      case "contact":
        return <span className={cn("tabular", contactLate && "font-semibold text-destructive")}>{contactText.replace(/^you: /, "")}</span>;
      case "nutrition": {
        // Their latest answer to "what made it difficult?" (src/lib/miss-reasons.ts).
        const why = m.data.missReasons?.find((x) => x.reason);
        return (
          <span className="block">
            <PctCell value={r.nutrition} title="Days on their calorie target, last 14" />
            {why ? (
              <span className="block truncate text-[11px] text-muted-foreground" title={why.note || undefined}>
                {reasonLabel(why.reason)} · {formatShort(why.date)}
              </span>
            ) : null}
          </span>
        );
      }
      case "workoutPct":
        return <PctCell value={r.workouts?.pct ?? null} title={r.workouts ? `${r.workouts.done} of ${r.workouts.planned} planned workouts, last 14 days` : "No active program"} />;
      case "habits":
        return <PctCell value={r.habits} title="Habit score, last 14 days" />;
      case "active":
        return (
          <span className={cn("tabular", activeDays !== null && activeDays >= 3 ? "font-semibold text-destructive" : "")}>
            {activeDays === null ? "—" : activeDays === 0 ? "Today" : activeDays === 1 ? "Yesterday" : `${activeDays} days ago`}
          </span>
        );
      case "status":
        return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_CHIP[r.status])}>{ROSTER_STATUS[r.status]}</span>;
      case "next":
        return (
          <span className="flex items-center gap-2">
            {next ? (
              <span className="min-w-0 flex-1 truncate" title={`${NEXT_LABEL[next.kind]}: ${next.reason}`}>
                <span className="font-medium">{NEXT_LABEL[next.kind]}:</span> <span className="text-muted-foreground">{next.reason}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">Nothing needed</span>
            )}
            {/* Its own click, not the row's. */}
            <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {nextButton}
            </span>
          </span>
        );
      case "health":
        return (
          <span className="flex justify-center">
            <HealthPill health={m.health} />
          </span>
        );
      case "week":
        return <span className={cn("tabular font-semibold", weekClass)}>{week}</span>;
      case "trend":
        return <TrendLine m={m} today={today} unit={unit} />;
      case "lastLog":
        return <span className="text-muted-foreground">{describeDaysAgo(m.daysSinceLog)}</span>;
      case "checkin":
        return <span className={ciTone}>{ci}</span>;
      case "risk":
        return (
          <span className={m.risk.level === "high" ? "font-semibold text-destructive" : m.risk.level === "medium" ? "text-warning" : "text-muted-foreground"}>
            {m.risk.level === "high" ? `High · ${m.risk.score}` : m.risk.level === "medium" ? `Medium · ${m.risk.score}` : "Low"}
          </span>
        );
      case "goal": {
        const d = goalDate(m, today);
        return <span className="tabular">{d ? formatShort(d) : "—"}</span>;
      }
      case "workouts":
        return <span className="tabular">{m.workouts7}</span>;
      case "protein":
        return <span className="tabular">{m.food7 ? `${Math.round(m.food7.protein)} g` : "—"}</span>;
      case "joined":
        return <span className="tabular text-muted-foreground">{m.data.joinedAt ? formatShort(m.data.joinedAt.slice(0, 10)) : "—"}</span>;
      case "tags":
        return <span className="block truncate text-muted-foreground">{tagNames || "—"}</span>;
      case "program":
        return <span className="block truncate">{m.data.program ?? "—"}</span>;
    }
  };
  // One line a member: flags fold into a chip that opens them under the row.
  const extraFlags = m.flags.filter((f) => !SHOWN_IN_ROW.has(f));
  const flagCount = extraFlags.length + (m.paused ? 1 : 0);
  const urgentFlag = extraFlags.some((f) => FLAG_VARIANT[f] === "danger");
  // When you last messaged them, replied to a check-in or sent a reminder.
  const contactDays = m.data.lastCoachContact ? Math.max(0, daysBetween(m.data.lastCoachContact.slice(0, 10), today)) : null;
  const contactText = contactDays === null ? "you: never" : `you: ${contactDays === 0 ? "today" : contactDays === 1 ? "yesterday" : `${contactDays} days ago`}`;
  const contactLate = contactDays === null || contactDays >= CONTACT_LATE_DAYS;
  // The short form, for the table cell: "you: 9d".
  const contactShort = contactDays === null ? "you: never" : `you: ${contactDays === 0 ? "today" : `${contactDays}d`}`;
  const [flagsOpen, setFlagsOpen] = React.useState(false);
  return (
    <div className={cn("border-l-2 transition-colors", selected ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/40")}>
      {/* The whole row opens them; the name is the keyboard's way in. */}
      <div style={gridStyle} onClick={onOpen} className={cn("grid w-full cursor-pointer items-center gap-x-3 px-3 py-2.5 text-left", ROW_GRID)}>
        <span
          className={cn(
            "flex min-w-0 items-center gap-3 sm:sticky sm:left-20 sm:z-10 sm:-my-2.5 sm:-ml-3 sm:self-stretch sm:bg-card sm:py-2.5 sm:pl-3",
            ticked && TICKED,
            selected && "sm:shadow-[inset_0_0_0_999px_hsl(var(--primary)/0.05)]",
          )}
        >
          <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-8 w-8" />
          <span className="min-w-0 flex-1 space-y-1 sm:space-y-0">
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                aria-current={selected ? "true" : undefined}
                className="truncate rounded-sm text-left text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {m.displayName}
              </button>
              {m.streak > 0 ? (
                <span className="tabular inline-flex shrink-0 items-center gap-0.5 text-xs text-primary">
                  <Flame className="h-3 w-3" aria-hidden />
                  {m.streak}
                  <span className="sr-only">-day streak</span>
                </span>
              ) : null}
              {flagCount > 0 ? (
                <button
                  type="button"
                  aria-expanded={flagsOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlagsOpen((v) => !v);
                  }}
                  title={[m.paused ? pausedLabel(m.paused) : null, ...extraFlags.map((f) => FLAG_LABELS[f])].filter(Boolean).join("\n")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    urgentFlag ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground",
                  )}
                >
                  {flagCount} flag{flagCount === 1 ? "" : "s"}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", flagsOpen && "rotate-180")} aria-hidden />
                </button>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground sm:hidden">
              {m.data.username && m.data.name ? `@${m.data.username} · ` : ""}last log {describeDaysAgo(m.daysSinceLog)}
            </span>
            <span className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
              {/* Status, the same headline as on a computer. */}
              <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_CHIP[r.status])}>{ROSTER_STATUS[r.status]}</span>
              <TrendLine m={m} today={today} unit={unit} compact />
              <span>
                <span className={ciTone}>{ci}</span> · <span className={contactLate ? "font-semibold text-destructive" : undefined}>{contactText}</span>
              </span>
            </span>
            {next ? (
              <span className="block truncate text-xs sm:hidden">
                <span className="font-medium">{NEXT_LABEL[next.kind]}:</span> <span className="text-muted-foreground">{next.reason}</span>
              </span>
            ) : null}
            <span className="sm:hidden">{tags}</span>
          </span>
        </span>
        {/* Computers: the columns on (phones show status in the lines under the name). */}
        {cols.map((c) => (
          <span key={c.key} className={cn("relative hidden min-w-0 text-sm sm:block", ALIGN_CELL[c.align], groupStarts.has(c.key) && GROUP_EDGE)}>
            <span className="sr-only">{c.label}: </span>
            {cell(c)}
          </span>
        ))}
      </div>
      {flagsOpen ? (
        <div className="flex flex-wrap gap-1 px-3 pb-2.5 sm:sticky sm:left-20 sm:w-fit sm:max-w-[40rem] sm:pl-14">
          {m.paused ? (
            <Badge variant="secondary" className="px-2 py-0 text-[11px]">
              {pausedLabel(m.paused)}
            </Badge>
          ) : null}
          {extraFlags.map((f) => (
            <Badge key={f} variant={FLAG_VARIANT[f]} className="px-2 py-0 text-[11px]">
              {FLAG_LABELS[f]}
              {f === "slipping" && m.data.slipping?.length ? `: ${m.data.slipping.slice(0, 2).join(", ")}` : ""}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
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

type DetailTab = "overview" | "insights" | "body" | "food" | "training" | "checkins" | "timeline";

type TrainingView = "progress" | "log" | "muscles" | "program";

const TRAINING_VIEWS: { value: TrainingView; label: string }[] = [
  { value: "progress", label: "Lift progress" },
  { value: "log", label: "Workout log" },
  { value: "muscles", label: "Sets per muscle" },
  { value: "program", label: "Program & calendar" },
];

/** Overview first (with the key insights), then every insight, the numbers, the check-ins and everything that happened. */
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "insights", label: "Insights" },
  { id: "body", label: "Progress" },
  { id: "food", label: "Nutrition" },
  { id: "training", label: "Training" },
  { id: "checkins", label: "Check-ins" },
  { id: "timeline", label: "Changes" },
];

const RISK_CHIP: Record<"high" | "medium", string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
};

function MemberDetail({
  roster: r,
  next,
  nextButton,
  tagSummary,
  nav,
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
  /** As on the Members list: status, next action and its button. */
  roster: RosterInfo;
  next: NextAction;
  nextButton: React.ReactNode;
  /** Their tags' names, for the folded tags line. */
  tagSummary: string;
  /** ‹ › to the previous and next member in the list's order. */
  nav: { index: number; total: number; prev: (() => void) | null; next: (() => void) | null };
}) {
  const [stopError, setStopError] = React.useState<string | null>(null);
  // The header's flags chip (only what the page doesn't already show, as on the list).
  const extraFlags = m.flags.filter((f) => !SHOWN_IN_ROW.has(f));
  const flagCount = extraFlags.length + (m.paused ? 1 : 0);
  const [flagsOpen, setFlagsOpen] = React.useState(false);
  // Notes and tags fold to a line each until opened (Add note opens notes).
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  // Their workouts, food, check-ins and macros: loaded once for the key insights, History and the client file.
  const loaded = useInsightsData(companyId, m, unit, today);
  const muscle = React.useMemo(() => (loaded.input ? muscleCheck(loaded.input) : null), [loaded.input]);
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
  // The sticky bar: shown once their header card has scrolled up under the page header.
  const headCard = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(false);
  // Room for labelled buttons and Remind (the column narrows beside the notes): icons only when not.
  const [barRoomy, setBarRoomy] = React.useState(true);
  React.useEffect(() => {
    const el = headCard.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!!e && !e.isIntersecting && e.boundingClientRect.top < 64), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => setBarRoomy(el.clientWidth >= 540));
    ro?.observe(el);
    return () => {
      io.disconnect();
      ro?.disconnect();
    };
  }, []);
  // The bar's Report button: open the progress report on Overview and scroll to it.
  const [reportWanted, setReportWanted] = React.useState(false);
  const reportOpened = React.useCallback(() => setReportWanted(false), []);
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
            setNotesOpen(true);
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

      {/* Their name and the main actions, kept in view while you scroll (takes no space: the next card keeps its place). */}
      <div className="sticky top-16 z-30 h-0 [&+*]:!mt-0">
        {stuck ? (
          <div className="absolute inset-x-0 top-2 flex items-center gap-2.5 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <MemberNav nav={nav} />
            <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.displayName}</p>
              <p className="tabular truncate text-[11px] text-muted-foreground">
                {ROSTER_STATUS[r.status]} · {DETAIL_TABS.find((t) => t.id === tab)?.label}
              </p>
            </div>
            <Button
              size={barRoomy ? "sm" : "icon"}
              className={cn(!barRoomy && "h-9 w-9 shrink-0")}
              variant={unreadMessages > 0 ? "default" : "outline"}
              onClick={openChat}
              aria-label={barRoomy ? undefined : `Message ${m.displayName}`}
            >
              <MessageCircle />
              {barRoomy ? "Message" : null}
            </Button>
            {barRoomy ? (
              <RemindMenu
                variant="button"
                companyId={companyId}
                members={[{ id: m.data.userId, name: m.displayName }]}
                suggested={suggestedReminders(m)}
                recent={reminders}
                onSent={onReminders}
              />
            ) : null}
            <Button
              size={barRoomy ? "sm" : "icon"}
              className={cn(!barRoomy && "h-9 w-9 shrink-0")}
              variant="outline"
              aria-label={barRoomy ? undefined : "Open their progress report"}
              onClick={() => {
                onTab("overview");
                setReportWanted(true);
              }}
            >
              <FileText />
              {barRoomy ? "Report" : null}
            </Button>
          </div>
        ) : null}
      </div>

      <div ref={headCard} className="space-y-3 molten-card rounded-[1.25rem] border border-primary/15 bg-card p-4">
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
          <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", STATUS_CHIP[r.status])}>{ROSTER_STATUS[r.status]}</span>
        </div>
        {/* ‹ › through the list, without going back to it. */}
        {nav.total > 1 ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <MemberNav nav={nav} />
            <span className="tabular">
              {nav.index + 1} of {nav.total}
            </span>
          </div>
        ) : null}
        {/* What to do next, as on the list. */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">Next:</span>
          <span className="min-w-0 flex-1 basis-48 text-muted-foreground">{next ? `${NEXT_LABEL[next.kind]}: ${next.reason}` : "Nothing needed: keep going"}</span>
          {nextButton}
          {flagCount > 0 ? (
            <button
              type="button"
              aria-expanded={flagsOpen}
              onClick={() => setFlagsOpen((v) => !v)}
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                extraFlags.some((f) => FLAG_VARIANT[f] === "danger") ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground",
              )}
            >
              {flagCount} flag{flagCount === 1 ? "" : "s"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", flagsOpen && "rotate-180")} aria-hidden />
            </button>
          ) : null}
        </div>
        {flagsOpen && flagCount > 0 ? (
          <div className="flex flex-wrap gap-1">
            {m.paused ? <Badge variant="secondary">{pausedLabel(m.paused)}</Badge> : null}
            {extraFlags.map((f) => (
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
            <OverviewSummary m={m} r={r} unit={unit} today={today} onTab={onTab} />
            <CoachReportPanel
              companyId={companyId}
              memberId={m.data.userId}
              memberName={m.displayName}
              unit={unit}
              openNow={reportWanted}
              onOpened={reportOpened}
            />

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

          </>
        ) : tab === "insights" ? (
          <MemberInsights companyId={companyId} summary={m} unit={unit} today={today} loaded={loaded} />
        ) : tab === "body" ? (
          <>
            {/* Habits and weigh-ins, moved here from Overview. */}
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

            <MeasurementsCard measurements={m.data.measurements} weighIns={m.data.weighIns} unit={unit} today={today} readOnly />
            <ProgressPhotos m={m} companyId={companyId} unit={unit} />
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
            <CoachNutritionReport companyId={companyId} summary={m} today={today} />
            <CoachIntakeChart companyId={companyId} memberId={m.data.userId} weighIns={m.data.weighIns} unit={unit} today={today} />
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
            <CoachLiftGoals
              companyId={companyId}
              memberId={m.data.userId}
              memberName={m.displayName}
              workouts={loaded.input?.workouts ?? (loaded.error ? [] : null)}
              unit={unit}
              today={today}
              cutting={isCutting(m.timeline, today)}
              onMessage={openChat}
            />
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
        <Fold label="Notes" summary="Private to you and your admins" open={notesOpen} onToggle={setNotesOpen}>
          <CoachNotesCard companyId={companyId} memberId={m.data.userId} />
        </Fold>
        <Fold label="Tags" summary={tagSummary || "None yet"} open={tagsOpen} onToggle={setTagsOpen}>
          {tags}
        </Fold>
      </aside>
      </div>
    </div>
  );
}

/** ‹ › to the previous and next member in the list. */
function MemberNav({ nav }: { nav: { prev: (() => void) | null; next: (() => void) | null } }) {
  if (!nav.prev && !nav.next) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Previous member" disabled={!nav.prev} onClick={() => nav.prev?.()}>
        <ChevronLeft />
      </Button>
      <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Next member" disabled={!nav.next} onClick={() => nav.next?.()}>
        <ChevronRight />
      </Button>
    </span>
  );
}

/** A side-column card folded to one line until opened. */
function Fold({ label, summary, open, onToggle, children }: { label: string; summary: string; open: boolean; onToggle: (open: boolean) => void; children: React.ReactNode }) {
  if (open) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => onToggle(false)} className="flex w-full items-center justify-end gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          Fold {label.toLowerCase()}
          <ChevronDown className="h-3 w-3 rotate-180" aria-hidden />
        </button>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={() => onToggle(true)}
      className="flex w-full items-center gap-2 rounded-[1.25rem] border border-primary/15 bg-card px-4 py-3 text-left text-sm hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{summary}</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** Overview: the Members row for this person, as tiles, each leading to where the detail is. */
function OverviewSummary({ m, r, unit, today, onTab }: { m: MemberSummary; r: RosterInfo; unit: WeightUnit; today: string; onTab: (t: DetailTab) => void }) {
  const ci = checkinLabel(r.checkin, today);
  const contactDays = m.data.lastCoachContact ? Math.max(0, daysBetween(m.data.lastCoachContact.slice(0, 10), today)) : null;
  const tr = weightTrend(m.data.weighIns, today);
  const lb = m.progress?.trendWeight ?? m.latestWeightLb;
  const pct = (v: number | null) => (v === null ? "text-muted-foreground" : v >= 80 ? "text-success" : v >= 60 ? "text-warning" : "text-destructive");
  const tile = (label: string, value: React.ReactNode, sub: React.ReactNode, to: DetailTab) => (
    <button type="button" onClick={() => onTab(to)} className="rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular text-lg font-semibold leading-snug">{value}</p>
      <p className="tabular truncate text-[12px] text-muted-foreground">{sub}</p>
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tile(
        "Goal progress",
        r.progress ? `${r.progress.pct}%` : "—",
        r.progress
          ? `${Math.round(fromLb(r.progress.doneLb, unit) * 10) / 10} of ${Math.round(fromLb(r.progress.totalLb, unit) * 10) / 10} ${unit}`
          : r.goal === "Recomp" || r.goal === "Maintenance"
            ? "No weight goal"
            : r.goal,
        "body",
      )}
      {tile(
        "Adherence · 14d",
        <>
          <span className={pct(r.nutrition)}>{r.nutrition === null ? "—" : `${r.nutrition}%`}</span>
          <span className="text-muted-foreground"> · </span>
          <span className={pct(r.workouts?.pct ?? null)}>{r.workouts ? `${r.workouts.pct}%` : "—"}</span>
          <span className="text-muted-foreground"> · </span>
          <span className={pct(r.habits)}>{r.habits === null ? "—" : `${r.habits}%`}</span>
        </>,
        "Nutrition · workouts · habits",
        "food",
      )}
      {tile(
        "Check-in",
        <span className={r.checkin.kind === "overdue" ? "text-destructive" : r.checkin.kind === "review" ? "text-primary" : undefined}>{ci}</span>,
        <span className={contactDays === null || contactDays >= CONTACT_LATE_DAYS ? "font-semibold text-destructive" : undefined}>
          you: {contactDays === null ? "never" : contactDays === 0 ? "today" : `${contactDays} days ago`}
        </span>,
        "checkins",
      )}
      {tile(
        "Trend",
        lb === null ? "—" : weight(lb, unit),
        tr.changeLb === null ? "Not enough weigh-ins" : `${tr.changeLb > 0 ? "+" : "−"}${Math.abs(Math.round(fromLb(tr.changeLb, unit) * 10) / 10)} ${unit} over 4 weeks`,
        "body",
      )}
    </div>
  );
}

/** Progress photos, shared or not (Progress tab). */
function ProgressPhotos({ m, companyId, unit }: { m: MemberSummary; companyId: string; unit: WeightUnit }) {
  return (
    <>
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
      {m.data.photos !== null ? <CoachComparisonCard companyId={companyId} memberId={m.data.userId} memberName={m.displayName} unit={unit} /> : null}
    </>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted/40 px-1 font-sans text-[11px]">{children}</kbd>;
}

/** The Inbox's context card: your notes, their tags and the last change you made for them. */
function InboxContext({ companyId, memberId, tags, sharing }: { companyId: string; memberId: string; tags: TagsData | null; sharing: boolean }) {
  const [note, setNote] = React.useState<string | null>(null);
  const [change, setChange] = React.useState<CoachChange | null | undefined>(undefined);
  const [all, setAll] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;
    const get = <T,>(path: string) =>
      fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } }).then((r) => (r.ok ? (r.json() as Promise<T>) : null));
    get<{ note: string }>(`/api/coach/notes?${qs}`)
      .then((b) => live && setNote(b?.note ?? ""))
      .catch(() => live && setNote(""));
    if (sharing) {
      get<{ changes: CoachChange[] }>(`/api/coach/member-changes?${qs}`)
        .then((b) => live && setChange([...(b?.changes ?? [])].sort((a, z) => z.date.localeCompare(a.date))[0] ?? null))
        .catch(() => live && setChange(null));
    } else setChange(null);
    return () => {
      live = false;
    };
  }, [companyId, memberId, sharing]);
  const ids = tags?.members[memberId] ?? [];
  const long = (note ?? "").length > 220 || (note ?? "").split("\n").length > 4;
  return (
    <section aria-label="Your notes and their context" className="space-y-2 rounded-[1.25rem] border border-primary/15 bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" aria-hidden />
        Your notes
      </p>
      {note === null ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted/30" aria-busy="true" />
      ) : note.trim() ? (
        <>
          <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", !all && "line-clamp-4")}>{note}</p>
          {long ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline">
              {all ? "Less" : "All of it"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">No notes yet. Add them from Open profile.</p>
      )}
      {tags && ids.length > 0 ? <TagChips tags={tags.tags} ids={ids} /> : null}
      {sharing ? (
        <p className="text-[12px] text-muted-foreground">
          Last change you made:{" "}
          {change === undefined ? "…" : change ? (
            <span className="text-foreground">
              {formatShort(change.date)} · {change.title}
            </span>
          ) : (
            "none yet"
          )}
        </p>
      ) : null}
    </section>
  );
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
  tags,
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
  tags: TagsData | null;
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
  // The order they were in when you opened the Inbox, so reading a chat (or replying) doesn't
  // move people around under you; anyone new goes at the end. It re-sorts next time you open it.
  const order = React.useRef<string[]>([]);
  const ids = new Set(entries.map((e) => e.id));
  order.current = [...order.current.filter((id) => ids.has(id)), ...entries.map((e) => e.id).filter((id) => !order.current.includes(id))];
  const rank = new Map(order.current.map((id, i) => [id, i]));
  const steady = [...entries].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const list = steady.filter((e) => match(e, show));
  const waiting = steady.filter((e) => e.waitingSince !== null);
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

  // Keyboard: J / K next and previous, R reply, U mark their message unread (Ctrl+Enter sends, in the reply box).
  const detail = React.useRef<HTMLDivElement>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const markUnread = async (id: string) => {
    const other = list.find((e) => e.id !== id) ?? entries.find((e) => e.id !== id);
    // Their chat reads it again while it's open, so it needs someone else to move to.
    if (!other) return setFlash("Open another conversation first: theirs would be read again straight away.");
    try {
      const res = await fetch("/api/coach/messages/unread", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ company: companyId, member: id }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't mark it unread.");
      onOpenId(other.id);
      onMessagesRead();
      setFlash("Marked unread.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't mark it unread.");
    }
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const key = e.key.toLowerCase();
      const i = list.findIndex((x) => x.id === current?.id);
      if (key === "j" || key === "k") {
        const next = list[key === "j" ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)];
        if (next) {
          e.preventDefault();
          onOpenId(next.id);
        }
      } else if (key === "r" && current) {
        const box =
          (current.checkin ? detail.current?.querySelector<HTMLTextAreaElement>("textarea[id^='reply-']") : null) ??
          detail.current?.querySelector<HTMLTextAreaElement>(".inbox-chat textarea");
        if (box) {
          e.preventDefault();
          box.scrollIntoView({ block: "center", behavior: "smooth" });
          box.focus({ preventScroll: true });
        }
      } else if (key === "u" && current?.thread) {
        e.preventDefault();
        void markUnread(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

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
      <p className="text-[12px] text-muted-foreground max-lg:hidden" aria-live="polite">
        {flash ?? (
          <>
            Keys: <Kbd>J</Kbd> / <Kbd>K</Kbd> next and previous · <Kbd>R</Kbd> reply · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> send · <Kbd>U</Kbd> mark unread
          </>
        )}
      </p>

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
            <div ref={detail} className="min-w-0 space-y-4">
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
                <div className="inbox-chat min-w-0 space-y-4 xl:sticky xl:top-20">
                  {/* What you know about them, while you reply. */}
                  <InboxContext key={`ctx-${current.id}`} companyId={companyId} memberId={current.id} tags={tags} sharing={current.summary !== null} />
                  <CoachChatPanel key={`chat-${current.id}`} companyId={companyId} memberId={current.id} memberName={current.name} onRead={onMessagesRead} />
                </div>
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
