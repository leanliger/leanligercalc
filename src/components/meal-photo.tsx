"use client";

import * as React from "react";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FoodEntry } from "@/lib/food";
import type { MealEstimate, MealEstimateItem } from "@/lib/meal-photo";
import { cn } from "@/lib/utils";

/**
 * Add food → Photo: photograph a plate, get Claude's estimate of each food
 * (worker/meal-photo.ts), fix anything that's off, then log them all. The
 * photo is shrunk on the phone before it's sent and isn't kept.
 */

const MAX_SIDE = 768;

/** The photo as a small JPEG, base64 without the data: prefix. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo the browser can read."));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72).split(",")[1] ?? "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = { name: string; grams: string; kcal: string; protein: string; carbs: string; fat: string };
const toRow = (i: MealEstimateItem): Row => ({
  name: i.name,
  grams: String(i.grams),
  kcal: String(i.kcal),
  protein: String(i.protein),
  carbs: String(i.carbs),
  fat: String(i.fat),
});
const n = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : NaN;
};

export function MealPhotoView({
  mealLabel,
  onAddMany,
  onCancel,
}: {
  mealLabel: string;
  onAddMany: (entries: Omit<FoodEntry, "id" | "meal">[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [stage, setStage] = React.useState<"pick" | "working" | "review">("pick");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [estimate, setEstimate] = React.useState<MealEstimate | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [left, setLeft] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage("working");
    try {
      const image = await shrink(file);
      setPreview(`data:image/jpeg;base64,${image}`);
      const res = await fetch("/api/meal-photo", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ image, mediaType: "image/jpeg" }),
      });
      const body = (await res.json().catch(() => null)) as { estimate?: MealEstimate; left?: number; error?: string } | null;
      if (!res.ok || !body?.estimate) throw new Error(body?.error ?? "The estimate didn't come back. Try again.");
      setEstimate(body.estimate);
      setRows(body.estimate.items.map(toRow));
      setLeft(typeof body.left === "number" ? body.left : null);
      setStage(body.estimate.items.length > 0 ? "review" : "pick");
      if (body.estimate.items.length === 0) setError(body.estimate.note || "No food found in that photo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't estimate that photo.");
      setStage("pick");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const valid = rows.length > 0 && rows.every((r) => r.name.trim() && [r.grams, r.kcal, r.protein, r.carbs, r.fat].every((v) => !Number.isNaN(n(v))));
  const total = rows.reduce((s, r) => s + (n(r.kcal) || 0), 0);

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      await onAddMany(
        rows.map((r) => ({
          name: r.name.trim(),
          brand: null,
          barcode: null,
          quantity: Math.max(1, Math.round(n(r.grams))),
          unit: "g" as const,
          servingLabel: null,
          kcal: Math.round(n(r.kcal)),
          protein: Math.round(n(r.protein)),
          carbs: Math.round(n(r.carbs)),
          fat: Math.round(n(r.fat)),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add them. Try again.");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take or choose a photo of your meal"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {stage === "pick" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Take a photo of your plate from above. You&apos;ll get an estimate of each food to check before anything is logged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => input.current?.click()}>
              <Camera />
              Take or choose a photo
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "working" ? (
        <div className="flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your meal" className="h-16 w-16 rounded-md object-cover" />
          ) : null}
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Estimating your meal…
          </p>
        </div>
      ) : null}

      {stage === "review" && estimate ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your meal" className="h-16 w-16 shrink-0 rounded-md object-cover" />
            ) : null}
            <div className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {estimate.name || "Your meal"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {estimate.confidence === "high" ? "Fairly confident" : estimate.confidence === "medium" ? "Rough estimate" : "Low confidence"}
                {estimate.note ? `: ${estimate.note}` : "."}
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="space-y-1.5 rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`mp-name-${i}`}>
                    Food name
                  </label>
                  <Input
                    id={`mp-name-${i}`}
                    value={r.name}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="h-8 min-w-0 flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      ["grams", "g"],
                      ["kcal", "kcal"],
                      ["protein", "P"],
                      ["carbs", "C"],
                      ["fat", "F"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="space-y-0.5">
                      <span className="block text-center text-[10px] text-muted-foreground">{label}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={r[k]}
                        aria-label={`${r.name} ${k}`}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                        className={cn("tabular h-8 px-1.5 text-center text-sm", Number.isNaN(n(r[k])) && "border-destructive")}
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="tabular text-sm">
            Total <span className="font-semibold">{Math.round(total).toLocaleString()} kcal</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void add()} disabled={!valid || adding}>
              {adding ? "Adding…" : `Add ${rows.length} food${rows.length === 1 ? "" : "s"} to ${mealLabel}`}
            </Button>
            <Button variant="outline" onClick={() => input.current?.click()} disabled={adding}>
              <Camera />
              Another photo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Photo estimates can be off by 20–30%, mostly on portion size and hidden oil. Fix the grams if you know them.
            {left !== null ? ` ${left} photo estimate${left === 1 ? "" : "s"} left today.` : ""}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
