import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchHalfLambdas, pGoalInHalf, sampleHalf } from "./half-goals.ts";
import { settleWniosekMarkets } from "./wniosek-markets.ts";
import { trackPicks, type MarketPick } from "./markets.ts";
import type { FormMatch, TeamBlock } from "./types.ts";

function fm(ha: "H" | "A", q: FormMatch["quality"], gf1h: number, ga1h: number, gf2h: number, ga2h: number): FormMatch {
  return {
    date: "2026-08-01",
    opponent: "X",
    ha,
    scoreFor: gf1h + gf2h,
    scoreAgainst: ga1h + ga2h,
    quality: q,
    gf1h,
    ga1h,
    gf2h,
    ga2h,
  };
}

const team = (form: FormMatch[], extra: Partial<TeamBlock> = {}): TeamBlock =>
  ({
    name: "T",
    tablePos: 4,
    points: 10,
    played: form.length,
    form,
    csPctOverall: 0,
    csPctHome: 0,
    csPctAway: 0,
    bttsPct: 0,
    over25Pct: 0,
    gfAvg: 1.5,
    gaAvg: 1,
    gfHome: 1.6,
    gaHome: 0.9,
    gfAway: 1.2,
    gaAway: 1.1,
    xg: 0,
    xga: 0,
    possession: 50,
    corners: 5,
    shotsOnTarget: 4,
    cards: 2,
    goalsAfter60Pct: 30,
    goalsSecondHalfPct: 55,
    finishingLabel: "Neutral",
    ...extra,
  }) as TeamBlock;

describe("gole 1H / 2H", () => {
  it("bierze venue+klasę gdy n>=2", () => {
    const form = [
      fm("H", "TOP", 0, 1, 2, 0),
      fm("H", "TOP", 0, 0, 1, 1),
      fm("H", "SLABY", 2, 0, 1, 0),
      fm("A", "TOP", 1, 0, 0, 1),
    ];
    const s = sampleHalf(form, "H", "TOP");
    assert.equal(s.n, 2);
    assert.equal(s.gf1h, 0);
    assert.equal(s.gf2h, 1.5);
  });

  it("P(gol w połowie) z λ", () => {
    assert.ok(pGoalInHalf(0.5) > 35 && pGoalInHalf(0.5) < 45);
    assert.ok(pGoalInHalf(1.2) > 65);
  });

  it("thin gdy n<4 — cap na rynku nie tu", () => {
    const h = team([fm("H", "SREDNI", 1, 0, 1, 0), fm("H", "SREDNI", 0, 1, 1, 0)]);
    const a = team([fm("A", "SREDNI", 0, 0, 1, 1), fm("A", "SREDNI", 1, 0, 0, 1)]);
    const l = matchHalfLambdas(h, a, "SREDNI", "SREDNI");
    assert.equal(l.thin, true);
    assert.ok(l.l1 > 0);
    assert.ok(l.l2 > 0);
  });

  it("HT settle 1H/2H", () => {
    const picks: MarketPick[] = [
      { id: "h1-y", market: "Gol 1. połowa", pick: "TAK", pct: 70, why: "", fairOdds: 1.4, source: "forma" },
      { id: "h2-y", market: "Gol 2. połowa", pick: "TAK", pct: 80, why: "", fairOdds: 1.25, source: "forma" },
    ];
    const a = settleWniosekMarkets({ ft: "2:1", box: { ht: "0:0" }, picks });
    assert.equal(a[0].hit, false);
    assert.equal(a[1].hit, true);
    const b = settleWniosekMarkets({ ft: "1:0", box: { ht: "1:0" }, picks });
    assert.equal(b[0].hit, true);
    assert.equal(b[1].hit, false);
  });

  it("trackPicks ma 1H i 2H", () => {
    const t = trackPicks([
      { id: "h1-y", market: "Gol 1. połowa", pick: "TAK", pct: 61, why: "", fairOdds: 1.6, source: "forma" },
      { id: "h2-y", market: "Gol 2. połowa", pick: "TAK", pct: 78, why: "", fairOdds: 1.28, source: "forma" },
      { id: "btts-y", market: "BTTS", pick: "TAK", pct: 55, why: "", fairOdds: 1.8, source: "forma" },
    ]);
    assert.deepEqual(
      t.map((x) => x.id),
      ["btts-y", "h1-y", "h2-y"],
    );
  });
});
