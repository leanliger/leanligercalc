/**
 * System health (coach dashboard; src/lib/system-health.ts; tables from
 * migration 0041):
 *
 *   GET /api/coach/health?company=…   the jobs' latest runs, this whop's notifications and digests
 *
 * trackJob records each scheduled job's run as it finishes; logNotification
 * records every Whop notification's result (worker/reminders.ts), by community
 * or whop only. Neither stores anything about a member. Notification rows are
 * kept NOTIFY_KEEP_DAYS (pruneHealth, daily).
 */

import { NOTIFY_DAYS, NOTIFY_KEEP_DAYS, type JobId, type SystemHealth } from "../src/lib/system-health";
import { adminCheck } from "./messages";

type Env = Parameters<typeof adminCheck>[0];
type Result = { ok: true; body: unknown } | { ok: false; status: number; error: string };

/** Records a scheduled job's run and passes its result (or error) through. */
export async function trackJob<T>(env: { DB: D1Database }, job: JobId, run: Promise<T>): Promise<T> {
  const at = new Date().toISOString();
  try {
    const result = await run;
    const counts = result && typeof result === "object" ? JSON.stringify(result).slice(0, 500) : null;
    await env.DB.prepare(
      `INSERT INTO job_runs (job, last_run_at, last_ok_at, last_result) VALUES (?1, ?2, ?2, ?3)
       ON CONFLICT (job) DO UPDATE SET last_run_at = ?2, last_ok_at = ?2, last_result = ?3`,
    )
      .bind(job, at, counts)
      .run()
      .catch(() => undefined);
    return result;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await env.DB.prepare(
      `INSERT INTO job_runs (job, last_run_at, last_error_at, last_error) VALUES (?1, ?2, ?2, ?3)
       ON CONFLICT (job) DO UPDATE SET last_run_at = ?2, last_error_at = ?2, last_error = ?3`,
    )
      .bind(job, at, message)
      .run()
      .catch(() => undefined);
    throw e;
  }
}

export async function logNotification(env: { DB: D1Database }, target: string, r: { ok: boolean; status: number; reason?: string }): Promise<void> {
  await env.DB.prepare("INSERT INTO notification_log (target, ok, status, reason) VALUES (?, ?, ?, ?)")
    .bind(target.slice(0, 64), r.ok ? 1 : 0, r.status, r.ok ? null : (r.reason ?? null))
    .run();
}

/** Drops notification rows past NOTIFY_KEEP_DAYS. */
export async function pruneHealth(env: { DB: D1Database }, now: Date): Promise<{ deleted: number }> {
  const before = new Date(now.getTime() - NOTIFY_KEEP_DAYS * 86_400_000).toISOString();
  const r = await env.DB.prepare("DELETE FROM notification_log WHERE at < ?").bind(before).run();
  return { deleted: r.meta.changes ?? 0 };
}

// This whop's notifications: to its team (biz_…) or to one of its communities (exp_…).
const MINE = "(target = ?1 OR target IN (SELECT experience_id FROM experience_companies WHERE company_id = ?1))";

export async function getHealth(env: Env, viewerId: string, companyId: string): Promise<Result> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const now = new Date();
  // The same NOTIFY_DAYS days as the chart, today included.
  const since = new Date(now.getTime() - (NOTIFY_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const [jobs, days, failures, digests] = await env.DB.batch([
    env.DB.prepare("SELECT job, last_run_at, last_ok_at, last_error_at, last_error, last_result FROM job_runs"),
    env.DB.prepare(`SELECT substr(at, 1, 10) AS date, SUM(ok) AS sent, SUM(1 - ok) AS failed FROM notification_log WHERE at >= ?2 AND ${MINE} GROUP BY date`).bind(
      companyId,
      since,
    ),
    env.DB.prepare(
      `SELECT status, reason, COUNT(*) AS count, MAX(at) AS last_at FROM notification_log WHERE ok = 0 AND at >= ?2 AND ${MINE}
       GROUP BY status, reason ORDER BY last_at DESC LIMIT 10`,
    ).bind(companyId, since),
    env.DB.prepare("SELECT date, user_id, status FROM coach_digest_log WHERE company_id = ? AND date >= ? ORDER BY date DESC, user_id LIMIT 30").bind(
      companyId,
      since,
    ),
  ]);
  const byDay = new Map(((days?.results ?? []) as { date: string; sent: number; failed: number }[]).map((d) => [d.date, d]));
  const body: SystemHealth = {
    generatedAt: now.toISOString(),
    jobs: ((jobs?.results ?? []) as { job: string; last_run_at: string; last_ok_at: string | null; last_error_at: string | null; last_error: string | null; last_result: string | null }[]).map((r) => {
      let lastResult: Record<string, unknown> | null = null;
      try {
        lastResult = r.last_result ? (JSON.parse(r.last_result) as Record<string, unknown>) : null;
      } catch {
        lastResult = null;
      }
      return {
        id: r.job,
        lastRunAt: r.last_run_at,
        lastOkAt: r.last_ok_at,
        lastErrorAt: r.last_error_at,
        lastError: r.last_error,
        lastResult,
      };
    }),
    notifications: {
      // Every day, so a quiet day shows as a zero rather than a gap.
      days: Array.from({ length: NOTIFY_DAYS }, (_, i) => {
        const date = new Date(now.getTime() - (NOTIFY_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        const d = byDay.get(date);
        return { date, sent: d?.sent ?? 0, failed: d?.failed ?? 0 };
      }),
      failures: ((failures?.results ?? []) as { status: number; reason: string | null; count: number; last_at: string }[]).map((f) => ({
        status: f.status,
        reason: f.reason,
        count: f.count,
        lastAt: f.last_at,
      })),
    },
    digests: ((digests?.results ?? []) as { date: string; user_id: string; status: string }[]).map((d) => ({
      date: d.date,
      mine: d.user_id === viewerId,
      status: d.status,
    })),
  };
  return { ok: true, body };
}
