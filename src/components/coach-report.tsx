"use client";

import * as React from "react";
import { FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressReportLoader } from "@/components/progress-report";
import type { WeightUnit } from "@/lib/types";

/** Coach dashboard → a member: open their progress report and send it to them. */
export function CoachReportPanel({ companyId, memberId, memberName, unit }: { companyId: string; memberId: string; memberName: string; unit: WeightUnit }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<{ busy: boolean; text: string | null; ok: boolean }>({ busy: false, text: null, ok: true });
  const first = memberName.split(" ")[0] || memberName;
  React.useEffect(() => {
    setOpen(false);
    setState({ busy: false, text: null, ok: true });
  }, [memberId]);
  const qs = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;

  const share = async () => {
    setState({ busy: true, text: null, ok: true });
    try {
      const res = await fetch("/api/coach/report/share", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ company: companyId, member: memberId }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't send it. Try again.");
      setState({ busy: false, ok: true, text: `Sent. ${first} got a notification and can open it from Progress → Weekly.` });
    } catch (e) {
      setState({ busy: false, ok: false, text: e instanceof Error ? e.message : "Couldn't send it. Try again." });
    }
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <FileText />
        Progress report
      </Button>
    );
  }
  return (
    <ProgressReportLoader
      url={`/api/coach/report?${qs}`}
      name={memberName}
      unit={unit}
      photoSrc={(p) => `/api/coach/photo?${qs}&id=${encodeURIComponent(p.id)}`}
      actions={
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void share()} disabled={state.busy}>
              <Send />
              {state.busy ? "Sending…" : `Send to ${first}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close report
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            They can see the same report in their app at any time. For a testimonial, a screenshot of it works well.
          </p>
          {state.text ? (
            <p role="status" className={state.ok ? "text-[11px] text-muted-foreground" : "text-[11px] text-destructive"}>
              {state.text}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
