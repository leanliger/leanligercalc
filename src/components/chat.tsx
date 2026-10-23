"use client";

import * as React from "react";
import { ArrowLeft, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/coach-today";
import { formatShort } from "@/lib/dates";
import { CHAT_POLL_MS, MESSAGE_MAX, type ChatMessage, type ChatThread } from "@/lib/messages";
import { cn } from "@/lib/utils";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
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

/**
 * One conversation: the messages, newest at the bottom, and a box to write in.
 * `me` is which side is looking, so their own messages sit on the right.
 */
export function ChatView({
  messages,
  me,
  otherName,
  onSend,
  error,
  emptyText,
  className,
}: {
  messages: ChatMessage[] | null;
  me: "coach" | "member";
  otherName: string;
  onSend: (body: string) => Promise<void>;
  error: string | null;
  emptyText: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const list = React.useRef<HTMLDivElement>(null);
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
      await onSend(body);
      setDraft("");
    } catch {
      /* onSend shows the error; the draft stays to try again */
    } finally {
      setSending(false);
    }
  };
  const lastMine = messages ? [...messages].reverse().find((m) => m.fromCoach === (me === "coach")) : undefined;

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
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
                  )}
                >
                  <span className="sr-only">{mine ? "You" : otherName}: </span>
                  {m.body}
                  <span className={cn("mt-0.5 block text-[10px]", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {timeOf(m.at)}
                    {mine && m.id === lastMine?.id && m.read ? " · Seen" : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
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
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Send message" className="shrink-0 rounded-full">
          <Send />
        </Button>
      </form>
      {error ? (
        <p role="alert" className="px-3 pb-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
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
  const q = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;
  const seen = React.useRef(0);

  usePolled(async () => {
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
  }, [q]);

  return (
    <section aria-label={`Chat with ${memberName}`} className={cn("molten-card flex flex-col overflow-hidden rounded-[1.25rem] border border-primary/15 bg-card", className)}>
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
        className="h-[26rem]"
        messages={messages}
        me="coach"
        otherName={first}
        error={error}
        emptyText={`No messages yet. Say hi to ${first}; they get it as a Whop notification.`}
        onSend={async (body) => {
          try {
            const r = await call<{ messages: ChatMessage[] }>("/api/coach/messages", {
              method: "POST",
              body: JSON.stringify({ company: companyId, member: memberId, body }),
            });
            setMessages(r.messages);
            setError(null);
            onRead?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't send it.");
            throw e;
          }
        }}
      />
    </section>
  );
}

/**
 * Inbox → Messages: every chat, newest first, with unread counts; the open one
 * beside the list on a computer, in its place on a phone.
 */
export function CoachMessagesInbox({
  companyId,
  threads,
  names,
  onRead,
  onOpenProfile,
  switcher,
}: {
  companyId: string;
  threads: ChatThread[];
  names: ReadonlyMap<string, { name: string; avatarUrl: string | null }>;
  onRead: () => void;
  onOpenProfile: (userId: string) => void;
  switcher: React.ReactNode;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const open = threads.find((t) => t.memberId === openId) ?? null;
  const who = (id: string) => names.get(id) ?? { name: "A member", avatarUrl: null };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
        {switcher}
      </div>
      {threads.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No messages yet. Members can message you from the chat icon at the top of their app, and you can start a chat from the Message
          button on any member&apos;s page.
        </p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <ul aria-label="Chats" className={cn("molten-card space-y-1 rounded-[1.25rem] border border-primary/15 bg-card p-2", open && "max-lg:hidden")}>
            {threads.map((t) => {
              const p = who(t.memberId);
              const on = openId === t.memberId;
              return (
                <li key={t.memberId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(t.memberId)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-primary/[0.14]" : "hover:bg-muted/40",
                    )}
                  >
                    <Avatar name={p.name} url={p.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", t.unread > 0 ? "font-extrabold" : "font-semibold")}>{p.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {t.last.fromCoach ? "You: " : ""}
                        {t.last.body}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">{formatShort(t.last.at.slice(0, 10))}</span>
                      {t.unread > 0 ? (
                        <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground" aria-label={`${t.unread} unread`}>
                          {t.unread}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {open ? (
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 px-2 lg:hidden" onClick={() => setOpenId(null)}>
                  <ArrowLeft />
                  All chats
                </Button>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => onOpenProfile(open.memberId)}>
                  Open profile
                </Button>
              </div>
              <CoachChatPanel key={open.memberId} companyId={companyId} memberId={open.memberId} memberName={who(open.memberId).name} onRead={onRead} />
            </div>
          ) : (
            <p className="hidden rounded-[1.25rem] border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:block">Pick a chat.</p>
          )}
        </div>
      )}
    </div>
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
        className="fixed inset-x-3 bottom-3 top-auto m-0 flex h-[min(36rem,calc(100dvh-1.5rem))] w-auto max-w-none flex-col overflow-hidden molten-card rounded-[1.25rem] border border-primary/15 bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40 [&:not([open])]:hidden sm:left-auto sm:right-6 sm:top-4 sm:w-[24rem]"
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

  return (
    <ChatView
      className="min-h-0 flex-1"
      messages={messages}
      me="member"
      otherName="your coach"
      error={error}
      emptyText="Questions about your plan, a check-in or a lift? Message your coach here. They get a notification and reply in this chat."
      onSend={async (body) => {
        try {
          const r = await call<{ messages: ChatMessage[] }>("/api/messages", { method: "POST", body: JSON.stringify({ experience: experienceId, body }) });
          setMessages(r.messages);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't send it.");
          throw e;
        }
      }}
    />
  );
}
