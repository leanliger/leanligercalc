/**
 * Whop user identity.
 *
 * When this app runs inside a Whop app iframe, Whop's reverse proxy attaches a
 * short-lived JWT in the `x-whop-user-token` header to every same-origin
 * request. Verifying it is the only way this server learns who the user is.
 *
 * The checks mirror Whop's own verifier in the official `@whop/api` package
 * (src/verify-user-token.ts), with two deliberate tightenings:
 *
 *   1. The audience MUST equal this app's id. Whop's verifier treats the app
 *      id as optional; here a missing WHOP_APP_ID disables cloud storage
 *      rather than accepting tokens minted for any Whop app.
 *   2. Keys come from Whop's published JWKS rather than one hard-coded key, so
 *      a key rotation does not silently lock every user out. The key Whop's
 *      SDK hard-codes is kept as a fallback if the JWKS fetch fails.
 */

import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";

export const USER_TOKEN_HEADER = "x-whop-user-token";
export const WHOP_ISSUER = "urn:whopcom:exp-proxy";
export const WHOP_JWKS_URL = "https://api.whop.com/.well-known/jwks.json";

/** The key hard-coded in @whop/api 0.0.51 — used only if the JWKS fetch fails. */
const FALLBACK_JWK: JWK = {
  kty: "EC",
  crv: "P-256",
  x: "rz8a8vxvexHC0TLT91g7llOdDOsNuYiGEfic4Qhni-E",
  y: "zH0QblKYToexd5PEIMGXPVJS9AB5smKrW4S_TbiXrOs",
};

type VerifyKey = Awaited<ReturnType<typeof importJWK>>;

export interface VerificationKey {
  kid: string | null;
  key: VerifyKey;
}

export interface VerifiedUser {
  userId: string;
  appId: string;
}

/**
 * Pure verification against a supplied key set. Kept separate from key
 * loading so it can be tested with locally generated keys.
 */
export async function verifyWhopToken(
  token: string,
  appId: string,
  keys: VerificationKey[],
  now?: Date,
): Promise<VerifiedUser | null> {
  if (!token || !appId || keys.length === 0) return null;

  let kid: string | undefined;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256") return null;
    kid = header.kid;
  } catch {
    return null;
  }

  // Prefer the key the token names; if it names none (Whop's own verifier
  // never looks at kid), try each published key.
  const named = kid ? keys.filter((k) => k.kid === kid) : [];
  const candidates = named.length > 0 ? named : keys;

  for (const { key } of candidates) {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: WHOP_ISSUER,
        audience: appId,
        algorithms: ["ES256"],
        currentDate: now,
      });
      // Same shape rules as Whop's verifier: a subject, and a single-string
      // audience — never an array.
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
      if (typeof payload.aud !== "string" || payload.aud !== appId) return null;
      return { userId: payload.sub, appId: payload.aud };
    } catch {
      // Wrong key, bad signature, expired, wrong issuer/audience — try the next
      // key, and fail closed if none verify.
    }
  }
  return null;
}

/* ------------------------------- key loading ------------------------------ */

const KEY_TTL_MS = 12 * 60 * 60 * 1000;
let cached: { keys: VerificationKey[]; at: number } | null = null;

async function importKeys(jwks: JWK[]): Promise<VerificationKey[]> {
  const keys: VerificationKey[] = [];
  for (const jwk of jwks) {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
    if (jwk.alg && jwk.alg !== "ES256") continue;
    try {
      keys.push({ kid: jwk.kid ?? null, key: await importJWK(jwk, "ES256") });
    } catch {
      /* skip malformed key */
    }
  }
  return keys;
}

/** Whop's published keys, cached per Worker isolate for 12 hours. */
export async function loadWhopKeys(fetchImpl: typeof fetch = fetch): Promise<VerificationKey[]> {
  if (cached && Date.now() - cached.at < KEY_TTL_MS) return cached.keys;
  try {
    const res = await fetchImpl(WHOP_JWKS_URL, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`JWKS ${res.status}`);
    const body = (await res.json()) as { keys?: JWK[] };
    const keys = await importKeys(body.keys ?? []);
    if (keys.length === 0) throw new Error("JWKS contained no usable keys");
    cached = { keys, at: Date.now() };
    return keys;
  } catch {
    // Fall back to the SDK's key but do not cache it, so the next request
    // retries the real key set.
    return importKeys([FALLBACK_JWK]);
  }
}

/* --------------------------------- request -------------------------------- */

export interface AuthEnv {
  WHOP_APP_ID?: string;
  /**
   * LOCAL DEVELOPMENT ONLY. Set in `.dev.vars` (never in wrangler.jsonc or as a
   * production secret). Honoured only when the request arrives on localhost,
   * so even if it leaked into production config it could not be used.
   */
  DEV_USER_ID?: string;
}

function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Identify the caller, or null if the request carries no valid identity. */
export async function authenticate(request: Request, env: AuthEnv): Promise<VerifiedUser | null> {
  if (env.DEV_USER_ID && isLocalRequest(request)) {
    return { userId: env.DEV_USER_ID, appId: env.WHOP_APP_ID ?? "dev" };
  }
  const token = request.headers.get(USER_TOKEN_HEADER);
  if (!token || !env.WHOP_APP_ID) return null;
  return verifyWhopToken(token, env.WHOP_APP_ID, await loadWhopKeys());
}
