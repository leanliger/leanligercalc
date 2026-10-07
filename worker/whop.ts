/**
 * Small helpers for calling Whop's REST API with the app's API key.
 */

import { secretValue } from "./secrets";

export interface WhopEnv {
  WHOP_API_KEY?: string;
  /** Override for tests only (a local mock of Whop's API). */
  WHOP_API_BASE?: string;
}

const WHOP_API = "https://api.whop.com";
const TIMEOUT_MS = 10000;

export function hasWhopKey(env: WhopEnv): boolean {
  return Boolean(secretValue(env.WHOP_API_KEY, "WHOP_API_KEY"));
}

export async function whopGet(env: WhopEnv, path: string): Promise<{ status: number; body: unknown }> {
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

/** Whop's own explanation of an error, for logs and admin-facing messages. */
export function whopReason(body: unknown): string {
  const e = (body as { error?: { type?: string; message?: string } } | null)?.error;
  return [e?.type, e?.message].filter(Boolean).join(" | ").slice(0, 200);
}

/** The user's access level to a Whop resource (biz_, prod_ or exp_), or null if Whop didn't answer. */
export async function accessLevel(
  env: WhopEnv,
  userId: string,
  resourceId: string,
): Promise<"admin" | "customer" | "no_access" | null> {
  const res = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`);
  if (res.status !== 200) {
    console.error("whop access check failed", { status: res.status, reason: whopReason(res.body) });
    return null;
  }
  const level = (res.body as { access_level?: string } | null)?.access_level;
  return level === "admin" || level === "customer" || level === "no_access" ? level : null;
}
