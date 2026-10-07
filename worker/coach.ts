/**
 * Coach dashboard data: GET /api/coach/overview?company=biz_…
 *
 * Who can see what:
 *   - The viewer must be signed in through Whop (verified token) AND be an
 *     admin of that company, which is checked with Whop on every request.
 *   - The members shown are the company's members according to Whop. Data
 *     belonging to anyone else in the database is never returned, even if the
 *     app is installed in more than one whop.
 *
 * Returns each member's saved plan and recent logs; the browser does the maths
 * with the same code the member's own app uses (src/lib/coach.ts).
 *
 * Needs the app's WHOP_API_KEY, with the `member:basic:read` permission so the
 * member list (names and avatars) can be read.
 */

import { COMPANY_ID_PATTERN, OVERVIEW_DAYS, type CoachMemberData, type FoodDay } from "../src/lib/coach-api";
import { addDays, toISODate } from "../src/lib/dates";
import type { HabitEntries } from "../src/lib/habits";
import { secretValue } from "./secrets";

export interface CoachEnv {
  DB: D1Database;
  WHOP_API_KEY?: string;
  /** Override for tests only (a local mock of Whop's API). */
  WHOP_API_BASE?: string;
}

const WHOP_API = "https://api.whop.com";
const TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;
/** 25 pages of 100: plenty, and well inside the per-request subrequest limit. */
const MAX_PAGES = 25;
/** D1 allows 100 bound parameters per statement; leave room for the date. */
const ID_CHUNK = 50;

export type CoachResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string };

async function whopGet(env: CoachEnv, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${env.WHOP_API_BASE ?? WHOP_API}${path}`, {
    headers: {
      authorization: `Bearer ${secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")}`,
      accept: "application/json",
      "user-agent": "LeanLigerCalc/1.0 (+https://leanligercalc.lean-liger-fitness.workers.dev)",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Whop's own explanation of an error, for the server log (never shown raw to users). */
function whopReason(body: unknown): string {
  const e = (body as { error?: { type?: string; message?: string } } | null)?.error;
  return [e?.type, e?.message].filter(Boolean).join(" | ").slice(0, 200);
}

interface WhopMember {
  status?: string;
  access_level?: string;
  joined_at?: string | null;
  last_accessed_at?: string | null;
  user?: { id?: string; name?: string | null; username?: string | null; profile_picture?: { url?: string } | null } | null;
}

type Profile = Pick<CoachMemberData, "userId" | "name" | "username" | "avatarUrl" | "lastAccessedAt" | "joinedAt">;

export async function coachOverview(env: CoachEnv, viewerId: string, companyId: string, now = new Date()): Promise<CoachResult> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")) {
    return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  }

  // 1. Is the viewer an admin of this company?
  const access = await whopGet(env, `/api/v1/users/${encodeURIComponent(viewerId)}/access/${companyId}`);
  if (access.status !== 200) {
    console.error("coach access check failed", { status: access.status, reason: whopReason(access.body) });
    return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  }
  if ((access.body as { access_level?: string } | null)?.access_level !== "admin") {
    return { ok: false, status: 403, error: "Only the owner and admins of this whop can open the coach dashboard." };
  }

  // 2. The company's members, according to Whop.
  const profiles = new Map<string, Profile>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ account_id: companyId, first: String(PAGE_SIZE) });
    if (after) query.set("after", after);
    const res = await whopGet(env, `/api/v1/members?${query}`);
    if (res.status !== 200) {
      console.error("coach member list failed", { status: res.status, reason: whopReason(res.body) });
      return {
        ok: false,
        status: 502,
        error:
          res.status === 401 || res.status === 403
            ? "Whop didn't allow reading your member list. In Whop's developer dashboard, give the app the member:basic:read permission, then approve the update in your whop."
            : "Couldn't load your members from Whop. Try again in a moment.",
      };
    }
    const body = res.body as { data?: WhopMember[]; page_info?: { has_next_page?: boolean; end_cursor?: string | null } };
    for (const m of body.data ?? []) {
      const u = m.user;
      if (!u?.id || m.status === "left") continue;
      profiles.set(u.id, {
        userId: u.id,
        name: u.name ?? null,
        username: u.username ?? null,
        avatarUrl: u.profile_picture?.url ?? null,
        lastAccessedAt: m.last_accessed_at ?? null,
        joinedAt: m.joined_at ?? null,
      });
    }
    if (!body.page_info?.has_next_page || !body.page_info.end_cursor) break;
    after = body.page_info.end_cursor;
  }

  // 3. Their data — only theirs.
  const today = toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const since = {
    weighIns: addDays(today, -OVERVIEW_DAYS.weighIns),
    habits: addDays(today, -OVERVIEW_DAYS.habits),
    food: addDays(today, -OVERVIEW_DAYS.food),
  };
  const members = new Map<string, CoachMemberData>();
  for (const p of profiles.values()) {
    members.set(p.userId, { ...p, plan: null, weighIns: [], habitLogs: [], foodDays: [] });
  }
  const ids = [...profiles.keys()];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const [plans, weighIns, habits, food] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id, state FROM plans WHERE user_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(
        `SELECT user_id, date, weight_lb, calories, note FROM weigh_ins WHERE user_id IN (${marks}) AND date >= ? ORDER BY date ASC`,
      ).bind(...chunk, since.weighIns),
      env.DB.prepare(
        `SELECT user_id, date, entries FROM habit_logs WHERE user_id IN (${marks}) AND date >= ? ORDER BY date ASC`,
      ).bind(...chunk, since.habits),
      env.DB.prepare(
        `SELECT user_id, date, entries FROM food_logs WHERE user_id IN (${marks}) AND date >= ? ORDER BY date ASC`,
      ).bind(...chunk, since.food),
    ]);

    for (const r of (plans?.results ?? []) as { user_id: string; state: string }[]) {
      const m = members.get(r.user_id);
      if (!m) continue;
      try {
        m.plan = JSON.parse(r.state);
      } catch {
        m.plan = null;
      }
    }
    for (const r of (weighIns?.results ?? []) as { user_id: string; date: string; weight_lb: number; calories: number | null; note: string | null }[]) {
      members.get(r.user_id)?.weighIns.push({ date: r.date, weightLb: r.weight_lb, calories: r.calories, note: r.note });
    }
    for (const r of (habits?.results ?? []) as { user_id: string; date: string; entries: string }[]) {
      try {
        members.get(r.user_id)?.habitLogs.push({ date: r.date, entries: JSON.parse(r.entries) as HabitEntries });
      } catch {
        /* skip a corrupt row */
      }
    }
    for (const r of (food?.results ?? []) as { user_id: string; date: string; entries: string }[]) {
      try {
        const entries = JSON.parse(r.entries) as { kcal?: number; protein?: number; carbs?: number; fat?: number }[];
        const day: FoodDay = { date: r.date, kcal: 0, protein: 0, carbs: 0, fat: 0 };
        for (const e of entries) {
          day.kcal += Number(e.kcal) || 0;
          day.protein += Number(e.protein) || 0;
          day.carbs += Number(e.carbs) || 0;
          day.fat += Number(e.fat) || 0;
        }
        // Daily totals only — the coach view doesn't need individual foods.
        members.get(r.user_id)?.foodDays.push({
          date: day.date,
          kcal: Math.round(day.kcal),
          protein: Math.round(day.protein),
          carbs: Math.round(day.carbs),
          fat: Math.round(day.fat),
        });
      } catch {
        /* skip a corrupt row */
      }
    }
  }

  return {
    ok: true,
    body: { companyId, generatedAt: now.toISOString(), members: [...members.values()] },
  };
}
