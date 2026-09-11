import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SET_PIECE_CAP,
  capSetPiecePct,
  classConversion,
  classSetPiece,
  classifyOppQuality,
  combineSetPiece,
  oppClassFromPos,
  setPieceThin,
} from "./set-piece-class.ts";
import type { FormMatch } from "./types.ts";

function fm(q: FormMatch["quality"], corners: number, cards = 2): FormMatch {
  return {
    date: "2026-08-01",
    opponent: "X",
    ha: "H",
    scoreFor: 1,
    scoreAgainst: 0,
    quality: q,
    corners,
    cards,
  };
}

describe("klasa rywala rożne/kartki", () => {
  it("TOP / SREDNI / SLABY z tabeli 16 i 20", () => {
    assert.equal(classifyOppQuality(1, 16), "TOP");
    assert.equal(classifyOppQuality(4, 16), "TOP");
    assert.equal(classifyOppQuality(8, 16), "SREDNI");
    assert.equal(classifyOppQuality(16, 16), "SLABY");
    assert.equal(classifyOppQuality(5, 20), "TOP");
    assert.equal(classifyOppQuality(16, 20), "SLABY");
    assert.equal(classifyOppQuality(0, 16), "SREDNI");
  });

  it("n=1 w klasie → brak picka, nie sezon", () => {
    const form = [fm("TOP", 8), fm("SREDNI", 4), fm("SREDNI", 5)];
    const r = classSetPiece(form, "TOP", "corners", 6);
    assert.equal(r.used, "none");
    assert.equal(r.avg, 0);
  });

  it("n=3 w klasie TOP → średnia z kubełka", () => {
    const form = [fm("TOP", 3), fm("TOP", 4), fm("TOP", 5), fm("SLABY", 12)];
    const r = classSetPiece(form, "TOP", "corners");
    assert.equal(r.used, "class");
    assert.equal(r.n, 3);
    assert.equal(r.avg, 4);
  });

  it("brak boxu per mecz → season + thin cap", () => {
    const form: FormMatch[] = [
      { date: "2026-08-01", opponent: "X", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
      { date: "2026-08-08", opponent: "Y", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "TOP" },
    ];
    const r = classSetPiece(form, "TOP", "corners", 5.5);
    assert.equal(r.used, "season");
    assert.equal(r.avg, 5.5);
    const a = classSetPiece(form, "SLABY", "corners", 4);
    assert.equal(setPieceThin(r, a), true);
    assert.equal(capSetPiecePct(78, true), SET_PIECE_CAP);
    assert.equal(capSetPiecePct(78, false), 78);
  });

  it("combine: jedna strona none nie zeruje drugiej", () => {
    const h = classSetPiece([fm("TOP", 6), fm("TOP", 8)], "TOP", "corners");
    const a = classSetPiece([fm("SREDNI", 4), fm("SREDNI", 5)], "TOP", "corners");
    assert.equal(h.used, "class");
    assert.equal(a.used, "none");
    assert.equal(combineSetPiece(h, a), 7);
  });

  it("SOT konwersja gol/SOT w klasie", () => {
    const form: FormMatch[] = [
      { date: "1", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "TOP", sot: 8 },
      { date: "2", opponent: "B", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "TOP", sot: 6 },
      { date: "3", opponent: "C", ha: "A", scoreFor: 3, scoreAgainst: 0, quality: "SLABY", sot: 4 },
    ];
    const r = classConversion(form, "TOP", "H");
    assert.equal(r.n, 2);
    assert.equal(r.pct, 21.4);
  });

  it("oppClassFromPos: 2. miejsce = TOP", () => {
    assert.equal(oppClassFromPos(2, 10), "TOP");
    assert.equal(oppClassFromPos(14, 2), "SLABY");
    assert.equal(oppClassFromPos(0, 1), "SREDNI");
  });
});
