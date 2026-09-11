import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SavedAnalysis } from "./types";
import { isExpired } from "./archive-ttl";
import { overlayNumericStats } from "./set-piece-fallback";

const ID_RE = /^[a-zA-Z0-9._-]{8,80}$/;

export function isPinnedAnalysis(a: Pick<SavedAnalysis, "id" | "demo">): boolean {
  if (a.demo) return true;
  return a.id.startsWith("demo-") || a.id.startsWith("test-");
}

export function analysesDir(): string {
  return process.env.ANALYSES_DIR || resolve(process.cwd(), "data", "analyses");
}

/** Zimne archiwum — 2 h po HIT/MISS karta schodzi tutaj, nie do kosza. */
export function coldArchiveDir(live = analysesDir()): string {
  return resolve(live, "_cold");
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

export function safeAnalysisId(id: string): string | null {
  if (!id || !ID_RE.test(id)) return null;
  if (id.includes("..")) return null;
  return id;
}

function fileFor(id: string, dir = analysesDir()): string | null {
  const safe = safeAnalysisId(id);
  if (!safe) return null;
  return resolve(dir, `${safe}.json`);
}

function stripForDisk(a: SavedAnalysis): SavedAnalysis {
  const { engine: _engine, ...rest } = a;
  return { ...rest, demo: undefined };
}

function moveToCold(id: string, liveDir: string, destDir: string): boolean {
  const src = fileFor(id, liveDir);
  const dest = fileFor(id, destDir);
  if (!src || !dest || !existsSync(src)) return false;
  ensureDir(destDir);
  try {
    writeFileSync(dest, readFileSync(src));
    unlinkSync(src);
    return true;
  } catch {
    return false;
  }
}

export function pruneExpired(dir = analysesDir(), now = Date.now(), dest = coldArchiveDir(dir)): string[] {
  ensureDir(dir);
  ensureDir(dest);
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const path = resolve(dir, name);
    try {
      const raw = readFileSync(path, "utf8");
      const a = JSON.parse(raw) as SavedAnalysis;
      if (!a?.id || isPinnedAnalysis(a)) continue;
      if (isExpired(a, now)) {
        if (moveToCold(id, dir, dest)) removed.push(id);
      }
    } catch {
      try {
        unlinkSync(path);
        removed.push(id);
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

/** Operator: zdejmij karty z pulpitu do Archiwum teraz, bez czekania na 2 h. */
export function archiveAllLive(dir = analysesDir(), dest = coldArchiveDir(dir)): string[] {
  ensureDir(dir);
  ensureDir(dest);
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const path = resolve(dir, name);
    try {
      const a = JSON.parse(readFileSync(path, "utf8")) as SavedAnalysis;
      if (!a?.id || isPinnedAnalysis(a)) continue;
      if (moveToCold(id, dir, dest)) removed.push(id);
    } catch {
      /* skip broken */
    }
  }
  return removed;
}

export function writeAnalysis(a: SavedAnalysis, dir = analysesDir()): { ok: boolean; skipped?: boolean; error?: string } {
  if (isPinnedAnalysis(a)) return { ok: true, skipped: true };
  const path = fileFor(a.id, dir);
  if (!path) return { ok: false, error: "Niepoprawny identyfikator analizy." };
  ensureDir(dir);
  const dest = coldArchiveDir(dir);
  ensureDir(dest);
  pruneExpired(dir);
  const coldPath = fileFor(a.id, dest);
  if (coldPath && existsSync(coldPath) && !existsSync(path)) {
    writeFileSync(coldPath, JSON.stringify(stripForDisk(a)), "utf8");
    return { ok: true, skipped: true };
  }
  if (isExpired(a)) return { ok: false, error: "Analiza po HIT/MISS + 2 h — jest w Archiwum, nie zapisuję na pulpit." };
  let toWrite = a;
  try {
    if (existsSync(path)) {
      const prev = JSON.parse(readFileSync(path, "utf8")) as SavedAnalysis;
      const prevTs = Date.parse(prev.updatedAt || "") || 0;
      const incTs = Date.parse(a.updatedAt || "") || 0;
      if (prev.status === "complete" && prevTs > incTs) {
        const keep: SavedAnalysis = {
          ...prev,
          wniosek: a.wniosek || prev.wniosek,
          k11Note: a.k11Note ?? prev.k11Note,
        };
        writeFileSync(path, JSON.stringify(stripForDisk(keep)), "utf8");
        return { ok: true, skipped: true };
      }
      if (prev?.phase1 && a.phase1) {
        toWrite = {
          ...a,
          phase1: {
            ...a.phase1,
            home: overlayNumericStats(a.phase1.home, prev.phase1.home),
            away: overlayNumericStats(a.phase1.away, prev.phase1.away),
            sources: [...new Set([...(a.phase1.sources || []), ...(prev.phase1.sources || [])])],
          },
          citations: [...new Set([...(a.citations || []), ...(prev.citations || [])])],
          wniosek: a.wniosek || prev.wniosek,
        };
      } else if (prev?.wniosek && !a.wniosek) {
        toWrite = { ...a, wniosek: prev.wniosek };
      }
    }
  } catch {
    toWrite = a;
  }
  writeFileSync(path, JSON.stringify(stripForDisk(toWrite)), "utf8");
  return { ok: true };
}

function parseFile(path: string): SavedAnalysis | null {
  try {
    const a = JSON.parse(readFileSync(path, "utf8")) as SavedAnalysis;
    return a?.id ? a : null;
  } catch {
    return null;
  }
}

export function readAnalysis(id: string, dir = analysesDir(), dest = coldArchiveDir(dir)): SavedAnalysis | null {
  const livePath = fileFor(id, dir);
  if (livePath && existsSync(livePath)) {
    const a = parseFile(livePath);
    if (!a) return null;
    if (!isPinnedAnalysis(a) && isExpired(a)) {
      moveToCold(id, dir, dest);
      const coldPath = fileFor(id, dest);
      return coldPath && existsSync(coldPath) ? parseFile(coldPath) : a;
    }
    return a;
  }
  const coldPath = fileFor(id, dest);
  if (coldPath && existsSync(coldPath)) return parseFile(coldPath);
  return null;
}

function stripSteps(phase: SavedAnalysis["phase1"]): SavedAnalysis["phase1"] {
  if (!phase) return phase;
  return { ...phase, steps: [] };
}

export function listAnalyses(dir = analysesDir()): SavedAnalysis[] {
  ensureDir(dir);
  pruneExpired(dir);
  const out: SavedAnalysis[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const path = resolve(dir, name);
    try {
      const a = JSON.parse(readFileSync(path, "utf8")) as SavedAnalysis;
      if (a?.id && a.input?.home) {
        out.push({
          ...a,
          phase1: stripSteps(a.phase1),
          phase2: stripSteps(a.phase2),
        });
      }
    } catch {
      /* skip broken file */
    }
  }
  out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return out;
}

export function listColdAnalyses(dir = analysesDir(), dest = coldArchiveDir(dir)): SavedAnalysis[] {
  pruneExpired(dir, Date.now(), dest);
  ensureDir(dest);
  const out: SavedAnalysis[] = [];
  for (const name of readdirSync(dest)) {
    if (!name.endsWith(".json")) continue;
    const path = resolve(dest, name);
    const a = parseFile(path);
    if (a?.id && a.input?.home) {
      out.push({
        ...a,
        phase1: stripSteps(a.phase1),
        phase2: stripSteps(a.phase2),
      });
    }
  }
  out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return out;
}

export function deleteAnalysis(id: string, dir = analysesDir(), dest = coldArchiveDir(dir)): boolean {
  if (id.startsWith("demo-") || id.startsWith("test-")) return false;
  const live = fileFor(id, dir);
  if (live && existsSync(live)) {
    unlinkSync(live);
    return true;
  }
  const cold = fileFor(id, dest);
  if (cold && existsSync(cold)) {
    unlinkSync(cold);
    return true;
  }
  return false;
}

/** Wyciągnij kartę z zimnego Archiwum z powrotem na pulpit. Plik nie jest kasowany — tylko wraca do live. */
export function restoreFromCold(id: string, dir = analysesDir(), dest = coldArchiveDir(dir)): SavedAnalysis | null {
  if (id.startsWith("demo-") || id.startsWith("test-")) return null;
  const cold = fileFor(id, dest);
  const live = fileFor(id, dir);
  if (!cold || !live || !existsSync(cold)) return null;
  const a = parseFile(cold);
  if (!a) return null;
  ensureDir(dir);
  writeFileSync(live, JSON.stringify(stripForDisk(a)), "utf8");
  unlinkSync(cold);
  return a;
}

export function patchAnalysis(
  id: string,
  patch: Partial<SavedAnalysis>,
  dir = analysesDir(),
  dest = coldArchiveDir(dir),
): SavedAnalysis | null {
  const live = fileFor(id, dir);
  const cold = fileFor(id, dest);
  const path = live && existsSync(live) ? live : cold && existsSync(cold) ? cold : null;
  if (!path) return null;
  const prev = parseFile(path);
  if (!prev) return null;
  const next: SavedAnalysis = {
    ...prev,
    ...patch,
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(stripForDisk(next)), "utf8");
  return next;
}
