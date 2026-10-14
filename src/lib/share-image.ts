/**
 * The branded before/after image for a monthly comparison: 1080 × 1350
 * (Instagram's portrait size), drawn on the device from the member's private
 * photos, so they never go anywhere new. Charcoal and gold like the app.
 *
 * Browser only.
 */

export interface ShareImageInput {
  before: Blob;
  after: Blob;
  beforeLabel: string;
  afterLabel: string;
  /** "28-day transformation" */
  title: string;
  /** Short facts: "−3.5 lb", "Waist −1.2 in". */
  chips: string[];
  summary: string | null;
}

const W = 1080;
const H = 1350;
const GOLD = "#D2A74B";
const GOLD_DIM = "#9A7629";
const BG = "#0F0F0F";
const CARD = "#1A1712";
const TEXT = "#F2EEE6";
const MUTED = "#A39C8E";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

async function bitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw an image into a box, cropped to fill it (like object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Word-wrap into at most maxLines lines, ending with "…" if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]!;
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export async function drawComparisonImage(input: ShareImageInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make images.");
  const [before, after] = await Promise.all([bitmap(input.before), bitmap(input.after)]);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // A thin gold frame.
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Brand and title.
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = `700 30px ${FONT}`;
  ctx.letterSpacing = "8px";
  ctx.fillText("LEAN STATURE SYSTEM", W / 2, 96);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = TEXT;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(input.title, W / 2, 176);

  // Photos, side by side, 3:4.
  const pw = 468;
  const ph = 624;
  const top = 222;
  const gap = 24;
  const left = (W - pw * 2 - gap) / 2;
  cover(ctx, before, left, top, pw, ph, 18);
  cover(ctx, after, left + pw + gap, top, pw, ph, 18);
  for (const [i, label] of [input.beforeLabel, input.afterLabel].entries()) {
    const x = left + i * (pw + gap);
    ctx.font = `600 28px ${FONT}`;
    const tw = ctx.measureText(label).width + 36;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.roundRect(x + 18, top + 18, tw, 50, 25);
    ctx.fill();
    ctx.fillStyle = i === 1 ? GOLD : TEXT;
    ctx.textAlign = "left";
    ctx.fillText(label, x + 36, top + 53);
  }

  // Facts as pills, centred, wrapping to a second row if needed.
  let y = top + ph + 40;
  ctx.font = `700 32px ${FONT}`;
  const chips = input.chips.slice(0, 5);
  if (chips.length > 0) {
    const pad = 28;
    const widths = chips.map((c) => ctx.measureText(c).width + pad * 2);
    const rows: number[][] = [[]];
    let rowW = 0;
    widths.forEach((w, i) => {
      if (rowW + w + (rows.at(-1)!.length ? 16 : 0) > W - 120 && rows.at(-1)!.length) {
        rows.push([]);
        rowW = 0;
      }
      rows.at(-1)!.push(i);
      rowW += w + (rows.at(-1)!.length > 1 ? 16 : 0);
    });
    for (const row of rows) {
      const total = row.reduce((s, i) => s + widths[i]!, 0) + 16 * (row.length - 1);
      let x = (W - total) / 2;
      for (const i of row) {
        ctx.fillStyle = CARD;
        ctx.strokeStyle = GOLD_DIM;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, widths[i]!, 62, 31);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = TEXT;
        ctx.textAlign = "center";
        ctx.fillText(chips[i]!, x + widths[i]! / 2, y + 42);
        x += widths[i]! + 16;
      }
      y += 78;
    }
    y += 8;
  }

  // The summary, as much as fits.
  if (input.summary) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 33px ${FONT}`;
    ctx.textAlign = "center";
    const lines = wrap(ctx, input.summary, W - 180, Math.max(1, Math.floor((H - 110 - y) / 46)));
    for (const line of lines) {
      ctx.fillText(line, W / 2, y + 30);
      y += 46;
    }
  }

  // Footer.
  ctx.fillStyle = GOLD_DIM;
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Natural results · Lean Stature System", W / 2, H - 60);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Couldn't make the image.");
  return blob;
}
