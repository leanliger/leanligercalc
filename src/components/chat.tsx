"use client";

import * as React from "react";
import { Clock, ImagePlus, Loader2, MessageCircle, Mic, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareForUpload } from "@/components/photos-card";
import { SavedRepliesButton } from "@/components/saved-replies";
import { VoicePlayer, VoiceRecorder } from "@/components/voice-reply";
import { formatShort } from "@/lib/dates";
import { CHAT_POLL_MS, CHAT_VOICE_MAX_SECONDS, MESSAGE_MAX, formatSendAt, type ChatMessage, type ChatThread } from "@/lib/messages";
import { cn } from "@/lib/utils";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : `${formatShort(iso.slice(0, 10))}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

/** Polls `load` every few seconds while mounted and the page is visible. */
function usePolled(load: () => Promise<void>, deps: React.DependencyList) {
  React.useEffect(() => {
    let live = true;
    const tick = () => {
      if (live && document.visibilityState === "visible") void load();
    };
    void load();
    const t = window.setInterval(tick, CHAT_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what `load` depends on
  }, deps);
}

/** A private photo: fetched with the app's sign-in, shown from memory; tap for full size. */
function ChatPhoto({ src }: { src: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [big, setBig] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    let made: string | null = null;
    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        made = URL.createObjectURL(await res.blob());
        if (live) setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  if (failed) return <span className="block text-xs">Couldn&apos;t load the photo.</span>;
  if (!url) return <span className="flex h-32 w-40 items-center justify-center rounded-xl bg-black/10"><Loader2 className="h-4 w-4 animate-spin" aria-label="Loading photo" /></span>;
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="block overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open the photo full size">
        {/* eslint-disable-next-line @next/next/no-img-element -- private blob URL */}
        <img src={url} alt="Photo in chat" className="max-h-64 w-auto max-w-full object-contain" />
      </button>
      {big ? (
        <div role="dialog" aria-label="Photo" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setBig(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private blob URL */}
          <img src={url} alt="Photo in chat, full size" className="max-h-full max-w-full object-contain" />
          <Button variant="ghost" size="icon" className="absolute right-3 top-3 text-white hover:bg-white/10" onClick={() => setBig(false)} aria-label="Close photo">
            <X />
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * One conversation: the messages, newest at the bottom, and a box to write in
 * (with a photo, a voice note, saved replies and, for coaches, sending later).
 * `me` is which side is looking, so their own messages sit on the right.
 */
export function ChatView({
  messages,
  me,
  otherName,
  onSend,
  onAttach,
  attachmentSrc,
  onCancelScheduled,
  savedReplies,
  canSchedule = false,
  error,
  emptyText,
  className,
}: {
  messages: ChatMessage[] | null;
  me: "coach" | "member";
  otherName: string;
  onSend: (body: string, sendAt: string | null) => Promise<void>;
  /** Photos and voice notes; left out where they can't be sent. */
  onAttach?: (kind: "photo" | "voice", blob: Blob, seconds: number | null) => Promise<void>;
  attachmentSrc: (id: string) => string;
  onCancelScheduled?: (id: string) => Promise<void>;
  /** Coaches: the saved-replies picker. */
  savedReplies?: { companyId: string; firstName: string };
  canSchedule?: boolean;
  error: string | null;
  emptyText: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  // Sending later: the picker's value (local time), or null when sending now.
  const [later, setLater] = React.useState<string | null>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const count = messages?.length ?? 0;
  React.useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [count]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body, later ? new Date(later).toISOString() : null);
      setDraft("");
      setLater(null);
    } catch {
      /* onSend shows the error; the draft stays to try again */
    } finally {
      setSending(false);
    }
  };
  const lastMine = messages ? [...messages].reverse().find((m) => m.fromCoach === (me === "coach") && !m.scheduledFor) : undefined;
  // The earliest a message can be scheduled: a few minutes from now, in the picker's local format.
  const minLater = () => {
    const d = new Date(Date.now() + 5 * 60_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" aria-live="polite" aria-label={`Messages with ${otherName}`}>
        {messages === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
        ) : messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          messages.map((m) => {
            const mine = m.fromCoach === (me === "coach");
            const scheduled = Boolean(m.scheduledFor);
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                    scheduled
                      ? "rounded-br-md border border-dashed border-primary/50 bg-primary/[0.06] text-foreground"
                      : mine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted text-foreground",
                  )}
                >
                  <span className="sr-only">{mine ? "You" : otherName}: </span>
                  {m.attachment?.kind === "photo" ? <ChatPhoto src={attachmentSrc(m.id)} /> : null}
                  {m.attachment?.kind === "voice" ? (
                    <span className="block min-w-[14rem]">
                      <VoicePlayer src={attachmentSrc(m.id)} seconds={m.attachment.seconds ?? 0} label="Voice note" />
                    </span>
                  ) : null}
                  {m.body}
                  {scheduled ? (
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden />
                      Sends {formatSendAt(m.scheduledFor!)}
                      {onCancelScheduled ? (
                        <button
                          type="button"
                          onClick={() => void onCancelScheduled(m.id)}
                          className="font-semibold text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </span>
                  ) : (
                    <span className={cn("mt-0.5 block text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                      {timeOf(m.at)}
                      {mine && m.id === lastMine?.id && m.read ? " · Seen" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {recording && onAttach ? (
        <div className="border-t border-border p-2">
          <VoiceRecorder
            title={`Voice note (up to ${CHAT_VOICE_MAX_SECONDS} s)`}
            maxSeconds={CHAT_VOICE_MAX_SECONDS}
            upload={(blob, seconds) => onAttach("voice", blob, seconds)}
            onSent={() => setRecording(false)}
            onCancel={() => setRecording(false)}
          />
        </div>
      ) : (
        <form
          className="space-y-1.5 border-t border-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {later !== null ? (
            <div className="flex flex-wrap items-center gap-2 px-1 text-[12px]">
              <label htmlFor={`${inputId}-later`} className="font-medium">
                Send on
              </label>
              <input
                id={`${inputId}-later`}
                type="datetime-local"
                value={later}
                min={minLater()}
                onChange={(e) => setLater(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" onClick={() => setLater(null)} className="text-muted-foreground underline-offset-2 hover:underline">
                Send now instead
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <label htmlFor={inputId} className="sr-only">
              Message {otherName}
            </label>
            <textarea
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a new line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={MESSAGE_MAX}
              rows={1}
              placeholder={`Message ${otherName}…`}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || sending || (later !== null && !later)}
              aria-label={later ? "Schedule message" : "Send message"}
              className="shrink-0 rounded-full"
            >
              {later ? <Clock /> : <Send />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-0.5">
            {onAttach ? (
              <>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Send a photo"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setPhotoBusy(true);
                    try {
                      // Re-saved on the device: smaller, and without location or camera details.
                      await onAttach("photo", await prepareForUpload(f), null);
                    } catch {
                      /* onAttach shows the error */
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                />
                <Button type="button" size="sm" variant="ghost" disabled={photoBusy} onClick={() => photoInput.current?.click()}>
                  {photoBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                  Photo
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRecording(true)}>
                  <Mic />
                  Voice
                </Button>
              </>
            ) : null}
            {canSchedule && later === null ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLater(minLater())}>
                <Clock />
                Send later
              </Button>
            ) : null}
            {savedReplies ? (
              <SavedRepliesButton
                className="ml-auto"
                align="right"
                companyId={savedReplies.companyId}
                firstName={savedReplies.firstName}
                current={draft}
                onInsert={(text) => setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${text}` : text))}
              />
            ) : null}
          </div>
        </form>
      )}
      {error ? (
        <p role="alert" className="px-3 pb-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Upload a photo or voice note, as the chat's own message. */
async function postAttachment(base: string, kind: "photo" | "voice", blob: Blob, seconds: number | null) {
  const type = kind === "photo" ? "image/jpeg" : blob.type.split(";")[0] || "audio/webm";
  return call<{ messages: ChatMessage[] }>(`${base}&kind=${kind}${seconds ? `&seconds=${seconds}` : ""}`, {
    method: "POST",
    headers: { "content-type": type },
    body: blob,
  });
}

/* ---------------------------------- coach ---------------------------------- */

/** Every chat in the whop, refreshed every minute; `refresh` after reading or sending one. */
export function useCoachThreads(companyId: string) {
  const [threads, setThreads] = React.useState<ChatThread[]>([]);
  const refresh = React.useCallback(async () => {
    try {
      const r = await call<{ threads: ChatThread[] }>(`/api/coach/threads?company=${encodeURIComponent(companyId)}`);
      setThreads(r.threads);
    } catch {
      /* the badge just stays as it was */
    }
  }, [companyId]);
  React.useEffect(() => {
    void refresh();
    const t = window.setInterval(() => document.visibilityState === "visible" && void refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);
  const unread = threads.reduce((n, t) => n + t.unread, 0);
  return { threads, unread, refresh };
}

/** A member's chat on their page (beside the notes on a computer). */
export function CoachChatPanel({
  companyId,
  memberId,
  memberName,
  onClose,
  onRead,
  className,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  onClose?: () => void;
  /** After it loads (their messages are now read) or after sending. */
  onRead?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const first = memberName.split(" ")[0] || memberName;
  const company = `company=${encodeURIComponent(companyId)}`;
  const q = `${company}&member=${encodeURIComponent(memberId)}`;
  const seen = React.useRef(0);

  const load = async () => {
    try {
      const r = await call<{ messages: ChatMessage[] }>(`/api/coach/messages?${q}`);
      setMessages(r.messages);
      setError(null);
      const theirs = r.messages.filter((m) => !m.fromCoach).length;
      if (theirs !== seen.current) {
        seen.current = theirs;
        onRead?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  };
  usePolled(load, [q]);

  const run = async (p: Promise<{ messages: ChatMessage[] }>, fail: string) => {
    try {
      const r = await p;
      setMessages(r.messages);
      setError(null);
      onRead?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : fail);
      throw e;
    }
  };

  return (
    <section aria-label={`Chat with ${memberName}`} className={cn("molten-card flex flex-col rounded-[1.25rem] border border-primary/15 bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold">Chat with {first}</h3>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close chat">
            <X />
          </Button>
        ) : null}
      </div>
      <ChatView
        className="h-[28rem]"
        messages={messages}
        me="coach"
        otherName={first}
        error={error}
        canSchedule
        savedReplies={{ companyId, firstName: first }}
        emptyText={`No messages yet. Say hi to ${first}; they get it as a Whop notification.`}
        attachmentSrc={(id) => `/api/coach/messages/attachment/${id}?${company}`}
        onSend={(body, sendAt) =>
          run(
            call("/api/coach/messages", { method: "POST", body: JSON.stringify({ company: companyId, member: memberId, body, sendAt }) }),
            "Couldn't send it.",
          )
        }
        onAttach={(kind, blob, seconds) => run(postAttachment(`/api/coach/messages/attachment?${q}`, kind, blob, seconds), "Couldn't send it.")}
        onCancelScheduled={async (id) => {
          try {
            await call(`/api/coach/messages/${id}?${company}`, { method: "DELETE" });
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't cancel it.");
          }
        }}
      />
    </section>
  );
}

/* --------------------------------- members --------------------------------- */

/**
 * The chat icon at the top of the member's app, with a dot for unread coach
 * messages; it opens their chat with their coach in a panel.
 */
export function MemberChatButton({
  experienceId,
  unread,
  onRead,
  openRequest = 0,
}: {
  experienceId: string;
  unread: number;
  onRead: () => void;
  /** Bump to open it from elsewhere (the notification bell). */
  openRequest?: number;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
  const dialog = React.useRef<HTMLDialogElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label={unread > 0 ? `Messages from your coach, ${unread} unread` : "Message your coach"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative shrink-0"
      >
        <MessageCircle />
        {unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" aria-hidden /> : null}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false);
        }}
        className="fixed inset-x-3 bottom-3 top-auto m-0 flex h-[min(38rem,calc(100dvh-1.5rem))] w-auto max-w-none flex-col overflow-hidden molten-card rounded-[1.25rem] border border-primary/15 bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40 [&:not([open])]:hidden sm:left-auto sm:right-6 sm:top-4 sm:w-[24rem]"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
          <h2 id={titleId} className="min-w-0 flex-1 text-sm font-semibold">
            Your coach
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close chat">
            <X />
          </Button>
        </div>
        {open ? <MemberChat experienceId={experienceId} onRead={onRead} /> : null}
      </dialog>
    </>
  );
}

function MemberChat({ experienceId, onRead }: { experienceId: string; onRead: () => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const seen = React.useRef(-1);
  const q = `experience=${encodeURIComponent(experienceId)}`;

  usePolled(async () => {
    try {
      const r = await call<{ available: boolean; messages: ChatMessage[] }>(`/api/messages?${q}&open=1`);
      setMessages(r.messages);
      setError(r.available ? null : "Chat works when you open the app from your coach's Whop.");
      const theirs = r.messages.filter((m) => m.fromCoach).length;
      if (theirs !== seen.current) {
        seen.current = theirs;
        onRead();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, [q]);

  const run = async (p: Promise<{ messages: ChatMessage[] }>) => {
    try {
      setMessages((await p).messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it.");
      throw e;
    }
  };

  return (
    <ChatView
      className="min-h-0 flex-1"
      messages={messages}
      me="member"
      otherName="your coach"
      error={error}
      emptyText="Questions about your plan, a check-in or a lift? Message your coach here, or send a photo or voice note. They get a notification and reply in this chat."
      attachmentSrc={(id) => `/api/messages/attachment/${id}`}
      onSend={(body) => run(call("/api/messages", { method: "POST", body: JSON.stringify({ experience: experienceId, body }) }))}
      onAttach={(kind, blob, seconds) => run(postAttachment(`/api/messages/attachment?${q}`, kind, blob, seconds))}
    />
  );
}
