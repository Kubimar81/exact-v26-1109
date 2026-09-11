import type {
  CSLean,
  ExactCandidate,
  ExactRole,
  FavoriteSide,
  MatchInput,
  MatchProfile,
  PhasePayload,
  TeamBlock,
} from "./types";
import { blendWeight, prevGrey, prevOff, venueNThisSeason } from "./prev-season";

export type ExactCtx = {
  favorite: FavoriteSide;
  profile: MatchProfile;
  home: TeamBlock;
  away: TeamBlock;
  h2hAvg: number;
  h2hN: number;
  csFav: CSLean;
  hv: boolean;
  ugo: boolean;
  oddsFav?: number;
  exactOdds: Record<string, number>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** Sufit λ: HV bez capu; kurs ≤1.30 → 3.20; ≤1.45 → 2.60; inaczej 2.10. Bez podłogi. */
export function lambdaCeiling(hv: boolean, oddsFav?: number): number | null {
  if (hv) return null;
  if (typeof oddsFav === "number" && oddsFav <= 1.3) return 3.2;
  if (typeof oddsFav === "number" && oddsFav <= 1.45) return 2.6;
  return 2.1;
}

export function cappedLambda(lambda: number, hv: boolean, oddsFav?: number): number {
  if (!(lambda > 0)) return 0;
  const cap = lambdaCeiling(hv, oddsFav);
  if (cap == null) return lambda;
  return Math.min(lambda, cap);
}

/** Early sample (n≤5): mecz z ≥4 golami liczy się jako 3. */
export function clipEarlyOutlierGoals(goals: number, n: number): number {
  if (!(goals > 0)) return Math.max(0, goals);
  if (n <= 5 && goals >= 4) return 3;
  return goals;
}

export function gfGaForHv(team: {
  form?: { scoreFor: number; scoreAgainst: number }[];
  gfAvg?: number;
  gaAvg?: number;
  played?: number;
}): number {
  const form = team.form ?? [];
  const n = form.length || team.played || 0;
  if (n <= 5 && form.some((m) => m.scoreFor >= 4 || m.scoreAgainst >= 4)) {
    const gf = form.reduce((s, m) => s + clipEarlyOutlierGoals(m.scoreFor, n), 0) / form.length;
    const ga = form.reduce((s, m) => s + clipEarlyOutlierGoals(m.scoreAgainst, n), 0) / form.length;
    return gf + ga;
  }
  return Math.max(0, (team.gfAvg || 0) + (team.gaAvg || 0));
}

/** λ z venue sezonu (gfHome/gfAway), potem gfAvg, potem xG. Nie spłaszczaj L8 do jednej liczby. */
export function venueLambda(team: TeamBlock, ha: "H" | "A"): number {
  const form = team.form ?? [];
  const n = form.length || team.played || 0;
  if (n <= 5 && form.length) {
    const rows = form.filter((m) => m.ha === ha);
    if (rows.some((m) => m.scoreFor >= 4)) {
      const avg = rows.reduce((s, m) => s + clipEarlyOutlierGoals(m.scoreFor, n), 0) / rows.length;
      if (avg > 0) return Math.round(avg * 100) / 100;
    }
  }
  const split = ha === "H" ? team.gfHome : team.gfAway;
  if (split > 0) return split;
  if (team.gfAvg > 0) return team.gfAvg;
  if (team.xg > 0) return team.xg;
  return 0;
}

/**
 * 25.19 venueLambdaBlended — prevSeason tylko do λ, nie do Confidence.
 * Brak wiersza / prevOff → tylko ten sezon. Nie zgaduje.
 */
export function venueLambdaBlended(team: TeamBlock, ha: "H" | "A"): number {
  const current = venueLambda(team, ha);
  const prev = team.prevSeason;
  const flags = team.prevFlags;
  if (!prev || prevOff(flags)) return current;
  const n = venueNThisSeason(team.form, ha);
  const w = blendWeight(n);
  let prevLam = ha === "H" ? prev.gfHome : prev.gfAway;
  if (!(prevLam > 0)) prevLam = ha === "H" ? (prev.xgHome || 0) : (prev.xgAway || 0);
  if (!(prevLam > 0)) return current;
  if (prevGrey(flags)) prevLam *= 0.5;
  const lam = w * current + (1 - w) * prevLam;
  return Math.round(lam * 100) / 100;
}

function pois(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function parse(score: string) {
  const [h, a] = score.split(/[:\-]/).map((x) => Number(x.trim()));
  return { h: h || 0, a: a || 0 };
}

function fit(actual: number, lambda: number, max: number) {
  const d = Math.abs(actual - lambda);
  return clamp(Math.round(max * Math.exp(-d * 0.9) * 100) / 100, 0, max);
}

function make(
  score: string,
  parts: number[],
  epl: number[],
  reasons: string[],
): ExactCandidate {
  const [fg, ug, cs, fl, od] = parts;
  const total = Math.round((fg + ug + cs + fl + od) * 10) / 10;
  const [p, f, m, a, r] = epl;
  const raw = p + f + m + a + r;
  return {
    score,
    epf: { favGoals: fg, udGoals: ug, csRisk: cs, flowFit: fl, odpornosc: od, total },
    epl: { profil: p, flow: f, market: m, audyt: a, ryzyko: r, raw, pct: 0 },
    role: "Rezerwa" as ExactRole,
    reasons,
    functions: [],
    satisfies: [],
  };
}

export function scoreExact(score: string, ctx: ExactCtx): ExactCandidate {
  const s = parse(score);
  const favIsAway = ctx.favorite === "away";
  const fav = favIsAway ? ctx.away : ctx.home;
  const ud = favIsAway ? ctx.home : ctx.away;
  const favHa: "H" | "A" = favIsAway ? "A" : "H";
  const udHa: "H" | "A" = favIsAway ? "H" : "A";
  const lFavRaw = venueLambdaBlended(fav, favHa);
  const lUdRaw = venueLambdaBlended(ud, udHa);
  const lFav = cappedLambda(lFavRaw, ctx.hv, ctx.oddsFav);
  const lUd = cappedLambda(lUdRaw, ctx.hv, ctx.oddsFav);
  const gFav = favIsAway ? s.a : s.h;
  const gUd = favIsAway ? s.h : s.a;
  const tot = s.h + s.a;
  const btts = s.h > 0 && s.a > 0;
  const clean = gUd === 0 && gFav > 0;
  const reasons: string[] = [];

  const hasLambda = lFav > 0 || lUd > 0;
  const lH = cappedLambda(venueLambdaBlended(ctx.home, "H") || lFavRaw, ctx.hv, ctx.oddsFav);
  const lA = cappedLambda(venueLambdaBlended(ctx.away, "A") || lUdRaw, ctx.hv, ctx.oddsFav);
  const pJoint = hasLambda ? pois(s.h, lH) * pois(s.a, lA) : 0;

  const favP = hasLambda ? fit(gFav, lFav, 3) : 0.4;
  const udP = hasLambda ? fit(gUd, lUd, 2) : 0.3;
  const cap = lambdaCeiling(ctx.hv, ctx.oddsFav);
  const capNote = (raw: number) =>
    cap != null && raw > cap ? ` cap ${cap.toFixed(2)}` : "";
  if (hasLambda) {
    reasons.push(`λ fav ${lFav.toFixed(2)} → exact ${gFav} (EPF ${favP.toFixed(1)})${capNote(lFavRaw)}`);
    reasons.push(`λ ud ${lUd.toFixed(2)} → exact ${gUd} (EPF ${udP.toFixed(1)})${capNote(lUdRaw)}`);
  } else {
    reasons.push("Brak średnich goli — EPF niski, NIEAKTYWNA baza");
  }

  let cs = 1;
  if (clean) {
    cs = ctx.csFav === "Strong" ? 2 : ctx.csFav === "Medium" ? 1.1 : 0.35;
    reasons.push(`Clean + CS ${ctx.csFav} → csRisk ${cs}`);
  } else if (btts) {
    cs = ctx.csFav === "Weak" || ctx.ugo ? 1.9 : ctx.csFav === "Medium" ? 1.4 : 0.7;
    reasons.push(`Mixed/BTTS + CS ${ctx.csFav} / UGO=${ctx.ugo} → csRisk ${cs}`);
  } else {
    cs = ctx.csFav === "Strong" ? 1.3 : 0.8;
  }

  const bttsEmp = (fav.bttsPct + ud.bttsPct) / 2;
  const overEmp = (fav.over25Pct + ud.over25Pct) / 2;
  let flow = 0.6;
  if (btts && bttsEmp >= 55) flow = 1.9;
  else if (btts && bttsEmp >= 40) flow = 1.3;
  else if (!btts && bttsEmp > 0 && bttsEmp < 40) flow = 1.8;
  else if (!btts && bttsEmp >= 55) flow = 0.5;
  if (tot >= 3 && overEmp >= 55) flow = Math.min(2, flow + 0.4);
  if (tot <= 2 && overEmp > 0 && overEmp < 40) flow = Math.min(2, flow + 0.3);
  if (ctx.h2hAvg > 0) {
    const hd = Math.abs(ctx.h2hAvg - tot);
    flow = clamp(flow + (hd < 0.6 ? 0.2 : hd > 1.5 ? -0.2 : 0), 0, 2);
  }
  reasons.push(`Flow BTTS ${bttsEmp.toFixed(0)}% O2.5 ${overEmp.toFixed(0)}% vs exact ${s.h}:${s.a}`);

  const gap = Math.abs((ctx.home.tablePos || 0) - (ctx.away.tablePos || 0));
  let odp = 0.4;
  if (gap >= 8 && gFav >= 2) odp = 0.9;
  if (gap < 3 && gFav >= 3) odp = 0.2;
  if (ctx.oddsFav && ctx.oddsFav <= 1.45 && clean && gFav <= 2) odp = 0.85;
  if (ctx.oddsFav && ctx.oddsFav > 1.85 && clean) odp = 0.3;

  const epf: number[] = [
    Math.round(favP * 10) / 10,
    Math.round(udP * 10) / 10,
    Math.round(cs * 10) / 10,
    Math.round(flow * 10) / 10,
    Math.round(odp * 10) / 10,
  ];

  let profil = 12;
  const pr = ctx.profile as string;
  if (pr.includes("Controlled") && clean && gFav === 2) profil = 28;
  else if (pr.includes("Controlled") && btts && gFav === 2) profil = 24;
  else if (pr.includes("Strong") && clean && gFav >= 2) profil = 27;
  else if (pr.includes("Dominator") && gFav >= 3) profil = 29;
  else if (pr.includes("Dominator") && gFav === 2 && clean) profil = 22;
  else if (pr === "Balanced" || pr === "Open") profil = btts ? 24 : 14;
  else if (pr.includes("Away") && favIsAway && gFav >= 1) profil = clean ? 25 : 22;
  else if (pr.includes("Chaotic") || ctx.hv) profil = btts || tot >= 3 ? 24 : 11;
  else if (clean && gFav === 1) profil = 18;
  else if (s.h === s.a) profil = pr === "Balanced" ? 22 : 13;
  if (pJoint > 0.12) profil = Math.min(30, profil + 3);
  else if (pJoint > 0 && pJoint < 0.03) profil = Math.max(8, profil - 4);

  const flowE = clamp(Math.round(flow * 12.5), 0, 25);
  let market = 6;
  const ex = ctx.exactOdds[score];
  if (typeof ex === "number" && ex > 1) {
    const implied = 100 / ex;
    market = clamp(Math.round(8 + (pJoint * 100 - implied) * 0.25), 2, 15);
    reasons.push(`Exact @ ${ex} implied ${implied.toFixed(1)}% vs Poisson ${(pJoint * 100).toFixed(1)}%`);
  } else if (ctx.oddsFav) {
    market = ctx.oddsFav <= 1.7 && (clean || gFav >= 2) ? 11 : 7;
  }

  const formN = ctx.home.form.length + ctx.away.form.length;
  let audyt = 6;
  if (formN >= 12) audyt = 18;
  else if (formN >= 8) audyt = 15;
  else if (formN >= 6) audyt = 12;
  else if (formN >= 3) audyt = 8;
  if (ctx.home.xg > 0 || ctx.away.xg > 0) audyt = Math.min(20, audyt + 2);
  if (ctx.h2hN >= 4) audyt = Math.min(20, audyt + 1);

  let ryz = 7;
  if (ctx.hv && clean) ryz = 3;
  if (ctx.hv && btts) ryz = 8;
  if (formN <= 6) ryz = Math.max(2, ryz - 2);
  if (ctx.ugo && clean) ryz = Math.max(2, ryz - 3);
  if (ctx.ugo && btts) ryz = Math.min(10, ryz + 2);

  const epl = [profil, flowE, market, audyt, ryz];
  reasons.push(`EPF ${epf.reduce((x, y) => x + y, 0).toFixed(1)}/10 · Poisson P=${(pJoint * 100).toFixed(1)}%`);
  return make(score, epf, epl, reasons);
}

export function buildExactPool(ctx: ExactCtx): ExactCandidate[] {
  const flip = (h: number, a: number) => (ctx.favorite === "away" ? `${a}:${h}` : `${h}:${a}`);
  const wanted = new Set<string>([
    flip(2, 0),
    flip(2, 1),
    flip(1, 0),
    flip(3, 0),
    flip(3, 1),
    flip(3, 2),
    "1:1",
    "0:0",
    "2:2",
  ]);
  if (ctx.hv) wanted.add(flip(4, 1));
  if (typeof ctx.oddsFav === "number" && ctx.oddsFav <= 1.3) {
    wanted.add(flip(4, 1));
    wanted.add(flip(4, 0));
    wanted.add(flip(5, 0));
    wanted.add(flip(5, 1));
  }
  const lH = cappedLambda(venueLambdaBlended(ctx.home, "H"), ctx.hv, ctx.oddsFav);
  const lA = cappedLambda(venueLambdaBlended(ctx.away, "A"), ctx.hv, ctx.oddsFav);
  if (lH > 0 || lA > 0) {
    for (let h = 0; h <= 4; h++) {
      for (let a = 0; a <= 3; a++) {
        const p = pois(h, lH) * pois(a, lA);
        if (p >= 0.045) wanted.add(`${h}:${a}`);
      }
    }
  }
  return [...wanted].map((sc) => scoreExact(sc, ctx));
}

export function mergeExactPool(ai: PhasePayload["candidates"], ctx: ExactCtx): ExactCandidate[] {
  const pool = buildExactPool(ctx);
  const have = new Set(pool.map((c) => c.score));
  for (const c of ai ?? []) {
    if (c?.score && !have.has(c.score)) {
      pool.push(scoreExact(c.score, ctx));
      have.add(c.score);
    }
  }
  return pool;
}
