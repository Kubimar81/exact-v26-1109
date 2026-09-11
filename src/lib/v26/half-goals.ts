import type { FormMatch, OpponentQuality, TeamBlock } from "./types";
import { SET_PIECE_CAP, capSetPiecePct } from "./set-piece-class";

export type HalfSample = {
  n: number;
  gf1h: number;
  ga1h: number;
  gf2h: number;
  ga2h: number;
  thin: boolean;
};

function mean(rows: FormMatch[], key: keyof FormMatch): number {
  if (!rows.length) return 0;
  const s = rows.reduce((a, m) => a + (typeof m[key] === "number" ? (m[key] as number) : 0), 0);
  return Math.round((s / rows.length) * 100) / 100;
}

/** Max 10 meczów. Priorytet: venue+klasa → klasa → venue → cała forma. */
export function sampleHalf(form: FormMatch[], ha: "H" | "A", cls: OpponentQuality): HalfSample {
  const has = form.filter((m) => typeof m.gf1h === "number" || typeof m.gf2h === "number").slice(0, 10);
  const buckets = [
    has.filter((m) => m.ha === ha && m.quality === cls),
    has.filter((m) => m.quality === cls),
    has.filter((m) => m.ha === ha),
    has,
  ];
  const rows = buckets.find((b) => b.length >= 2) || has;
  if (!rows.length) return { n: 0, gf1h: 0, ga1h: 0, gf2h: 0, ga2h: 0, thin: true };
  return {
    n: rows.length,
    gf1h: mean(rows, "gf1h"),
    ga1h: mean(rows, "ga1h"),
    gf2h: mean(rows, "gf2h"),
    ga2h: mean(rows, "ga2h"),
    thin: rows.length < 4,
  };
}

function blend(own: number, opp: number, nOwn: number, nOpp: number): number {
  if (nOwn && nOpp) return 0.5 * (own + opp);
  if (nOwn) return own;
  if (nOpp) return opp;
  return 0;
}

function fhShare(secondHalfPct: number): number {
  if (!(secondHalfPct > 0) || secondHalfPct >= 100) return 0.45;
  return Math.max(0.2, Math.min(0.8, (100 - secondHalfPct) / 100));
}

export type HalfLambdas = { l1: number; l2: number; thin: boolean; n: number };

export function matchHalfLambdas(
  home: Pick<TeamBlock, "form" | "gfHome" | "gfAway" | "gfAvg" | "gaHome" | "gaAway" | "gaAvg" | "goalsSecondHalfPct">,
  away: Pick<TeamBlock, "form" | "gfHome" | "gfAway" | "gfAvg" | "gaHome" | "gaAway" | "gaAvg" | "goalsSecondHalfPct">,
  homeCls: OpponentQuality,
  awayCls: OpponentQuality,
): HalfLambdas {
  const h = sampleHalf(home.form, "H", awayCls);
  const a = sampleHalf(away.form, "A", homeCls);
  if (h.n === 0 && a.n === 0) {
    const fhH = fhShare(home.goalsSecondHalfPct);
    const fhA = fhShare(away.goalsSecondHalfPct);
    const gfH = home.gfHome || home.gfAvg;
    const gaH = home.gaHome || home.gaAvg;
    const gfA = away.gfAway || away.gfAvg;
    const gaA = away.gaAway || away.gaAvg;
    const l1 = blend(gfH * fhH, gaA * fhA, 1, 1) + blend(gfA * fhA, gaH * fhH, 1, 1);
    const l2 = blend(gfH * (1 - fhH), gaA * (1 - fhA), 1, 1) + blend(gfA * (1 - fhA), gaH * (1 - fhH), 1, 1);
    return { l1: round2(l1), l2: round2(l2), thin: true, n: 0 };
  }
  const l1 = blend(h.gf1h, a.ga1h, h.n, a.n) + blend(a.gf1h, h.ga1h, a.n, h.n);
  const l2 = blend(h.gf2h, a.ga2h, h.n, a.n) + blend(a.gf2h, h.ga2h, a.n, h.n);
  return { l1: round2(l1), l2: round2(l2), thin: h.thin || a.thin, n: Math.min(h.n || 99, a.n || 99) };
}

export function pGoalInHalf(lambda: number): number {
  if (!(lambda > 0)) return 0;
  return Math.max(5, Math.min(92, Math.round((1 - Math.exp(-lambda)) * 1000) / 10));
}

export function capHalfPct(pct: number, thin: boolean): number {
  return capSetPiecePct(pct, thin);
}

export { SET_PIECE_CAP };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
