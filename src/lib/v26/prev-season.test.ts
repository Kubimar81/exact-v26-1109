import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { venueLambda, venueLambdaBlended } from "./exact-epf.ts";
import {
  blendWeight,
  lookupPrevClub,
  prevGrey,
  prevOff,
  venueNThisSeason,
  withPrevSeason,
} from "./prev-season.ts";
import type { TeamBlock } from "./types.ts";

function base(over: Partial<TeamBlock> & { name: string }): TeamBlock {
  return {
    tablePos: 1,
    points: 3,
    played: 1,
    form: [{ date: "2026-08-21", opponent: "X", ha: "H", scoreFor: 3, scoreAgainst: 0, quality: "SREDNI" }],
    csPctOverall: 100,
    csPctHome: 100,
    csPctAway: 0,
    bttsPct: 0,
    over25Pct: 100,
    gfAvg: 3,
    gaAvg: 0,
    gfHome: 3,
    gaHome: 0,
    gfAway: 0,
    gaAway: 0,
    xg: 1.8,
    xga: 0.2,
    possession: 0,
    corners: 0,
    shotsOnTarget: 0,
    cards: 0,
    goalsAfter60Pct: 0,
    goalsSecondHalfPct: 0,
    finishingLabel: "Neutral",
    ...over,
  };
}

describe("25.19 prevSeason λ blend", () => {
  it("lookup Arsenal / Villa, nie zgaduje obcego klubu", () => {
    assert.equal(lookupPrevClub("Arsenal", "Premier League")?.id, "arsenal");
    assert.equal(lookupPrevClub("Aston Villa", "Premier League")?.id, "aston-villa");
    assert.equal(lookupPrevClub("Flint Town United", "Cymru Premier"), null);
  });

  it("w: n=0 → 0, n=1..6 → 0.40, n=7..8 → 0.70, n≥9 → 1", () => {
    assert.equal(blendWeight(0), 0);
    assert.equal(blendWeight(1), 0.4);
    assert.equal(blendWeight(6), 0.4);
    assert.equal(blendWeight(7), 0.7);
    assert.equal(blendWeight(8), 0.7);
    assert.equal(blendWeight(9), 1);
  });

  it("n=1 HOME: 0.4*current + 0.6*prev", () => {
    const t = withPrevSeason(base({ name: "Arsenal", gfHome: 3 }), "Premier League");
    assert.ok(t.prevSeason);
    assert.equal(venueNThisSeason(t.form, "H"), 1);
    assert.equal(venueLambda(t, "H"), 3);
    assert.equal(venueLambdaBlended(t, "H"), Math.round((0.4 * 3 + 0.6 * 2.15) * 100) / 100);
  });

  it("prevOff (promoted) → tylko ten sezon", () => {
    const t = base({
      name: "Arsenal",
      prevSeason: { playedHome: 19, playedAway: 19, gfHome: 2.15, gaHome: 0.8, gfAway: 1.8, gaAway: 1 },
      prevFlags: { coachChanged: false, promoted: true, relegated: false, squadRebuild: false, newSigningsAttackDefense: 0 },
    });
    assert.equal(prevOff(t.prevFlags), true);
    assert.equal(venueLambdaBlended(t, "H"), venueLambda(t, "H"));
  });

  it("grey 3–5 signings: prev × 0.5", () => {
    const t = base({
      name: "Arsenal",
      gfHome: 3,
      prevSeason: { playedHome: 19, playedAway: 19, gfHome: 2, gaHome: 0.8, gfAway: 1.5, gaAway: 1 },
      prevFlags: { coachChanged: false, promoted: false, relegated: false, squadRebuild: false, newSigningsAttackDefense: 4 },
    });
    assert.equal(prevGrey(t.prevFlags), true);
    assert.equal(venueLambdaBlended(t, "H"), Math.round((0.4 * 3 + 0.6 * 1) * 100) / 100);
  });

  it("n≥9 → w=1, sam current", () => {
    const form = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const t = withPrevSeason(base({ name: "Arsenal", form, played: 10, gfHome: 2 }), "Premier League");
    assert.equal(venueNThisSeason(t.form, "H"), 10);
    assert.equal(venueLambdaBlended(t, "H"), venueLambda(t, "H"));
  });

  it("brak dumpa → venueLambda, nie zgaduje", () => {
    const t = base({ name: "Flint Town United", gfHome: 1.1 });
    assert.equal(withPrevSeason(t, "Cymru Premier").prevSeason, undefined);
    assert.equal(venueLambdaBlended(t, "H"), 1.1);
  });
});
