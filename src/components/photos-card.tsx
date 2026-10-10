"use client";

import * as React from "react";
import { Camera, ImageOff, Loader2, Lock, Trash2, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import { loadPhoto } from "@/lib/barcode-reader";
import { formatShort } from "@/lib/dates";
import { MAX_PHOTO_UPLOADS_PER_DAY, PHOTO_MAX_DIMENSION, POSES, POSE_LABELS, type PhotoMeta, type Pose } from "@/lib/photos";
import { cn } from "@/lib/utils";

/* ------------------------------ image loading ------------------------------ */

/**
 * Photos are private: they're fetched with the signed-in request (through
 * Whop's proxy) and shown from a local object URL, never a public link.
 */
function usePhotoUrl(src: string | null): { url: string | null; failed: boolean } {
  const [state, setState] = React.useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  React.useEffect(() => {
    if (!src) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ url: null, failed: false });
    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => !cancelled && setState({ url: null, failed: true }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return state;
}

export function PhotoImage({ src, alt, className, onClick }: { src: string; alt: string; className?: string; onClick?: () => void }) {
  const { url, failed } = usePhotoUrl(src);
  const inner = failed ? (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
      <ImageOff className="h-5 w-5" aria-label="Couldn't load photo" />
    </span>
  ) : url ? (
    // eslint-disable-next-line @next/next/no-img-element -- private blob URL
    <img src={url} alt={alt} className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading photo" />
    </span>
  );
  const box = cn("block overflow-hidden rounded-md border border-border bg-muted/30", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(box, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {inner}
    </button>
  ) : (
    <span className={box}>{inner}</span>
  );
}

/* --------------------------------- gallery --------------------------------- */

/** Photos by date, plus a first-vs-latest comparison per pose. Shared with the coach view. */
export function PhotoGallery({
  photos,
  srcFor,
  onDelete,
}: {
  photos: PhotoMeta[];
  srcFor: (p: PhotoMeta) => string;
  onDelete?: (p: PhotoMeta) => Promise<void>;
}) {
  const [open, setOpen] = React.useState<PhotoMeta | null>(null);
  const posesWithTwo = POSES.filter((pose) => photos.filter((p) => p.pose === pose).length >= 2);
  const [comparePose, setComparePose] = React.useState<Pose>(posesWithTwo[0] ?? "front");
  const pose = posesWithTwo.includes(comparePose) ? comparePose : posesWithTwo[0];
  const ofPose = pose ? photos.filter((p) => p.pose === pose).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  const first = ofPose[0];
  const latest = ofPose[ofPose.length - 1];

  const byDate = new Map<string, PhotoMeta[]>();
  for (const p of [...photos].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  }

  return (
    <div className="space-y-4">
      {pose && first && latest ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">First vs latest</p>
            {posesWithTwo.length > 1 ? (
              <SegmentedControl
                ariaLabel="Compare pose"
                size="sm"
                value={pose}
                onValueChange={setComparePose}
                options={posesWithTwo.map((p) => ({ value: p, label: POSE_LABELS[p] }))}
                className="w-auto"
              />
            ) : null}
          </div>
          <div className="grid max-w-sm grid-cols-2 gap-2">
            {[first, latest].map((p, i) => (
              <figure key={p.id} className="space-y-1">
                <PhotoImage src={srcFor(p)} alt={`${POSE_LABELS[p.pose]}, ${formatShort(p.date)}`} className="aspect-[3/4] w-full" onClick={() => setOpen(p)} />
                <figcaption className="text-center text-[11px] text-muted-foreground">
                  {i === 0 ? "First" : "Latest"} · {formatShort(p.date)}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {[...byDate.entries()].map(([date, list]) => (
          <div key={date} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{formatShort(date)}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {list.map((p) => (
                <figure key={p.id} className="space-y-1">
                  <PhotoImage src={srcFor(p)} alt={`${POSE_LABELS[p.pose]}, ${formatShort(p.date)}`} className="aspect-[3/4] w-full" onClick={() => setOpen(p)} />
                  <figcaption className="text-center text-[11px] text-muted-foreground">{POSE_LABELS[p.pose]}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${POSE_LABELS[open.pose]} photo, ${formatShort(open.date)}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
          onClick={() => setOpen(null)}
        >
          <div className="flex w-full max-w-md items-center justify-between text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span>
              {POSE_LABELS[open.pose]} · {formatShort(open.date)}
            </span>
            <span className="flex items-center gap-1">
              {onDelete ? (
                <ConfirmButton
                  size="sm"
                  icon={<Trash2 />}
                  label="Delete"
                  confirmLabel="Delete photo"
                  className="text-white hover:bg-white/10"
                  onConfirm={async () => {
                    await onDelete(open);
                    setOpen(null);
                  }}
                />
              ) : null}
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setOpen(null)} aria-label="Close">
                <X />
              </Button>
            </span>
          </div>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <PhotoImage src={srcFor(open)} alt={`${POSE_LABELS[open.pose]}, ${formatShort(open.date)}`} className="aspect-[3/4] w-full border-white/20" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- card ---------------------------------- */

/** Resize and re-save as JPEG on the device — this also drops location and camera metadata. */
async function prepareForUpload(file: File): Promise<Blob> {
  const photo = await loadPhoto(file);
  try {
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(photo.width, photo.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(photo.width * scale);
    canvas.height = Math.round(photo.height * scale);
    canvas.getContext("2d")?.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Couldn't process that photo.");
    return blob;
  } finally {
    photo.close();
  }
}

export function PhotosCard({ cloud, today }: { cloud: boolean; today: string }) {
  const [state, setState] = React.useState<{
    available: boolean;
    shareWithCoach: boolean;
    photos: PhotoMeta[];
    /** Uploads left today under the daily limit. */
    uploadsLeftToday?: number;
    /** The app-wide photo storage cap is reached. */
    storageFull?: boolean;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(today);
  const [pose, setPose] = React.useState<Pose>("front");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dateId = React.useId();
  const shareId = React.useId();

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/photos", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) throw new Error();
      setState(await res.json());
    } catch {
      setError("Couldn't load your photos.");
    }
  }, []);

  React.useEffect(() => {
    if (cloud) void load();
  }, [cloud, load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareForUpload(file);
      const res = await fetch(`/api/photos?date=${date}&pose=${pose}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "image/jpeg", accept: "application/json" },
        body: blob,
      });
      const body = (await res.json().catch(() => null)) as { photo?: PhotoMeta; uploadsLeftToday?: number; error?: string } | null;
      // Out of uploads today (429) or storage full (507): turn "Add photo" off until things change.
      if (res.status === 429) setState((prev) => (prev ? { ...prev, uploadsLeftToday: 0 } : prev));
      if (res.status === 507) setState((prev) => (prev ? { ...prev, storageFull: true } : prev));
      if (!res.ok || !body?.photo) throw new Error(body?.error ?? "Upload failed. Try again.");
      setState((prev) => (prev ? { ...prev, photos: [body.photo!, ...prev.photos], uploadsLeftToday: body.uploadsLeftToday ?? prev.uploadsLeftToday } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PhotoMeta) => {
    const res = await fetch(`/api/photos/${p.id}`, { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) throw new Error("Couldn't delete it.");
    setState((prev) => (prev ? { ...prev, photos: prev.photos.filter((x) => x.id !== p.id) } : prev));
  };

  const setShare = async (share: boolean) => {
    setState((prev) => (prev ? { ...prev, shareWithCoach: share } : prev));
    const res = await fetch("/api/photo-settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ shareWithCoach: share }),
    }).catch(() => null);
    if (!res?.ok) {
      setState((prev) => (prev ? { ...prev, shareWithCoach: !share } : prev));
      setError("Couldn't change sharing. Try again.");
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          Progress photos <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </CardTitle>
        <CardDescription className="flex gap-1.5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Completely optional and private: only you can see them unless you choose to share them with your coach. Never
            shown on the leaderboard or to other members.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cloud ? (
          <p className="text-sm text-muted-foreground">
            Progress photos are available when you open this app from inside Whop. They&apos;re never saved in your browser.
          </p>
        ) : !state && !error ? (
          <div className="h-24 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
        ) : state && !state.available ? (
          <p className="text-sm text-muted-foreground">Coming soon — progress photos aren&apos;t switched on for this app yet.</p>
        ) : state ? (
          <>
            {(() => {
              const blocked = state.storageFull ? "full" : state.uploadsLeftToday === 0 ? "daily" : null;
              return blocked ? (
                <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  {blocked === "full"
                    ? "Photo storage for this app is full, so new photos can't be added right now. Your photos are safe, and you can still view and delete them."
                    : `You've added ${MAX_PHOTO_UPLOADS_PER_DAY} photos today, the daily limit. You can add more tomorrow.`}
                </p>
              ) : null;
            })()}
            <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
              <Users className={cn("mt-0.5 h-4 w-4 shrink-0", state.shareWithCoach ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <label htmlFor={shareId} className="text-sm font-medium">
                  Share my photos with my coach
                </label>
                <p className="text-xs text-muted-foreground">
                  {state.shareWithCoach
                    ? "On: your coach can see your progress photos while Coach access is also on (Settings). Turn off any time."
                    : "Off: nobody but you can see your photos."}
                </p>
              </div>
              <Switch id={shareId} checked={state.shareWithCoach} onCheckedChange={(v) => void setShare(v)} />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={dateId} className="text-xs">
                  Date
                </Label>
                <Input id={dateId} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-[10.5rem]" />
              </div>
              <SegmentedControl
                ariaLabel="Pose"
                size="sm"
                value={pose}
                onValueChange={setPose}
                options={POSES.map((p) => ({ value: p, label: POSE_LABELS[p] }))}
                className="w-auto min-w-[12rem] flex-1"
              />
              <Button type="button" size="sm" disabled={busy || state.storageFull || state.uploadsLeftToday === 0} onClick={() => fileRef.current?.click()}>
                {busy ? <Loader2 className="animate-spin" /> : <Camera />}
                {busy ? "Uploading…" : "Add photo"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tip: same spot, same lighting, morning, relaxed. Photos are shrunk and re-saved on your phone before upload,
              which also strips location data.
              {state.uploadsLeftToday !== undefined && state.uploadsLeftToday > 0 && state.uploadsLeftToday <= 3
                ? ` ${state.uploadsLeftToday} more today.`
                : ""}
            </p>

            {state.photos.length > 0 ? (
              <PhotoGallery photos={state.photos} srcFor={(p) => `/api/photos/${p.id}`} onDelete={remove} />
            ) : (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No photos yet.</p>
            )}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
