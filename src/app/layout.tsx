import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prep Calculator — Fat Loss Timeline & Carb Cycling",
  description:
    "Reverse-engineer contest prep duration from a safe weekly fat loss rate, then build a carb cycling plan whose weekly totals average out exactly.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f18" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint. Without this the page renders
 * light and then snaps to dark once React hydrates, which is jarring on every
 * single load for dark-mode users.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('prep-calculator:theme');
    var dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
