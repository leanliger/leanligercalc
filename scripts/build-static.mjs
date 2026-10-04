/**
 * Static-export build.
 *
 * Exists so `npm run build:static` behaves identically on Windows and Linux.
 * `NEXT_OUTPUT=export next build` is POSIX-only shell syntax and fails in cmd
 * and PowerShell, and pulling in `cross-env` for one variable is not worth a
 * dependency.
 */
import { spawn } from "node:child_process";
import "./copy-zxing.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "export" },
});

child.on("exit", (code) => process.exit(code ?? 1));
