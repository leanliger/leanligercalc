"use client";

import * as React from "react";
import { Camera, Check, Loader2, RefreshCw, RotateCcw, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cameraAllowedByPolicy } from "@/lib/barcode-reader";
import { PHOTO_MAX_DIMENSION } from "@/lib/photos";
import { cn } from "@/lib/utils";

const TIMERS = [0, 3, 10] as const;

/**
 * Progress photos with a pose guide: a live camera with last time's photo of
 * the same pose laid faintly over it, so this week lines up with the last
 * (same distance, same angle, same framing). That makes before/after and the
 * physique analysis far more trustworthy than photos taken any old way.
 *
 * The frame is 3:4, exactly what the gallery shows, and what's captured is
 * what was framed (cropped the same way as the preview). The front camera's
 * preview is mirrored like a mirror, and so is the guide, but the saved photo
 * is the true image, like every other photo. A self-timer covers propping the
 * phone up. Without a usable camera, onFallback hands over to the photo
 * picker.
 */
export function PoseCamera({
  poseLabel,
  guideUrl,
  onCapture,
  onFallback,
  onClose,
}: {
  poseLabel: string;
  /** Last photo of this pose, as a local object URL; null for the first. */
  guideUrl: string | null;
  onCapture: (photo: Blob) => Promise<void>;
  onFallback: (reason: string) => void;
  onClose: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [facing, setFacing] = React.useState<"user" | "environment">("environment");
  const [live, setLive] = React.useState(false);
  const [guide, setGuide] = React.useState(35);
  const [timer, setTimer] = React.useState<(typeof TIMERS)[number]>(0);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [shot, setShot] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mirrored = facing === "user";

  // Start (or switch) the camera.
  React.useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setLive(false);
      if (cameraAllowedByPolicy() === false) return onFallback("The live camera isn't available inside this page.");
      if (!navigator.mediaDevices?.getUserMedia) return onFallback("This browser can't show a live camera here.");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        return onFallback(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was blocked."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found."
              : "The camera couldn't start.",
        );
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* muted inline video may still refuse once; the frame shows anyway */
      }
      if (!cancelled) setLive(true);
    };
    void start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the camera flips
  }, [facing]);

  // Stop the camera when this closes.
  React.useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  React.useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  /** The 3:4 centre of the frame, as the preview shows it (object-cover), at most PHOTO_MAX_DIMENSION tall. */
  const grab = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const target = 3 / 4;
    const sw = vw / vh > target ? vh * target : vw;
    const sh = vw / vh > target ? vh : vw / target;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / sh);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return setError("Couldn't capture that frame. Try again.");
    setShot({ blob, url: URL.createObjectURL(blob) });
  };

  const shoot = () => {
    if (timer === 0) return void grab();
    setCountdown(timer);
  };
  React.useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      void grab();
      return;
    }
    const t = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticks on its own
  }, [countdown]);

  const use = async () => {
    if (!shot) return;
    setSaving(true);
    setError(null);
    try {
      await onCapture(shot.blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Take a ${poseLabel.toLowerCase()} photo`} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose} aria-label="Close camera">
          <X />
        </Button>
        <p className="text-sm font-medium">{poseLabel} photo</p>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Switch camera"
          disabled={!!shot}
        >
          <RefreshCw />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        {/* 3:4 and as big as fits between the top bar and the controls. */}
        <div
          className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-900"
          style={{ width: "min(100%, calc((100dvh - 15rem) * 0.75))" }}
        >
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element -- local capture
            <img src={shot.url} alt="Your new photo" className="h-full w-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className={cn("h-full w-full object-cover", mirrored && "-scale-x-100")}
              />
              {guideUrl && guide > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element -- private blob URL
                <img
                  src={guideUrl}
                  alt=""
                  aria-hidden
                  className={cn("pointer-events-none absolute inset-0 h-full w-full object-cover", mirrored && "-scale-x-100")}
                  style={{ opacity: guide / 100 }}
                />
              ) : null}
              {/* A centre line and thirds help even without a guide photo. */}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/25" />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/15" />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/15" />
              {!live ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-label="Starting the camera" />
                </span>
              ) : null}
              {countdown !== null ? (
                <span className="absolute inset-0 flex items-center justify-center text-7xl font-bold tabular-nums drop-shadow-lg" aria-live="assertive">
                  {countdown}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {error ? <p role="alert" className="text-center text-sm text-red-300">{error}</p> : null}
        {shot ? (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setShot(null)} disabled={saving}>
              <RotateCcw />
              Retake
            </Button>
            <Button onClick={() => void use()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? "Saving…" : "Use photo"}
            </Button>
          </div>
        ) : (
          <>
            {guideUrl ? (
              <label className="flex items-center gap-3 text-xs text-white/80">
                <span className="w-24 shrink-0">Last photo guide</span>
                <input
                  type="range"
                  min={0}
                  max={70}
                  step={5}
                  value={guide}
                  onChange={(e) => setGuide(Number(e.target.value))}
                  className="h-1 flex-1 accent-[hsl(var(--primary))]"
                  aria-label="Guide photo strength"
                />
              </label>
            ) : (
              <p className="text-center text-xs text-white/70">Your first {poseLabel.toLowerCase()} photo: next time it becomes the guide.</p>
            )}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTimer((t) => TIMERS[(TIMERS.indexOf(t) + 1) % TIMERS.length]!)}
                className="flex w-20 items-center gap-1.5 text-sm text-white/85"
                aria-label={`Self-timer: ${timer === 0 ? "off" : `${timer} seconds`}`}
              >
                <Timer className="h-5 w-5" />
                {timer === 0 ? "Off" : `${timer}s`}
              </button>
              <button
                type="button"
                onClick={shoot}
                disabled={!live || countdown !== null}
                aria-label="Take photo"
                className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-40"
              >
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
              <span className="flex w-20 justify-end text-white/60">
                <Camera className="h-5 w-5" aria-hidden />
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
