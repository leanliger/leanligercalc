"use client";

import * as React from "react";
import { KCAL_PER_G } from "@/lib/units";

/**
 * Where the day's calories come from: a ring split into protein, carbs and
 * fat by their calories (4 / 4 / 9 kcal per gram), labelled around the
 * outside with leader lines, and the calories eaten in the middle. With
 * nothing logged yet it shows the target's split, faded.
 *
 * Plain SVG on a fixed viewBox, so it scales to the card and the labels keep
 * their places at any width.
 */

interface Grams {
  protein: number;
  carbs: number;
  fat: number;
}

const SLICES = [
  { key: "protein", label: "Protein", color: "hsl(var(--macro-protein))" },
  { key: "carbs", label: "Carbs", color: "hsl(var(--macro-carb))" },
  { key: "fat", label: "Fat", color: "hsl(var(--macro-fat))" },
] as const;

type SliceKey = (typeof SLICES)[number]["key"];

/** Whole percentages of calories from each macro that add up to exactly 100. */
export function calorieSplit(g: Grams): Record<SliceKey, number> | null {
  const kcal = {
    protein: Math.max(g.protein, 0) * KCAL_PER_G.protein,
    carbs: Math.max(g.carbs, 0) * KCAL_PER_G.carbs,
    fat: Math.max(g.fat, 0) * KCAL_PER_G.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  if (!(total > 0)) return null;
  // Largest remainder: floor each, then hand the missing points to the biggest fractions.
  const exact = SLICES.map((s) => ({ key: s.key, v: (kcal[s.key] / total) * 100 }));
  const out = { protein: 0, carbs: 0, fat: 0 };
  for (const e of exact) out[e.key] = Math.floor(e.v);
  let missing = 100 - (out.protein + out.carbs + out.fat);
  for (const e of [...exact].sort((a, b) => (b.v % 1) - (a.v % 1))) {
    if (missing <= 0) break;
    out[e.key] += 1;
    missing -= 1;
  }
  return out;
}

const W = 380;
const H = 200;
const CX = W / 2;
const CY = H / 2;
const R = 64;
const RI = 36;
const LABEL_GAP = 18;

/** A point on a circle, angles in degrees clockwise from 12 o'clock. */
function at(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function slicePath(a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = at(R, a0);
  const [x1, y1] = at(R, a1);
  const [x2, y2] = at(RI, a1);
  const [x3, y3] = at(RI, a0);
  return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${RI} ${RI} 0 ${large} 0 ${x3} ${y3}Z`;
}

export function MacroDonut({
  eaten,
  kcal,
  target,
}: {
  /** Grams eaten so far. */
  eaten: Grams;
  /** Calories eaten, for the middle of the ring. */
  kcal: number;
  /** The day's target grams, for the comparison line and the empty state. */
  target?: Grams | null;
}) {
  const eatenSplit = calorieSplit(eaten);
  const targetSplit = target ? calorieSplit(target) : null;
  const split = eatenSplit ?? targetSplit;
  if (!split) return null;
  const faded = !eatenSplit;

  // Slices clockwise from 12 o'clock, then a label per slice beside its middle.
  let angle = 0;
  const parts = SLICES.filter((s) => split[s.key] > 0).map((s) => {
    const a0 = angle;
    const a1 = angle + (split[s.key] / 100) * 360;
    angle = a1;
    const mid = (a0 + a1) / 2;
    const right = mid < 180;
    const [px, py] = at(R + 2, mid);
    const [ex, ey] = at(R + 16, mid);
    return { ...s, a0, a1, pct: split[s.key], right, px, py, ex, ey, ly: ey };
  });

  // Keep labels on the same side from overlapping.
  for (const side of [true, false]) {
    const group = parts.filter((p) => p.right === side).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1]!;
      if (group[i]!.ly - prev.ly < LABEL_GAP) group[i]!.ly = prev.ly + LABEL_GAP;
    }
    const last = group[group.length - 1];
    if (last && last.ly > H - 10) {
      const shift = last.ly - (H - 10);
      for (const p of group) p.ly -= shift;
    }
  }

  const describe = parts.map((p) => `${p.label} ${p.pct}%`).join(", ");

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto h-auto w-full max-w-[24rem]"
        role="img"
        aria-label={faded ? `Target calories by macro: ${describe}` : `Calories by macro: ${describe}`}
      >
        <g opacity={faded ? 0.35 : 1}>
          {parts.map((p) =>
            p.a1 - p.a0 >= 359.99 ? (
              <g key={p.key}>
                <path d={slicePath(0, 180)} fill={p.color} />
                <path d={slicePath(180, 360)} fill={p.color} />
              </g>
            ) : (
              <path key={p.key} d={slicePath(p.a0, p.a1)} fill={p.color} stroke="hsl(var(--card))" strokeWidth={2} />
            ),
          )}
        </g>
        {parts.map((p) => {
          const tx = p.ex + (p.right ? 12 : -12);
          return (
            <g key={p.key}>
              <path
                d={`M${p.px} ${p.py}Q${p.ex} ${p.ly} ${tx} ${p.ly}`}
                fill="none"
                stroke={p.color}
                strokeWidth={1.5}
                opacity={faded ? 0.5 : 1}
              />
              <text
                x={tx + (p.right ? 4 : -4)}
                y={p.ly}
                textAnchor={p.right ? "start" : "end"}
                dominantBaseline="middle"
                fontSize={13}
              >
                <tspan fontWeight={600} fill="hsl(var(--foreground))">
                  {p.label}
                </tspan>
                <tspan fill="hsl(var(--muted-foreground))"> ({p.pct}%)</tspan>
              </text>
            </g>
          );
        })}
        <text x={CX} y={CY - 3} textAnchor="middle" fontSize={17} fontWeight={600} fill="hsl(var(--foreground))" className="tabular">
          {Math.round(kcal).toLocaleString()}
        </text>
        <text x={CX} y={CY + 13} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
          kcal
        </text>
      </svg>
      <figcaption className="text-center text-[11px] text-muted-foreground">
        {faded
          ? "Your target's split. Log food to see yours."
          : targetSplit
            ? `Target: ${targetSplit.protein}% protein · ${targetSplit.carbs}% carbs · ${targetSplit.fat}% fat`
            : "Share of today's calories from each macro."}
      </figcaption>
    </figure>
  );
}
