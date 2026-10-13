"use client";

import * as React from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prepareForUpload } from "@/components/photos-card";
import { formatShort } from "@/lib/dates";
import { POSES, POSE_LABELS, type Pose } from "@/lib/photos";
import { PHYSIQUE_DAILY_LIMIT, type PhysiqueSection } from "@/lib/physique";

interface Analysis {
  id: string;
  source: string;
  photoDate: string | null;
  createdAt?: string;
  sections: PhysiqueSection[];
  raw: string;
}

/** Bullet lines render as a list; everything else as paragraphs. **bold** is honoured. */
function Body({ lines }: { lines: string[] }) {
  const blocks: ({ type: "p"; text: string } | { type: "ul"; items: string[] })[] = [];
  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    const last = blocks.at(-1);
    if (bullet) {
      if (last?.type === "ul") last.items.push(bullet[1] ?? "");
      else blocks.push({ type: "ul", items: [bullet[1] ?? ""] });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }

  const inline = (text: string) =>
    text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

  return (
    <div className="space-y-2 text-sm">
      {blocks.map((block, i) =>
        block.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}

/** The model's reply under its headings. Shared with the monthly comparison. */
export function Sections({ analysis }: { analysis: Pick<Analysis, "sections" | "raw"> }) {
  if (!analysis.sections.length) return <p className="text-sm whitespace-pre-wrap">{analysis.raw}</p>;
  return (
    <div className="space-y-4">
      {analysis.sections.map((section, i) => (
        <section key={i} className="space-y-1.5">
          {section.heading ? <h4 className="text-sm font-semibold">{section.heading}</h4> : null}
          <Body lines={section.lines} />
        </section>
      ))}
    </div>
  );
}

export function PhysiqueCard({ enabled }: { enabled: boolean }) {
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);

  // Past analyses, so a member can re-read one without spending another.
  React.useEffect(() => {
    if (!enabled) return;
    void (async () => {
      try {
        const res = await fetch("/api/physique", { credentials: "same-origin", headers: { accept: "application/json" } });
        if (!res.ok) return;
        const body = (await res.json()) as { analyses?: Analysis[]; left?: number };
        setAnalysis(body.analyses?.[0] ?? null);
        setLeft(body.left ?? null);
      } catch {
        /* history is a nicety; the button still works */
      }
    })();
  }, [enabled]);

  const run = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/physique", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as (Analysis & { left?: number; error?: string }) | null;
      if (!res.ok || !body?.sections) throw new Error(body?.error ?? "The analysis didn't come back. Try again.");
      setAnalysis(body);
      setLeft(body.left ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis didn't come back. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** A one-off set: resized on the device, sent as base64, never saved to the gallery. */
  const runUpload = async (files: FileList) => {
    if (files.length < 3) {
      setError("Pick all three photos at once — front, side and back.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const picked = Array.from(files).slice(0, 3);
      const images = await Promise.all(
        picked.map(async (file, i) => {
          const blob = await prepareForUpload(file);
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let j = 0; j < buffer.length; j += 8192) {
            binary += String.fromCharCode(...buffer.subarray(j, j + 8192));
          }
          return { pose: POSES[i] as Pose, data: btoa(binary) };
        }),
      );
      await run({ source: "upload", images });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Those photos couldn't be read.");
      setBusy(false);
    }
  };

  if (!enabled) return null;

  const outOfAnalyses = left === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Physique analysis
        </CardTitle>
        <CardDescription>
          A coaching breakdown of your latest front, side and back photos — body fat range, strengths, target areas and
          a plan for your next block. {PHYSIQUE_DAILY_LIMIT} a day.
          {left !== null ? ` ${left} left today.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void run({ source: "saved" })} disabled={busy || outOfAnalyses}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Analyzing…" : "Analyze my photos"}
          </Button>
          <Button variant="outline" onClick={() => uploadRef.current?.click()} disabled={busy || outOfAnalyses}>
            <Upload className="h-4 w-4" />
            One-off set
          </Button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void runUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          &quot;Analyze my photos&quot; uses the newest {POSES.map((p) => POSE_LABELS[p].toLowerCase()).join(", ")} photo
          you&apos;ve saved. A one-off set is {POSES.length} photos picked together, in that order, and is never added to
          your gallery. Photos go to Google for the analysis only; Google doesn't use them to train or improve its products.
        </p>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {analysis ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {analysis.photoDate ? `Photos from ${formatShort(analysis.photoDate)}` : "One-off set"}
              {analysis.createdAt ? ` · analyzed ${formatShort(analysis.createdAt.slice(0, 10))}` : ""}
            </p>
            <Sections analysis={analysis} />
            <p className="text-xs text-muted-foreground">
              An estimate from photos, not a measurement or medical advice.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
