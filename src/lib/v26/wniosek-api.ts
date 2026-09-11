import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MatchWniosek, SavedAnalysis } from "./types";
import { buildWniosek, isWniosekDue, wniosekDueAt, resolveKickoff } from "./wniosek";
import { buildMarkets, trackPicks } from "./markets";
import { settleWniosekMarkets } from "./wniosek-markets";

const RunSchema = z.object({
  id: z.string().min(8).max(80),
  force: z.boolean().optional(),
});

function isFinal(w?: MatchWniosek | null) {
  return w?.verdict === "HIT" || w?.verdict === "MISS_PROGRAMU" || w?.verdict === "MISS_PRZEBIEGU";
}

function hasMarkets(w?: MatchWniosek | null) {
  return Boolean(w?.markets && w.markets.length);
}

function foldKey(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function matchKey(a: { input?: { home?: string; away?: string; kickoff?: string } }): string {
  const i = a.input || {};
  return `${foldKey(i.home || "")}|${foldKey(i.away || "")}|${String(i.kickoff || "").slice(0, 10)}`;
}

const SETTLE_STATUS = new Set(["complete", "error", "awaiting-k11", "running-p1"]);

export function wniosekTickEligible(
  a: SavedAnalysis,
  opts?: { siblingComplete?: boolean; siblingHasPhase1?: boolean; now?: number },
): boolean {
  if (!a?.id || a.demo || a.id.startsWith("demo-") || a.id.startsWith("test-")) return false;
  if (!SETTLE_STATUS.has(a.status)) return false;
  if (opts?.siblingComplete && a.status !== "complete") return false;
  if (!a.phase1) {
    if (!opts?.siblingHasPhase1) return false;
    if (opts.siblingComplete) return false;
  }
  if (isFinal(a.wniosek) && hasMarkets(a.wniosek)) return false;
  if (a.wniosek?.verdict === "OCZEKUJE") {
    const last = Date.parse(a.wniosek.analyzedAt || "");
    const now = opts?.now ?? Date.now();
    if (Number.isFinite(last) && now - last < 25 * 60_000) return false;
  }
  return true;
}

function waiting(a: SavedAnalysis, text: string): MatchWniosek {
  const due = wniosekDueAt(a.input.kickoff || "");
  return {
    verdict: "OCZEKUJE",
    ft: "—",
    eplTop3: (a.engine?.epl || []).slice(0, 3).map((x) => x.score),
    epl1: a.engine?.epl?.[0]?.score || "",
    hitSlot: null,
    directionOk: true,
    events: { red: false, og: false, late90: false, squad: false, details: [] },
    text,
    sources: [],
    analyzedAt: new Date().toISOString(),
    dueAt: due ? new Date(due).toISOString() : "",
  };
}

export async function computeWniosek(id: string, force = false): Promise<{ ok: true; wniosek: MatchWniosek; skipped?: boolean } | { ok: false; error: string }> {
  const { readAnalysis, patchAnalysis, listAnalyses, listColdAnalyses } = await import("./archive.server");
  const { fetchMatchFt } = await import("./api-football");
  const { runEngine } = await import("./engine");
  let a0 = readAnalysis(id);
  if (!a0?.id) return { ok: false, error: "Brak analizy." };
  if (a0.demo || a0.id.startsWith("demo-") || a0.id.startsWith("test-")) {
    return { ok: false, error: "Przykład bez wniosku FT." };
  }
  if (isFinal(a0.wniosek) && hasMarkets(a0.wniosek) && !force) return { ok: true, wniosek: a0.wniosek!, skipped: true };

  const diskPatch: Partial<SavedAnalysis> = {};
  if (!a0.phase1) {
    const key = matchKey(a0);
    const sib = [...listAnalyses(), ...listColdAnalyses()].find(
      (x) => x.id !== a0!.id && matchKey(x) === key && x.phase1,
    );
    if (sib?.phase1) {
      a0 = { ...a0, phase1: sib.phase1, phase2: a0.phase2 || sib.phase2, engine: a0.engine || sib.engine };
      diskPatch.phase1 = a0.phase1;
      diskPatch.phase2 = a0.phase2;
    }
  }

  const kick = resolveKickoff(a0.input.kickoff, a0.input.notes, a0.createdAt);
  if (kick && kick !== a0.input.kickoff) {
    a0 = { ...a0, input: { ...a0.input, kickoff: kick } };
    diskPatch.input = a0.input;
  }
  if (Object.keys(diskPatch).length) patchAnalysis(a0.id, diskPatch);

  if (!a0.phase1) {
    if (isFinal(a0.wniosek) && !force) return { ok: true, wniosek: a0.wniosek!, skipped: true };
    const w = waiting(
      a0,
      "Analiza bez fazy 1 — nie rozliczam EPL ani typów. Odpal ponownie zbieranie danych.",
    );
    patchAnalysis(a0.id, { wniosek: w });
    return { ok: true, wniosek: w };
  }

  if (!force && !isWniosekDue(kick)) {
    const due = wniosekDueAt(kick);
    return {
      ok: true,
      wniosek: waiting(
        a0,
        due
          ? `Wniosek godzinę po końcu meczu — ${new Date(due).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}.`
          : "Brak godziny kickoff — nie ustawiam automatycznego wniosku.",
      ),
      skipped: true,
    };
  }

  let snap: Awaited<ReturnType<typeof fetchMatchFt>>;
  try {
    snap = await fetchMatchFt({
      home: a0.input.home,
      away: a0.input.away,
      league: a0.input.league,
      kickoff: kick || a0.input.kickoff,
    });
  } catch (e) {
    snap = { error: e instanceof Error ? e.message : String(e) };
  }
  if ("error" in snap) {
    if (isFinal(a0.wniosek) && !force) return { ok: true, wniosek: a0.wniosek!, skipped: true };
    const w = waiting(a0, `Źródło FT: ${snap.error}. Sprawdzę ponownie za chwilę (FotMob + API-Football).`);
    patchAnalysis(a0.id, { wniosek: w });
    return { ok: true, wniosek: w };
  }

  if (snap.kickoff && !Date.parse(a0.input.kickoff || "")) {
    a0 = { ...a0, input: { ...a0.input, kickoff: snap.kickoff } };
    patchAnalysis(a0.id, { input: a0.input });
  }

  if (!/^(FT|AET|PEN|AWD|WO)$/.test(snap.status) || !snap.ft) {
    const w = waiting(a0, `Mecz status ${snap.status || "NS"} — czekam na FT, potem +1 h.`);
    w.sources = snap.sources;
    patchAnalysis(a0.id, { wniosek: w });
    return { ok: true, wniosek: w };
  }

  let a = a0;
  if (!a.engine && a.phase1) {
    try {
      a = { ...a, engine: runEngine(a.input, a.phase1, a.phase2) };
    } catch {
      /* epl puste */
    }
  }
  const squad = Boolean(a.input.massOutFav || a.input.keyOutFav || a.input.gkOutFav);
  const due = wniosekDueAt(kick);
  const board =
    a.engine?.markets && (a.engine.markets.track?.length || a.engine.markets.surest?.length)
      ? a.engine.markets
      : a.phase1 && a.engine
        ? buildMarkets(a.input, a.phase1, a.engine)
        : undefined;
  const picks = board?.track?.length ? board.track : trackPicks([...(board?.surest || []), ...(board?.value || [])]);
  const markets = settleWniosekMarkets({ ft: snap.ft, box: { ...snap.box, ht: snap.ht }, picks });
  if (isFinal(a.wniosek) && !force) {
    const merged: MatchWniosek = { ...a.wniosek!, markets, sources: [...new Set([...(a.wniosek?.sources || []), ...snap.sources])] };
    patchAnalysis(a.id, { wniosek: merged });
    return { ok: true, wniosek: merged };
  }
  const wniosek = buildWniosek({
    epl: a.engine?.epl || [],
    protection: a.engine?.protection || [],
    favorite: a.engine?.favorite || "none",
    decision: a.engine?.decision || "WATCH",
    conf: a.engine?.confidence?.pct || 0,
    ft: snap.ft,
    events: { ...snap.events, squad: snap.events.squad || squad },
    sources: snap.sources,
    dueAt: due ? new Date(due).toISOString() : "",
    markets,
  });
  patchAnalysis(a.id, { wniosek });
  return { ok: true, wniosek };
}

function settlePriority(a: SavedAnalysis): number {
  if (a.status === "complete" && a.phase1) return 0;
  if (a.phase1) return 1;
  return 2;
}

export const runWniosek = createServerFn({ method: "POST" })
  .validator((input: unknown) => RunSchema.parse(input))
  .handler(async ({ data }) => computeWniosek(data.id, Boolean(data.force)));

export const tickWnioski = createServerFn({ method: "POST" }).handler(async () => {
  const { listAnalyses, listColdAnalyses, isPinnedAnalysis } = await import("./archive.server");
  const items: { id: string; ok: boolean }[] = [];
  const seenDone = new Set<string>();
  for (let wave = 0; wave < 6; wave++) {
    const live = listAnalyses();
    const cold = listColdAnalyses();
    const all = [...live, ...cold];
    const byKey = new Map<string, SavedAnalysis[]>();
    for (const a of all) {
      if (!a?.id) continue;
      const k = matchKey(a);
      const bucket = byKey.get(k) || [];
      bucket.push(a);
      byKey.set(k, bucket);
    }
    const seen = new Set<string>();
    const due: SavedAnalysis[] = [];
    for (const a of all) {
      if (!a?.id || seen.has(a.id) || seenDone.has(a.id) || isPinnedAnalysis(a)) continue;
      seen.add(a.id);
      const sibs = (byKey.get(matchKey(a)) || []).filter((x) => x.id !== a.id);
      const siblingHasPhase1 = sibs.some((x) => Boolean(x.phase1));
      const siblingComplete = sibs.some((x) => isFinal(x.wniosek) && hasMarkets(x.wniosek) && x.phase1);
      if (!wniosekTickEligible(a, { siblingComplete, siblingHasPhase1 })) continue;
      if (!isWniosekDue(resolveKickoff(a.input.kickoff, a.input.notes, a.createdAt))) continue;
      due.push(a);
    }
    due.sort((a, b) => settlePriority(a) - settlePriority(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const batch = due.slice(0, 12);
    if (!batch.length) break;
    for (const a of batch) {
      const res = await computeWniosek(a.id, false);
      items.push({ id: a.id, ok: res.ok });
      seenDone.add(a.id);
    }
  }
  return { ran: items.length, items };
});
