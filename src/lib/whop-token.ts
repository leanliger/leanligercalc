/**
 * Send the member's Whop sign-in with the app's own API calls.
 *
 * Inside Whop, Whop's proxy is supposed to attach the member's signed token
 * (x-whop-user-token) to every request. The Whop iPhone app only attaches it
 * to the page load, not to the page's fetch() calls, so the API saw a
 * signed-out member and everything logged on the iPhone stayed on the phone.
 *
 * The Worker now writes the verified token into the page
 * (<meta name="app-user-token">, see servePageWithToken in worker/auth.ts).
 * This sends it back on same-origin /api/ calls as x-app-user-token, which the
 * Worker verifies exactly like Whop's header. Where Whop's proxy does attach
 * its own header (computers, Android), that one wins.
 *
 * Call once, before the first API call.
 */

const META_NAME = "app-user-token";
const HEADER = "x-app-user-token";

let installed = false;

export function forwardWhopToken(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const token = document.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`)?.content;
  if (!token) return;

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(HEADER)) headers.set(HEADER, token);
    return input instanceof Request ? original(new Request(input, { ...init, headers })) : original(input, { ...init, headers });
  };
}
