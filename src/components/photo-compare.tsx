"use client";

import * as React from "react";
import { ImageOff, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { formatShort } from "@/lib/dates";
import { POSES, POSE_LABELS, type PhotoMeta, type Pose } from "@/lib/photos";

/** Frames in a timelapse at most: the newest this many of a pose. */
const MAX_FRAMES = 30;

type Mode = "side" | "slider" | "timelapse";

/**
 * Private photos as local object URLs, fetched once each with the signed-in
 * request (same as PhotoImage in photos-card.tsx), so a timelapse can flip
 * between them without refetching.
 */
function usePhotoUrls(srcs: readonly string[]): Map<string, string | "failed"> {
  const [urls, setUrls] = React.useState<Map<string, string | "failed">>(() => new Map());
  const key = srcs.join("|");
  React.useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    setUrls(new Map());
    for (const src of srcs) {
      fetch(src, { credentials: "same-origin" })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          if (cancelled) return URL.revokeObjectURL(url);
          made.push(url);
          setUrls((prev) => new Map(prev).set(src, url));
        })
        .catch(() => !cancelled && setUrls((prev) => new Map(prev).set(src, "failed")));
    }
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the list's contents
  }, [key]);
  return urls;
}

function Frame({ url, alt, className }: { url: string | "failed" | undefined; alt: string; className?: string }) {
  if (url === "failed") {
    return (
      <span className={`flex items-center justify-center text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="h-5 w-5" aria-label="Couldn't load photo" />
      </span>
    );
  }
  if (!url) {
    return (
      <span className={`flex items-center justify-center ${className ?? ""}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading photo" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- private blob URL
  return <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} draggable={false} />;
}

/**
 * Before and after, three ways: side by side, a slider that wipes one photo
 * over the other, or every photo of a pose played as a timelapse. Any two
 * dates can be picked. Shared by the member's gallery and the coach view.
 */
export function PhotoCompare({ photos, srcFor }: { photos: PhotoMeta[]; srcFor: (p: PhotoMeta) => string }) {
  const posesWithTwo = POSES.filter((pose) => photos.filter((p) => p.pose === pose).length >= 2);
  const [chosenPose, setPose] = React.useState<Pose>(posesWithTwo[0] ?? "front");
  const pose = posesWithTwo.includes(chosenPose) ? chosenPose : posesWithTwo[0];
  const ofPose = React.useMemo(
    () => (pose ? photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : []),
    [photos, pose],
  );
  const [mode, setMode] = React.useState<Mode>("slider");
  const [fromId, setFromId] = React.useState<string | null>(null);
  const [toId, setToId] = React.useState<string | null>(null);
  const from = ofPose.find((p) => p.id === fromId) ?? ofPose[0];
  const to = ofPose.find((p) => p.id === toId) ?? ofPose[ofPose.length - 1];

  const frames = mode === "timelapse" ? ofPose.slice(-MAX_FRAMES) : [from, to].filter((p): p is PhotoMeta => !!p);
  const urls = usePhotoUrls(frames.map(srcFor));
  if (!pose || !from || !to) return null;

  const label = (p: PhotoMeta) => `${POSE_LABELS[p.pose]}, ${formatShort(p.date)}`;
  const picker = (value: PhotoMeta, onPick: (id: string) => void, aria: string) => (
    <select
      aria-label={aria}
      value={value.id}
      onChange={(e) => onPick(e.target.value)}
      className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
    >
      {ofPose.map((p) => (
        <option key={p.id} value={p.id}>
          {formatShort(p.date)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Your transformation</p>
        {posesWithTwo.length > 1 ? (
          <SegmentedControl
            ariaLabel="Pose"
            size="sm"
            value={pose}
            onValueChange={setPose}
            options={posesWithTwo.map((p) => ({ value: p, label: POSE_LABELS[p] }))}
            className="w-auto"
          />
        ) : null}
      </div>
      <SegmentedControl<Mode>
        ariaLabel="Compare as"
        size="sm"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "slider", label: "Slider" },
          { value: "side", label: "Side by side" },
          { value: "timelapse", label: `Timelapse (${Math.min(ofPose.length, MAX_FRAMES)})` },
        ]}
        className="max-w-sm"
      />

      {mode !== "timelapse" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {picker(from, setFromId, "Before photo date")}
          <span>to</span>
          {picker(to, setToId, "After photo date")}
        </div>
      ) : null}

      {mode === "slider" ? (
        <BeforeAfterSlider before={urls.get(srcFor(from))} after={urls.get(srcFor(to))} beforeLabel={formatShort(from.date)} afterLabel={formatShort(to.date)} alt={[label(from), label(to)]} />
      ) : mode === "side" ? (
        <div className="grid max-w-sm grid-cols-2 gap-2">
          {[from, to].map((p, i) => (
            <figure key={`${p.id}-${i}`} className="space-y-1">
              <Frame url={urls.get(srcFor(p))} alt={label(p)} className="aspect-[3/4] w-full rounded-md border border-border bg-muted/30" />
              <figcaption className="text-center text-[12px] text-muted-foreground">
                {i === 0 ? "Before" : "After"} · {formatShort(p.date)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <Timelapse frames={frames} urls={urls} srcFor={srcFor} />
      )}
    </div>
  );
}

/** Drag across to wipe from the before photo to the after. Keyboard: arrow keys on the slider. */
function BeforeAfterSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  alt,
}: {
  before: string | "failed" | undefined;
  after: string | "failed" | undefined;
  beforeLabel: string;
  afterLabel: string;
  alt: [string, string];
}) {
  const [pos, setPos] = React.useState(50);
  return (
    <div className="relative aspect-[3/4] w-full max-w-sm select-none overflow-hidden rounded-md border border-border bg-muted/30">
      <Frame url={before} alt={alt[0]} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <Frame url={after} alt={alt[1]} className="h-full w-full" />
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)]" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-black shadow">
          ⇆
        </span>
      </span>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Before · {beforeLabel}</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">After · {afterLabel}</span>
      {/* The whole photo is the drag area; it's a real range input, so it works with a keyboard and screen readers too. */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Wipe between before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

function Timelapse({
  frames,
  urls,
  srcFor,
}: {
  frames: PhotoMeta[];
  urls: Map<string, string | "failed">;
  srcFor: (p: PhotoMeta) => string;
}) {
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(700);
  const ready = frames.every((p) => urls.has(srcFor(p)));
  React.useEffect(() => {
    if (!playing || !ready) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % frames.length), speed);
    return () => window.clearInterval(t);
  }, [playing, ready, speed, frames.length]);
  const at = Math.min(i, frames.length - 1);
  const frame = frames[at];
  if (!frame) return null;
  return (
    <div className="max-w-sm space-y-2">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-muted/30">
        <Frame url={urls.get(srcFor(frame))} alt={`${POSE_LABELS[frame.pose]}, ${formatShort(frame.date)}`} className="h-full w-full" />
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatShort(frame.date)} · {at + 1}/{frames.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} disabled={!ready}>
          {!ready ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
          {!ready ? "Loading…" : playing ? "Pause" : "Play"}
        </Button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={at}
          onChange={(e) => {
            setPlaying(false);
            setI(Number(e.target.value));
          }}
          aria-label="Timelapse frame"
          className="h-1 min-w-0 flex-1 accent-[hsl(var(--primary))]"
        />
        <select
          aria-label="Speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          <option value={1200}>Slow</option>
          <option value={700}>Normal</option>
          <option value={350}>Fast</option>
        </select>
      </div>
    </div>
  );
}
