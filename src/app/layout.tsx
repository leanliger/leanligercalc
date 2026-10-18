import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { A11Y_SCRIPT } from "@/lib/accessibility";

export const metadata: Metadata = {
  title: "Lean Stature System",
  description:
    "Your fat loss plan, food log, training and daily non-negotiables in one place, with your coach alongside.",
};

/** The app's typeface, self-hosted at build time (no request to Google from members' phones). */
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a08" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint. Without this the page renders
 * light and then snaps to dark once React hydrates, which is jarring on every
 * single load.
 *
 * Dark is the default rather than following the OS: the brand is gold on
 * charcoal, and a visitor whose system is set to light would otherwise land on
 * a version of the product that isn't really it. An explicit choice from the
 * Appearance setting (settings-menu.tsx) still wins.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('prep-calculator:theme');
    if (stored !== 'light') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: A11Y_SCRIPT }} />
      </head>
      <body>
        {/* Gradients the rings and arcs paint with (globals.css, "Molten gold"). */}
        <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="molten-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "hsl(var(--gold-hi))" }} />
              <stop offset="0.55" style={{ stopColor: "hsl(var(--primary))" }} />
              <stop offset="1" style={{ stopColor: "hsl(var(--gold-lo))" }} />
            </linearGradient>
            <linearGradient id="molten-green" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="hsl(148 60% 70%)" />
              <stop offset="1" stopColor="hsl(152 55% 34%)" />
            </linearGradient>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
