import type { EngineOutput, MatchInput, PhasePayload } from "./types";
import {
  SET_PIECE_CAP,
  capSetPiecePct,
  classConversion,
  classSetPiece,
  combineSetPiece,
  oppClassFromPos,
  setPieceThin,
} from "./set-piece-class";
import { matchHalfLambdas, pGoalInHalf } from "./half-goals";

export interface MarketPick {
  id: string;
  market: string;
  pick: string;
  pct: number;
  why: string;
  fairOdds: number;
  impliedPct?: number;
  edge?: number;
  source?: "forma" | "kurs" | "statystyki";
  qty?: number;
}

export interface MarketBoardData {
  surest: MarketPick[];
  value: MarketPick[];
  track: MarketPick[];
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseExactScore(score: string): { h: number; a: number } | null {
  const m = String(score || "").trim().match(/^(\d+)\s*[:\-]\s*(\d+)$/);
  if (!m) return null;
  return { h: Number(m[1]), a: Number(m[2]) };
}

/** Kupon 2× CS (np. 2:0 + 1:0) nie może iść razem z BTTS TAK jako „najpewniejsze”. */
export function top3BlocksBttsYes(scores: string[]): boolean {
  const parsed = scores.map(parseExactScore).filter((x): x is { h: number; a: number } => !!x);
  if (parsed.length < 2) return false;
  return parsed.filter((s) => s.h === 0 || s.a === 0).length >= 2;
}

/** 1:0 / 0:1 / 2:0 / 0:2 w TOP3 — BTTS TAK nie idzie do najpewniejszych (zostaje na torze). */
export function top3HasCleanSheetExact(scores: string[]): boolean {
  const clean = new Set(["1:0", "0:1", "2:0", "0:2"]);
  return scores.some((s) => {
    const p = parseExactScore(s);
    return !!p && clean.has(`${p.h}:${p.a}`);
  });
}

/** EPL1 1:1/2:2 wymaga BTTS TAK — BTTS NIE nie idzie do najpewniejszych. */
export function top3BlocksBttsNo(scores: string[]): boolean {
  const a = parseExactScore(scores[0] || "");
  return !!a && a.h > 0 && a.a > 0 && a.h === a.a;
}

/** Kupon 2× ≤2 goli nie może iść z O2.5 TAK jako „najpewniejsze”. */
export function top3BlocksOver25(scores: string[]): boolean {
  const parsed = scores.map(parseExactScore).filter((x): x is { h: number; a: number } => !!x);
  if (parsed.length < 2) return false;
  return parsed.filter((s) => s.h + s.a <= 2).length >= 2;
}

function poissonOver(lambda: number, line: number) {
  if (lambda <= 0) return 0;
  let p0 = Math.exp(-lambda);
  let cdf = p0;
  const last = Math.floor(line);
  let p = p0;
  for (let k = 1; k <= last; k++) {
    p *= lambda / k;
    cdf += p;
  }
  return clamp((1 - cdf) * 100, 5, 92);
}

function blend(emp: number, model: number, w = 0.55) {
  if (!emp && !model) return 0;
  if (!emp) return model;
  if (!model) return emp;
  return w * emp + (1 - w) * model;
}

function q10(n: number) {
  return Math.round(n * 10) / 10;
}

/** Surowe % na panel podsumowujący — bez progu 40% z kuponu. Silnik HOLD. */
export type SummaryRates = {
  hasForm: boolean;
  tot: number;
  xgHome: number;
  xgaHome: number;
  xgAway: number;
  xgaAway: number;
  cornersHome: number;
  cornersAway: number;
  cardsHome: number;
  cardsAway: number;
  bttsYes: number;
  bttsNo: number;
  o15: number;
  o25: number;
  u25: number;
  h1: number;
  h2: number;
  l1: number;
  l2: number;
  cor85: number;
  cor95: number;
  corL: number;
  cards35: number;
  cards45: number;
  cardsL: number;
};

export function summaryRates(
  data: PhasePayload,
  engine: Pick<EngineOutput, "stats">,
): SummaryRates {
  const h = data.home;
  const a = data.away;
  const s = engine.stats;
  const formN = h.form.length + a.form.length;
  const hasForm = formN >= 6 && (h.gfAvg > 0 || a.gfAvg > 0);
  const lH = hasForm ? h.gfAvg : 0;
  const lA = hasForm ? a.gfAvg : 0;
  const tot = lH + lA;
  const pBttsYes =
    hasForm && s.bttsProjectedPct > 0
      ? blend(s.bttsProjectedPct, tot ? (1 - Math.exp(-lH)) * (1 - Math.exp(-lA)) * 100 : 0)
      : 0;
  const pO25 = hasForm && s.over25ProjectedPct > 0 ? blend(s.over25ProjectedPct, tot ? poissonOver(tot, 2.5) : 0) : 0;
  const pO15 = tot > 0 ? poissonOver(tot, 1.5) : 0;
  const pU25 = pO25 ? 100 - pO25 : 0;
  const pBttsNo = pBttsYes ? 100 - pBttsYes : 0;
  const homeCls = oppClassFromPos(a.tablePos, h.tablePos);
  const awayCls = oppClassFromPos(h.tablePos, a.tablePos);
  const corH = classSetPiece(h.form, homeCls, "corners", h.corners || 0, "H");
  const corA = classSetPiece(a.form, awayCls, "corners", a.corners || 0, "A");
  const cardH = classSetPiece(h.form, homeCls, "cards", h.cards || 0, "H");
  const cardA = classSetPiece(a.form, awayCls, "cards", a.cards || 0, "A");
  const cardsL = combineSetPiece(cardH, cardA);
  const corL = combineSetPiece(corH, corA);
  const halves = matchHalfLambdas(h, a, homeCls, awayCls);
  return {
    hasForm,
    tot: q10(tot),
    xgHome: h.xg || 0,
    xgaHome: h.xga || 0,
    xgAway: a.xg || 0,
    xgaAway: a.xga || 0,
    cornersHome: s.cornersHome || h.corners || 0,
    cornersAway: s.cornersAway || a.corners || 0,
    cardsHome: s.cardsHome || h.cards || 0,
    cardsAway: s.cardsAway || a.cards || 0,
    bttsYes: q10(pBttsYes),
    bttsNo: q10(pBttsNo),
    o15: q10(pO15),
    o25: q10(pO25),
    u25: q10(pU25),
    h1: q10(pGoalInHalf(halves.l1)),
    h2: q10(pGoalInHalf(halves.l2)),
    l1: halves.l1,
    l2: halves.l2,
    cor85: corL ? q10(poissonOver(corL, 8.5)) : 0,
    cor95: corL ? q10(poissonOver(corL, 9.5)) : 0,
    corL: q10(corL),
    cards35: cardsL ? q10(poissonOver(cardsL, 3.5)) : 0,
    cards45: cardsL ? q10(poissonOver(cardsL, 4.5)) : 0,
    cardsL: q10(cardsL),
  };
}

function pick(
  id: string,
  market: string,
  side: string,
  pct: number,
  why: string,
  source: MarketPick["source"],
  ok: boolean,
  impliedPct?: number,
): MarketPick | null {
  if (!ok) return null;
  const n = Math.round(clamp(pct, 0, 92) * 10) / 10;
  if (n < 40) return null;
  const fairOdds = Math.round((100 / n) * 100) / 100;
  const edge = impliedPct != null ? Math.round((n - impliedPct) * 10) / 10 : undefined;
  return { id, market, pick: side, pct: n, why, fairOdds, impliedPct, edge, source };
}

function betterPick(a?: MarketPick, b?: MarketPick): MarketPick | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.pct >= b.pct ? a : b;
}

/** BTTS / gole / rożne / kartki — osobno od top-3 pewności (tam wypycha je CS). */
export function trackPicks(all: MarketPick[]): MarketPick[] {
  const by = (id: string) => all.find((m) => m.id === id);
  const out: MarketPick[] = [];
  const btts = betterPick(by("btts-y"), by("btts-n"));
  const goals = betterPick(betterPick(by("o25"), by("u25")), by("o15"));
  const cor95 = by("k95");
  const cor85 = by("k85");
  const corners = cor95 && cor95.pct >= 58 ? cor95 : betterPick(cor95, cor85);
  const cards = betterPick(by("c35"), by("c45"));
  const sot = by("sot");
  const h1 = by("h1-y");
  const h2 = by("h2-y");
  for (const p of [btts, goals, h1, h2, corners, cards, sot]) if (p) out.push(p);
  return out;
}

export function buildMarkets(
  input: MatchInput,
  data: PhasePayload,
  engine: Pick<EngineOutput, "stats" | "favorite" | "direction" | "centralExact"> & {
    epl?: { score: string }[];
  },
): MarketBoardData {
  const h = data.home;
  const a = data.away;
  const s = engine.stats;
  const formN = h.form.length + a.form.length;
  const hasForm = formN >= 6 && (h.gfAvg > 0 || a.gfAvg > 0);
  const lH = hasForm ? h.gfAvg : 0;
  const lA = hasForm ? a.gfAvg : 0;
  const tot = lH + lA;
  const hair = formN >= 12 ? 1 : formN >= 8 ? 0.97 : 0.93;

  const implied = (() => {
    const o1 = input.oddsHome;
    const ox = input.oddsDraw;
    const o2 = input.oddsAway;
    if (!o1 || !ox || !o2) return null;
    const raw = [1 / o1, 1 / ox, 1 / o2];
    const sum = raw[0] + raw[1] + raw[2];
    return { home: (raw[0] / sum) * 100, draw: (raw[1] / sum) * 100, away: (raw[2] / sum) * 100 };
  })();

  const pHomeCs = hasForm ? blend(h.csPctOverall, tot ? Math.exp(-lA) * 100 : 0) : 0;
  const pAwayCs = hasForm ? blend(a.csPctOverall, tot ? Math.exp(-lH) * 100 : 0) : 0;
  const pBttsYes = hasForm && s.bttsProjectedPct > 0
    ? blend(s.bttsProjectedPct, tot ? (1 - Math.exp(-lH)) * (1 - Math.exp(-lA)) * 100 : 0)
    : 0;
  const pO25 = hasForm && s.over25ProjectedPct > 0 ? blend(s.over25ProjectedPct, tot ? poissonOver(tot, 2.5) : 0) : 0;
  const pO15 = tot > 0 ? poissonOver(tot, 1.5) : 0;
  const pU25 = pO25 ? 100 - pO25 : 0;
  const pBttsNo = pBttsYes ? 100 - pBttsYes : 0;
  const top3 = (engine.epl ?? []).slice(0, 3).map((e) => e.score);
  const blockBttsYes = top3BlocksBttsYes(top3);
  const hideBttsYesSurest = top3HasCleanSheetExact(top3);
  const blockBttsNo = top3BlocksBttsNo(top3);
  const blockO25 = top3BlocksOver25(top3);

  const homeCls = oppClassFromPos(a.tablePos, h.tablePos);
  const awayCls = oppClassFromPos(h.tablePos, a.tablePos);
  const corH = classSetPiece(h.form, homeCls, "corners", h.corners || 0, "H");
  const corA = classSetPiece(a.form, awayCls, "corners", a.corners || 0, "A");
  const cardH = classSetPiece(h.form, homeCls, "cards", h.cards || 0, "H");
  const cardA = classSetPiece(a.form, awayCls, "cards", a.cards || 0, "A");
  const sotH = classSetPiece(h.form, homeCls, "sot", h.shotsOnTarget || 0, "H");
  const sotA = classSetPiece(a.form, awayCls, "sot", a.shotsOnTarget || 0, "A");
  const cardsL = combineSetPiece(cardH, cardA);
  const corL = combineSetPiece(corH, corA);
  const sotL = combineSetPiece(sotH, sotA);
  const corThin = setPieceThin(corH, corA);
  const cardsThin = setPieceThin(cardH, cardA);
  const sotThin = setPieceThin(sotH, sotA);
  const pCards35 = cardsL ? poissonOver(cardsL, 3.5) : 0;
  const pCards45 = cardsL ? poissonOver(cardsL, 4.5) : 0;
  const pCor95 = corL ? poissonOver(corL, 9.5) : 0;
  const pCor85 = corL ? poissonOver(corL, 8.5) : 0;
  const corWhy = corL
    ? `vs ${homeCls} ${corH.avg} (${corH.used} n=${corH.n}) + vs ${awayCls} ${corA.avg} (${corA.used} n=${corA.n}) = ${corL.toFixed(1)}.`
    : "";
  const cardWhy = cardsL
    ? `vs ${homeCls} ${cardH.avg} (${cardH.used} n=${cardH.n}) + vs ${awayCls} ${cardA.avg} (${cardA.used} n=${cardA.n}) = ${cardsL.toFixed(1)}.`
    : "";
  const halves = matchHalfLambdas(h, a, homeCls, awayCls);
  const pH1 = pGoalInHalf(halves.l1);
  const pH2 = pGoalInHalf(halves.l2);
  const halfWhy = `1H λ=${halves.l1} · 2H λ=${halves.l2} · n=${halves.n} · ${homeCls}/${awayCls} (strzelone+stracone, dom/wyjazd).`;
  const convH = classConversion(h.form, homeCls, "H");
  const convA = classConversion(a.form, awayCls, "A");
  const convFromForm =
    convH.n && convA.n ? Math.round(((convH.pct + convA.pct) / 2) * 10) / 10 : convH.pct || convA.pct;
  const convPct =
    convFromForm > 0 ? convFromForm : sotL > 0 && tot > 0 ? Math.round((1000 * tot) / sotL) / 10 : 0;
  const q = (n: number) => Math.round(n * 10) / 10;

  const favName = engine.favorite === "away" ? a.name : h.name;
  const pFavCs = engine.favorite === "away" ? pAwayCs : pHomeCs;

  const pool: MarketPick[] = [];
  const add = (x: MarketPick | null, thin?: boolean, extra?: { qty?: number; min?: number }) => {
    if (!x) return;
    const raw = Math.round(x.pct * (x.source === "kurs" ? 1 : hair) * 10) / 10;
    const n = thin ? capSetPiecePct(raw, true) : raw;
    if (n < (extra?.min ?? 40)) return;
    const why =
      thin && n < raw
        ? `${x.why} Cap ${SET_PIECE_CAP}% — za mało meczów w klasie rywala albo brak boxu per mecz.`
        : x.why;
    pool.push({ ...x, pct: n, why, qty: extra?.qty ?? x.qty });
  };

  add(
    pick(
      "1",
      "Zwycięzca (z kursu 1X2)",
      h.name,
      s.homeWinProb,
      implied
        ? `Implied z Twojego kursu ${input.oddsHome} — to nie jest model z formy.`
        : "",
      "kurs",
      Boolean(implied && s.homeWinProb),
      implied?.home,
    ),
  );
  add(
    pick(
      "2",
      "Zwycięzca (z kursu 1X2)",
      a.name,
      s.awayWinProb,
      implied ? `Implied z Twojego kursu ${input.oddsAway} — to nie jest model z formy.` : "",
      "kurs",
      Boolean(implied && s.awayWinProb),
      implied?.away,
    ),
  );
  add(
    pick(
      "x",
      "Remis (z kursu 1X2)",
      "X",
      s.drawProb,
      implied ? `Implied z Twojego kursu ${input.oddsDraw}.` : "",
      "kurs",
      Boolean(implied && s.drawProb),
      implied?.draw,
    ),
  );
  add(
    pick(
      "cs-fav",
      "Clean sheet faworyta",
      `${favName} CS TAK`,
      pFavCs,
      hasForm
        ? `Z formy: CS ${engine.favorite === "away" ? a.csPctOverall : h.csPctOverall}% · λ goli przeciwnika ${engine.favorite === "away" ? lH : lA}.`
        : "",
      "forma",
      hasForm && pFavCs >= 40,
    ),
  );
  add(
    pick(
      "cs-h",
      "Clean sheet gospodarza",
      `${h.name} CS TAK`,
      pHomeCs,
      hasForm ? `${h.name} CS ${h.csPctOverall}% z ${h.form.length} meczów, gość ${lA} gf.` : "",
      "forma",
      hasForm && pHomeCs >= 40,
    ),
  );
  add(
    pick(
      "cs-a",
      "Clean sheet gościa",
      `${a.name} CS TAK`,
      pAwayCs,
      hasForm ? `${a.name} CS ${a.csPctOverall}% z ${a.form.length} meczów, gospodarz ${lH} gf.` : "",
      "forma",
      hasForm && pAwayCs >= 40,
    ),
  );
  add(
    pick(
      "btts-y",
      "BTTS",
      "TAK",
      pBttsYes,
      hasForm
        ? blockBttsYes
          ? `Forma BTTS ${h.bttsPct}% / ${a.bttsPct}%, ale kupon exact ${top3.join(", ")} ma 2× czyste konto — BTTS TAK nie idzie do najpewniejszych.`
          : `BTTS z formy ${h.bttsPct}% / ${a.bttsPct}% → proj. ${s.bttsProjectedPct}%.`
        : "",
      "forma",
      hasForm && pBttsYes >= 40 && !blockBttsYes,
    ),
  );
  add(
    pick(
      "btts-n",
      "BTTS",
      "NIE",
      pBttsNo,
      hasForm
        ? blockBttsNo
          ? `Forma BTTS NIE ${pBttsNo.toFixed(0)}%, ale EPL1 ${top3[0] || "—"} wymaga obu bramek — BTTS NIE nie idzie do najpewniejszych.`
          : `Lustrzane BTTS z formy (${h.form.length}+${a.form.length} meczów).`
        : "",
      "forma",
      hasForm && pBttsNo >= 40 && !blockBttsNo,
    ),
  );
  add(
    pick(
      "o15",
      "Gole Over 1.5",
      "TAK",
      pO15,
      tot ? `Poisson z λ=${tot.toFixed(2)} (suma gf z formy).` : "",
      "forma",
      tot > 0 && pO15 >= 40,
    ),
    undefined,
    { qty: tot ? q(tot) : undefined },
  );
  add(
    pick(
      "o25",
      "Gole Over 2.5",
      "TAK",
      pO25,
      tot
        ? blockO25
          ? `Forma O2.5, ale kupon exact ${top3.join(", ")} ma 2× wynik ≤2 goli — O2.5 TAK nie idzie do najpewniejszych.`
          : `O2.5 z formy ${h.over25Pct}/${a.over25Pct}% i λ=${tot.toFixed(2)}.`
        : "",
      "forma",
      tot > 0 && pO25 >= 40 && !blockO25,
    ),
    undefined,
    { qty: tot ? q(tot) : undefined },
  );
  add(
    pick(
      "u25",
      "Gole Under 2.5",
      "TAK",
      pU25,
      tot ? `Under jako 100−O2.5 z formy.` : "",
      "forma",
      tot > 0 && pU25 >= 40,
    ),
    undefined,
    { qty: tot ? q(tot) : undefined },
  );
  add(
    pick(
      "h1-y",
      "Gol 1. połowa",
      "TAK",
      pH1,
      halfWhy,
      "forma",
      pH1 >= 40,
    ),
    halves.thin,
    { qty: halves.l1 ? q(halves.l1) : undefined },
  );
  add(
    pick(
      "h2-y",
      "Gol 2. połowa",
      "TAK",
      pH2,
      halfWhy,
      "forma",
      pH2 >= 40,
    ),
    halves.thin,
    { qty: halves.l2 ? q(halves.l2) : undefined },
  );
  add(
    pick(
      "c35",
      "Kartki Over 3.5",
      "TAK",
      pCards35,
      cardWhy,
      "statystyki",
      cardsL > 0,
      52,
    ),
    cardsThin,
    { qty: cardsL ? q(cardsL) : undefined },
  );
  add(
    pick(
      "c45",
      "Kartki Over 4.5",
      "TAK",
      pCards45,
      cardWhy,
      "statystyki",
      cardsL > 0,
      42,
    ),
    cardsThin,
    { qty: cardsL ? q(cardsL) : undefined },
  );
  add(
    pick(
      "k95",
      "Rożne Over 9.5",
      "TAK",
      pCor95,
      corWhy,
      "statystyki",
      corL > 0,
      53,
    ),
    corThin,
    { qty: corL ? q(corL) : undefined },
  );
  add(
    pick(
      "k85",
      "Rożne Over 8.5",
      "TAK",
      pCor85,
      corWhy,
      "statystyki",
      corL > 0,
      58,
    ),
    corThin,
    { qty: corL ? q(corL) : undefined },
  );
  if (sotL > 0 && convPct > 0) {
    add(
      {
        id: "sot",
        market: "Celne strzały",
        pick: "gol",
        pct: convPct,
        why: `śr. SOT ${sotL.toFixed(1)} · konw. ${convPct}% gol/SOT vs ${homeCls}/${awayCls}, max 10, dom/wyjazd.`,
        fairOdds: Math.round((100 / Math.max(convPct, 1)) * 100) / 100,
        source: "statystyki",
      },
      false,
      { qty: q(sotL), min: 8 },
    );
  }

  const unique = new Map<string, MarketPick>();
  for (const m of pool) {
    const prev = unique.get(m.id);
    if (!prev || m.pct > prev.pct) unique.set(m.id, m);
  }
  const all = [...unique.values()];
  const fromData = all.filter((m) => m.source !== "kurs");
  const surest = [...(fromData.length ? fromData : all)]
    .filter((m) => !(hideBttsYesSurest && m.id === "btts-y"))
    .sort((x, y) => y.pct - x.pct)
    .slice(0, 3);
  const value = [...all]
    .filter((m) => (m.edge ?? 0) > 3)
    .sort((x, y) => (y.edge ?? 0) - (x.edge ?? 0))
    .slice(0, 3);

  return { surest, value, track: trackPicks(all) };
}
