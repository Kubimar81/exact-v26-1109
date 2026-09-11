import { create } from "zustand";
import { runEngine } from "./engine";
import { buildSample } from "./sample";
import liveBoardJson from "./live-board.json";
import { deleteArchivedAnalysis, getArchivedAnalysis, listArchivedAnalyses, pruneArchivedAnalyses, saveArchivedAnalysis } from "./archive-api";
import { runWniosek, tickWnioski } from "./wniosek-api";
import { fillPhase1Steps, overlaySteps } from "./fill-steps";
import { overlayNumericStats } from "./set-piece-fallback";
import type { MatchInput, MatchWniosek, PhasePayload, SavedAnalysis } from "./types";

function overlayPhase1(keep: PhasePayload, extra: PhasePayload): PhasePayload {
  const keepN = keep.steps?.length ?? 0;
  const extraN = extra.steps?.length ?? 0;
  const primary = extraN > keepN ? extra : keep;
  const secondary = primary === keep ? extra : keep;
  const home = overlayNumericStats(primary.home, secondary.home);
  const away = overlayNumericStats(primary.away, secondary.away);
  const next = {
    ...secondary,
    ...primary,
    home,
    away,
    sources: [...new Set([...(primary.sources || []), ...(secondary.sources || [])])],
  };
  const baseSteps = (primary.steps?.length ? primary.steps : secondary.steps) || [];
  return { ...next, steps: overlaySteps(baseSteps, fillPhase1Steps(next)) };
}

function stamp(a: { updatedAt?: string } | undefined): number {
  return Date.parse(a?.updatedAt || "") || 0;
}

function squadSlice(p: PhasePayload | undefined) {
  if (!p) return {};
  return {
    squadVerified: p.squadVerified,
    keyOutFav: p.keyOutFav,
    gkOutFav: p.gkOutFav,
    massOutFav: p.massOutFav,
    keyOutUd: p.keyOutUd,
    injuries: p.injuries,
  };
}

function inputSquad(input: MatchInput | undefined) {
  if (!input) return {};
  return {
    squadVerified: input.squadVerified,
    keyOutFav: input.keyOutFav,
    gkOutFav: input.gkOutFav,
    massOutFav: input.massOutFav,
    keyOutUd: input.keyOutUd,
  };
}

function s3On(a: SavedAnalysis | undefined): boolean {
  if (!a) return false;
  const p = a.phase1 || a.phase2;
  const i = a.input;
  return !!(p?.keyOutFav || p?.gkOutFav || p?.massOutFav || i?.keyOutFav || i?.gkOutFav || i?.massOutFav);
}

function applySquad(phase: PhasePayload | undefined, src: PhasePayload | undefined): PhasePayload | undefined {
  if (!phase) return src;
  if (!src) return phase;
  return { ...phase, ...squadSlice(src) };
}

/** Zapis z dysku wygrywa flagi S3 i nowszy updatedAt — otwarta karta nie trzyma cap 60%. */
export function mergeArchivedRow(row: SavedAnalysis, loc?: SavedAnalysis): SavedAnalysis {
  if (!loc) return row;
  const diskFlags = stamp(row) >= stamp(loc) || (s3On(loc) && !s3On(row));
  const flagSrc = diskFlags ? row : loc;
  const p1 =
    loc.phase1 && row.phase1
      ? overlayPhase1(loc.phase1, row.phase1)
      : row.phase1 || loc.phase1;
  const locP2 = loc.phase2?.steps?.length ?? 0;
  const rowP2 = row.phase2?.steps?.length ?? 0;
  const p2 = rowP2 >= locP2 ? row.phase2 || loc.phase2 : loc.phase2 || row.phase2;
  return {
    ...loc,
    ...row,
    status: row.status === "complete" ? "complete" : loc.status,
    updatedAt: stamp(row) >= stamp(loc) ? row.updatedAt : loc.updatedAt,
    input: {
      ...(loc.input || {}),
      ...(row.input || {}),
      ...inputSquad(flagSrc.input),
      kickoff: row.input?.kickoff || loc.input?.kickoff || "",
    },
    k11Note: loc.k11Note ?? row.k11Note,
    wniosek: loc.wniosek || row.wniosek,
    phase1: applySquad(p1, flagSrc.phase1 || flagSrc.phase2),
    phase2: applySquad(p2, flagSrc.phase2 || flagSrc.phase1),
    citations: [...new Set([...(row.citations || []), ...(loc.citations || [])])],
  };
}

const liveBoard = liveBoardJson as unknown as SavedAnalysis[];

function isPinned(a: Pick<SavedAnalysis, "id" | "demo">) {
  return Boolean(a.demo) || a.id.startsWith("demo-") || a.id.startsWith("test-");
}

function lockEngine(a: SavedAnalysis): SavedAnalysis {
  if (!a.phase1) return a;
  try {
    return { ...a, engine: runEngine(a.input, a.phase1, a.phase2), updatedAt: a.updatedAt };
  } catch (e) {
    return {
      ...a,
      error: e instanceof Error ? e.message : "Silnik V26 nie przeliczył tej analizy.",
    };
  }
}

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persistUser(a: SavedAnalysis, immediate = false) {
  if (isPinned(a)) return;
  const run = () => {
    persistTimers.delete(a.id);
    void saveArchivedAnalysis({ data: a }).catch(() => {});
  };
  const prev = persistTimers.get(a.id);
  if (prev) clearTimeout(prev);
  if (immediate) {
    run();
    return;
  }
  persistTimers.set(a.id, setTimeout(run, 500));
}

interface AnalysisStore {
  items: SavedAnalysis[];
  hydrated: boolean;
  setHydrated: () => void;
  mergeFromDisk: (rows: SavedAnalysis[]) => void;
  upsert: (a: SavedAnalysis) => void;
  remove: (id: string) => void;
  get: (id: string) => SavedAnalysis | undefined;
  createDraft: (input: MatchInput) => SavedAnalysis;
  setPhase1: (id: string, payload: PhasePayload, citations: string[]) => void;
  setPhase2: (id: string, payload: PhasePayload, citations: string[]) => void;
  setStatus: (id: string, status: SavedAnalysis["status"], error?: string) => void;
  setK11Note: (id: string, note: string) => void;
  patchPhase1: (id: string, payload: PhasePayload, citations: string[]) => void;
  applyT60: (id: string, payload: PhasePayload, citations: string[]) => void;
  setWniosek: (id: string, w: MatchWniosek) => void;
}

function pinnedSeed(): SavedAnalysis[] {
  return [buildSample(), ...liveBoard];
}

export const useAnalyses = create<AnalysisStore>()((set, get) => ({
  items: pinnedSeed(),
  hydrated: false,
  setHydrated: () => set({ hydrated: true }),
  mergeFromDisk: (rows) =>
    set((s) => {
      const pinned = s.items.filter(isPinned);
      const pinIds = new Set(pinned.map((x) => x.id));
      const localById = new Map(s.items.filter((x) => !pinIds.has(x.id)).map((x) => [x.id, x]));
      const seen = new Set<string>();
      const merged: SavedAnalysis[] = [];
      for (const row of rows) {
        if (!row?.id || pinIds.has(row.id)) continue;
        seen.add(row.id);
        const loc = localById.get(row.id);
        if (loc && (loc.status === "running-p1" || loc.status === "running-p2") && row.status !== "complete") {
          const stuckMs = Date.now() - Date.parse(loc.updatedAt || loc.createdAt || "") ;
          if (!loc.phase1 && Number.isFinite(stuckMs) && stuckMs > 3 * 60_000) {
            merged.push({
              ...loc,
              status: "error",
              error: "Liczenie się urwało. Otwórz mecz i kliknij Spróbuj ponownie.",
            });
            continue;
          }
          merged.push(loc);
          continue;
        }
        if (!loc && (row.status === "running-p1" || row.status === "running-p2") && !row.phase1) {
          const stuckMs = Date.now() - Date.parse(row.updatedAt || row.createdAt || "");
          if (Number.isFinite(stuckMs) && stuckMs > 3 * 60_000) {
            merged.push({
              ...row,
              status: "error",
              error: "Liczenie się urwało. Otwórz mecz i kliknij Spróbuj ponownie.",
            });
            continue;
          }
        }
        const picked = loc ? mergeArchivedRow(row, loc) : row;
        merged.push(picked.phase1 ? lockEngine(picked) : picked);
      }
      for (const [id, loc] of localById) {
        if (seen.has(id)) continue;
        if (loc.status === "running-p1" || loc.status === "running-p2" || loc.status === "awaiting-k11") {
          merged.push(loc);
        }
      }
      return { items: [...merged, ...pinned], hydrated: true };
    }),
  upsert: (a) => {
    const next = a.phase1 ? lockEngine(a) : a;
    set((s) => ({ items: [next, ...s.items.filter((x) => x.id !== next.id)] }));
    persistUser(next, true);
  },
  remove: (id) => {
    const cur = get().items.find((x) => x.id === id);
    if (cur && isPinned(cur)) return;
    set((s) => ({ items: s.items.filter((x) => x.id !== id && !x.demo) }));
    void deleteArchivedAnalysis({ data: { id } }).catch(() => {});
  },
  get: (id) => get().items.find((x) => x.id === id),
  createDraft: (input) => {
    const a: SavedAnalysis = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input,
      status: "running-p1",
      citations: [],
    };
    set((s) => ({ items: [a, ...s.items] }));
    persistUser(a, true);
    return a;
  },
  setPhase1: (id, payload, citations) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = lockEngine({
          ...x,
          phase1: payload,
          citations: [...new Set([...x.citations, ...citations])],
          status: "awaiting-k11",
          updatedAt: new Date().toISOString(),
        });
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
  setPhase2: (id, payload, citations) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = lockEngine({
          ...x,
          phase2: payload,
          citations: [...new Set([...x.citations, ...citations])],
          status: "complete",
          updatedAt: new Date().toISOString(),
        });
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
  setStatus: (id, status, error) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, status, error, updatedAt: new Date().toISOString() };
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
  setK11Note: (id, note) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, k11Note: note };
        persistUser(next);
        return next;
      });
      return { items };
    }),
  patchPhase1: (id, payload, citations) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = lockEngine({
          ...x,
          phase1: payload,
          citations: [...new Set([...x.citations, ...citations])],
          enrichedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
  applyT60: (id, payload, citations) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const flags = {
          squadVerified: payload.squadVerified,
          keyOutFav: payload.keyOutFav,
          gkOutFav: payload.gkOutFav,
          massOutFav: payload.massOutFav,
          keyOutUd: payload.keyOutUd,
          injuries: payload.injuries,
        };
        const input = {
          ...x.input,
          squadVerified: flags.squadVerified,
          keyOutFav: flags.keyOutFav,
          gkOutFav: flags.gkOutFav,
          massOutFav: flags.massOutFav,
          keyOutUd: flags.keyOutUd,
        };
        const next = lockEngine({
          ...x,
          input,
          phase1: x.phase1 ? { ...x.phase1, ...flags } : payload,
          phase2: x.phase2 ? { ...x.phase2, ...flags } : x.phase2,
          citations: [...new Set([...x.citations, ...citations])],
          updatedAt: new Date().toISOString(),
        });
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
  setWniosek: (id, w) =>
    set((s) => {
      const items = s.items.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, wniosek: w, updatedAt: new Date().toISOString() };
        persistUser(next, true);
        return next;
      });
      return { items };
    }),
}));

async function migrateBrowserCache() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("exact-v26-analyses");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { items?: SavedAnalysis[] } };
    const items = parsed?.state?.items;
    if (Array.isArray(items)) {
      for (const a of items) {
        if (!a?.id || isPinned(a)) continue;
        await saveArchivedAnalysis({ data: a });
      }
    }
    localStorage.removeItem("exact-v26-analyses");
  } catch {
    try {
      localStorage.removeItem("exact-v26-analyses");
    } catch {
      /* ignore */
    }
  }
}

let loading = false;
let loadGen = 0;

function timed<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function loadArchive() {
  if (loading) return;
  loading = true;
  const gen = ++loadGen;
  try {
    await migrateBrowserCache();
    void pruneArchivedAnalyses().catch(() => {});
    const rows = await timed(listArchivedAnalyses(), 4000);
    if (gen !== loadGen) return;
    useAnalyses.getState().mergeFromDisk(Array.isArray(rows) ? rows : []);
  } catch {
    useAnalyses.getState().setHydrated();
  } finally {
    if (gen === loadGen) {
      loading = false;
      if (!useAnalyses.getState().hydrated) useAnalyses.getState().setHydrated();
      void pullWnioski();
    }
  }
}

export async function ensureAnalysisLoaded(id: string) {
  try {
    const row = await getArchivedAnalysis({ data: { id } });
    if (!row?.id) return;
    const loc = useAnalyses.getState().items.find((x) => x.id === id);
    if (!loc) {
      useAnalyses.getState().upsert(row);
      return;
    }
    const diskDone = row.status === "complete" || Boolean(row.phase1);
    if ((loc.status === "running-p1" || loc.status === "running-p2") && diskDone) {
      useAnalyses.getState().upsert({
        ...row,
        input: {
          ...(loc.input || {}),
          ...(row.input || {}),
          kickoff: row.input?.kickoff || loc.input?.kickoff || "",
        },
        k11Note: loc.k11Note ?? row.k11Note,
        wniosek: row.wniosek || loc.wniosek,
      });
      return;
    }
    if (loc.status === "running-p1" || loc.status === "running-p2") {
      if (row.phase1 && !(loc.phase1?.steps?.length)) {
        useAnalyses.getState().upsert({
          ...loc,
          phase1: row.phase1,
          phase2: loc.phase2 || row.phase2,
          citations: [...new Set([...(loc.citations || []), ...(row.citations || [])])],
        });
      }
      return;
    }
    useAnalyses.getState().upsert(mergeArchivedRow(row, loc));
  } catch {
    /* ignore */
  }
}

const wniosekBusy = new Set<string>();

export async function requestWniosek(id: string, force = false) {
  if (wniosekBusy.has(id)) return;
  wniosekBusy.add(id);
  try {
    const res = await runWniosek({ data: { id, force } });
    if (res && "ok" in res && res.ok && res.wniosek) {
      useAnalyses.getState().setWniosek(id, res.wniosek);
    }
    return res;
  } catch {
    return undefined;
  } finally {
    wniosekBusy.delete(id);
  }
}

export async function pullWnioski() {
  try {
    await tickWnioski();
    const rows = await listArchivedAnalyses();
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?.id && row.wniosek) useAnalyses.getState().setWniosek(row.id, row.wniosek);
    }
  } catch {
    /* wniosek nie blokuje boot */
  }
}

