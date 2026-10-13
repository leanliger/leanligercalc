"use client";

import * as React from "react";
import { Footprints, KeyRound, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { ConfirmButton } from "@/components/confirm-button";
import { formatShort } from "@/lib/dates";

interface KeyStatus {
  on: boolean;
  endpoint: string;
  lastUsedAt?: string | null;
  lastSteps?: number | null;
  lastDate?: string | null;
}

async function call(method: "GET" | "POST" | "DELETE"): Promise<KeyStatus & { key?: string }> {
  const res = await fetch("/api/steps-sync/key", {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as (KeyStatus & { key?: string; error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Couldn't reach step sync. Try again.");
  return body;
}

/**
 * Progress → Habits: send the day's steps from an iPhone automatically. A web
 * app can't read Apple Health, so an Apple Shortcut does it each evening and
 * posts the count with a personal key (worker/steps-sync.ts). The key is shown
 * once; after that, only "make a new one" or "turn off".
 */
export function StepSyncCard({ cloud }: { cloud: boolean }) {
  const [status, setStatus] = React.useState<KeyStatus | null>(null);
  const [key, setKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!cloud) return;
    let live = true;
    call("GET")
      .then((s) => live && setStatus(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load step sync."));
    return () => {
      live = false;
    };
  }, [cloud]);

  const run = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setError(null);
    try {
      const r = await call(method);
      setKey(r.key ?? null);
      setStatus(method === "DELETE" ? { on: false, endpoint: r.endpoint ?? status?.endpoint ?? "" } : { on: true, endpoint: r.endpoint });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-primary" />
          Step sync from iPhone
        </CardTitle>
        <CardDescription>
          Your steps arrive here every evening by themselves, from Apple Health, instead of typing them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cloud ? (
          <p className="text-sm text-muted-foreground">Open the app inside Whop to set this up: it saves to your account.</p>
        ) : status === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {status?.on && !key ? (
              <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/10 px-3 py-2.5">
                <Footprints className="h-5 w-5 shrink-0 text-success" />
                <p className="min-w-0 text-sm">
                  {status.lastSteps != null && status.lastDate ? (
                    <>
                      <span className="font-medium">Working.</span> Last sync:{" "}
                      <span className="tabular font-semibold">{status.lastSteps.toLocaleString()}</span> steps for{" "}
                      {formatShort(status.lastDate)}.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Key made, nothing received yet.</span> Run the Shortcut once to test it.
                    </>
                  )}
                </p>
              </div>
            ) : null}

            {key && status ? <SetupSteps endpoint={status.endpoint} keyValue={key} /> : null}

            {!status?.on ? (
              <Button onClick={() => run("POST")} disabled={busy}>
                <KeyRound />
                Set up step sync
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!key ? (
                  <ConfirmButton variant="outline" label="Show setup again" confirmLabel="Make a new key" onConfirm={() => run("POST")} />
                ) : null}
                <ConfirmButton label="Turn off" confirmLabel="Turn off" onConfirm={() => run("DELETE")} />
              </div>
            )}
            {status?.on && !key ? (
              <p className="text-xs text-muted-foreground">
                Showing setup again makes a new key; the Shortcut needs the new one pasted in.
              </p>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SetupSteps({ endpoint, keyValue }: { endpoint: string; keyValue: string }) {
  const header = `Bearer ${keyValue}`;
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed">
        Your key is shown <strong>once</strong>. Copy it into the Shortcut now. Keep it private: anyone with it can change your step
        count (nothing else).
      </p>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
        <li>
          Open the <strong>Shortcuts</strong> app → <strong>Automation</strong> → <strong>+</strong> → <strong>Time of Day</strong>.
          Pick <strong>9:00 PM</strong>, <strong>Daily</strong>, <strong>Run Immediately</strong>, then <strong>New Blank Automation</strong>.
        </li>
        <li>
          Add <strong>Find Health Samples</strong>: Type <strong>Steps</strong>, add the filter <strong>Start Date is Today</strong>,
          and set <strong>Group By</strong> to <strong>Day</strong>.
        </li>
        <li>
          Add <strong>Get Details of Health Samples</strong> and choose <strong>Value</strong>.
        </li>
        <li>
          Add <strong>Format Date</strong>: Date <strong>Current Date</strong>, Date Format <strong>Custom</strong>,{" "}
          <code className="rounded bg-muted px-1">yyyy-MM-dd</code>.
        </li>
        <li className="space-y-2">
          <span>
            Add <strong>Get Contents of URL</strong> with this URL, then tap the arrow to show more:
          </span>
          <CopyRow label="URL" value={endpoint} />
          <span className="block">
            Method <strong>POST</strong>. Under <strong>Headers</strong>, add <strong>Authorization</strong> with:
          </span>
          <CopyRow label="Authorization" value={header} secret />
          <span className="block">
            Request Body <strong>JSON</strong>: add a <strong>Number</strong> field <code className="rounded bg-muted px-1">steps</code>{" "}
            set to <em>Value</em>, and a <strong>Text</strong> field <code className="rounded bg-muted px-1">date</code> set to{" "}
            <em>Formatted Date</em>.
          </span>
        </li>
        <li>
          Tap <strong>▶</strong> to test. Allow Shortcuts to read your steps when asked. This card shows the count once it arrives (reopen
          Progress to refresh).
        </li>
      </ol>
      <p className="text-xs leading-relaxed text-muted-foreground">
        iPhones keep Health data locked while the phone is locked, so pick a time you&apos;re usually on your phone. Running it again
        later the same day just updates the number.
      </p>
    </div>
  );
}

function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  return (
    <span className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <span className="sr-only">{label}: </span>
      <code className="min-w-0 flex-1 truncate text-xs">{secret ? `${value.slice(0, 16)}…` : value}</code>
      <CopyButton getText={() => value} label="Copy" className="h-7 shrink-0 px-2 text-xs" />
    </span>
  );
}
