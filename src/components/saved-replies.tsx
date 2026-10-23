"use client";

import * as React from "react";
import { BookmarkPlus, MessageSquareQuote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAVED_REPLY_TITLE_MAX, fillReply, type SavedReply } from "@/lib/messages";
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

// One list per whop for the page, shared by every picker (check-ins and chat).
const cache = new Map<string, Promise<SavedReply[]>>();
const listeners = new Set<(companyId: string, replies: SavedReply[]) => void>();
const publish = (companyId: string, replies: SavedReply[]) => {
  cache.set(companyId, Promise.resolve(replies));
  listeners.forEach((l) => l(companyId, replies));
};

function useSavedReplies(companyId: string, enabled: boolean) {
  const [replies, setReplies] = React.useState<SavedReply[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const on = (id: string, list: SavedReply[]) => id === companyId && setReplies(list);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, [companyId]);
  React.useEffect(() => {
    if (!enabled) return;
    let p = cache.get(companyId);
    if (!p) {
      p = call<{ replies: SavedReply[] }>(`/api/coach/saved-replies?company=${encodeURIComponent(companyId)}`).then((r) => r.replies);
      cache.set(companyId, p);
      p.catch(() => cache.delete(companyId));
    }
    p.then(setReplies).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load saved replies."));
  }, [companyId, enabled]);
  return { replies, error, setError };
}

/**
 * "Saved replies" next to a reply box: pick one to drop it in ({first}
 * becomes the member's first name), save what's written as a new one, or
 * delete one. Shared by the whop's admins.
 */
export function SavedRepliesButton({
  companyId,
  firstName,
  current,
  onInsert,
  className,
  align = "left",
}: {
  companyId: string;
  firstName: string;
  /** What's in the box now, to save as a reply. */
  current: string;
  onInsert: (text: string) => void;
  className?: string;
  /** Which edge of the button the list lines up with. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const [naming, setNaming] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { replies, error, setError } = useSavedReplies(companyId, open);
  const box = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ replies: SavedReply[] }>("/api/coach/saved-replies", {
        method: "POST",
        body: JSON.stringify({ company: companyId, title: naming ?? "", body: current }),
      });
      publish(companyId, r.replies);
      setNaming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const r = await call<{ replies: SavedReply[] }>(`/api/coach/saved-replies/${id}?company=${encodeURIComponent(companyId)}`, { method: "DELETE" });
      publish(companyId, r.replies);
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <MessageSquareQuote />
        Saved replies
      </Button>
      {open ? (
        <div
          id={listId}
          className={cn(
            "absolute bottom-full z-30 mb-1 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-2xl border border-primary/20 bg-card p-2 text-card-foreground shadow-2xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold">Saved replies</p>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close saved replies">
              <X />
            </Button>
          </div>
          {replies === null && !error ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
          ) : replies && replies.length === 0 ? (
            <p className="px-1 text-[12px] text-muted-foreground">
              None yet. Write a reply you send often, then save it here. Use {"{first}"} for the member&apos;s first name.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
              {(replies ?? []).map((r) => (
                <li key={r.id} className="group flex items-start gap-1 rounded-xl hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => {
                      onInsert(fillReply(r.body, firstName));
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="line-clamp-2 block text-[12px] text-muted-foreground">{fillReply(r.body, firstName)}</span>
                  </button>
                  {confirm === r.id ? (
                    <span className="flex shrink-0 gap-1 p-1">
                      <Button type="button" size="sm" variant="destructive" className="h-7 px-2" disabled={busy} onClick={() => void remove(r.id)}>
                        Delete
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirm(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100"
                      aria-label={`Delete saved reply "${r.title}"`}
                      onClick={() => setConfirm(r.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border pt-2">
            {naming !== null ? (
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Input
                  autoFocus
                  value={naming}
                  onChange={(e) => setNaming(e.target.value)}
                  maxLength={SAVED_REPLY_TITLE_MAX}
                  placeholder="Name it (optional)"
                  aria-label="Name for the saved reply"
                  className="h-8 text-sm"
                />
                <Button type="submit" size="sm" className="h-8" disabled={busy}>
                  Save
                </Button>
              </form>
            ) : (
              <Button type="button" size="sm" variant="ghost" className="w-full justify-start" disabled={!current.trim()} onClick={() => setNaming("")}>
                <BookmarkPlus />
                {current.trim() ? "Save what I've written" : "Write a reply to save it"}
              </Button>
            )}
            {error ? (
              <p role="alert" className="px-1 pt-1 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
