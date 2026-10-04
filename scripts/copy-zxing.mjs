/**
 * Copies the ZXing barcode decoder (WebAssembly) into public/zxing/, so the
 * site serves it itself instead of the package's default of fetching it from a
 * third-party CDN at scan time. See src/lib/barcode-reader.ts.
 *
 * Runs before every build and dev server start; the copied file is not
 * committed (it's regenerated from node_modules).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const targetDir = join(root, "public", "zxing");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, "zxing_reader.wasm"));
console.log("Copied zxing_reader.wasm to public/zxing/");
