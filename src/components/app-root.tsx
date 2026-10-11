"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { companyIdFromPath } from "@/lib/coach-api";
import { forwardWhopToken } from "@/lib/whop-token";

/**
 * Whop opens an app at one of two views:
 *
 *   /experiences/[experienceId]   members — the calculators and logs
 *   /dashboard/[companyId]        the creator's dashboard — the coach view
 *
 * Both are served the same page, so the choice is made here, after mount
 * (this is a static export: the URL isn't known at build time).
 */
// Members never download the coach dashboard, and coaches never download the
// member app: each is its own bundle, started as soon as the URL is known.
const loadShell = () => import("@/components/app-shell").then((m) => m.AppShell);
const loadCoach = () => import("@/components/coach-dashboard").then((m) => m.CoachDashboard);
const blank = () => <div className="min-h-screen bg-background" aria-busy="true" />;
const AppShell = dynamic(() => import("@/components/app-shell").then((m) => m.AppShell), { ssr: false, loading: blank });
const CoachDashboard = dynamic(() => import("@/components/coach-dashboard").then((m) => m.CoachDashboard), {
  ssr: false,
  loading: blank,
});

export function AppRoot() {
  const [view, setView] = React.useState<{ kind: "pending" } | { kind: "member" } | { kind: "coach"; companyId: string }>({
    kind: "pending",
  });

  React.useEffect(() => {
    // Before either view mounts and makes its first API call.
    forwardWhopToken();
    const companyId = companyIdFromPath(window.location.pathname);
    void (companyId ? loadCoach() : loadShell());
    setView(companyId ? { kind: "coach", companyId } : { kind: "member" });
  }, []);

  if (view.kind === "coach") return <CoachDashboard companyId={view.companyId} />;
  if (view.kind === "member") return <AppShell />;
  return <div className="min-h-screen bg-background" aria-busy="true" />;
}
