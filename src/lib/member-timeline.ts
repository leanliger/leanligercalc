/**
 * A member's timeline for the coach (worker/member-timeline.ts,
 * coach-dashboard.tsx): one feed of what happened, newest first, to skim
 * before a call. Built here from plain rows so it can be checked without a
 * database; the worker reads the rows and hands them over.
 */

import { CHECKIN_SCALES } from "./checkins";
import { addDays } from "./dates";
import { weekStartOf } from "./habits";
import { milestoneLabel, type MilestoneKind } from "./milestones";
import { NUDGE_INFO, type NudgeKind } from "./nudges";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

export type TimelineKind =
  | "weigh-in"
  | "check-in"
  | "reply"
  | "note"
  | "program"
  | "habits"
  | "program-edit"
  | "macros"
  | "milestone"
  | "photos"
  | "measurement"
  | "workout"
  | "nudge"
  | "message-in"
  | "message-out";

/** Groups for the feed's filter. */
export const TIMELINE_GROUPS = {
  checkins: ["check-in", "reply"],
  body: ["weigh-in", "measurement", "photos", "milestone"],
  training: ["workout", "program", "program-edit"],
  coach: ["note", "macros", "habits", "program", "program-edit", "reply", "nudge", "message-out"],
  messages: ["message-in", "message-out"],
} as const satisfies Record<string, readonly TimelineKind[]>;
export type TimelineGroup = keyof typeof TIMELINE_GROUPS;

export interface TimelineEvent {
  /** The member's day it happened, yyyy-mm-dd. */
  date: string;
  /** The exact time, when known (orders events within a day). */
  at: string | null;
  kind: TimelineKind;
  title: string;
  detail?: string;
}

/** The days the feed covers by default, and the longest it goes back. */
export const TIMELINE_DAYS = 90;
export const TIMELINE_MAX_DAYS = 365;
const MAX_EVENTS = 500;

export interface TimelineRows {
  weighIns: { date: string; weightLb: number; note: string | null }[];
  checkins: {
    weekStart: string;
    submittedAt: string;
    answers: { ratings?: Record<string, number>; wins?: string; struggles?: string; question?: string };
    reply: string | null;
    repliedAt: string | null;
    voiceSeconds: number | null;
  }[];
  note: { text: string; updatedAt: string } | null;
  assignments: { kind: string; title: string; createdAt: string; status: string; respondedAt: string | null; cancelledAt: string | null }[];
  programEdits: { createdAt: string; appliedAt: string | null }[];
  macros: { kcal: number; protein: number; carbs: number; fat: number; setAt: string } | null;
  milestones: { kind: MilestoneKind; level: number; reachedOn: string }[];
  /** Null when the member doesn't share photos with the coach. */
  photos: { date: string; pose: string }[] | null;
  measurements: { date: string; waist: number | null; hips: number | null; chest: number | null; arms: number | null; thighs: number | null }[];
  workouts: { date: string; finishedAt: number | null; name: string; sets: number; volumeLb: number }[];
  /** Automatic nudges sent (src/lib/nudges.ts). Optional for callers that don't read them. */
  nudges?: { kind: NudgeKind; message: string | null; sentAt: string }[];
  /** Chat messages (src/lib/messages.ts), delivered ones only. Optional for callers that don't read them. */
  messages?: { fromCoach: boolean; body: string; at: string; attachment: "photo" | "voice" | null }[];
}

const clip = (s: string, n = 180) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const day = (iso: string) => iso.slice(0, 10);
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The feed, newest first, from `since` (inclusive) on. */
export function buildTimeline(rows: TimelineRows, since: string, unit: WeightUnit): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const w = (lb: number, d = 1) => `${Math.round(fromLb(lb, unit) * 10 ** d) / 10 ** d} ${unit}`;
  const len = (inches: number) => (unit === "kg" ? `${Math.round(inches * 2.54 * 10) / 10} cm` : `${Math.round(inches * 10) / 10} in`);

  // Weigh-ins: one line a week (count, average, change on the week before), plus any with a note.
  const byWeek = new Map<string, { date: string; weightLb: number }[]>();
  for (const x of rows.weighIns) {
    const ws = weekStartOf(x.date);
    byWeek.set(ws, [...(byWeek.get(ws) ?? []), x]);
  }
  const avgOf = (ws: string) => {
    const xs = byWeek.get(ws);
    return xs && xs.length > 0 ? xs.reduce((s, x) => s + x.weightLb, 0) / xs.length : null;
  };
  for (const [ws, xs] of byWeek) {
    const last = xs.reduce((m, x) => (x.date > m ? x.date : m), xs[0]!.date);
    if (last < since) continue;
    const avg = avgOf(ws)!;
    const prev = avgOf(addDays(ws, -7));
    out.push({
      date: last,
      at: null,
      kind: "weigh-in",
      title: xs.length === 1 ? `Weighed in once · ${w(avg)}` : `Weighed in ${xs.length} times · average ${w(avg)}`,
      detail: prev === null ? undefined : Math.abs(avg - prev) < 0.05 ? "Same as the week before" : `${avg < prev ? "−" : "+"}${w(Math.abs(avg - prev))} on the week before`,
    });
  }
  for (const x of rows.weighIns) {
    if (x.date >= since && x.note && x.note.trim()) {
      out.push({ date: x.date, at: null, kind: "weigh-in", title: `Weigh-in note (${w(x.weightLb)})`, detail: `“${clip(x.note, 140)}”` });
    }
  }

  // Check-ins and the replies to them.
  for (const c of rows.checkins) {
    if (day(c.submittedAt) >= since) {
      const ratings = CHECKIN_SCALES.map((s) => (c.answers.ratings?.[s.key] ? `${s.label} ${c.answers.ratings[s.key]}` : null)).filter(Boolean).join(" · ");
      const words = [
        c.answers.wins ? `Wins: ${clip(c.answers.wins, 90)}` : null,
        c.answers.struggles ? `Struggles: ${clip(c.answers.struggles, 90)}` : null,
        c.answers.question ? `Asked: ${clip(c.answers.question, 90)}` : null,
      ].filter(Boolean);
      out.push({
        date: day(c.submittedAt),
        at: c.submittedAt,
        kind: "check-in",
        title: `Sent their check-in for the week of ${shortDate(c.weekStart)}`,
        detail: [ratings, ...words].filter(Boolean).join("\n"),
      });
    }
    if (c.repliedAt && day(c.repliedAt) >= since && (c.reply || c.voiceSeconds)) {
      const voice = c.voiceSeconds ? `a voice note (${Math.floor(c.voiceSeconds / 60)}:${String(Math.round(c.voiceSeconds % 60)).padStart(2, "0")})` : null;
      out.push({
        date: day(c.repliedAt),
        at: c.repliedAt,
        kind: "reply",
        title: voice && !c.reply ? `You replied with ${voice}` : voice ? `You replied, with ${voice}` : "You replied to their check-in",
        detail: c.reply ? `“${clip(c.reply)}”` : undefined,
      });
    }
  }

  if (rows.note && day(rows.note.updatedAt) >= since && rows.note.text.trim()) {
    out.push({ date: day(rows.note.updatedAt), at: rows.note.updatedAt, kind: "note", title: "You updated your notes", detail: clip(rows.note.text) });
  }

  for (const a of rows.assignments) {
    if (day(a.createdAt) < since) continue;
    const what = a.kind === "habits" ? `habits “${a.title}”` : `the program “${a.title}”`;
    const status = a.cancelledAt
      ? "You cancelled it."
      : a.status === "accepted"
        ? `They added it${a.respondedAt ? ` on ${shortDate(a.respondedAt)}` : ""}.`
        : a.status === "declined"
          ? `They said not now${a.respondedAt ? ` on ${shortDate(a.respondedAt)}` : ""}.`
          : "Not answered yet.";
    out.push({ date: day(a.createdAt), at: a.createdAt, kind: a.kind === "habits" ? "habits" : "program", title: `You sent ${what}`, detail: status });
  }

  for (const e of rows.programEdits) {
    if (day(e.createdAt) < since) continue;
    out.push({
      date: day(e.createdAt),
      at: e.createdAt,
      kind: "program-edit",
      title: "You edited their program",
      detail: e.appliedAt ? `In their app since ${shortDate(e.appliedAt)}.` : "Waiting for them to open the app.",
    });
  }

  if (rows.macros && day(rows.macros.setAt) >= since) {
    const m = rows.macros;
    out.push({
      date: day(m.setAt),
      at: m.setAt,
      kind: "macros",
      title: "You set their macros",
      detail: `${m.kcal.toLocaleString("en-US")} kcal · P ${m.protein} g · C ${m.carbs} g · F ${m.fat} g`,
    });
  }

  for (const m of rows.milestones) {
    if (m.reachedOn >= since) out.push({ date: m.reachedOn, at: null, kind: "milestone", title: `Milestone: ${milestoneLabel(m, unit).toLowerCase()}` });
  }

  if (rows.photos) {
    const byDay = new Map<string, Set<string>>();
    for (const p of rows.photos) if (p.date >= since) byDay.set(p.date, (byDay.get(p.date) ?? new Set()).add(p.pose));
    for (const [d, poses] of byDay) out.push({ date: d, at: null, kind: "photos", title: `Took progress photos (${[...poses].join(", ")})` });
  }

  const ms = [...rows.measurements].sort((a, b) => a.date.localeCompare(b.date));
  ms.forEach((m, i) => {
    if (m.date < since) return;
    const prev = ms[i - 1];
    const parts = (["waist", "hips", "chest", "arms", "thighs"] as const)
      .filter((k) => m[k] !== null)
      .map((k) => {
        const v = m[k]!;
        const p = prev?.[k];
        const change = p != null ? ` (${v - p <= 0 ? "−" : "+"}${len(Math.abs(v - p))})` : "";
        return `${k} ${len(v)}${change}`;
      });
    if (parts.length > 0) out.push({ date: m.date, at: null, kind: "measurement", title: "Measured", detail: parts.join(" · ") });
  });

  for (const wo of rows.workouts) {
    if (wo.date < since || wo.sets === 0) continue;
    out.push({
      date: wo.date,
      at: wo.finishedAt ? new Date(wo.finishedAt).toISOString() : null,
      kind: "workout",
      title: `Finished ${wo.name}`,
      detail: `${wo.sets} set${wo.sets === 1 ? "" : "s"}${wo.volumeLb > 0 ? ` · ${Math.round(fromLb(wo.volumeLb, unit)).toLocaleString("en-US")} ${unit} lifted` : ""}`,
    });
  }

  for (const n of rows.nudges ?? []) {
    if (day(n.sentAt) < since) continue;
    out.push({
      date: day(n.sentAt),
      at: n.sentAt,
      kind: "nudge",
      title: `Automatic nudge: ${NUDGE_INFO[n.kind].label.toLowerCase()}`,
      detail: n.message ? `“${clip(n.message)}”` : undefined,
    });
  }

  // Chat: one entry per day and side, so a long conversation doesn't bury everything else.
  const chats = new Map<string, { fromCoach: boolean; n: number; last: { body: string; at: string; attachment: "photo" | "voice" | null } }>();
  for (const msg of rows.messages ?? []) {
    if (day(msg.at) < since) continue;
    const key = `${day(msg.at)}|${msg.fromCoach ? 1 : 0}`;
    const c = chats.get(key);
    if (!c) chats.set(key, { fromCoach: msg.fromCoach, n: 1, last: msg });
    else {
      c.n++;
      if (msg.at > c.last.at) c.last = msg;
    }
  }
  for (const [key, c] of chats) {
    const what = c.last.attachment === "photo" ? "[photo]" : c.last.attachment === "voice" ? "[voice note]" : "";
    const text = [what, c.last.body].filter(Boolean).join(" ");
    const times = c.n > 1 ? ` ${c.n} times` : "";
    out.push({
      date: key.slice(0, 10),
      at: c.last.at,
      kind: c.fromCoach ? "message-out" : "message-in",
      title: c.fromCoach ? `You messaged them${times}` : `Messaged you${times}`,
      detail: text ? `${c.n > 1 ? "Last: " : ""}“${clip(text)}”` : undefined,
    });
  }

  out.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : (b.at ?? "").localeCompare(a.at ?? "")));
  return out.slice(0, MAX_EVENTS);
}
