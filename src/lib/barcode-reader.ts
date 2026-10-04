/**
 * Reads retail barcodes (EAN-13, EAN-8, UPC-A, UPC-E) from camera frames and
 * photos.
 *
 * Uses the browser's built-in BarcodeDetector where it exists (Chrome on
 * Android). iPhones have no such API, so everywhere else this falls back to
 * ZXing compiled to WebAssembly. The ~1 MB decoder is loaded only the first
 * time someone scans, and is served from this site (public/zxing/, copied
 * there by scripts/copy-zxing.mjs) rather than a third-party CDN.
 */

import { normalizeBarcode } from "./food";

const WASM_URL = "/zxing/zxing_reader.wasm";
const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const ZXING_FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE"] as const;

/** Minimal typing for the Shape Detection API (not in TypeScript's DOM lib). */
interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

export interface BarcodeReader {
  /** "native" or "zxing", for diagnostics. */
  engine: "native" | "zxing";
  /** A valid, normalised barcode found in the canvas, or null. */
  read(canvas: HTMLCanvasElement): Promise<string | null>;
}

let readerPromise: Promise<BarcodeReader> | null = null;

/** Create (once) the best available reader. */
export function getBarcodeReader(): Promise<BarcodeReader> {
  readerPromise ??= createReader().catch((e) => {
    readerPromise = null; // let a later attempt retry, e.g. after a network blip
    throw e;
  });
  return readerPromise;
}

async function createReader(): Promise<BarcodeReader> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (NATIVE_FORMATS.every((f) => supported.includes(f))) {
        const detector = new Native({ formats: NATIVE_FORMATS });
        return {
          engine: "native",
          async read(canvas) {
            for (const hit of await detector.detect(canvas)) {
              const code = normalizeBarcode(hit.rawValue);
              if (code) return code;
            }
            return null;
          },
        };
      }
    } catch {
      /* fall through to ZXing */
    }
  }

  const zxing = await import("zxing-wasm/reader");
  zxing.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_URL : prefix + path),
    },
  });
  return {
    engine: "zxing",
    async read(canvas) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const results = await zxing.readBarcodes(image, {
        formats: [...ZXING_FORMATS],
        tryHarder: true,
        maxNumberOfSymbols: 1,
      });
      for (const r of results) {
        const code = r.isValid ? normalizeBarcode(r.text) : null;
        if (code) return code;
      }
      return null;
    },
  };
}

/** Draw an image (or a region of it) onto a canvas no wider than `maxWidth`. */
export function drawToCanvas(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  region: { x: number; y: number; width: number; height: number },
  maxWidth: number,
): void {
  const scale = Math.min(1, maxWidth / region.width);
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx?.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
}

/** Load a photo the user picked or took, honouring its EXIF orientation. */
export async function loadPhoto(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* older Safari: fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Whether this page is allowed to ask for the camera at all (false inside an iframe without allow="camera"). */
export function cameraAllowedByPolicy(): boolean | null {
  const doc = document as Document & {
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  if (!policy) return null; // Safari / Firefox: unknown until we try
  try {
    return policy.allowsFeature("camera");
  } catch {
    return null;
  }
}
