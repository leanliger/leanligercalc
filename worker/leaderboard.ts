/**
 * Community streak leaderboard (opt-in). See src/lib/leaderboard.ts.
 *
 *   GET    /api/leaderboard?experience=exp_…&tz=…   the board, if I'm in that community
 *   PUT    /api/leaderboard  { experienceId, timeZone }   join
 *   DELETE /api/leaderboard?experience=exp_…        leave
 *
 * Only members with access to the experience (checked with Whop) can view or
 * join its board. Stats are computed here from each participant's habit logs,
 * so other members' raw logs never leave the server.
 */

import { addDays } from "../src/lib/dates";
import { EXPERIENCE_ID_PATTERN, isValidTimeZone, localClock } from "../src/lib/fasting";
import { sanitizeHabitDefs, type HabitEntries } from "../src/lib/habits";
import {
  LEADERBOARD_LOOKBACK_DAYS,
  LEADERBOARD_MAX,
  leaderboardStats,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from "../src/lib/leaderboard";
import { accessLevel, hasWhopKey, whopGet, type WhopEnv } from "./whop";

export interface LeaderboardEnv extends WhopEnv {
  DB: D1Database;
}

export type LeaderboardResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const ID_CHUNK = 50;
const NAME_MAX = 60;

async function checkMember(env: LeaderboardEnv, userId: string, experienceId: string): Promise<LeaderboardResult | null> {
  if (!EXPERIENCE_ID_PATTERN.test(experienceId)) {
    return { ok: false, status: 422, error: "Open the app from your Whop community to see the leaderboard." };
  }
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The leaderboard isn't switched on for this app yet." };
  const level = await accessLevel(env, userId, experienceId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level === "no_access") return { ok: false, status: 403, error: "You don't have access to this community." };
  return null;
}

export async function joinLeaderboard(env: LeaderboardEnv, userId: string, raw: unknown): Promise<LeaderboardResult> {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const experienceId = typeof body.experienceId === "string" ? body.experienceId : "";
  if (!isValidTimeZone(body.timeZone)) return { ok: false, status: 422, error: "Unknown time zone." };
  const denied = await checkMember(env, userId, experienceId);
  if (denied) return denied;

  // Their public Whop profile, so other members see the same name and photo
  // they see everywhere else in the community.
  const profile = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`);
  const p = (profile.status === 200 ? profile.body : null) as
    | { name?: string | null; username?: string | null; profile_picture?: { url?: string } | null }
    | null;
  const clip = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().slice(0, NAME_MAX) : null);
  const avatar = typeof p?.profile_picture?.url === "string" && /^https:\/\//.test(p.profile_picture.url) ? p.profile_picture.url : null;

  await env.DB.prepare(
    `INSERT INTO leaderboard (user_id, experience_id, time_zone, name, username, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, experience_id) DO UPDATE SET
       time_zone  = excluded.time_zone,
       name       = excluded.name,
       username   = excluded.username,
       avatar_url = excluded.avatar_url`,
  )
    .bind(userId, experienceId, body.timeZone, clip(p?.name), clip(p?.username), avatar)
    .run();
  return { ok: true, body: { joined: true } };
}

export async function leaveLeaderboard(env: LeaderboardEnv, userId: string, experienceId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM leaderboard WHERE user_id = ? AND experience_id = ?").bind(userId, experienceId).run();
}

interface Row {
  user_id: string;
  time_zone: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export async function getLeaderboard(
  env: LeaderboardEnv,
  userId: string,
  experienceId: string,
  timeZone: string | null,
  now = new Date(),
): Promise<LeaderboardResult> {
  const denied = await checkMember(env, userId, experienceId);
  if (denied) return denied;

  const { results } = await env.DB.prepare(
    "SELECT user_id, time_zone, name, username, avatar_url FROM leaderboard WHERE experience_id = ? ORDER BY joined_at ASC LIMIT ?",
  )
    .bind(experienceId, LEADERBOARD_MAX)
    .all<Row>();

  const me = results.find((r) => r.user_id === userId);
  // Keep the viewer's time zone current (e.g. after travelling).
  if (me && timeZone && isValidTimeZone(timeZone) && me.time_zone !== timeZone) {
    await env.DB.prepare("UPDATE leaderboard SET time_zone = ? WHERE user_id = ? AND experience_id = ?")
      .bind(timeZone, userId, experienceId)
      .run();
    me.time_zone = timeZone;
  }

  // Each participant's local today, and the habit data needed for their stats.
  const todays = new Map<string, string>();
  for (const r of results) {
    let date: string;
    try {
      date = localClock(now, r.time_zone).date;
    } catch {
      date = localClock(now, "UTC").date;
    }
    todays.set(r.user_id, date);
  }
  const earliest = addDays(localClock(now, "UTC").date, -LEADERBOARD_LOOKBACK_DAYS - 1);
  const defs = new Map<string, ReturnType<typeof sanitizeHabitDefs>>();
  const logs = new Map<string, Map<string, HabitEntries>>();
  const ids = results.map((r) => r.user_id);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const [plans, habits] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id, state FROM plans WHERE user_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(`SELECT user_id, date, entries FROM habit_logs WHERE user_id IN (${marks}) AND date >= ?`).bind(
        ...chunk,
        earliest,
      ),
    ]);
    for (const r of (plans?.results ?? []) as { user_id: string; state: string }[]) {
      try {
        defs.set(r.user_id, sanitizeHabitDefs((JSON.parse(r.state) as { tracking?: { habits?: unknown } })?.tracking?.habits));
      } catch {
        /* defaults below */
      }
    }
    for (const r of (habits?.results ?? []) as { user_id: string; date: string; entries: string }[]) {
      try {
        let m = logs.get(r.user_id);
        if (!m) logs.set(r.user_id, (m = new Map()));
        m.set(r.date, JSON.parse(r.entries) as HabitEntries);
      } catch {
        /* skip a corrupt row */
      }
    }
  }

  const entries: LeaderboardEntry[] = results.map((r) => ({
    name: r.name ?? (r.username ? `@${r.username}` : "Member"),
    avatarUrl: r.avatar_url,
    isYou: r.user_id === userId,
    ...leaderboardStats(defs.get(r.user_id) ?? sanitizeHabitDefs(undefined), logs.get(r.user_id) ?? new Map(), todays.get(r.user_id)!),
  }));
  const body: LeaderboardResponse = { joined: Boolean(me), entries };
  return { ok: true, body };
}
