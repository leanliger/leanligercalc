"use client";

import * as React from "react";
import { ClipboardList, Clock, MessageCircle, Tag, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { SavedRepliesButton } from "@/components/saved-replies";
import type { TagsData } from "@/components/member-tags";
import { MESSAGE_MAX, formatSendAt } from "@/lib/messages";
import { cn } from "@/lib/utils";

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const r = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !r) throw new Error(r?.error ?? "Something went wrong. Try again.");
  return r;
}

type Panel = "message" | "tag" | "macros" | null;

const FIELD =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Members → tick members → this bar: message them all (now or later), add or
 * remove a tag, set or adjust their macros, or send them a program. Only
 * people Whop lists as current members are changed.
 */
export function BulkBar({
  companyId,
  selected,
  tags,
  onClear,
  onTagsChanged,
  onAssign,
  onMessaged,
  remind,
}: {
  /** The Remind menu for everyone selected. */
  remind?: React.ReactNode;
  companyId: string;
  selected: string[];
  tags: TagsData | null;
  onClear: () => void;
  onTagsChanged: (t: TagsData) => void;
  /** Open Library → Programs with these members as the audience. */
  onAssign: () => void;
  onMessaged: () => void;
}) {
  const [panel, setPanel] = React.useState<Panel>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const n = selected.length;
  const who = `${n} member${n === 1 ? "" : "s"}`;

  // Message
  const [body, setBody] = React.useState("");
  const [later, setLater] = React.useState<string | null>(null);
  // Tag
  const [tagId, setTagId] = React.useState("");
  // Macros
  const [mode, setMode] = React.useState<"adjust" | "set">("adjust");
  const [delta, setDelta] = React.useState("-100");
  const [grams, setGrams] = React.useState({ protein: "", carbs: "", fat: "" });
  const [note, setNote] = React.useState("");

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await fn() });
      setPanel(null);
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = () =>
    run(async () => {
      const r = await call<{ sent: number; skipped: number; notified: number; scheduledFor: string | null }>("/api/coach/messages/bulk", {
        company: companyId,
        members: selected,
        body,
        sendAt: later ? new Date(later).toISOString() : null,
      });
      setBody("");
      setLater(null);
      onMessaged();
      const skipped = r.skipped ? ` ${r.skipped} skipped (not current members).` : "";
      return r.scheduledFor
        ? `Scheduled for ${formatSendAt(r.scheduledFor)} to ${r.sent} member${r.sent === 1 ? "" : "s"}.${skipped}`
        : `Sent to ${r.sent} member${r.sent === 1 ? "" : "s"}; ${r.notified} got a Whop notification.${skipped}`;
    });

  const changeTag = (add: boolean) =>
    run(async () => {
      const r = await call<TagsData>("/api/coach/tags/bulk", { company: companyId, members: selected, tagId, add });
      onTagsChanged(r);
      const name = tags?.tags.find((t) => t.id === tagId)?.name ?? "the tag";
      return add ? `Tagged ${who} ${name}.` : `Removed ${name} from ${who}.`;
    });

  const changeMacros = () =>
    run(async () => {
      const payload =
        mode === "adjust"
          ? { company: companyId, members: selected, mode, kcalDelta: Number(delta) }
          : { company: companyId, members: selected, mode, protein: Number(grams.protein), carbs: Number(grams.carbs), fat: Number(grams.fat), note };
      const r = await call<{ updated: number; skipped: number; notified: number }>("/api/coach/macros/bulk", payload);
      const skipped = r.skipped
        ? mode === "adjust"
          ? ` ${r.skipped} skipped: they're on their own plan's macros (set theirs first), or it would go out of range.`
          : ` ${r.skipped} skipped (not current members).`
        : "";
      return `Macros updated for ${r.updated} member${r.updated === 1 ? "" : "s"}; ${r.notified} got a Whop notification.${skipped}`;
    });

  const minLater = () => {
    const d = new Date(Date.now() + 5 * 60_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const toggle = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    setResult(null);
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-3 z-30 space-y-3 rounded-[1.25rem] border border-primary/40 bg-card/95 p-3 shadow-[0_14px_34px_-8px_rgb(0_0_0/0.55)] backdrop-blur max-lg:bottom-24"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-sm font-bold">{who} selected</span>
        <span className="flex flex-wrap gap-1">
          <Button size="sm" variant={panel === "message" ? "default" : "outline"} onClick={() => toggle("message")} aria-expanded={panel === "message"}>
            <MessageCircle />
            Message
          </Button>
          <Button size="sm" variant={panel === "tag" ? "default" : "outline"} onClick={() => toggle("tag")} aria-expanded={panel === "tag"}>
            <Tag />
            Tag
          </Button>
          <Button size="sm" variant={panel === "macros" ? "default" : "outline"} onClick={() => toggle("macros")} aria-expanded={panel === "macros"}>
            <Utensils />
            Macros
          </Button>
          <Button size="sm" variant="outline" onClick={onAssign}>
            <ClipboardList />
            Assign program
          </Button>
          {remind}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
          <X />
          Clear
        </Button>
      </div>

      {panel === "message" ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
        >
          <label htmlFor="bulk-message" className="sr-only">
            Message
          </label>
          <textarea
            id="bulk-message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_MAX}
            rows={3}
            placeholder={`A message to ${who}, in each of their chats…`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            {later === null ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLater(minLater())}>
                <Clock />
                Send later
              </Button>
            ) : (
              <span className="flex flex-wrap items-center gap-2 text-[12px]">
                <label htmlFor="bulk-later" className="font-medium">
                  Send on
                </label>
                <input id="bulk-later" type="datetime-local" value={later} min={minLater()} onChange={(e) => setLater(e.target.value)} className={FIELD} />
                <button type="button" onClick={() => setLater(null)} className="text-muted-foreground underline-offset-2 hover:underline">
                  Send now instead
                </button>
              </span>
            )}
            {/* {first} isn't filled in for a group, so the picker gets a neutral greeting. */}
            <SavedRepliesButton companyId={companyId} firstName="there" current={body} onInsert={(t) => setBody(t)} />
            <Button type="submit" size="sm" className="ml-auto" disabled={busy || !body.trim() || (later !== null && !later)}>
              {later ? <Clock /> : <MessageCircle />}
              {busy ? "Sending…" : later ? `Schedule for ${who}` : `Send to ${who}`}
            </Button>
          </div>
        </form>
      ) : panel === "tag" ? (
        !tags || tags.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet. Add tags on any member&apos;s page first.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bulk-tag" className="text-sm font-medium">
              Tag
            </label>
            <select id="bulk-tag" value={tagId} onChange={(e) => setTagId(e.target.value)} className={FIELD}>
              <option value="">Pick a tag…</option>
              {tags.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={busy || !tagId} onClick={() => void changeTag(true)}>
              Add to {who}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !tagId} onClick={() => void changeTag(false)}>
              Remove
            </Button>
          </div>
        )
      ) : panel === "macros" ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void changeMacros();
          }}
        >
          <SegmentedControl
            ariaLabel="How"
            size="sm"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "adjust" as const, label: "Change calories" },
              { value: "set" as const, label: "Set the same macros" },
            ]}
            className="w-auto"
          />
          {mode === "adjust" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="bulk-delta">Calories a day</label>
              <Input id="bulk-delta" type="number" inputMode="numeric" step={25} value={delta} onChange={(e) => setDelta(e.target.value)} className="h-9 w-24" />
              <span className="text-[12px] text-muted-foreground">
                kcal, through carbs ({Number(delta) > 0 ? "+" : ""}
                {Math.round(Number(delta) / 4) || 0} g). Only members whose macros you set; others are skipped.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2 text-sm">
              {(["protein", "carbs", "fat"] as const).map((k) => (
                <label key={k} className="space-y-1">
                  <span className="block text-[12px] capitalize text-muted-foreground">{k} (g)</span>
                  <Input type="number" inputMode="numeric" min={0} value={grams[k]} onChange={(e) => setGrams((g) => ({ ...g, [k]: e.target.value }))} className="h-9 w-20" />
                </label>
              ))}
              <span className="tabular pb-2 text-[12px] text-muted-foreground">
                = {Math.round(Number(grams.protein) * 4 + Number(grams.carbs) * 4 + Number(grams.fat) * 9) || 0} kcal
              </span>
              <label className="min-w-[12rem] flex-1 space-y-1">
                <span className="block text-[12px] text-muted-foreground">Note (optional)</span>
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-9" />
              </label>
            </div>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={busy || (mode === "adjust" ? !Number(delta) : !grams.protein || !grams.carbs || !grams.fat)}
          >
            {busy ? "Saving…" : `Update ${who}`}
          </Button>
        </form>
      ) : null}

      {result ? (
        <p role="status" className={cn("text-[12px]", result.ok ? "text-muted-foreground" : "text-destructive")}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
