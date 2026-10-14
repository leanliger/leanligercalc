/**
 * Browser side of the food database: barcode lookups and name search, both
 * through the Worker (/api/food/*), which asks USDA FoodData Central and
 * caches results for every member. Nothing is fetched from anywhere else.
 */

import type { FoodProduct } from "./food";

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

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<LookupOutcome> {
  let reply: JsonReply;
  try {
    reply = await fetchJson(`/api/food/barcode/${code}`, signal);
  } catch {
    rethrowIfAborted(signal);
    return { kind: "error", message: "Couldn't reach the food database. Check your connection." };
  }
  if (!reply.json) return { kind: "error", message: "Barcode lookup isn't available in this preview. Add the food by hand." };
  if (reply.status === 429) return { kind: "error", message: "Too many lookups. Wait a minute and try again." };
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
