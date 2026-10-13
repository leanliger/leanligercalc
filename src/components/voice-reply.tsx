"use client";

import * as React from "react";
import { Loader2, Mic, Send, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VOICE_MAX_SECONDS } from "@/lib/checkins";
import { cn } from "@/lib/utils";

/**
 * Voice replies to check-ins (worker/voice-replies.ts): the coach records up
 * to 30 seconds in the browser, or uploads a voice memo (Whop's dashboard may
 * not allow the microphone); members and coaches play them back.
 */

/** Plays a private recording: fetched with the app's sign-in, then played from memory. */
export function VoicePlayer({ src, seconds, label }: { src: string; seconds: number; label: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    let made: string | null = null;
    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        made = URL.createObjectURL(await res.blob());
        if (live) setUrl(made);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
        <Mic className="h-3 w-3" />
        {label} · {Math.round(seconds)} s
      </p>
      {error ? (
        <p className="text-xs text-destructive">Couldn&apos;t load the recording.</p>
      ) : url ? (
        <audio controls src={url} className="h-9 w-full" aria-label={label} />
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </p>
      )}
    </div>
  );
}

function pickMime(): string {
  const options = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** How long an audio file is, from its metadata. */
function durationOf(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      // Some browsers report Infinity for fresh recordings until they seek.
      if (Number.isFinite(a.duration)) {
        URL.revokeObjectURL(url);
        resolve(a.duration);
      } else {
        a.currentTime = 1e6;
        a.ontimeupdate = () => {
          a.ontimeupdate = null;
          URL.revokeObjectURL(url);
          resolve(Number.isFinite(a.duration) ? a.duration : 0);
        };
      }
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    a.src = url;
  });
}

/** Record or upload a voice reply, preview it, and send it. */
export function VoiceRecorder({ uploadUrl, onSent }: { uploadUrl: string; onSent: (notified: boolean) => void }) {
  const [state, setState] = React.useState<"idle" | "recording" | "ready" | "sending">("idle");
  const [clip, setClip] = React.useState<{ blob: Blob; seconds: number; url: string } | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const timer = React.useRef<number | null>(null);
  const file = React.useRef<HTMLInputElement>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  React.useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  const use = async (blob: Blob) => {
    const seconds = await durationOf(blob);
    if (seconds > VOICE_MAX_SECONDS + 1) {
      setError(`That's ${Math.round(seconds)} seconds. Keep it to ${VOICE_MAX_SECONDS}.`);
      setState("idle");
      return;
    }
    setClip({ blob, seconds: seconds || elapsed || 1, url: URL.createObjectURL(blob) });
    setState("ready");
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't available here. Record a voice memo on your phone and upload it instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The microphone is blocked here (Whop's dashboard can block it). Record a voice memo on your phone and upload it instead.");
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) window.clearInterval(timer.current);
      void use(new Blob(chunks, { type: (rec.mimeType || mime || "audio/webm").split(";")[0] }));
    };
    recorder.current = rec;
    rec.start();
    setElapsed(0);
    setState("recording");
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const s = (Date.now() - began) / 1000;
      setElapsed(s);
      if (s >= VOICE_MAX_SECONDS && rec.state === "recording") rec.stop();
    }, 200);
  };

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const send = async () => {
    if (!clip) return;
    setState("sending");
    setError(null);
    try {
      const type = clip.blob.type.split(";")[0] || "audio/webm";
      const res = await fetch(`${uploadUrl}&seconds=${Math.max(1, Math.round(clip.seconds * 10) / 10)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": type, accept: "application/json" },
        body: clip.blob,
      });
      const body = (await res.json().catch(() => null)) as { notified?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't send it. Try again.");
      setClip(null);
      setState("idle");
      onSent(body?.notified === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
      setState("ready");
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
      <p className="text-xs font-medium">Or reply with your voice (up to {VOICE_MAX_SECONDS} s)</p>
      <input
        ref={file}
        type="file"
        accept="audio/*"
        className="sr-only"
        aria-label="Upload a voice memo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void use(f);
        }}
      />
      {state === "recording" ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-destructive" role="status">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
            Recording {Math.floor(elapsed)} / {VOICE_MAX_SECONDS} s
          </span>
          <Button size="sm" variant="outline" onClick={stop}>
            <Square />
            Stop
          </Button>
        </div>
      ) : clip && (state === "ready" || state === "sending") ? (
        <div className="space-y-2">
          <audio controls src={clip.url} className="h-9 w-full" aria-label="Your recording" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void send()} disabled={state === "sending"}>
              <Send />
              {state === "sending" ? "Sending…" : `Send voice reply (${Math.round(clip.seconds)} s)`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setClip(null)} disabled={state === "sending"}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void start()}>
            <Mic />
            Record
          </Button>
          <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
            <Upload />
            Upload a voice memo
          </Button>
        </div>
      )}
      {error ? <p className={cn("text-[12px] text-destructive")}>{error}</p> : null}
    </div>
  );
}
