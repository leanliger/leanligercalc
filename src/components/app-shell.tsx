"use client";

import * as React from "react";
import { Activity, Link2, RotateCcw, Salad, TrendingDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyButton } from "@/components/copy-button";
import { FatLossCalculator } from "@/components/fat-loss-calculator";
import { CarbCyclingCalculator } from "@/components/carb-cycling-calculator";
import { ProfileCard } from "@/components/profile-card";
import {
  DEFAULT_APP_STATE,
  buildShareUrl,
  clearStorage,
  decodeStateFromQuery,
  loadFromStorage,
  saveToStorage,
  syncUrl,
  type AppState,
} from "@/lib/persistence";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  FatLossInputs,
  WeightUnit,
} from "@/lib/types";

const UNIT_OPTIONS = [
  { value: "lb" as const, label: "lb" },
  { value: "kg" as const, label: "kg" },
];

export function AppShell() {
  const [state, setState] = React.useState<AppState>(DEFAULT_APP_STATE);
  const [linkedToTimeline, setLinkedToTimeline] = React.useState(false);
  // Rendering defaults on the server and hydrating persisted state afterwards
  // avoids a hydration mismatch, since neither localStorage nor the query
  // string exists during SSR.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const fromUrl = decodeStateFromQuery(window.location.search);
    const restored = fromUrl ?? loadFromStorage();
    if (restored) setState(restored);
    setHydrated(true);
  }, []);

  // Persist on every change, but only once the real state has been restored —
  // otherwise the first render would overwrite storage with the defaults.
  React.useEffect(() => {
    if (!hydrated) return;
    saveToStorage(state);
    syncUrl(state);
  }, [state, hydrated]);

  const updateProfile = React.useCallback((patch: Partial<BiometricProfile>) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  }, []);

  const updateFatLoss = React.useCallback((patch: Partial<FatLossInputs>) => {
    setState((prev) => ({ ...prev, fatLoss: { ...prev.fatLoss, ...patch } }));
  }, []);

  const updateCarbs = React.useCallback((patch: Partial<CarbCyclingInputs>) => {
    setState((prev) => ({ ...prev, carbs: { ...prev.carbs, ...patch } }));
  }, []);

  const handleSendToCarbCycling = React.useCallback(
    (payload: { dailyCalories: number; tdee: number }) => {
      // Biometrics already live on the shared profile, so only the derived
      // energy figures need to cross over.
      setState((prev) => ({
        ...prev,
        activeTab: "carbs",
        carbs: {
          ...prev.carbs,
          tdee: Math.round(payload.tdee),
          dailyCalorieTarget: Math.round(payload.dailyCalories),
        },
      }));
      setLinkedToTimeline(true);
    },
    [],
  );

  const handleReset = React.useCallback(() => {
    clearStorage();
    setState(DEFAULT_APP_STATE);
    setLinkedToTimeline(false);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container flex h-16 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                  Prep Calculator
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  Fat loss timelines and carb cycling for contest prep
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <SegmentedControl
                ariaLabel="Weight unit"
                value={state.unit}
                onValueChange={(unit: WeightUnit) =>
                  setState((prev) => ({ ...prev, unit }))
                }
                options={UNIT_OPTIONS}
                size="sm"
                className="w-[5.5rem]"
              />
              <CopyButton
                getText={() => buildShareUrl(state)}
                label="Share"
                copiedLabel="Link copied"
                variant="outline"
                className="hidden sm:inline-flex"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                aria-label="Reset all inputs to defaults"
                title="Reset to defaults"
              >
                <RotateCcw />
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="container py-6">
          <Tabs
            value={state.activeTab}
            onValueChange={(value) =>
              setState((prev) => ({
                ...prev,
                activeTab: value as AppState["activeTab"],
              }))
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <TabsList>
                <TabsTrigger value="timeline">
                  <TrendingDown />
                  Fat Loss Timeline
                </TabsTrigger>
                <TabsTrigger value="carbs">
                  <Salad />
                  Carb Cycling
                </TabsTrigger>
              </TabsList>

              {linkedToTimeline ? (
                <Badge variant="success">
                  <Link2 />
                  Carb plan linked to timeline
                </Badge>
              ) : null}
            </div>

            <TabsContent value="timeline">
              <FatLossCalculator
                profile={state.profile}
                inputs={state.fatLoss}
                onChange={updateFatLoss}
                unit={state.unit}
                onSendToCarbCycling={handleSendToCarbCycling}
                profileSlot={
                  <ProfileCard
                    profile={state.profile}
                    onChange={updateProfile}
                    unit={state.unit}
                  />
                }
              />
            </TabsContent>

            <TabsContent value="carbs">
              <CarbCyclingCalculator
                profile={state.profile}
                inputs={state.carbs}
                onChange={updateCarbs}
                unit={state.unit}
                linkedToTimeline={linkedToTimeline}
                onClearLink={() => setLinkedToTimeline(false)}
                profileSlot={
                  <ProfileCard
                    profile={state.profile}
                    onChange={updateProfile}
                    unit={state.unit}
                  />
                }
              />
            </TabsContent>
          </Tabs>
        </main>

        <footer className="border-t border-border py-6">
          <div className="container space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              Projections are models, not promises. Real weight loss is noisy — water,
              glycogen, sodium, and menstrual cycles all move the scale more in a day than
              fat does in a week. Track weekly averages and adjust from actual trend data
              rather than assuming the curve.
            </p>
            <p>
              This tool is for general fitness planning and is not medical or nutritional
              advice. Talk to a physician or registered dietitian before starting an
              aggressive diet, especially if you have a history of disordered eating or any
              medical condition.
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
