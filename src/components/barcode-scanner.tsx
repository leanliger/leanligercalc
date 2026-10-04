"use client";

import * as React from "react";
import { Camera, Flashlight, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cameraAllowedByPolicy, drawToCanvas, getBarcodeReader, loadPhoto } from "@/lib/barcode-reader";
import { cn } from "@/lib/utils";

/** How often a camera frame is checked for a barcode. */
const SCAN_INTERVAL_MS = 180;
/** Decode at most this many pixels wide: plenty for a barcode, light on CPU. */
const LIVE_DECODE_WIDTH = 960;
const PHOTO_DECODE_WIDTH = 1600;

type Phase =
  | { kind: "starting" }
  | { kind: "live"; torch: boolean | null }
  | { kind: "photo"; reason: string | null }
  | { kind: "reading-photo" };

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onCancel: () => void;
}

/**
 * Live camera scanning, with a photo fallback.
 *
 * The live view needs camera permission. Inside an embed (Whop's iframe), that
 * also needs the embedding page to allow it; if it doesn't, the browser
 * refuses without even asking. Taking a photo works either way: the file
 * picker hands over a picture without granting this page the camera.
 */
export function BarcodeScanner({ onDetected, onCancel }: BarcodeScannerProps) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "starting" });
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const doneRef = React.useRef(false);
  const detectedRef = React.useRef(onDetected);
  detectedRef.current = onDetected;

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finish = React.useCallback(
    (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      stopCamera();
      try {
        navigator.vibrate?.(40);
      } catch {
        /* not supported */
      }
      detectedRef.current(code);
    },
    [stopCamera],
  );

  // Start the camera, then poll frames until a barcode is read.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas");

    const start = async () => {
      if (cameraAllowedByPolicy() === false) {
        setPhase({ kind: "photo", reason: "The live camera isn't available inside this page." });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase({ kind: "photo", reason: "This browser can't show a live camera here." });
        return;
      }
      // Start loading the decoder while the camera warms up.
      const readerPromise = getBarcodeReader();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setPhase({
          kind: "photo",
          reason:
            name === "NotAllowedError" || name === "SecurityError"
              ? "Camera access was blocked."
              : name === "NotFoundError" || name === "OverconstrainedError"
                ? "No camera was found."
                : name === "NotReadableError"
                  ? "The camera is being used by another app."
                  : "The camera couldn't start.",
        });
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay of a muted inline video is allowed; ignore odd refusals */
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setPhase({ kind: "live", torch: caps.torch ? false : null });

      let reader;
      try {
        reader = await readerPromise;
      } catch {
        if (!cancelled) {
          stopCamera();
          setPhase({ kind: "photo", reason: "The barcode reader couldn't load. Check your connection." });
        }
        return;
      }

      const tick = async () => {
        // Stops when the camera does (finish, unmount, or switching to a photo).
        if (cancelled || doneRef.current || !streamRef.current) return;
        const box = frameRef.current;
        if (video.readyState >= 2 && video.videoWidth > 0 && box) {
          // Decode the part of the frame under the guide box (plus a margin),
          // allowing for how object-cover crops the video to fit.
          const cw = box.clientWidth;
          const ch = box.clientHeight;
          const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
          const width = Math.min(video.videoWidth, (cw * 0.92) / scale);
          const height = Math.min(video.videoHeight, (ch * 0.7) / scale);
          drawToCanvas(
            canvas,
            video,
            { x: (video.videoWidth - width) / 2, y: (video.videoHeight - height) / 2, width, height },
            LIVE_DECODE_WIDTH,
          );
          try {
            const code = await reader.read(canvas);
            if (code && !cancelled) {
              finish(code);
              return;
            }
          } catch {
            /* a bad frame; try the next one */
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    };

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [finish, stopCamera]);

  const toggleTorch = async () => {
    if (phase.kind !== "live" || phase.torch === null) return;
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !phase.torch;
    try {
      await track?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setPhase({ kind: "live", torch: next });
    } catch {
      setPhase({ kind: "live", torch: null });
    }
  };

  const readPhoto = async (file: File) => {
    setPhotoError(null);
    const previous = phase;
    setPhase({ kind: "reading-photo" });
    try {
      const [reader, photo] = await Promise.all([getBarcodeReader(), loadPhoto(file)]);
      const canvas = document.createElement("canvas");
      try {
        drawToCanvas(canvas, photo.source, { x: 0, y: 0, width: photo.width, height: photo.height }, PHOTO_DECODE_WIDTH);
      } finally {
        photo.close();
      }
      const code = await reader.read(canvas);
      if (code) {
        finish(code);
        return;
      }
      setPhotoError("No barcode found in that photo. Fill the frame with the barcode, keep it sharp, and try again — or type the numbers instead.");
    } catch {
      setPhotoError("Couldn't read that photo. Try again, or type the numbers instead.");
    }
    setPhase(previous.kind === "photo" ? previous : { kind: "photo", reason: null });
  };

  const live = phase.kind === "live" || phase.kind === "starting";

  return (
    <div className="space-y-3">
      {live ? (
        <div
          ref={frameRef}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Camera view"
            className="h-full w-full object-cover"
          />
          {/* Guide box: everything outside it is dimmed. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[45%] -translate-y-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
          />
          <div aria-hidden className="pointer-events-none absolute inset-x-[14%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          <p className="absolute inset-x-0 bottom-2 px-3 text-center text-xs font-medium text-white drop-shadow">
            {phase.kind === "starting" ? "Starting camera…" : "Line up the barcode inside the box"}
          </p>
          {phase.kind === "live" && phase.torch !== null ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-pressed={phase.torch}
              aria-label={phase.torch ? "Turn off flashlight" : "Turn on flashlight"}
              onClick={toggleTorch}
              className="absolute right-2 top-2 h-9 w-9 bg-black/50 text-white hover:bg-black/70"
            >
              <Flashlight />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-center">
          <ScanLine className="mx-auto h-8 w-8 text-primary" aria-hidden />
          {phase.kind === "photo" && phase.reason ? (
            <p className="text-sm text-muted-foreground">{phase.reason}</p>
          ) : null}
          <p className="text-sm">Take a photo of the barcode instead — it&apos;ll be read automatically.</p>
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={phase.kind === "reading-photo"}
            className="w-full sm:w-auto"
          >
            {phase.kind === "reading-photo" ? <Loader2 className="animate-spin" /> : <Camera />}
            {phase.kind === "reading-photo" ? "Reading photo…" : "Take a photo of the barcode"}
          </Button>
        </div>
      )}

      {photoError ? (
        <p role="alert" className="text-sm text-destructive">
          {photoError}
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          if (file) void readPhoto(file);
        }}
      />

      <div className={cn("flex flex-wrap items-center gap-2", live ? "justify-between" : "justify-end")}>
        {live ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Open the picker first, while this click still counts as the
              // user's gesture; then release the camera for the photo.
              fileRef.current?.click();
              stopCamera();
              setPhase({ kind: "photo", reason: null });
            }}
          >
            <Camera />
            Use a photo instead
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X />
          Cancel
        </Button>
      </div>
    </div>
  );
}
