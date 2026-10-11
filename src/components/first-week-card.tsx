"use client";

import * as React from "react";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Today: the first-week checklist for new members. Five steps, each ticked off
 * by doing it (not by tapping): set a goal, weigh in, log a meal, finish a
 * workout, turn on reminders. Gone once all five are done, or when hidden
 * (remembered on this device).
 */

export type FirstWeekStep = "goal" | "weigh-in" | "food" | "workout" | "reminders";

const STEPS: { id: FirstWeekStep; title: string; how: string; action: string }[] = [
  { id: "goal", title: "Set your goal", how: "Your details, goal weight and pace on Plan → Timeline.", action: "Set goal" },
  { id: "weigh-in", title: "Log your first weigh-in", how: "Morning, after the bathroom, before food.", action: "Weigh in" },
  { id: "food", title: "Log a meal", how: "Scan a barcode, search, or type it from the label.", action: "Log food" },
  { id: "workout", title: "Finish your first workout", how: "Pick a program, or start an empty workout.", action: "Train" },
  { id: "reminders", title: "Turn on reminders", how: "A nudge to weigh in and tick your habits.", action: "Reminders" },
];

const HIDE_KEY = "prep-calculator:first-week-hidden";

export function FirstWeekCard({ done, onGo }: { done: Record<FirstWeekStep, boolean>; onGo: (step: FirstWeekStep) => void }) {
  const [hidden, setHidden] = React.useState(true);
  React.useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const count = STEPS.filter((s) => done[s.id]).length;
  if (hidden || count === STEPS.length) return null;
  const next = STEPS.find((s) => !done[s.id]);
  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* hidden for this visit */
    }
  };

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Your first week</p>
            <p className="text-xs text-muted-foreground">
              {count} of {STEPS.length} done. Each one ticks itself off when you do it.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 text-muted-foreground" aria-label="Hide the first-week checklist" onClick={hide}>
            <X />
          </Button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="First week" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={count}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(count / STEPS.length) * 100}%` }} />
        </div>
        <ol className="space-y-1">
          {STEPS.map((s) => {
            const isDone = done[s.id];
            const isNext = next?.id === s.id;
            return (
              <li key={s.id} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5", isNext && "bg-background/60")}>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    isDone ? "border-success bg-success text-background" : "border-border",
                  )}
                  aria-hidden
                >
                  {isDone ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", isDone ? "text-muted-foreground line-through" : "font-medium")}>
                    {s.title}
                    <span className="sr-only">{isDone ? " (done)" : " (to do)"}</span>
                  </span>
                  {isNext ? <span className="block text-[11px] text-muted-foreground">{s.how}</span> : null}
                </span>
                {!isDone ? (
                  <Button variant={isNext ? "default" : "ghost"} size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => onGo(s.id)}>
                    {s.action}
                    <ChevronRight />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
