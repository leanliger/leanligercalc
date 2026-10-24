"use client";

import * as React from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The coach dashboard's command palette (Ctrl+K, or ⌘K on a Mac): type a
 * member's name to open them or jump straight to messaging them, setting
 * their macros or their check-ins; or go anywhere on the dashboard and run
 * the on-demand actions (routine replies, nudges, the digest).
 */

export interface PaletteCommand {
  id: string;
  label: string;
  /** The heading it's listed under. */
  group: "Go to" | "Actions" | "Members";
  /** A note on the right, e.g. "@username". */
  hint?: string;
  /** More words it matches on. */
  keywords?: string;
  /** Only listed once something is typed (each member's own actions). */
  searchOnly?: boolean;
  run: () => void;
}

/** Members listed before anything is typed. */
const MEMBERS_BEFORE_TYPING = 6;
const MAX_RESULTS = 40;

function score(c: PaletteCommand, q: string): number {
  if (!q) return 0;
  const label = c.label.toLowerCase();
  const all = `${label} ${c.keywords ?? ""} ${c.hint ?? ""}`.toLowerCase();
  if (!q.split(/\s+/).every((w) => all.includes(w))) return -1;
  return label.startsWith(q) ? 3 : label.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : 1;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const back = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
    return () => back.current?.focus?.();
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (!q) {
      let members = 0;
      return commands.filter((c) => !c.searchOnly && (c.group !== "Members" || members++ < MEMBERS_BEFORE_TYPING));
    }
    return commands
      .map((c, i) => ({ c, s: score(c, q), i }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, MAX_RESULTS)
      .map((x) => x.c);
  }, [commands, q]);
  // Grouped as they come, so the best match's group is first.
  const groups = React.useMemo(() => {
    const out: { name: string; items: { c: PaletteCommand; index: number }[] }[] = [];
    results.forEach((c, index) => {
      const g = out.find((x) => x.name === c.group) ?? out[out.push({ name: c.group, items: [] }) - 1]!;
      g.items.push({ c, index });
    });
    return out;
  }, [results]);
  // The order on screen (by group), for the arrow keys.
  const order = groups.flatMap((g) => g.items.map((x) => x.index));
  const at = Math.min(active, Math.max(0, order.length - 1));

  React.useEffect(() => {
    document.getElementById(`${listId}-${order[at]}`)?.scrollIntoView({ block: "nearest" });
  }, [at, order, listId]);

  if (!open) return null;
  const run = (c: PaletteCommand | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (order.length) setActive((at + (e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[order[at]!]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={order.length ? `${listId}-${order[at]}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Find a member, or type a command"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">Esc</kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{query}&rdquo;.</p> : null}
          {groups.map((g) => (
            <div key={g.name} role="group" aria-label={g.name}>
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</p>
              {g.items.map(({ c, index }) => {
                const on = order[at] === index;
                return (
                  <div
                    key={c.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setActive(order.indexOf(index))}
                    onClick={() => run(c)}
                    className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm", on ? "bg-primary/10 text-primary" : "text-foreground")}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.hint ? <span className="shrink-0 truncate text-[12px] text-muted-foreground">{c.hint}</span> : null}
                    {on ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ctrl+K / ⌘K anywhere on the page opens (or closes) it. */
export function usePaletteShortcut(toggle: () => void) {
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [toggle]);
}
