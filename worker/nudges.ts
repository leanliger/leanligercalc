/**
 * Automatic nudges (src/lib/nudges.ts):
 *
 *   GET /api/coach/nudges?company=…   coaches: the rules, and the nudges sent lately
 *   PUT /api/coach/nudges             coaches: save the rules { company, rules }
 *   GET /api/coach/nudges/preview?company=…   coaches: who'd get a nudge right now, nothing sent
 *   POST /api/coach/nudges/run         coaches: send them now { company, members }
 *
 * Checked from the cron every 15 minutes between 17:00 and 19:45 UTC (late
 * morning in the Americas, evening in Europe). Each whop with a rule on is
 * checked once a day: its members from Whop, those sharing their progress,
 * not paused today, and not nudged today. For each, the first rule that's due
 * for a gap it hasn't nudged about yet goes out as a Whop notification with
 * the coach's message, one request per community for everyone getting the
 * same message. A whop that doesn't finish in one run carries on in the next.
 */

import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { NUDGE_ORDER, nudgeDue, validateNudgeRules, withDefaults, type NudgeKind, type NudgeRule } from "../src/lib/nudges";
import { isPausedOn, sanitizePauses } from "../src/lib/pause";
import { companyMembers } from "./coach";
import { experiencesOf } from "./experiences";
import { sendWhop, type ReminderEnv } from "./reminders";
import { accessLevel, hasWhopKey, type WhopEnv } from "./whop";

type Env = WhopEnv & ReminderEnv & { DB: D1Database };
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const ID_CHUNK = 45;
const NOTIFY_CHUNK = 100;
/** Whops checked per run, and Whop requests (member list pages and sends) per run. */
const COMPANIES_PER_RUN = 3;
const REQUESTS_PER_RUN = 30;
/** Nudges shown on the settings page. */
const RECENT_LIMIT = 50;

async function adminCheck(env: Env, viewerId: string, companyId: string): Promise<Result | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  return null;
}

async function savedRules(env: Env, companyId: string): Promise<NudgeRule[]> {
  const { results } = await env.DB.prepare("SELECT kind, enabled, days, message FROM coach_nudge_rules WHERE company_id = ?")
    .bind(companyId)
    .all<{ kind: NudgeKind; enabled: number; days: number; message: string }>();
  return results.map((r) => ({ kind: r.kind, enabled: r.enabled === 1, days: r.days, message: r.message }));
}

export async function getNudges(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const [rules, recent] = await Promise.all([
    savedRules(env, companyId),
    env.DB.prepare("SELECT user_id, kind, sent_at FROM coach_nudges_sent WHERE company_id = ? ORDER BY sent_at DESC LIMIT ?")
      .bind(companyId, RECENT_LIMIT)
      .all<{ user_id: string; kind: NudgeKind; sent_at: string }>(),
  ]);
  return {
    ok: true,
    body: { rules: withDefaults(rules), recent: recent.results.map((r) => ({ userId: r.user_id, kind: r.kind, sentAt: r.sent_at })) },
  };
}

export async function saveNudges(env: Env, viewerId: string, raw: unknown): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as { company?: unknown; rules?: unknown };
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const v = validateNudgeRules(b.rules);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  if (v.rules.length > 0) {
    await env.DB.batch(
      v.rules.map((r) =>
        env.DB.prepare(
          `INSERT INTO coach_nudge_rules (company_id, kind, enabled, days, message, updated_by) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (company_id, kind) DO UPDATE SET enabled = excluded.enabled, days = excluded.days, message = excluded.message,
             updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        ).bind(companyId, r.kind, r.enabled ? 1 : 0, r.days, r.message, viewerId),
      ),
    );
  }
  return getNudges(env, viewerId, companyId);
}

/* ------------------------------- the daily check ------------------------------- */

/** The last day each member did each thing, for the rules that are on. */
async function lastDays(env: Env, ids: readonly string[], kinds: ReadonlySet<NudgeKind>) {
  const out = new Map<string, Partial<Record<NudgeKind, string>>>();
  const queries: Record<NudgeKind, string> = {
    no_food: "SELECT user_id, MAX(date) AS d FROM food_logs WHERE user_id IN (%) AND entries <> '[]' GROUP BY user_id",
    no_weighin: "SELECT user_id, MAX(date) AS d FROM weigh_ins WHERE user_id IN (%) GROUP BY user_id",
    no_workout: "SELECT user_id, MAX(date) AS d FROM workouts WHERE user_id IN (%) AND json_extract(data, '$.finishedAt') IS NOT NULL GROUP BY user_id",
    no_checkin: "SELECT user_id, MAX(substr(submitted_at, 1, 10)) AS d FROM checkins WHERE user_id IN (%) GROUP BY user_id",
  };
  const active = NUDGE_ORDER.filter((k) => kinds.has(k));
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const results = await env.DB.batch<{ user_id: string; d: string | null }>(
      active.map((k) => env.DB.prepare(queries[k].replace("%", marks)).bind(...chunk)),
    );
    results.forEach((r, j) => {
      for (const row of r.results ?? []) {
        if (!row.d) continue;
        out.set(row.user_id, { ...out.get(row.user_id), [active[j]!]: row.d });
      }
    });
  }
  return out;
}

type Picks = Map<NudgeKind, { userId: string; anchor: string }[]>;

/**
 * Who's due a nudge today, and for which rule: members Whop lists, sharing
 * their progress, not paused today and not nudged today; for each, the first
 * rule due for a gap not nudged yet. `used` counts Whop requests (the member list).
 */
async function planCompany(env: Env, companyId: string, today: string): Promise<{ ok: boolean; used: number; rules: NudgeRule[]; picks: Picks }> {
  const rules = (await savedRules(env, companyId)).filter((r) => r.enabled);
  const picks: Picks = new Map();
  if (rules.length === 0) return { ok: true, used: 0, rules, picks };
  const listed = await companyMembers(env, companyId);
  if (!listed.ok) return { ok: false, used: 1, rules, picks };
  const memberIds = [...listed.profiles.keys()];

  // Sharing members, when they started sharing, their pauses, and what they were sent.
  const since = new Map<string, string>();
  const paused = new Set<string>();
  const sentGaps = new Set<string>();
  const sentToday = new Set<string>();
  for (let i = 0; i < memberIds.length; i += ID_CHUNK) {
    const chunk = memberIds.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const [sharing, plans, sent] = await env.DB.batch([
      env.DB.prepare(`SELECT user_id, shared_at FROM coach_sharing WHERE shared = 1 AND user_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(`SELECT user_id, json_extract(state, '$.tracking.pauses') AS pauses FROM plans WHERE user_id IN (${marks})`).bind(...chunk),
      env.DB.prepare(`SELECT user_id, kind, anchor, sent_on FROM coach_nudges_sent WHERE company_id = ? AND user_id IN (${marks})`).bind(companyId, ...chunk),
    ]);
    for (const r of (sharing!.results ?? []) as { user_id: string; shared_at: string | null }[]) since.set(r.user_id, (r.shared_at ?? today).slice(0, 10));
    for (const r of (plans!.results ?? []) as { user_id: string; pauses: string | null }[]) {
      try {
        if (r.pauses && isPausedOn(sanitizePauses(JSON.parse(r.pauses)), today)) paused.add(r.user_id);
      } catch {
        /* unreadable pauses: not paused */
      }
    }
    for (const r of (sent!.results ?? []) as { user_id: string; kind: string; anchor: string; sent_on: string }[]) {
      sentGaps.add(`${r.user_id}|${r.kind}|${r.anchor}`);
      if (r.sent_on === today) sentToday.add(r.user_id);
    }
  }
  const candidates = [...since.keys()].filter((id) => !paused.has(id) && !sentToday.has(id));
  if (candidates.length === 0) return { ok: true, used: 1, rules, picks };

  const last = await lastDays(env, candidates, new Set(rules.map((r) => r.kind)));
  for (const id of candidates) {
    for (const kind of NUDGE_ORDER) {
      const rule = rules.find((r) => r.kind === kind);
      if (!rule) continue;
      const anchor = nudgeDue(last.get(id)?.[kind] ?? null, since.get(id)!, today, rule.days);
      if (!anchor || sentGaps.has(`${id}|${kind}|${anchor}`)) continue;
      picks.set(kind, [...(picks.get(kind) ?? []), { userId: id, anchor }]);
      break;
    }
  }
  return { ok: true, used: 1, rules, picks };
}

/** Send the picks: one request per community and message, for everyone getting it. */
async function sendPicks(
  env: Env,
  companyId: string,
  today: string,
  rules: NudgeRule[],
  picks: Picks,
  budget: number,
  used: number,
): Promise<{ used: number; sent: number; done: boolean }> {
  const experiences = await experiencesOf(env, [...picks.values()].flat().map((p) => p.userId));
  let sent = 0;
  let done = true;
  for (const [kind, list] of picks) {
    const rule = rules.find((r) => r.kind === kind)!;
    const byExperience = new Map<string, { userId: string; anchor: string }[]>();
    for (const p of list) {
      const exp = experiences.get(p.userId);
      if (exp) byExperience.set(exp, [...(byExperience.get(exp) ?? []), p]);
    }
    for (const [exp, members] of byExperience) {
      for (let i = 0; i < members.length; i += NOTIFY_CHUNK) {
        if (used >= budget) {
          done = false;
          break;
        }
        const chunk = members.slice(i, i + NOTIFY_CHUNK);
        used++;
        const r = await sendWhop(env, exp, chunk.map((m) => m.userId), { title: "From your coach", content: rule.message });
        if (!r.ok) {
          console.error("coach nudge failed", { status: r.status, reason: r.reason });
          done = false;
          continue;
        }
        sent += chunk.length;
        await env.DB.batch(
          chunk.map((m) =>
            env.DB.prepare("INSERT OR IGNORE INTO coach_nudges_sent (company_id, user_id, kind, anchor, sent_on) VALUES (?, ?, ?, ?, ?)").bind(
              companyId,
              m.userId,
              kind,
              m.anchor,
              today,
            ),
          ),
        );
      }
    }
  }
  return { used, sent, done };
}

async function checkCompany(env: Env, companyId: string, today: string, budget: number): Promise<{ used: number; sent: number; done: boolean }> {
  const plan = await planCompany(env, companyId, today);
  if (!plan.ok) return { used: plan.used, sent: 0, done: false };
  if (plan.picks.size === 0) return { used: plan.used, sent: 0, done: true };
  return sendPicks(env, companyId, today, plan.rules, plan.picks, budget, plan.used);
}

/* ------------------------------- on demand ------------------------------- */

/** "Run nudges now": who would get one right now, and the message. Nothing is sent. */
export async function previewNudges(env: Env, viewerId: string, companyId: string, now = new Date()): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const plan = await planCompany(env, companyId, now.toISOString().slice(0, 10));
  if (!plan.ok) return { ok: false, status: 502, error: "Couldn't get your member list from Whop. Try again in a moment." };
  if (plan.rules.length === 0) return { ok: true, body: { items: [], rulesOn: 0 } };
  const items = [...plan.picks].flatMap(([kind, list]) => {
    const rule = plan.rules.find((r) => r.kind === kind)!;
    return list.map((p) => ({ memberId: p.userId, kind, message: rule.message }));
  });
  return { ok: true, body: { items, rulesOn: plan.rules.length } };
}

/** Send now to the members the coach kept ticked (still only those due, and once a day). */
export async function runNudgesNow(env: Env, viewerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as { company?: unknown; members?: unknown };
  const companyId = typeof b.company === "string" ? b.company : "";
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const keep = new Set(Array.isArray(b.members) ? b.members.filter((x): x is string => typeof x === "string") : []);
  if (keep.size === 0) return { ok: false, status: 422, error: "Pick at least one member." };
  const today = now.toISOString().slice(0, 10);
  const plan = await planCompany(env, companyId, today);
  if (!plan.ok) return { ok: false, status: 502, error: "Couldn't get your member list from Whop. Try again in a moment." };
  const picks: Picks = new Map();
  for (const [kind, list] of plan.picks) {
    const kept = list.filter((p) => keep.has(p.userId));
    if (kept.length) picks.set(kind, kept);
  }
  const r = await sendPicks(env, companyId, today, plan.rules, picks, REQUESTS_PER_RUN, plan.used);
  return { ok: true, body: { sent: r.sent } };
}

export async function sendCoachNudges(env: Env, now: Date): Promise<{ companies: number; sent: number }> {
  if (!hasWhopKey(env)) return { companies: 0, sent: 0 };
  const today = now.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT company_id FROM coach_nudge_rules WHERE enabled = 1
       AND company_id NOT IN (SELECT company_id FROM coach_nudge_runs WHERE done_on = ?) LIMIT ?`,
  )
    .bind(today, COMPANIES_PER_RUN)
    .all<{ company_id: string }>();
  let budget = REQUESTS_PER_RUN;
  let sent = 0;
  for (const { company_id } of results) {
    if (budget <= 0) break;
    const r = await checkCompany(env, company_id, today, budget);
    budget -= r.used;
    sent += r.sent;
    if (r.done) {
      await env.DB.prepare("INSERT INTO coach_nudge_runs (company_id, done_on) VALUES (?, ?) ON CONFLICT (company_id) DO UPDATE SET done_on = excluded.done_on")
        .bind(company_id, today)
        .run();
    }
  }
  return { companies: results.length, sent };
}
