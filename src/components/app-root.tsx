"use client";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { CoachDashboard } from "@/components/coach-dashboard";
import { companyIdFromPath } from "@/lib/coach-api";

/**
 * Whop opens an app at one of two views:
 *
 *   /experiences/[experienceId]   members — the calculators and logs
 *   /dashboard/[companyId]        the creator's dashboard — the coach view
 *
 * Both are served the same page, so the choice is made here, after mount
 * (this is a static export: the URL isn't known at build time).
 */
export function AppRoot() {
  const [view, setView] = React.useState<{ kind: "pending" } | { kind: "member" } | { kind: "coach"; companyId: string }>({
    kind: "pending",
  });

  React.useEffect(() => {
    const companyId = companyIdFromPath(window.location.pathname);
    setView(companyId ? { kind: "coach", companyId } : { kind: "member" });
  }, []);

  if (view.kind === "coach") return <CoachDashboard companyId={view.companyId} />;
  if (view.kind === "member") return <AppShell />;
  return <div className="min-h-screen bg-background" aria-busy="true" />;
}
