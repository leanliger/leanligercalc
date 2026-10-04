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
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
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
 * theme toggle still wins.
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
