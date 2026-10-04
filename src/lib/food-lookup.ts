/**
 * Browser side of the food database: barcode lookups and name search.
 *
 * Both go through the Worker (/api/food/*), which caches results for every
 * member. If the Worker can't answer — it's busy, Open Food Facts refused it,
 * or there is no Worker at all (a static preview) — barcode lookups fall back
 * to asking Open Food Facts directly from the browser, which it allows.
 * Name search has no such fallback: Open Food Facts' search service doesn't
 * accept requests from other websites.
 */

import { barcodeCandidates, normalizeOffProduct, OFF_PRODUCT_FIELDS, type FoodProduct } from "./food";

export type LookupOutcome =
  | { kind: "found"; product: FoodProduct }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export type SearchOutcome = { kind: "ok"; results: FoodProduct[] } | { kind: "error"; message: string };

const TIMEOUT_MS = 12000;

interface JsonReply {
  status: number;
  ok: boolean;
  /** False when the server answered with something other than JSON. */
  json: boolean;
  body: unknown;
}

/**
 * GET a URL and parse its JSON, giving up after TIMEOUT_MS. Throws only when
 * the request couldn't be made at all, or the caller aborted it. (Written
 * without AbortSignal.any / .timeout, which older iPhones lack.)
 */
async function fetchJson(url: string, signal?: AbortSignal): Promise<JsonReply> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    const json = (res.headers.get("content-type") ?? "").includes("application/json");
    return { status: res.status, ok: res.ok, json, body: json ? await res.json() : null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function rethrowIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function lookupDirect(code: string, signal?: AbortSignal): Promise<LookupOutcome> {
  try {
    for (const candidate of barcodeCandidates(code)) {
      const reply = await fetchJson(
        `https://world.openfoodfacts.org/api/v2/product/${candidate}.json?fields=${OFF_PRODUCT_FIELDS}`,
        signal,
      );
      if (reply.status === 404) continue;
      if (!reply.ok || !reply.json) return { kind: "error", message: "The food database didn't answer. Try again." };
      const body = reply.body as { status?: number; product?: unknown };
      const product = body.status === 1 ? normalizeOffProduct(body.product, candidate) : null;
      if (product) return { kind: "found", product: { ...product, barcode: code } };
    }
    return { kind: "missing" };
  } catch {
    rethrowIfAborted(signal);
    return { kind: "error", message: "Couldn't reach the food database. Check your connection." };
  }
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<LookupOutcome> {
  let reply: JsonReply;
  try {
    reply = await fetchJson(`/api/food/barcode/${code}`, signal);
  } catch {
    rethrowIfAborted(signal);
    return lookupDirect(code, signal);
  }
  // No Worker (static preview), or the Worker couldn't get an answer upstream.
  if (!reply.json || reply.status === 429 || reply.status >= 500) return lookupDirect(code, signal);
  const body = reply.body as { product?: FoodProduct | null; error?: string };
  if (!reply.ok) return { kind: "error", message: body.error ?? "Lookup failed." };
  return body.product ? { kind: "found", product: body.product } : { kind: "missing" };
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<SearchOutcome> {
  try {
    const reply = await fetchJson(`/api/food/search?q=${encodeURIComponent(query)}`, signal);
    if (!reply.json) {
      return { kind: "error", message: "Search isn't available in this preview. Scan or type a barcode instead." };
    }
    const body = reply.body as { results?: FoodProduct[]; error?: string };
    if (!reply.ok) return { kind: "error", message: body.error ?? "Search failed. Try again." };
    return { kind: "ok", results: body.results ?? [] };
  } catch {
    rethrowIfAborted(signal);
    return { kind: "error", message: "Couldn't reach food search. Check your connection." };
  }
}
