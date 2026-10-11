"use client";

/**
 * What shows for the moment a tab's code is still downloading. Tabs are split
 * out of the start-up bundle (see app-shell.tsx) and fetched in the background
 * once the app is up, so this is rarely seen for more than a frame.
 */
export function LazyPanel() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-48 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}
