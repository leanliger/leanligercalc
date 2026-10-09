"use client";

import * as React from "react";
import { Eye, EyeOff, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatShort } from "@/lib/dates";
import { SHARED_ITEMS, type MySharing } from "@/lib/sharing";
import { cn } from "@/lib/utils";

async function call(init?: RequestInit, experienceId?: string | null): Promise<MySharing> {
  const query = experienceId ? `?experience=${encodeURIComponent(experienceId)}` : "";
  const res = await fetch(`/api/sharing${query}`, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => null)) as (MySharing & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

/** The member's choice; also tells the server which community to notify them in. */
export const loadSharing = (experienceId: string | null) => call(undefined, experienceId);
export const saveSharing = (shared: boolean) => call({ method: "PUT", body: JSON.stringify({ shared }) });

export interface CoachAccessProps {
  /** Inside Whop (cloud mode); otherwise there's no coach to share with. */
  available: boolean;
  sharing: MySharing | null;
  error: string | null;
  onChange: (shared: boolean) => Promise<void>;
}

function WhatsShared({ className }: { className?: string }) {
  return (
    <ul className={cn("space-y-0.5 text-[11px] text-muted-foreground", className)}>
      {SHARED_ITEMS.map((item) => (
        <li key={item} className="flex gap-1.5">
          <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Settings → Coach access. */
export function CoachAccessSettings({ available, sharing, error, onChange }: CoachAccessProps) {
  const id = React.useId();
  const [busy, setBusy] = React.useState(false);
  const shared = sharing?.shared ?? false;
  const set = async (next: boolean) => {
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {shared ? <Eye className="h-3.5 w-3.5 text-primary" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        Coach access
      </p>
      {!available ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">Available when you open this app from inside Whop.</p>
      ) : (
        <>
          {sharing?.requestedAt && !shared ? (
            <div className="space-y-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2.5">
              <p className="text-sm font-medium">Your coach asked to see your progress</p>
              <p className="text-[11px] text-muted-foreground">Asked {formatShort(sharing.requestedAt.slice(0, 10))}.</p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" disabled={busy} onClick={() => void set(true)}>
                  Share
                </Button>
                <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => void set(false)}>
                  Not now
                </Button>
              </div>
            </div>
          ) : null}
          <div className={cn("space-y-2 rounded-md border px-3 py-2.5", shared ? "border-primary/40 bg-primary/5" : "border-border")}>
            <div className="flex items-center gap-2.5">
              <label htmlFor={id} className="min-w-0 flex-1 text-sm font-medium">
                Share my progress with my coach
              </label>
              <Switch id={id} checked={shared} disabled={busy || sharing === null} onCheckedChange={(v) => void set(v)} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {shared
                ? `Shared${sharing?.sharedAt ? ` since ${formatShort(sharing.sharedAt.slice(0, 10))}` : ""}. Your coach can see:`
                : "Off: your coach sees only your name. Turn it on and your coach can see:"}
            </p>
            <WhatsShared />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Progress photos have their own switch. Turn this off any time and your coach loses access straight away.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The prompt on Today when a coach has asked. */
export function CoachRequestCard({ sharing, onChange }: { sharing: MySharing; onChange: (shared: boolean) => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const set = async (next: boolean) => {
    setBusy(true);
    try {
      await onChange(next);
    } catch {
      setBusy(false);
    }
  };
  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Your coach asked to see your progress</p>
            <p className="text-xs text-muted-foreground">
              Share so they can check your plan and give feedback. You can stop any time in Settings.{" "}
              <button type="button" className="underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? "Hide" : "What's shared?"}
              </button>
            </p>
            {open ? <WhatsShared className="mt-2" /> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void set(true)}>
            Share with my coach
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void set(false)}>
            Not now
          </Button>
        </div>
        <p className="sr-only">Asked {formatShort(sharing.requestedAt?.slice(0, 10) ?? "")}</p>
      </CardContent>
    </Card>
  );
}
