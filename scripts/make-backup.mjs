#!/usr/bin/env node
/**
 * Pakuje aktualny kod EXACT V26 do public/exact-v26.zip i public/exact-v26.rar.
 * WinRAR otwiera oba — .rar to ten sam ZIP (brak binarki rar w środowisku).
 * Pakowanie idzie przez python3 zipfile (w sandboxie nie ma CLI `zip`).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const zipPath = join(pub, "exact-v26.zip");
const rarPath = join(pub, "exact-v26.rar");

const PY = `
import os, sys, zipfile

root, out, arcname = sys.argv[1], sys.argv[2], sys.argv[3]
skip_dirs = {"node_modules", ".git", "dist", ".output", ".nitro", ".tanstack", ".vercel", "screenshots"}
skip_files = {"exact-v26.zip", "exact-v26.rar"}

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".vite")]
        rel_dir = os.path.relpath(dirpath, root)
        for name in filenames:
            if name in skip_files and os.path.basename(dirpath) == "public":
                continue
            if name.endswith(".log"):
                continue
            full = os.path.join(dirpath, name)
            rel = name if rel_dir == "." else os.path.join(rel_dir, name)
            zf.write(full, os.path.join(arcname, rel).replace("\\\\", "/"))
`;

export function makeBackup() {
  mkdirSync(pub, { recursive: true });
  for (const p of [zipPath, rarPath]) {
    if (existsSync(p)) rmSync(p);
  }
  const pyFile = join(pub, ".make-backup.py");
  writeFileSync(pyFile, PY);
  try {
    execFileSync("python3", [pyFile, root, zipPath, "exact-v26"], { stdio: "ignore" });
  } finally {
    if (existsSync(pyFile)) rmSync(pyFile);
  }
  if (!existsSync(zipPath)) {
    throw new Error("backup zip nie powstał");
  }
  copyFileSync(zipPath, rarPath);
  return { zipPath, rarPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = makeBackup();
  console.log("backup", out.zipPath);
}
