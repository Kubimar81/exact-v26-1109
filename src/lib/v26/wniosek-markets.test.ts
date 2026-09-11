import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { settleWniosekMarkets } from "./wniosek-markets.ts";
import { trackPicks, type MarketPick } from "./markets.ts";

const p = (id: string, market: string, pick: string, pct = 70): MarketPick => ({
  id,
  market,
  pick,
  pct,
  why: "",
  fairOdds: 1.4,
  source: "forma",
});

describe("wniosek rynki BTTS / gole / rożne / kartki", () => {
  it("BTTS TAK vs 2:1 HIT, vs 2:0 MISS", () => {
    const picks = [p("btts-y", "BTTS", "TAK")];
    assert.equal(settleWniosekMarkets({ ft: "2:1", picks })[0].hit, true);
    assert.equal(settleWniosekMarkets({ ft: "2:0", picks })[0].hit, false);
    assert.equal(settleWniosekMarkets({ ft: "0:0", picks: [p("btts-n", "BTTS", "NIE")] })[0].hit, true);
  });

  it("O2.5 / U2.5 z id, nie z napisu TAK", () => {
    assert.equal(settleWniosekMarkets({ ft: "2:1", picks: [p("o25", "Gole Over 2.5", "TAK")] })[0].hit, true);
    assert.equal(settleWniosekMarkets({ ft: "1:0", picks: [p("o25", "Gole Over 2.5", "TAK")] })[0].hit, false);
    assert.equal(settleWniosekMarkets({ ft: "1:0", picks: [p("u25", "Gole Under 2.5", "TAK")] })[0].hit, true);
    assert.equal(settleWniosekMarkets({ ft: "2:1", picks: [p("u25", "Gole Under 2.5", "TAK")] })[0].hit, false);
  });

  it("rożne O9.5 i kartki O3.5; brak boxu = null", () => {
    const cor = settleWniosekMarkets({
      ft: "1:0",
      box: { corners: 11, yellow: 2, red: 0 },
      picks: [p("k95", "Rożne Over 9.5", "TAK"), p("c35", "Kartki Over 3.5", "TAK")],
    });
    assert.equal(cor[0].hit, true);
    assert.equal(cor[0].actual, "11");
    assert.equal(cor[1].hit, false);
    assert.equal(cor[1].actual, "2");
    const empty = settleWniosekMarkets({
      ft: "1:0",
      picks: [p("k95", "Rożne Over 9.5", "TAK")],
    });
    assert.equal(empty[0].hit, null);
    assert.equal(empty[0].actual, "brak boxu");
  });

  it("trackPicks bierze BTTS/gole/rożne/kartki, nie CS", () => {
    const t = trackPicks([
      p("cs-fav", "Clean sheet", "TAK", 80),
      p("o15", "Gole Over 1.5", "TAK", 88),
      p("btts-y", "BTTS", "TAK", 61),
      p("k95", "Rożne Over 9.5", "TAK", 72),
      p("k85", "Rożne Over 8.5", "TAK", 80),
      p("c35", "Kartki Over 3.5", "TAK", 64),
    ]);
    assert.deepEqual(
      t.map((x) => x.id),
      ["btts-y", "o15", "k95", "c35"],
    );
  });
});
