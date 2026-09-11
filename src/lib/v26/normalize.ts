import type {
  FavoriteSide,
  FormMatch,
  H2HMatch,
  MatchInput,
  MatchProfile,
  PhasePayload,
  PrevSeasonFlags,
  PrevSeasonSplit,
  StepResult,
  TeamBlock,
} from "./types";
import { STEPS } from "./types";
import { fillPhase1Steps, fillPhase2Steps, overlaySteps } from "./fill-steps";
import { clipEarlyOutlierGoals } from "./exact-epf";

function num(v: unknown, d = 0): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : d;
}
function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : v == null ? d : String(v);
}
function bool(v: unknown, d = false): boolean {
  return typeof v === "boolean" ? v : d;
}

/** Kurs bukmacherski: 0 z szablonu scouta = brak, nie nadpisuje formularza. */
export function pickOdds(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (Number.isFinite(n) && n > 1) return n;
  return undefined;
}

export function mergeOdds(
  a?: { home?: number; draw?: number; away?: number; exacts?: Record<string, number> },
  b?: { home?: number; draw?: number; away?: number; exacts?: Record<string, number> },
): { home?: number; draw?: number; away?: number; exacts: Record<string, number> } {
  const exacts = { ...(a?.exacts ?? {}), ...(b?.exacts ?? {}) };
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(exacts)) {
    if (typeof v === "number" && v > 1) cleaned[k] = v;
  }
  return {
    home: pickOdds(b?.home) ?? pickOdds(a?.home),
    draw: pickOdds(b?.draw) ?? pickOdds(a?.draw),
    away: pickOdds(b?.away) ?? pickOdds(a?.away),
    exacts: cleaned,
  };
}

const SCORE_RE = /(\d+)\s*[:\-]\s*(\d+)/;

export function coerceForm(raw: unknown): FormMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: FormMatch[] = [];
  for (const item of raw.slice(0, 10)) {
    if (typeof item === "string") {
      const t = item.trim();
      if (/^[WLDn]$/i.test(t) || /^(win|loss|draw|ww|ll|dd)$/i.test(t)) continue;
      const sm = t.match(SCORE_RE);
      if (!sm) continue;
      const opp = t
        .replace(SCORE_RE, "")
        .replace(/\b(h|a|home|away|vs\.?|@)\b/gi, "")
        .trim();
      out.push({
        date: "",
        opponent: opp,
        ha: /\b(A|away)\b/i.test(t) ? "A" : "H",
        scoreFor: Number(sm[1]),
        scoreAgainst: Number(sm[2]),
        quality: "SREDNI",
      });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    let sf = num(x.scoreFor ?? x.gf ?? x.goalsFor, Number.NaN);
    let sa = num(x.scoreAgainst ?? x.ga ?? x.goalsAgainst, Number.NaN);
    if (!Number.isFinite(sf) || !Number.isFinite(sa)) {
      const sm = str(x.score ?? x.result ?? x.ft).match(SCORE_RE);
      if (sm) {
        sf = Number(sm[1]);
        sa = Number(sm[2]);
      }
    }
    if (!Number.isFinite(sf) || !Number.isFinite(sa)) continue;
    out.push({
      date: str(x.date),
      opponent: str(x.opponent ?? x.opp ?? x.team),
      ha: x.ha === "A" || x.venue === "A" || x.home === false ? "A" : "H",
      scoreFor: sf,
      scoreAgainst: sa,
      quality: x.quality === "TOP" || x.quality === "SLABY" ? x.quality : "SREDNI",
      comp: x.comp === "PUCHAR" || x.comp === "SPARING" || x.comp === "LIGA" ? x.comp : "LIGA",
      corners: Number.isFinite(num(x.corners, Number.NaN)) ? num(x.corners) : undefined,
      cards: Number.isFinite(num(x.cards, Number.NaN)) ? num(x.cards) : undefined,
      sot: Number.isFinite(num(x.sot, Number.NaN)) ? num(x.sot) : undefined,
      oppPos: Number.isFinite(num(x.oppPos, Number.NaN)) ? num(x.oppPos) : undefined,
      gf1h: Number.isFinite(num(x.gf1h, Number.NaN)) ? num(x.gf1h) : undefined,
      ga1h: Number.isFinite(num(x.ga1h, Number.NaN)) ? num(x.ga1h) : undefined,
      gf2h: Number.isFinite(num(x.gf2h, Number.NaN)) ? num(x.gf2h) : undefined,
      ga2h: Number.isFinite(num(x.ga2h, Number.NaN)) ? num(x.ga2h) : undefined,
    });
  }
  return out;
}

export type FactsQuality = {
  formN: number;
  formHome: number;
  formAway: number;
  h2hN: number;
  pos: number;
  pts: number;
  useful: boolean;
  reason: string;
};

/** V26 K0 wymaga realnej formy — sama tabela/punkty nie wystarczą do kroków. */
export function factsQuality(factsJson: string | undefined | null): FactsQuality {
  const empty: FactsQuality = { formN: 0, formHome: 0, formAway: 0, h2hN: 0, pos: 0, pts: 0, useful: false, reason: "brak factsJson" };
  if (!factsJson || factsJson.length < 20) return empty;
  let blob: Record<string, unknown>;
  try {
    blob = JSON.parse(factsJson) as Record<string, unknown>;
  } catch {
    return { ...empty, reason: "factsJson nie jest JSON" };
  }
  if (!blob || typeof blob !== "object") return { ...empty, reason: "pusty obiekt faktów" };
  const home = (blob.home ?? {}) as Record<string, unknown>;
  const away = (blob.away ?? {}) as Record<string, unknown>;
  const formHome = coerceForm(home.form).length;
  const formAway = coerceForm(away.form).length;
  const formN = formHome + formAway;
  const h2hN = coerceH2h(blob.h2h).length;
  const pos = Number(home.tablePos || 0) + Number(away.tablePos || 0);
  const pts = Number(home.points || 0) + Number(away.points || 0);
  // Minimum V26: przynajmniej 2 mecze formy łącznie (preferowane po 1 na stronę)
  if (formN < 2) {
    return {
      formN, formHome, formAway, h2hN, pos, pts,
      useful: false,
      reason: `za mało formy (formN=${formN}, home=${formHome}, away=${formAway}) — K0 wymaga meczów aktualnego sezonu`,
    };
  }
  return { formN, formHome, formAway, h2hN, pos, pts, useful: true, reason: "ok" };
}

export function coerceH2h(raw: unknown): H2HMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: H2HMatch[] = [];
  for (const item of raw.slice(0, 10)) {
    if (typeof item === "string") {
      const t = item.trim();
      const sm = t.match(SCORE_RE);
      if (!sm) continue;
      const parts = t.replace(SCORE_RE, " vs ").split(/\s+vs\s+/i);
      out.push({
        date: "",
        competition: "",
        home: (parts[0] || "").trim(),
        away: (parts[1] || "").trim(),
        score: `${sm[1]}:${sm[2]}`,
      });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const score = str(x.score ?? x.ft ?? x.result);
    const sm = score.match(SCORE_RE);
    if (!sm) continue;
    out.push({
      date: str(x.date),
      competition: str(x.competition),
      home: str(x.home ?? x.homeTeam),
      away: str(x.away ?? x.awayTeam),
      score: `${sm[1]}:${sm[2]}`,
    });
  }
  return out;
}

export function sanitizeFacts(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  for (const side of ["home", "away"]) {
    const t = o[side];
    if (t && typeof t === "object") {
      o[side] = { ...(t as Record<string, unknown>), form: coerceForm((t as Record<string, unknown>).form) };
    }
  }
  if (o.h2h) o.h2h = coerceH2h(o.h2h);
  return o;
}

export function mergeFactBlobs(a: unknown, b: unknown): unknown {
  const x = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
  const y = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  const pickForm = (left?: unknown, right?: unknown) => {
    const lf = coerceForm(left);
    const rf = coerceForm(right);
    return rf.length >= lf.length ? rf : lf;
  };
  const nz = (a: unknown, b: unknown) => {
    const bn = typeof b === "number" ? b : Number(b);
    const an = typeof a === "number" ? a : Number(a);
    if (bn && !Number.isNaN(bn)) return bn;
    if (an && !Number.isNaN(an)) return an;
    return 0;
  };
  const mergeTeam = (left: Record<string, unknown>, right: Record<string, unknown>) => {
    const keys = [
      "xg",
      "xga",
      "corners",
      "shotsOnTarget",
      "cards",
      "goalsAfter60Pct",
      "goalsSecondHalfPct",
      "csPctOverall",
      "csPctHome",
      "bttsPct",
      "over25Pct",
      "gfAvg",
      "gaAvg",
      "tablePos",
      "points",
      "played",
      "possession",
    ];
    const out: Record<string, unknown> = { ...left, ...right, form: pickForm(left.form, right.form) };
    for (const k of keys) out[k] = nz(left[k], right[k]);
    if (right.name) out.name = right.name;
    else if (left.name) out.name = left.name;
    return out;
  };
  const hx = (x.home && typeof x.home === "object" ? x.home : {}) as Record<string, unknown>;
  const hy = (y.home && typeof y.home === "object" ? y.home : {}) as Record<string, unknown>;
  const ax = (x.away && typeof x.away === "object" ? x.away : {}) as Record<string, unknown>;
  const ay = (y.away && typeof y.away === "object" ? y.away : {}) as Record<string, unknown>;
  const h2hX = coerceH2h(x.h2h);
  const h2hY = coerceH2h(y.h2h);
  const pickStr = (left: unknown, right: unknown) => {
    const r = typeof right === "string" ? right.trim() : "";
    const l = typeof left === "string" ? left.trim() : "";
    return r || l;
  };
  return {
    ...x,
    ...y,
    sources: [...(Array.isArray(x.sources) ? x.sources : []), ...(Array.isArray(y.sources) ? y.sources : [])],
    home: mergeTeam(hx, hy),
    away: mergeTeam(ax, ay),
    h2h: h2hY.length >= h2hX.length ? h2hY : h2hX,
    injuries: pickStr(x.injuries, y.injuries),
    coach: pickStr(x.coach, y.coach),
    weather: pickStr(x.weather, y.weather),
    odds: mergeOdds(
      (x.odds && typeof x.odds === "object" ? x.odds : {}) as {
        home?: number;
        draw?: number;
        away?: number;
        exacts?: Record<string, number>;
      },
      (y.odds && typeof y.odds === "object" ? y.odds : {}) as {
        home?: number;
        draw?: number;
        away?: number;
        exacts?: Record<string, number>;
      },
    ),
  };
}

export function compactPrior(prior?: string): string | undefined {
  if (!prior) return undefined;
  try {
    const p = JSON.parse(prior) as Record<string, unknown>;
    return JSON.stringify({
      match: p.match,
      odds: p.odds,
      favorite: p.favorite,
      profileDraft: p.profileDraft,
      home: p.home,
      away: p.away,
      h2h: p.h2h,
      h2hAvgGoals: p.h2hAvgGoals,
      injuries: p.injuries,
      squadVerified: p.squadVerified,
      keyOutFav: p.keyOutFav,
      gkOutFav: p.gkOutFav,
      massOutFav: p.massOutFav,
      keyOutUd: p.keyOutUd,
      gatesRaw: p.gatesRaw,
      candidates: p.candidates,
      confidenceParts: p.confidenceParts,
    });
  } catch {
    return prior.slice(0, 6000);
  }
}

function parsePrevSplit(v: unknown): PrevSeasonSplit | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const gfHome = num(r.gfHome);
  const gfAway = num(r.gfAway);
  if (!(gfHome > 0) && !(gfAway > 0)) return undefined;
  return {
    playedHome: num(r.playedHome),
    playedAway: num(r.playedAway),
    gfHome,
    gaHome: num(r.gaHome),
    gfAway,
    gaAway: num(r.gaAway),
    xgHome: num(r.xgHome) || undefined,
    xgaHome: num(r.xgaHome) || undefined,
    xgAway: num(r.xgAway) || undefined,
    xgaAway: num(r.xgaAway) || undefined,
  };
}

function parsePrevFlags(v: unknown): PrevSeasonFlags | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  return {
    coachChanged: bool(r.coachChanged),
    promoted: bool(r.promoted),
    relegated: bool(r.relegated),
    squadRebuild: bool(r.squadRebuild),
    newSigningsAttackDefense: num(r.newSigningsAttackDefense),
  };
}

function team(raw: Record<string, unknown> | undefined, fallback: string): TeamBlock {
  const r = raw ?? {};
  const form = coerceForm(r.form);
  const n = form.length;
  const clip = (g: number) => clipEarlyOutlierGoals(g, n);
  const homeM = form.filter((m) => m.ha === "H");
  const awayM = form.filter((m) => m.ha === "A");
  const avg = (sel: (m: FormMatch) => number, arr = form) =>
    arr.length ? Math.round((arr.reduce((a, m) => a + sel(m), 0) / arr.length) * 100) / 100 : 0;
  const pct = (pred: (m: FormMatch) => boolean, arr = form) =>
    arr.length ? Math.round((100 * arr.filter(pred).length) / arr.length) : 0;
  return {
    name: str(r.name, fallback),
    tablePos: num(r.tablePos),
    points: num(r.points),
    played: num(r.played) || n,
    form,
    csPctOverall: num(r.csPctOverall) || pct((m) => m.scoreAgainst === 0),
    csPctHome: num(r.csPctHome) || pct((m) => m.scoreAgainst === 0, homeM),
    csPctAway: num(r.csPctAway) || pct((m) => m.scoreAgainst === 0, awayM),
    bttsPct: num(r.bttsPct) || pct((m) => m.scoreFor > 0 && m.scoreAgainst > 0),
    over25Pct: num(r.over25Pct) || pct((m) => m.scoreFor + m.scoreAgainst >= 3),
    gfAvg: num(r.gfAvg) || avg((m) => clip(m.scoreFor)),
    gaAvg: num(r.gaAvg) || avg((m) => clip(m.scoreAgainst)),
    gfHome: num(r.gfHome) || avg((m) => clip(m.scoreFor), homeM),
    gaHome: num(r.gaHome) || avg((m) => clip(m.scoreAgainst), homeM),
    gfAway: num(r.gfAway) || avg((m) => clip(m.scoreFor), awayM),
    gaAway: num(r.gaAway) || avg((m) => clip(m.scoreAgainst), awayM),
    xg: num(r.xg),
    xga: num(r.xga),
    possession: num(r.possession),
    corners: num(r.corners),
    shotsOnTarget: num(r.shotsOnTarget),
    cards: num(r.cards),
    goalsAfter60Pct: num(r.goalsAfter60Pct),
    goalsSecondHalfPct: num(r.goalsSecondHalfPct),
    finishingLabel: finishingFrom(r.finishingLabel, num(r.gfAvg) || avg((m) => m.scoreFor), num(r.xg)),
    prevSeason: parsePrevSplit(r.prevSeason),
    prevFlags: parsePrevFlags(r.prevFlags),
    prevSource: str(r.prevSource) || undefined,
  };
}

function finishingFrom(
  raw: unknown,
  gf: number,
  xg: number,
): TeamBlock["finishingLabel"] {
  if (raw === "Elite Finisher" || raw === "Underperforming") return raw;
  if (xg > 0 && gf > 0) {
    const r = gf / xg;
    if (r >= 1.15) return "Elite Finisher";
    if (r <= 0.85) return "Underperforming";
  }
  return "Neutral";
}

function steps(raw: unknown): StepResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    const pts = Array.isArray(x.points) ? x.points : [];
    const audit = (x.audit ?? {}) as Record<string, unknown>;
    const numbers: Record<string, number | string> = {};
    if (x.numbers && typeof x.numbers === "object") {
      for (const [k, v] of Object.entries(x.numbers as Record<string, unknown>)) {
        numbers[k] = typeof v === "number" ? v : str(v);
      }
    }
    return {
      k: num(x.k),
      name: STEPS.find((st) => st.k === num(x.k))?.name || str(x.name),
      points: pts.length
        ? pts.map((p, i) => {
            const y = (p ?? {}) as Record<string, unknown>;
            return {
              n: num(y.n, i + 1),
              title: str(y.title),
              home: str(y.home),
              away: str(y.away),
              conclusion: str(y.conclusion),
            };
          })
        : str(x.summary)
          ? [{ n: 1, title: "Wniosek", home: "", away: "", conclusion: str(x.summary) }]
          : [],
      sources: Array.isArray(x.sources) ? x.sources.map((u) => str(u)) : [],
      numbers,
      summary: str(x.summary),
      audit: {
        pct: num(audit.pct, 100),
        good: str(audit.good),
        bad: str(audit.bad),
        impact: str(audit.impact),
      },
    };
  });
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  let body = (fence ? fence[1] : trimmed).trim();
  const start = body.indexOf("{");
  if (start < 0) throw new Error("Brak JSON w odpowiedzi modelu");
  body = body.slice(start);
  try {
    const end = body.lastIndexOf("}");
    return JSON.parse(end >= 0 ? body.slice(0, end + 1) : body);
  } catch {
    return JSON.parse(repairJson(body));
  }
}

function repairJson(s: string): string {
  let inStr = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.at(-1) === c) stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

export function normalizePayload(raw: unknown, fallbackHome: string, fallbackAway: string): PhasePayload {
  const r = (raw ?? {}) as Record<string, unknown>;
  const match = (r.match ?? {}) as Record<string, unknown>;
  const odds = (r.odds ?? {}) as Record<string, unknown>;
  const exactsRaw = (odds.exacts ?? {}) as Record<string, unknown>;
  const exacts: Record<string, number> = {};
  for (const [k, v] of Object.entries(exactsRaw)) {
    const n = pickOdds(v);
    if (n != null) exacts[k] = n;
  }
  const gates = (r.gatesRaw ?? {}) as Record<string, unknown>;
  const conf = (r.confidenceParts ?? {}) as Record<string, unknown>;
  const market = (r.market ?? {}) as Record<string, unknown>;
  const kehnyg: Record<string, number> = {};
  if (market.kehnyg && typeof market.kehnyg === "object") {
    for (const [k, v] of Object.entries(market.kehnyg as Record<string, unknown>)) kehnyg[k] = num(v);
  }
  const fav = r.favorite;
  const favorite: FavoriteSide = fav === "away" || fav === "none" ? fav : "home";
  const profile = str(r.profileDraft, "Controlled Home Favorite") as MatchProfile;
  const home = team(r.home as Record<string, unknown>, fallbackHome);
  const away = team(r.away as Record<string, unknown>, fallbackAway);
  const h2h = coerceH2h(r.h2h);
  const h2hAvgGoals =
    num(r.h2hAvgGoals) ||
    (h2h.length
      ? Math.round(
          (h2h.reduce((acc, m) => {
            const sm = m.score.match(SCORE_RE);
            return acc + (sm ? Number(sm[1]) + Number(sm[2]) : 0);
          }, 0) /
            h2h.length) *
            100,
        ) / 100
      : 0);

  const cands = Array.isArray(r.candidates) ? r.candidates : [];
  const base: PhasePayload = {
    sources: Array.isArray(r.sources) ? r.sources.map((s) => str(s)) : [],
    match: {
      league: str(match.league),
      kickoff: str(match.kickoff),
      homePos: num(match.homePos) || home.tablePos,
      awayPos: num(match.awayPos) || away.tablePos,
      ptsHome: num(match.ptsHome) || home.points,
      ptsAway: num(match.ptsAway) || away.points,
      motivation: str(match.motivation),
    },
    odds: {
      home: pickOdds(odds.home),
      draw: pickOdds(odds.draw),
      away: pickOdds(odds.away),
      exacts,
    },
    favorite,
    profileDraft: profile,
    home,
    away,
    h2h,
    h2hAvgGoals,
    injuries: str(r.injuries),
    squadVerified: r.squadVerified === true || r.squadVerified === "true" || r.squadFetched === true || bool(r.squadVerified),
    keyOutFav: r.keyOutFav === true || bool(r.keyOutFav),
    gkOutFav: r.gkOutFav === true || bool(r.gkOutFav),
    massOutFav: r.massOutFav === true || bool(r.massOutFav),
    keyOutUd: r.keyOutUd === true || bool(r.keyOutUd),
    weather: str(r.weather),
    coach: str(r.coach),
    steps: steps(r.steps),
    gatesRaw: {
      csFavLast10: num(gates.csFavLast10) || (favorite === "away" ? away.csPctOverall : home.csPctOverall),
      csFavLast5Venue: num(gates.csFavLast5Venue),
      goalsConcededFavLast5Venue: num(gates.goalsConcededFavLast5Venue),
      bttsRelevant: num(gates.bttsRelevant) || Math.round((home.bttsPct + away.bttsPct) / 2),
      avgGoalsRelevant: num(gates.avgGoalsRelevant) || Math.max(home.gfAvg + home.gaAvg, away.gfAvg + away.gaAvg),
      favConcededInLast10Pct: num(gates.favConcededInLast10Pct),
      underdogOffQuality: bool(gates.underdogOffQuality),
      matchesPlayedFav: num(gates.matchesPlayedFav) || (favorite === "away" ? away.played : home.played),
      lateGoalUnderdogPct: num(gates.lateGoalUnderdogPct) || (favorite === "away" ? home.goalsAfter60Pct : away.goalsAfter60Pct),
      leagueGapScore: num(gates.leagueGapScore),
      xgFavVsThisTier: num(gates.xgFavVsThisTier) || (favorite === "away" ? away.xg : home.xg),
      udCsPct: num(gates.udCsPct),
      opponentGfVenue: num(gates.opponentGfVenue),
      opponentBttsPct: num(gates.opponentBttsPct),
    },
    candidates: cands.map((c) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const epf = Array.isArray(x.epfParts) ? x.epfParts.map((n) => num(n)) : [0, 0, 0, 0, 0];
      const epl = Array.isArray(x.eplParts) ? x.eplParts.map((n) => num(n)) : [0, 0, 0, 0, 0];
      return {
        score: str(x.score),
        epfParts: [epf[0] || 0, epf[1] || 0, epf[2] || 0, epf[3] || 0, epf[4] || 0] as [
          number,
          number,
          number,
          number,
          number,
        ],
        eplParts: [epl[0] || 0, epl[1] || 0, epl[2] || 0, epl[3] || 0, epl[4] || 0] as [
          number,
          number,
          number,
          number,
          number,
        ],
        reasons: Array.isArray(x.reasons) ? x.reasons.map((s) => str(s)) : [],
      };
    }),
    confidenceParts: {
      forma: num(conf.forma),
      xg: num(conf.xg),
      h2h: num(conf.h2h),
      homeAway: num(conf.homeAway) || num(conf.atakObrona),
      qoi: num(conf.qoi),
      flow: num(conf.flow),
      market: num(conf.market),
      squad: num(conf.squad) || num(conf.override),
      sample: num(conf.sample),
    },
    market: {
      movement: str(market.movement),
      kehnyg,
      consensus: str(market.consensus),
    },
    gustawK4: str(r.gustawK4),
    gustawK12: str(r.gustawK12),
    gustawK17: str(r.gustawK17),
    statsNotes: str(r.statsNotes),
  };
  base.steps = overlaySteps(base.steps, fillPhase1Steps(base));
  return base;
}

function mergeTeam(base: TeamBlock, extra: TeamBlock): TeamBlock {
  return mergeTeamBlocks(base, extra, "keep");
}

/** Pole-po-polu: zero nie kasuje SOT/kartek/xG. prefer="extra" → nowsza faza wygrywa gdy ma liczbę. */
export function mergeTeamBlocks(keep: TeamBlock, overlay?: TeamBlock | null, prefer: "keep" | "extra" = "extra"): TeamBlock {
  if (!overlay) return keep;
  const left = prefer === "keep" ? keep : overlay;
  const right = prefer === "keep" ? overlay : keep;
  const nz = (a: number, b: number) => (a && !Number.isNaN(a) ? a : b) || 0;
  const form = overlay.form.length >= keep.form.length ? overlay.form : keep.form;
  return {
    ...keep,
    name: overlay.name || keep.name,
    form,
    tablePos: nz(left.tablePos, right.tablePos),
    points: nz(left.points, right.points),
    played: nz(left.played, right.played),
    csPctOverall: nz(left.csPctOverall, right.csPctOverall),
    csPctHome: nz(left.csPctHome, right.csPctHome),
    csPctAway: nz(left.csPctAway, right.csPctAway),
    bttsPct: nz(left.bttsPct, right.bttsPct),
    over25Pct: nz(left.over25Pct, right.over25Pct),
    gfAvg: nz(left.gfAvg, right.gfAvg),
    gaAvg: nz(left.gaAvg, right.gaAvg),
    gfHome: nz(left.gfHome, right.gfHome),
    gaHome: nz(left.gaHome, right.gaHome),
    gfAway: nz(left.gfAway, right.gfAway),
    gaAway: nz(left.gaAway, right.gaAway),
    xg: nz(left.xg, right.xg),
    xga: nz(left.xga, right.xga),
    possession: nz(left.possession, right.possession),
    corners: nz(left.corners, right.corners),
    shotsOnTarget: nz(left.shotsOnTarget, right.shotsOnTarget),
    cards: nz(left.cards, right.cards),
    goalsAfter60Pct: nz(left.goalsAfter60Pct, right.goalsAfter60Pct),
    goalsSecondHalfPct: nz(left.goalsSecondHalfPct, right.goalsSecondHalfPct),
    finishingLabel:
      overlay.finishingLabel !== "Neutral" ? overlay.finishingLabel : keep.finishingLabel,
    prevSeason: overlay.prevSeason ?? keep.prevSeason,
    prevFlags: overlay.prevFlags ?? keep.prevFlags,
    prevSource: overlay.prevSource || keep.prevSource,
  };
}

export function backfillPayload(p: PhasePayload, factsJson: string | undefined, input: MatchInput): PhasePayload {
  p.odds = mergeOdds(p.odds, {
    home: input.oddsHome,
    draw: input.oddsDraw,
    away: input.oddsAway,
    exacts: input.exactOdds,
  });
  if (factsJson) {
    try {
      const f = JSON.parse(factsJson) as Record<string, unknown>;
      p.home = mergeTeam(p.home, team(f.home as Record<string, unknown>, p.home.name));
      p.away = mergeTeam(p.away, team(f.away as Record<string, unknown>, p.away.name));
      const h2h = coerceH2h(f.h2h);
      if (h2h.length > p.h2h.length) p.h2h = h2h;
      if (!p.h2hAvgGoals && typeof f.h2hAvgGoals === "number") p.h2hAvgGoals = f.h2hAvgGoals;
      if (!p.injuries) p.injuries = str(f.injuries);
      const outHome = (f.outHome && typeof f.outHome === "object" ? f.outHome : {}) as Record<string, unknown>;
      const outAway = (f.outAway && typeof f.outAway === "object" ? f.outAway : {}) as Record<string, unknown>;
      if (f.squadFetched === true || f.squadVerified === true || f.squadVerified === "true") p.squadVerified = true;
      const favIsAway = p.favorite === "away";
      const favOut = favIsAway ? outAway : outHome;
      const udOut = favIsAway ? outHome : outAway;
      if (favOut.gk === true) p.gkOutFav = true;
      if (favOut.key === true) p.keyOutFav = true;
      if (favOut.mass === true) p.massOutFav = true;
      if (udOut.key === true) p.keyOutUd = true;
      if (bool(f.keyOutFav)) p.keyOutFav = true;
      if (bool(f.gkOutFav)) p.gkOutFav = true;
      if (bool(f.massOutFav)) p.massOutFav = true;
      if (bool(f.keyOutUd)) p.keyOutUd = true;
      if (!p.weather) p.weather = str(f.weather);
      if (!p.coach) p.coach = str(f.coach);
      const fo = (f.odds ?? {}) as Record<string, unknown>;
      p.odds = mergeOdds(p.odds, {
        home: pickOdds(fo.home),
        draw: pickOdds(fo.draw),
        away: pickOdds(fo.away),
      });
      const fm = (f.match && typeof f.match === "object" ? f.match : {}) as Record<string, unknown>;
      if (!p.match.league) p.match.league = str(fm.league) || str(f.league) || input.league;
      if (!p.match.kickoff) p.match.kickoff = str(fm.kickoff) || input.kickoff || p.match.kickoff;
    } catch {
      /* facts optional */
    }
  }
  if (!p.match.league) p.match.league = input.league;
  if (!p.match.kickoff && input.kickoff) p.match.kickoff = input.kickoff;
  if (typeof input.oddsHome === "number" && typeof input.oddsAway === "number") {
    if (input.oddsAway + 0.02 < input.oddsHome) p.favorite = "away";
    else if (input.oddsHome + 0.02 < input.oddsAway) p.favorite = "home";
  }
  if (p.favorite === "away" && (p.profileDraft === "Controlled Home Favorite" || p.profileDraft === "Strong Home Favorite" || !p.profileDraft)) {
    const o = input.oddsAway ?? p.odds.away;
    p.profileDraft = typeof o === "number" && o <= 2.1 ? "Controlled Away Favorite" : "Away Favorite";
  }
  const kick = Date.parse(input.kickoff || "") || Date.now();
  const cut = kick - 120 * 86400000;
  const recent = (form: typeof p.home.form) => {
    const r = form.filter((m) => !m.date || Number.isNaN(Date.parse(m.date)) || Date.parse(m.date) >= cut);
    return r.length ? r : form;
  };
  p.home = { ...p.home, form: recent(p.home.form) };
  p.away = { ...p.away, form: recent(p.away.form) };
  const favTeam = p.favorite === "away" ? p.away : p.home;
  if (!p.gatesRaw.favConcededInLast10Pct && favTeam.form.length) {
    p.gatesRaw.favConcededInLast10Pct = Math.round(
      (100 * favTeam.form.filter((m) => m.scoreAgainst > 0).length) / favTeam.form.length,
    );
  }
  if (!p.gatesRaw.csFavLast10) {
    p.gatesRaw.csFavLast10 = favTeam.csPctOverall;
  }
  if (!p.gatesRaw.matchesPlayedFav) p.gatesRaw.matchesPlayedFav = favTeam.played;
  // League Gap Score = poziom ligi, nie Δ miejsc. Ten sam mecz ligowy = 0 (NIEAKTYWNA).
  if (!p.gatesRaw.leagueGapScore) {
    p.gatesRaw.leagueGapScore = 0;
  }
  p.steps = overlaySteps(p.steps, fillPhase1Steps(p));
  if (input.squadVerified === true) p.squadVerified = true;
  if (input.keyOutFav) p.keyOutFav = true;
  if (input.gkOutFav) p.gkOutFav = true;
  if (input.massOutFav) p.massOutFav = true;
  if (input.keyOutUd) p.keyOutUd = true;
  if (input.squadNote && !/^\s*$/.test(input.squadNote)) {
    p.injuries = p.injuries ? `${input.squadNote} | ${p.injuries}` : input.squadNote;
  }
  const note = `${p.injuries || ""} ${input.squadNote || ""}`.toLowerCase();
  if (!p.keyOutFav) p.keyOutFav = /(kluczow|captain|napastnik).*(out|kontuz|zawiesz)/i.test(note);
  if (!p.gkOutFav) p.gkOutFav = /bramkarz.*(out|kontuz|zawiesz)/i.test(note);
  if (!p.massOutFav) p.massOutFav = /\b(3\+|trzech|masa).*(out|absenc)/i.test(note);
  if (!p.keyOutUd) p.keyOutUd = /underdog.*(kluczow|napastnik).*(out)|ud.*(out|kontuz).*klucz/i.test(note);
  return p;
}

export type T60Overlay = {
  squadVerified: boolean;
  keyOutFav: boolean;
  gkOutFav: boolean;
  massOutFav: boolean;
  keyOutUd: boolean;
  injuries: string;
  xiReady: boolean;
  p2DeadHome: boolean;
  note: string;
};

type XiPlayer = { name: string; pos: string };

function xiCount(kind: "g" | "f", xi: XiPlayer[]) {
  return xi.filter((x) => {
    const p = (x.pos || "").toLowerCase();
    if (kind === "g") return /^g\b|keeper|goal/.test(p);
    return /^f\b|attack|forward|striker|winger|napast/.test(p);
  }).length;
}

function nameInXi(name: string, xi: XiPlayer[]) {
  const n = name.toLowerCase().trim();
  if (!n) return false;
  return xi.some((x) => {
    const m = x.name.toLowerCase();
    return m === n || m.includes(n) || n.includes(m);
  });
}

/** Overlay T−60: tylko flagi S1–S4 + linia XI. Nie rusza formy, H2H, Fill. */
export function buildT60Overlay(args: {
  favorite: FavoriteSide;
  homeName: string;
  awayName: string;
  homeXi: XiPlayer[];
  awayXi: XiPlayer[];
  outHome: { names: string[]; gk: boolean; key: boolean; mass: boolean };
  outAway: { names: string[]; gk: boolean; key: boolean; mass: boolean };
}): T60Overlay {
  const homeReady = args.homeXi.length >= 11;
  const awayReady = args.awayXi.length >= 11;
  const partial = args.homeXi.length >= 8 && args.awayXi.length >= 8 && args.homeXi.length + args.awayXi.length >= 19;
  const xiReady = (homeReady && awayReady) || partial;
  const p2DeadHome = xiReady && xiCount("f", args.homeXi) === 0;
  if (!xiReady) {
    return {
      squadVerified: false,
      keyOutFav: false,
      gkOutFav: false,
      massOutFav: false,
      keyOutUd: false,
      injuries: "T-60 XI: składy nieopublikowane — squadVerified=false, S1 cap 69%, NO EXECUTION.",
      xiReady: false,
      p2DeadHome: false,
      note: "XI nieopublikowane. Conf cap 69%. Spróbuj ~60 min przed kickoff.",
    };
  }
  const favIsAway = args.favorite === "away";
  const favXi = favIsAway ? args.awayXi : args.homeXi;
  const udXi = favIsAway ? args.homeXi : args.awayXi;
  const favOut = favIsAway ? args.outAway : args.outHome;
  const udOut = favIsAway ? args.outHome : args.outAway;
  const favOutNotIn = favOut.names.filter((n) => !nameInXi(n, favXi));
  const udOutNotIn = udOut.names.filter((n) => !nameInXi(n, udXi));
  const gkOutFav = xiCount("g", favXi) === 0 || (favOut.gk && favOutNotIn.length > 0);
  const keyOutFav = xiCount("f", favXi) === 0 || (favOut.key && favOutNotIn.length > 0);
  const massOutFav = favOut.mass;
  const keyOutUd = xiCount("f", udXi) === 0 || (udOut.key && udOutNotIn.length > 0);
  const hf = xiCount("f", args.homeXi);
  const fmtXi = (xi: XiPlayer[]) => xi.map((x) => x.name).filter(Boolean).join(", ");
  const injuries = [
    `T-60 XI: ${args.homeName} ${args.homeXi.length} (F=${hf}) · ${args.awayName} ${args.awayXi.length}. XI potwierdzone${partial && !(homeReady && awayReady) ? " (API niepełne, <11 z jednej strony)" : ""}.`,
    `${args.homeName}: ${fmtXi(args.homeXi)}. ${args.awayName}: ${fmtXi(args.awayXi)}.`,
    p2DeadHome ? "P2 atak gospodarza martwy (0 napastników w XI)." : "P2 atak gospodarza OK po XI.",
    keyOutFav ? "keyOut faworyta TAK." : "",
    gkOutFav ? "GK out faworyta TAK." : "",
    massOutFav ? "3+ absencji faworyta TAK." : "",
  ].filter(Boolean).join(" ");
  return {
    squadVerified: true,
    keyOutFav,
    gkOutFav,
    massOutFav,
    keyOutUd,
    injuries,
    xiReady: true,
    p2DeadHome,
    note: injuries,
  };
}

export function applyT60Overlay(p: PhasePayload, o: T60Overlay): PhasePayload {
  const stripped = (p.injuries || "").replace(/T-60 XI:[^|]*/g, "").replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim();
  return {
    ...p,
    squadVerified: o.squadVerified,
    keyOutFav: o.keyOutFav,
    gkOutFav: o.gkOutFav,
    massOutFav: o.massOutFav,
    keyOutUd: o.keyOutUd,
    injuries: o.injuries ? (stripped ? `${o.injuries} | ${stripped}` : o.injuries) : stripped,
  };
}

export function payloadFromFacts(factsJson: string, input: MatchInput): PhasePayload {
  let parsed: unknown = {};
  if (factsJson) {
    try {
      parsed = JSON.parse(factsJson);
    } catch {
      try {
        parsed = extractJson(factsJson);
      } catch {
        parsed = {};
      }
    }
  }
  return backfillPayload(normalizePayload(parsed, input.home, input.away), factsJson, input);
}

export function closeFromPrior(priorJson: string, input: MatchInput): PhasePayload {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(priorJson);
  } catch {
    try {
      parsed = extractJson(priorJson);
    } catch {
      parsed = {};
    }
  }
  const p = backfillPayload(normalizePayload(parsed, input.home, input.away), undefined, input);
  p.steps = [...p.steps.filter((s) => s.k <= 11), ...fillPhase2Steps(p)];
  return p;
}
