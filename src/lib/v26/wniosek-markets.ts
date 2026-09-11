import type { WniosekMarket } from "./types";
import type { MarketPick } from "./markets";
import { normScore } from "./wniosek";

export type FtBox = {
  corners?: number | null;
  yellow?: number | null;
  red?: number | null;
  sot?: number | null;
  ht?: string | null;
};

export function parseFtGoals(ft: string): { h: number; a: number } | null {
  const s = normScore(ft);
  if (!s) return null;
  const [h, a] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { h, a };
}

function lineFromId(id: string): number | null {
  if (id === "o15") return 1.5;
  if (id === "o25" || id === "u25") return 2.5;
  if (id === "k85") return 8.5;
  if (id === "k95") return 9.5;
  if (id === "c35") return 3.5;
  if (id === "c45") return 4.5;
  return null;
}

function lineHit(id: string, actual: number): boolean | null {
  const line = lineFromId(id);
  if (line == null) return null;
  if (id === "u25") return actual < line;
  return actual > line;
}

export function settleWniosekMarkets(input: {
  ft: string;
  box?: FtBox | null;
  picks: MarketPick[];
}): WniosekMarket[] {
  const g = parseFtGoals(input.ft);
  const box = input.box || {};
  const cardsN =
    box.yellow == null && box.red == null ? null : (box.yellow || 0) + (box.red || 0);
  const cornersN = box.corners == null ? null : box.corners;

  return input.picks.map((p) => {
    let actual = "—";
    let hit: boolean | null = null;
    if (!g) return { id: p.id, market: p.market, pick: p.pick, pct: p.pct, actual, hit };

    if (p.id === "btts-y" || p.id === "btts-n") {
      const yes = g.h > 0 && g.a > 0;
      actual = yes ? "TAK" : "NIE";
      hit = p.id === "btts-y" ? yes : !yes;
    } else if (p.id === "o15" || p.id === "o25" || p.id === "u25") {
      actual = String(g.h + g.a);
      hit = lineHit(p.id, g.h + g.a);
    } else if (p.id === "k85" || p.id === "k95") {
      if (cornersN == null) {
        actual = "brak boxu";
        hit = null;
      } else {
        actual = String(cornersN);
        hit = lineHit(p.id, cornersN);
      }
    } else if (p.id === "c35" || p.id === "c45") {
      if (cardsN == null) {
        actual = "brak boxu";
        hit = null;
      } else {
        actual = String(cardsN);
        hit = lineHit(p.id, cardsN);
      }
    } else if (p.id === "sot") {
      if (box.sot == null) {
        actual = "brak boxu";
        hit = null;
      } else {
        const conv = g.h + g.a > 0 ? Math.round((1000 * (g.h + g.a)) / Math.max(box.sot, 1)) / 10 : 0;
        actual = `${box.sot} SOT · ${conv}% gol`;
        hit = null;
      }
    } else if (p.id === "h1-y" || p.id === "h2-y") {
      const ht = parseFtGoals(box.ht || "");
      if (!ht || !g) {
        actual = "brak HT";
        hit = null;
      } else if (p.id === "h1-y") {
        const n = ht.h + ht.a;
        actual = n > 0 ? `TAK ${ht.h}:${ht.a}` : "NIE";
        hit = n > 0;
      } else {
        const n = Math.max(0, g.h - ht.h) + Math.max(0, g.a - ht.a);
        actual = n > 0 ? `TAK ${n}` : "NIE";
        hit = n > 0;
      }
    }
    return { id: p.id, market: p.market, pick: p.pick, pct: p.pct, actual, hit };
  });
}
