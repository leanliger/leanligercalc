/**
 * Food database lookups: barcode → product, and search by name.
 *
 * These endpoints are public (no Whop identity needed), because food logging
 * has to work for members using the plain embed too. They hold no personal
 * data, so the only protections they need are against abuse: strict input
 * validation, a per-IP rate limit, and a shared cache so each product is
 * fetched from upstream once rather than once per member.
 *
 *   Open Food Facts         always on, no key
 *   USDA FoodData Central   only when the USDA_API_KEY secret is set
 */

import {
  BARCODE_PATTERN,
  barcodeCandidates,
  hasNutrition,
  normalizeOffProduct,
  normalizeUsdaFood,
  OFF_PRODUCT_FIELDS,
  sameBarcode,
  type FoodProduct,
} from "../src/lib/food";
import { secretValue } from "./secrets";

export interface FoodEnv {
  DB: D1Database;
  /** Workers rate-limiting binding; absent in some local setups. */
  FOOD_LIMITER?: RateLimit;
  USDA_API_KEY?: string;
}

const USER_AGENT = "LeanLigerCalc/1.0 (+https://leanligercalc.lean-liger-fitness.workers.dev)";
const UPSTREAM_TIMEOUT_MS = 8000;

const DAY = 24 * 60 * 60;
const FOUND_TTL = 30 * DAY;
const MISSING_TTL = 1 * DAY;
const SEARCH_TTL = 1 * DAY;

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;
const SEARCH_RESULTS = 20;


/** Thrown when an upstream database is down or refusing us. */
class UpstreamError extends Error {}

async function upstream(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError("unreachable");
  }
}

/* --------------------------------- cache -------------------------------- */

async function cacheGet<T>(env: FoodEnv, key: string, maxAge: (value: T) => number): Promise<T | null> {
  const row = await env.DB.prepare("SELECT data, fetched_at FROM food_cache WHERE key = ?")
    .bind(key)
    .first<{ data: string; fetched_at: number }>();
  if (!row) return null;
  try {
    const value = JSON.parse(row.data) as T;
    return Date.now() / 1000 - row.fetched_at < maxAge(value) ? value : null;
  } catch {
    return null;
  }
}

async function cachePut(env: FoodEnv, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO food_cache (key, data, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`,
  )
    .bind(key, JSON.stringify(value), Math.floor(Date.now() / 1000))
    .run();
}

/* ------------------------------ Open Food Facts ----------------------------- */

async function offProduct(code: string): Promise<FoodProduct | null> {
  const res = await upstream(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_PRODUCT_FIELDS}`,
  );
  // Unknown products come back as 404 with { status: 0 }.
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError(`off ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: unknown };
  if (body.status !== 1 || !body.product) return null;
  return normalizeOffProduct(body.product, code);
}

async function offSearch(q: string): Promise<FoodProduct[]> {
  const params = new URLSearchParams({
    q,
    page_size: String(SEARCH_RESULTS),
    langs: "en",
    fields: "code,product_name,product_name_en,brands,nutriments",
  });
  const res = await upstream(`https://search.openfoodfacts.org/search?${params}`);
  if (!res.ok) throw new UpstreamError(`off search ${res.status}`);
  const body = (await res.json()) as { hits?: unknown[] };
  const out: FoodProduct[] = [];
  for (const hit of body.hits ?? []) {
    const code = (hit as { code?: unknown })?.code;
    if (typeof code !== "string" || !BARCODE_PATTERN.test(code)) continue;
    const p = normalizeOffProduct(hit, code);
    if (p && hasNutrition(p) && !p.name.startsWith("Unnamed")) out.push(p);
  }
  return out;
}

/* ---------------------------------- USDA --------------------------------- */

async function usdaSearch(
  env: FoodEnv,
  query: string,
  dataType: string[],
  pageSize: number,
): Promise<FoodProduct[]> {
  if (!env.USDA_API_KEY) return [];
  const res = await upstream(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(secretValue(env.USDA_API_KEY, "USDA_API_KEY"))}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, dataType, pageSize }),
    },
  );
  if (!res.ok) {
    // api.data.gov explains rejections with a code such as API_KEY_INVALID.
    let code = "";
    try {
      code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? "";
    } catch {
      /* not JSON */
    }
    throw new UpstreamError(`usda ${res.status}${code ? ` ${code}` : ""}`);
  }
  const body = (await res.json()) as { foods?: unknown[] };
  return (body.foods ?? [])
    .map(normalizeUsdaFood)
    .filter((p): p is FoodProduct => p !== null && hasNutrition(p));
}

/** USDA has no barcode endpoint: search the digits, then insist on an exact match. */
async function usdaByBarcode(env: FoodEnv, code: string): Promise<FoodProduct | null> {
  const hits = await usdaSearch(env, code, ["Branded"], 5);
  return hits.find((p) => p.barcode && sameBarcode(p.barcode, code)) ?? null;
}

/* -------------------------------- handlers -------------------------------- */

export type FoodResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string; upstream?: boolean };

export async function rateLimited(env: FoodEnv, request: Request): Promise<boolean> {
  if (!env.FOOD_LIMITER) return false;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.FOOD_LIMITER.limit({ key: `food:${ip}` });
  return !success;
}

export async function lookupBarcode(env: FoodEnv, code: string): Promise<FoodResult> {
  if (!BARCODE_PATTERN.test(code)) return { ok: false, status: 422, error: "Barcode must be 8–14 digits." };

  const cacheKey = `bc:${code}`;
  const cached = await cacheGet<{ product: FoodProduct | null }>(env, cacheKey, (v) =>
    v.product ? FOUND_TTL : MISSING_TTL,
  );
  if (cached) return { ok: true, body: cached };

  let product: FoodProduct | null = null;
  let failures = 0;
  for (const candidate of barcodeCandidates(code)) {
    try {
      product = await offProduct(candidate);
    } catch {
      failures++;
    }
    if (product) break;
  }
  // A product with no nutrition still helps (its name pre-fills the form),
  // but USDA may have the numbers.
  if (!product || !hasNutrition(product)) {
    try {
      const fromUsda = await usdaByBarcode(env, code);
      if (fromUsda) product = { ...fromUsda, barcode: code };
    } catch {
      failures++;
    }
  }

  if (!product && failures > 0) {
    // Don't cache "not found" when we never got a real answer.
    return { ok: false, status: 502, error: "The food database didn't answer. Try again.", upstream: true };
  }
  const body = { product };
  await cachePut(env, cacheKey, body);
  return { ok: true, body };
}

export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

export async function searchFoods(env: FoodEnv, raw: string): Promise<FoodResult> {
  const q = normalizeQuery(raw);
  if (q.length < SEARCH_MIN || q.length > SEARCH_MAX) {
    return { ok: false, status: 422, error: `Search for ${SEARCH_MIN}–${SEARCH_MAX} characters.` };
  }

  const cacheKey = `q:${env.USDA_API_KEY ? "u:" : ""}${q}`;
  const cached = await cacheGet<{ results: FoodProduct[] }>(env, cacheKey, () => SEARCH_TTL);
  if (cached) return { ok: true, body: cached };

  // Whole foods first (USDA reference data), then packaged products.
  const [generic, off, branded] = await Promise.allSettled([
    usdaSearch(env, q, ["Foundation", "SR Legacy"], 6),
    offSearch(q),
    usdaSearch(env, q, ["Branded"], 6),
  ]);
  const settled = [generic, off, branded];
  // Log which source failed and its status (never the key or the query).
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error("food search source failed", { source: ["usda-generic", "off", "usda-branded"][i], reason: String(r.reason?.message ?? r.reason) });
    }
  });
  if (settled.every((s) => s.status === "rejected")) {
    return { ok: false, status: 502, error: "Food search is busy right now. Try again in a minute.", upstream: true };
  }

  const results: FoodProduct[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const p of s.value) {
      const id = p.barcode ? `bc:${p.barcode.replace(/^0+/, "")}` : p.key;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(p);
    }
  }
  const body = { results: results.slice(0, 30) };
  // Only cache a complete answer; a partial one would hide a source for a day.
  if (settled.every((s) => s.status === "fulfilled")) await cachePut(env, cacheKey, body);
  return { ok: true, body };
}
