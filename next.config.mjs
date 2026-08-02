/**
 * Origins permitted to embed this app in a frame.
 *
 * `'self'` keeps the app working when opened directly (and in local dev); the
 * two Whop entries cover the apex domain and any subdomain it serves from.
 *
 * NOTE: this list is duplicated in `public/_headers`, which is what applies
 * when the app is deployed as a static export to Cloudflare Pages or Netlify.
 * Change both together.
 */
const FRAME_ANCESTORS = ["'self'", "https://whop.com", "https://*.whop.com"];

/**
 * Content-Security-Policy.
 *
 * Deliberately scoped to `frame-ancestors` only. Adding `script-src` or
 * `default-src` here would break the app: `app/layout.tsx` runs an inline
 * script to apply the stored theme before first paint, and Next.js injects its
 * own inline bootstrap and hydration scripts. Locking those down needs a nonce
 * threaded through a middleware, which is a separate piece of work — a blanket
 * policy added here would silently white-screen the page.
 *
 * Note that `frame-ancestors` is ignored when delivered via a `<meta>` tag, so
 * it has to be a real response header.
 */
const contentSecurityPolicy = `frame-ancestors ${FRAME_ANCESTORS.join(" ")};`;

/**
 * Two deployment targets are supported from one config:
 *
 *   NEXT_OUTPUT=export   Static export to `out/`. For Cloudflare Pages,
 *                        Netlify, or any static host. `headers()` does NOT run
 *                        in this mode — Next.js has no server to emit them —
 *                        so the CSP is served from `public/_headers` instead.
 *
 *   (unset)              Node server runtime via `next start`. For Vercel,
 *                        Render, or a VPS. `headers()` below emits the CSP.
 *
 * This app is entirely client-side — no API routes, no server data fetching —
 * so the static export is a complete, fully functional build, not a degraded
 * one. The only thing lost is the ability to set headers from this file.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  ...(isStaticExport
    ? {
        output: "export",
        // Static hosts serve /path/ as /path/index.html; without this, deep
        // links 404 on most of them.
        trailingSlash: true,
      }
    : {
        async headers() {
          return [
            {
              // Every route, including static assets and RSC payload requests.
              source: "/:path*",
              headers: [
                {
                  key: "Content-Security-Policy",
                  value: contentSecurityPolicy,
                },
                // X-Frame-Options is intentionally NOT set.
                //
                // It is the older, coarser mechanism and cannot express a list
                // of origins or a wildcard subdomain — the only values are DENY
                // and SAMEORIGIN, either of which would block the Whop embed
                // outright. Browsers give X-Frame-Options precedence over
                // frame-ancestors when both are present, so setting it at all
                // would defeat the CSP above.
                //
                // Nothing in this project emits it. If the embed is still
                // refused once deployed, check the hosting layer (Vercel /
                // Netlify / Cloudflare header rules, or an nginx `add_header`)
                // — those sit in front of Next.js and cannot be unset here.
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
