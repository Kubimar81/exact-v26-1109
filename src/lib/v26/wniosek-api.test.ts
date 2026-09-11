import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchKey, wniosekTickEligible } from "./wniosek-api.ts";
import type { MatchWniosek, SavedAnalysis } from "./types.ts";

function card(over: Partial<SavedAnalysis> & { status: SavedAnalysis["status"] }): SavedAnalysis {
  return {
    id: over.id || "abcd1234-test-card-xx",
    createdAt: "2026-09-07T12:00:00.000Z",
    updatedAt: "2026-09-07T12:00:00.000Z",
    input: over.input || {
      home: "Pogoń Szczecin",
      away: "Wisła Płock",
      league: "Ekstraklasa",
      kickoff: "2026-09-07T18:30:00.000Z",
    },
    citations: [],
    ...over,
  };
}

const hit: MatchWniosek = {
  verdict: "HIT",
  ft: "1:0",
  eplTop3: ["1:0", "2:0", "1:1"],
  epl1: "1:0",
  hitSlot: "EPL1",
  directionOk: true,
  events: { red: false, og: false, late90: false, squad: false, details: [] },
  text: "HIT",
  sources: [],
  analyzedAt: "2026-09-07T22:00:00.000Z",
  dueAt: "",
  markets: [{ id: "k85", market: "Rożne Over 8.5", pick: "TAK", pct: 72, actual: "11", hit: true }],
};

describe("wniosek tick — kto dostaje rozliczenie", () => {
  it("matchKey składa kluby bez ogonków + datę", () => {
    assert.equal(
      matchKey({ input: { home: "Alavés", away: "Real Sociedad", kickoff: "2026-09-07T18:30:00.000Z" } }),
      matchKey({ input: { home: "Alaves", away: "Real Sociedad", kickoff: "2026-09-07T20:00:00.000Z" } }),
    );
    assert.equal(
      matchKey({ input: { home: "Pogoń Szczecin", away: "Wisła Płock", kickoff: "2026-09-07T18:30:00.000Z" } }),
      matchKey({ input: { home: "Pogon Szczecin", away: "Wisla Plock", kickoff: "2026-09-07T20:00:00.000Z" } }),
    );
  });

  it("complete z fazą 1 i bez wniosku — tak", () => {
    assert.equal(wniosekTickEligible(card({ status: "complete", phase1: {} as SavedAnalysis["phase1"] })), true);
  });

  it("awaiting-k11 z fazą 1 — tak (wczoraj Midtjylland ginął)", () => {
    assert.equal(wniosekTickEligible(card({ status: "awaiting-k11", phase1: {} as SavedAnalysis["phase1"] })), true);
  });

  it("error bez fazy 1, bez rodzeństwa — nie", () => {
    assert.equal(wniosekTickEligible(card({ status: "error" })), false);
  });

  it("error bez fazy 1, rodzeństwo ma wniosek — nie (nie dubluj)", () => {
    assert.equal(
      wniosekTickEligible(card({ status: "error" }), { siblingHasPhase1: true, siblingComplete: true }),
      false,
    );
  });

  it("error bez fazy 1, rodzeństwo ma fazę 1 ale bez wniosku — tak (pożycz)", () => {
    assert.equal(
      wniosekTickEligible(card({ status: "error" }), { siblingHasPhase1: true, siblingComplete: false }),
      true,
    );
  });

  it("error nawet z fazą 1, gdy rodzeństwo już rozliczone — nie dubluj", () => {
    assert.equal(
      wniosekTickEligible(card({ status: "error", phase1: {} as SavedAnalysis["phase1"] }), {
        siblingHasPhase1: true,
        siblingComplete: true,
      }),
      false,
    );
  });

  it("HIT z rynkami — nie tykaj", () => {
    assert.equal(
      wniosekTickEligible(card({ status: "complete", phase1: {} as SavedAnalysis["phase1"], wniosek: hit })),
      false,
    );
  });

  it("OCZEKUJE młodsze niż 25 min — nie", () => {
    const w: MatchWniosek = {
      ...hit,
      verdict: "OCZEKUJE",
      ft: "—",
      markets: [],
      analyzedAt: new Date(Date.now() - 60_000).toISOString(),
    };
    assert.equal(
      wniosekTickEligible(card({ status: "complete", phase1: {} as SavedAnalysis["phase1"], wniosek: w })),
      false,
    );
  });

  it("demo / test- — nie", () => {
    assert.equal(wniosekTickEligible(card({ id: "test-abc12345", status: "complete", phase1: {} as SavedAnalysis["phase1"] })), false);
  });
});
