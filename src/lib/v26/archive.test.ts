import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExpired, ttlLeftMs, fmtTtl, ARCHIVE_TTL_MS, ARCHIVE_AFTER_WNIOSEK_MS } from "./archive-ttl.ts";
import { writeAnalysis, listAnalyses, listColdAnalyses, readAnalysis, pruneExpired, archiveAllLive, restoreFromCold, safeAnalysisId } from "./archive.server.ts";
import type { SavedAnalysis } from "./types.ts";

function sample(over: Partial<SavedAnalysis> = {}): SavedAnalysis {
  return {
    id: over.id ?? "11111111-1111-4111-8111-111111111111",
    createdAt: over.createdAt ?? new Date().toISOString(),
    updatedAt: over.updatedAt ?? new Date().toISOString(),
    input: over.input ?? { home: "Norrköping", away: "Falkenberg", league: "Superettan", kickoff: "" },
    status: over.status ?? "complete",
    citations: [],
    ...over,
  };
}

describe("archiwum 2 h po HIT/MISS", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "exact-v26-arch-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("TTL: bez wniosku 24 h; po HIT 2 h", () => {
    const now = Date.parse("2026-08-25T08:00:00.000Z");
    assert.equal(isExpired(new Date(now - 60_000).toISOString(), now), false);
    assert.equal(isExpired(new Date(now - ARCHIVE_TTL_MS).toISOString(), now), true);
    assert.equal(ttlLeftMs(new Date(now - 2 * 3600_000).toISOString(), now) > 20 * 3600_000, true);
    assert.match(fmtTtl(new Date(now - 23 * 3600_000).toISOString(), now), /jeszcze 1 h/);
    const hit = {
      createdAt: new Date(now - 20 * 3600_000).toISOString(),
      wniosek: { verdict: "HIT", analyzedAt: new Date(now - 60 * 60_000).toISOString() },
    };
    assert.equal(isExpired(hit, now), false);
    assert.match(fmtTtl(hit, now), /jeszcze 1 h/);
    const oldHit = {
      createdAt: new Date(now - 20 * 3600_000).toISOString(),
      wniosek: { verdict: "HIT", analyzedAt: new Date(now - ARCHIVE_AFTER_WNIOSEK_MS).toISOString() },
    };
    assert.equal(isExpired(oldHit, now), true);
  });

  it("zapis i odczyt z folderu, bez engine na dysku", () => {
    const a = sample({
      engine: { decision: "WATCH" } as SavedAnalysis["engine"],
    });
    assert.equal(writeAnalysis(a, dir).ok, true);
    const got = readAnalysis(a.id, dir);
    assert.ok(got);
    assert.equal(got!.input.home, "Norrköping");
    assert.equal(got!.engine, undefined);
    const list = listAnalyses(dir);
    assert.equal(list.length, 1);
  });

  it("prune przenosi 2 h po HIT do zimnego archiwum, nie kasuje", () => {
    const fresh = sample({ id: "22222222-2222-4222-8222-222222222222" });
    const old = sample({
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
      wniosek: {
        verdict: "HIT",
        ft: "1:0",
        eplTop3: [],
        epl1: "1:0",
        hitSlot: "EPL1",
        directionOk: true,
        events: { red: false, late90: false, squad: false, details: [] },
        text: "HIT",
        sources: [],
        analyzedAt: new Date(Date.now() - ARCHIVE_AFTER_WNIOSEK_MS - 1000).toISOString(),
        dueAt: new Date().toISOString(),
      },
    });
    writeAnalysis(fresh, dir);
    writeFileSync(join(dir, `${old.id}.json`), JSON.stringify(old));
    const removed = pruneExpired(dir);
    assert.ok(removed.includes(old.id));
    assert.equal(existsSync(join(dir, `${fresh.id}.json`)), true);
    assert.equal(existsSync(join(dir, `${old.id}.json`)), false);
    assert.equal(existsSync(join(dir, "_cold", `${old.id}.json`)), true);
    const got = readAnalysis(old.id, dir);
    assert.ok(got);
    assert.equal(got!.input.home, "Norrköping");
    const cold = listColdAnalyses(dir);
    assert.equal(cold.length, 1);
    assert.equal(cold[0].id, old.id);
    assert.equal(listAnalyses(dir).some((x) => x.id === old.id), false);
  });

  it("archiveAllLive zdejmuje świeże karty z pulpitu bez czekania na 2 h", () => {
    const fresh = sample({ id: "55555555-5555-4555-8555-555555555555" });
    writeAnalysis(fresh, dir);
    const removed = archiveAllLive(dir);
    assert.ok(removed.includes(fresh.id));
    assert.equal(existsSync(join(dir, `${fresh.id}.json`)), false);
    assert.equal(existsSync(join(dir, "_cold", `${fresh.id}.json`)), true);
    assert.equal(listAnalyses(dir).length, 0);
    assert.equal(listColdAnalyses(dir).some((x) => x.id === fresh.id), true);
    const again = writeAnalysis({ ...fresh, updatedAt: new Date().toISOString() }, dir);
    assert.equal(again.ok, true);
    assert.equal(existsSync(join(dir, `${fresh.id}.json`)), false);
    assert.equal(existsSync(join(dir, "_cold", `${fresh.id}.json`)), true);
  });

  it("restoreFromCold wyciąga kartę z Archiwum na pulpit", () => {
    const fresh = sample({ id: "66666666-6666-4666-8666-666666666666" });
    writeAnalysis(fresh, dir);
    archiveAllLive(dir);
    const got = restoreFromCold(fresh.id, dir);
    assert.ok(got);
    assert.equal(existsSync(join(dir, `${fresh.id}.json`)), true);
    assert.equal(existsSync(join(dir, "_cold", `${fresh.id}.json`)), false);
    assert.equal(listAnalyses(dir).some((x) => x.id === fresh.id), true);
  });

  it("odrzuca path traversal", () => {
    assert.equal(safeAnalysisId("../etc/passwd"), null);
    assert.equal(safeAnalysisId("abc"), null);
    assert.ok(safeAnalysisId("11111111-1111-4111-8111-111111111111"));
  });

  it("nie zapisuje demo/test na dysk", () => {
    assert.equal(writeAnalysis(sample({ id: "demo-lech-radomiak", demo: true }), dir).skipped, true);
    assert.equal(writeAnalysis(sample({ id: "test-cambuur-vs-feyenoord-rotterdam" }), dir).skipped, true);
    assert.equal(listAnalyses(dir).length, 0);
  });

  it("zapis nie kasuje SOT/rożnych zerami ze store", () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const filled = sample({
      id,
      phase1: {
        home: { name: "Suruchi Sangha", corners: 2.33, shotsOnTarget: 2.5, cards: 0 },
        away: { name: "Wari", corners: 4.5, shotsOnTarget: 2.83, cards: 0 },
      } as SavedAnalysis["phase1"],
    });
    assert.equal(writeAnalysis(filled, dir).ok, true);
    const zeros = sample({
      id,
      phase1: {
        home: { name: "Suruchi Sangha", corners: 0, shotsOnTarget: 0, cards: 0 },
        away: { name: "Wari", corners: 0, shotsOnTarget: 0, cards: 0 },
      } as SavedAnalysis["phase1"],
    });
    assert.equal(writeAnalysis(zeros, dir).ok, true);
    const got = readAnalysis(id, dir);
    assert.equal(got?.phase1?.home.corners, 2.33);
    assert.equal(got?.phase1?.away.shotsOnTarget, 2.83);
  });
});
