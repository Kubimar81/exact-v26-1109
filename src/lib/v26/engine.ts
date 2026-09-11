import { buildMarkets } from "./markets";
import { cappedLambda, gfGaForHv, mergeExactPool, venueLambdaBlended, type ExactCtx } from "./exact-epf";
import {
  isAllsvenskan,
  isHighVarianceLeague,
  isMediumVarianceLeague,
  isSuperettan,
  isUgoPlusLeague,
  isVeikkausliiga,
  clubNameMatches,
} from "./leagues";
import { fillPhase1Steps, fillPhase2Steps, overlaySteps } from "./fill-steps";
import { mergeOdds, mergeTeamBlocks, pickOdds } from "./normalize";
import { attachPrevSeason, blendWeight, venueNThisSeason } from "./prev-season";
import type {
  ConfidenceBreakdown,
  CSLean,
  EngineOutput,
  ExactCandidate,
  ExactRole,
  FavoriteSide,
  FormMatch,
  Gates,
  GateRecord,
  H2HMatch,
  MatchInput,
  MatchProfile,
  PhasePayload,
  StepResult,
  TeamBlock,
} from "./types";

/** Coin-flip: Δ kursu < 0.35 (Malmö 2.60–2.47). Nie próg „oba >2.30” (Málaga 2.35 zostaje home). */
export function isCoinFlipOdds(home?: number, away?: number): boolean {
  if (typeof home !== "number" || typeof away !== "number") return false;
  if (!(home > 1) || !(away > 1)) return false;
  return Math.abs(home - away) < 0.35;
}

function inferFavorite(input: MatchInput, draft: FavoriteSide): FavoriteSide {
  if (typeof input.oddsHome === "number" && typeof input.oddsAway === "number") {
    if (isCoinFlipOdds(input.oddsHome, input.oddsAway)) return "none";
    if (input.oddsAway + 0.02 < input.oddsHome) return "away";
    if (input.oddsHome + 0.02 < input.oddsAway) return "home";
    return "none";
  }
  return draft || "home";
}

function inferProfile(fav: FavoriteSide, odds: number | undefined, draft: MatchProfile): MatchProfile {
  if (draft && draft !== "Controlled Home Favorite") return draft;
  if (fav === "none") return "Balanced";
  if (typeof odds === "number") {
    if (odds <= 1.4) return fav === "away" ? "High Dominator" : "Strong Home Favorite";
    if (odds <= 2.1) return fav === "away" ? "Controlled Away Favorite" : "Controlled Home Favorite";
  }
  return fav === "away" ? "Away Favorite" : "Slight Home Edge";
}

function sampleSizePoints(n: number, hv: boolean): number {
  if (n <= 2) return 0;
  if (n === 3) return 1;
  if (n <= 5 || hv) return 3;
  return 5;
}

function squadAvailabilityPoints(injuries: string, verified = false): number {
  const t = (injuries || "").toLowerCase();
  if (!verified && !t.trim()) return 4;
  if (!verified) return 5;
  const emptyOk = /brak zg[lł]oszon|brak (strat|kontuz|absenc)|komplet|full squad|bez (długotermin|kontuz)|kadra komplet/.test(t);
  const realOut = /(out|injury|zawiesz|wątpliw|doubt)/i.test(t.replace(/brak zg[lł]oszonych kontuzji[^.]*.?/gi, ""));
  if (emptyOk && !realOut) return 9;
  if (/(kluczow|captain|napastnik|bramkarz).*(out|kontuz|zawiesz)|czerwon/.test(t)) return 3;
  if (/kontuz|out|zawiesz|absenc|wątpliw/.test(t)) return 5;
  return 6;
}

function qoiMotivationPoints(gap: number, hasTable: boolean, motivation: string): number {
  const mot = (motivation || "").toLowerCase();
  const highStake = /must-win|tytuł|tytul|baraż|baraz|awans|utrzym|degrad|finał|final/.test(mot);
  const lowStake = /rotacj|sparing|prestiż|prestiz|niska stawka/.test(mot);
  const udStake = /underdog.*(must-win|awans|utrzym)/.test(mot);
  if (udStake) return 1;
  if (!hasTable) return 5;
  if (gap >= 8 && highStake) return 10;
  if (gap >= 8 || highStake) return 8;
  if (lowStake || gap <= 2) return 4;
  if (gap >= 3) return 6;
  return 5;
}

function homeAwaySplitPoints(fav: TeamBlock, ud: TeamBlock, favorite: FavoriteSide, sampleN: number): number {
  const gf = favorite === "away" ? (fav.gfAway || fav.gfAvg) : (fav.gfHome || fav.gfAvg);
  const ga = favorite === "away" ? (fav.gaAway || fav.gaAvg) : (fav.gaHome || fav.gaAvg);
  const udGf = favorite === "home" ? (ud.gfAway || ud.gfAvg)
    : favorite === "away" ? (ud.gfHome || ud.gfAvg) : ud.gfAvg;
  const dGf = (gf || 0) - (udGf || 0);
  let pts = 2;
  if (gf >= 2.80 && ga <= 0.70 && (udGf || 99) <= 1.20 && dGf >= 1.80) pts = 15;
  else if (gf >= 2.40 && ga <= 0.90 && dGf >= 1.30) pts = 13;
  else if (gf >= 2.10 && ga <= 1.10 && dGf >= 0.90) pts = 11;
  else if (dGf >= 0.50) pts = 8;
  else if (dGf >= 0.20) pts = 5;
  else pts = 2;
  if (sampleN <= 3) pts = Math.min(pts, 11);
  else if (sampleN <= 5) pts = Math.min(pts, 13);
  return pts;
}

/** Forma z L5: 5/5 + GD≥+8 → 18–20. 3W bez porażki → 12–14. 2W–3D GD+3 → 8–11. */
export function formScoreFromLast5(form: FormMatch[]): number {
  const last5 = (form || []).slice(0, 5);
  if (!last5.length) return 0;
  let w = 0;
  let d = 0;
  let gd = 0;
  for (const m of last5) {
    gd += (m.scoreFor || 0) - (m.scoreAgainst || 0);
    if (m.scoreFor > m.scoreAgainst) w++;
    else if (m.scoreFor === m.scoreAgainst) d++;
  }
  if (w === 5 && gd >= 8) return gd >= 12 ? 20 : 18;
  if (w === 5) return clamp(15 + Math.min(2, Math.floor(gd / 3)), 15, 17);
  if (w === 4) return clamp(12 + Math.min(3, Math.max(0, gd)), 12, 15);
  if (w === 3 && last5.every((m) => m.scoreFor >= m.scoreAgainst))
    return clamp(12 + Math.min(2, Math.floor(Math.max(0, gd) / 4)), 12, 14);
  if (w === 3) return clamp(10 + Math.min(3, Math.max(0, Math.floor(gd / 2))), 10, 13);
  if (w === 2) return clamp(8 + Math.min(3, Math.max(0, gd)), 8, 11);
  if (w === 1) return clamp(5 + Math.min(3, d), 5, 8);
  return clamp(2 + d, 2, 6);
}

/** H2H tylko z ostatnich 36 miesięcy — 2019/2020 nie punktuje. */
export function recentH2h(list: H2HMatch[] | undefined, kickoff?: string): H2HMatch[] {
  const rows = Array.isArray(list) ? list : [];
  const end = kickoff ? Date.parse(kickoff) : Date.now();
  const to = Number.isFinite(end) ? end : Date.now();
  const from = to - 36 * 30.44 * 24 * 3600 * 1000;
  return rows.filter((h) => {
    const t = Date.parse(h.date || "");
    return Number.isFinite(t) && t >= from && t <= to + 2 * 24 * 3600 * 1000;
  });
}

function h2hPoints(rows: H2HMatch[], favorite: FavoriteSide, favName = ""): number {
  if (!rows.length) return 5;
  if (favorite === "none" || !favName) return 5;
  const last5 = rows.slice(0, 5);
  let w = 0, d = 0, l = 0, used = 0;
  for (const m of last5) {
    const [hg, ag] = (m.score || "").split(/[:\-]/).map((n) => Number(n.trim()));
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const favHome = sameClub(m.home, favName);
    const favAway = sameClub(m.away, favName);
    let fg: number;
    let ug: number;
    if (favHome) { fg = hg; ug = ag; }
    else if (favAway) { fg = ag; ug = hg; }
    else continue;
    used++;
    if (fg > ug) w++;
    else if (fg === ug) d++;
    else l++;
  }
  if (!used) return 5;
  if (w === 0 && l === used) return 0;
  if (w >= 4) return 9;
  if (w >= 2) return 6;
  if (w + d > 0 && l > 0) return 4;
  return 2;
}

function xgPoints(favXg: number, udXg: number, favGf: number): number {
  if (!(favXg > 0)) {
    if (favGf >= 2.4) return 12;
    if (favGf > 0) return 8;
    return 7;
  }
  if (udXg > 0 && udXg > favXg) return 2;
  if (favXg >= 2.20 && favXg > (udXg || 0) + 0.3) return 14;
  if (favXg >= 1.80 || favGf >= 2.40) return 11;
  if (favXg >= 1.50) return 8;
  if (favXg >= 1.20) return 5;
  return 2;
}

function marketAlignmentPoints(opts: {
  modelFav1x2Pct?: number;
  impliedFav1x2Pct?: number;
}): number {
  const { modelFav1x2Pct, impliedFav1x2Pct } = opts;
  if (modelFav1x2Pct == null || impliedFav1x2Pct == null) return 4;
  const pp = modelFav1x2Pct - impliedFav1x2Pct;
  if (pp >= 12) return 10;
  if (pp >= 7) return 8;
  if (pp >= 3) return 6;
  if (pp >= -2) return 4;
  return 1;
}

function flowDirectionPoints(opts: {
  directionTak: boolean;
  coinFlip: boolean;
  signalsAgree: number;
  softOrEarlyOrHv: boolean;
}): number {
  if (opts.coinFlip || !opts.directionTak) return 1;
  if (opts.signalsAgree <= 1) return 3;
  if (opts.softOrEarlyOrHv) return 6;
  if (opts.signalsAgree === 2) return 8;
  return 10;
}

/** Miara A: waga modelu 1X2 faworyta z xG/GF/luki/formy. Zakaz EPL% − implied exact. */
function estimateModelFav1x2Pct(fav: TeamBlock, ud: TeamBlock, gap: number): number | undefined {
  const last5 = (fav.form || []).slice(0, 5);
  const favAtt = fav.xg > 0 ? fav.xg : fav.gfAvg || 0;
  const udAtt = ud.xg > 0 ? ud.xg : ud.gfAvg || 0;
  if (!(favAtt > 0 || udAtt > 0 || gap > 0 || last5.length >= 3)) return undefined;
  let pct = 52;
  if (favAtt > 0 || udAtt > 0) pct += clamp((favAtt - udAtt) * 14, -22, 28);
  if (gap > 0) pct += clamp(gap * 1.1, 0, 16);
  if (last5.length) {
    const w = last5.filter((m) => m.scoreFor > m.scoreAgainst).length;
    pct += clamp((w / last5.length - 0.4) * 28, -14, 18);
  }
  return clamp(Math.round(pct), 18, 90);
}

function countSignalsAgree(
  favorite: FavoriteSide,
  input: MatchInput,
  fav: TeamBlock,
  ud: TeamBlock,
  p: PhasePayload,
): number {
  if (favorite === "none") return 0;
  let n = 0;
  if (typeof input.oddsHome === "number" && typeof input.oddsAway === "number") {
    const favOdds = favorite === "away" ? input.oddsAway : input.oddsHome;
    const udOdds = favorite === "away" ? input.oddsHome : input.oddsAway;
    if (favOdds < udOdds) n++;
  }
  if ((fav.xg || 0) > 0 || (ud.xg || 0) > 0) {
    if ((fav.xg || 0) >= (ud.xg || 0)) n++;
  }
  const hp = p.home.tablePos || p.match?.homePos || 0;
  const ap = p.away.tablePos || p.match?.awayPos || 0;
  if (hp > 0 && ap > 0) {
    const favPos = favorite === "away" ? ap : hp;
    const udPos = favorite === "away" ? hp : ap;
    if (favPos < udPos) n++;
  }
  return n;
}

function computedConfidence(
  p: PhasePayload,
  input: MatchInput,
  favorite: FavoriteSide,
  hvActive: boolean,
  flowOpts: { directionTak: boolean; coinFlip: boolean; softOrEarlyOrHv: boolean },
) {
  const fav = favorite === "away" ? p.away : p.home;
  const ud = favorite === "away" ? p.home : p.away;
  const formN = Array.isArray(fav?.form) ? fav.form.length : 0;
  const n = Math.max(formN, fav?.played || 0, p.gatesRaw?.matchesPlayedFav || 0);
  const forma = formScoreFromLast5(fav?.form || []);
  const xg = xgPoints(fav.xg || 0, ud.xg || 0, fav.gfAvg || 0);
  const h2hRows = recentH2h(p.h2h, input.kickoff);
  const favName = favorite === "away" ? (p.away?.name || input.away) : (p.home?.name || input.home);
  const h2h = h2hPoints(h2hRows, favorite, favName);
  const homeAway = homeAwaySplitPoints(fav, ud, favorite, n);
  const gap = Math.abs((p.home.tablePos || 0) - (p.away.tablePos || 0));
  const hasTable = !!(p.home.tablePos || p.away.tablePos || p.match?.homePos || p.match?.awayPos);
  const qoi = qoiMotivationPoints(gap || Math.abs((p.match?.homePos || 0) - (p.match?.awayPos || 0)), hasTable, p.match?.motivation || "");
  const signalsAgree = countSignalsAgree(favorite, input, fav, ud, p);
  const flow = flowDirectionPoints({
    directionTak: flowOpts.directionTak,
    coinFlip: flowOpts.coinFlip,
    signalsAgree,
    softOrEarlyOrHv: flowOpts.softOrEarlyOrHv,
  });
  const odds = favorite === "away" ? input.oddsAway : favorite === "home" ? input.oddsHome : Math.min(input.oddsHome || 99, input.oddsAway || 99);
  const impliedFav1x2Pct = typeof odds === "number" && odds > 1 ? 100 / odds : undefined;
  const modelFav1x2Pct = estimateModelFav1x2Pct(fav, ud, gap || Math.abs((p.match?.homePos || 0) - (p.match?.awayPos || 0)));
  const market = marketAlignmentPoints({ modelFav1x2Pct, impliedFav1x2Pct });
  const squadVerified = !!(p.squadVerified || input.squadVerified);
  const squad = squadAvailabilityPoints(p.injuries || input.squadNote || "", squadVerified);
  const sample = sampleSizePoints(n, hvActive);
  return { forma, xg, h2h, homeAway, qoi, flow, market, squad, sample };
}

function gate(active: boolean, data: string, reason: string): GateRecord {
	return {
		active,
		status: active ? "AKTYWNA" : "NIEAKTYWNA",
		data,
		reason
	};
}
function favOdds(input: MatchInput, favorite: FavoriteSide) {
	if (favorite === "home") return input.oddsHome;
	if (favorite === "away") return input.oddsAway;
	if (input.oddsHome && input.oddsAway) return Math.min(input.oddsHome, input.oddsAway);
	return input.oddsHome;
}
function classifyCS(cs10: number, cs5venue: number, conceded5: number, sampleN = 99): CSLean {
	if (cs10 > 0 && cs10 < 30) return "Weak";
	const strongOk = cs10 >= 50 && (cs5venue >= 60 || conceded5 <= 1);
	if (strongOk) return sampleN <= 5 ? "Medium" : "Strong";
	if (cs10 >= 30 && cs10 <= 49) return "Medium";
	if (cs10 >= 50) return "Medium";
	if (cs10 <= 0) return "Weak";
	return "Medium";
}
/** V26 UGO warunek 4: jakość ofensywna UD z gf / xG / BTTS / splitu, nie z samej flagi scouta. */
export function underdogOffensiveQuality(ud: TeamBlock, favorite: FavoriteSide, scoutFlag = false): boolean {
	const venueGf = favorite === "home" ? ud.gfAway : favorite === "away" ? ud.gfHome : ud.gfAvg;
	const gf = ud.gfAvg || 0;
	const xg = ud.xg || 0;
	const btts = ud.bttsPct || 0;
	const hasNumbers = gf > 0 || xg > 0 || (venueGf || 0) > 0 || (ud.form?.length ?? 0) >= 4;
	if (!hasNumbers) return !!scoutFlag;
	if ((venueGf || 0) >= 1.2 || gf >= 1.4 || xg >= 1.3) return true;
	let n = 0;
	if (gf >= 1.15 || (venueGf || 0) >= 1.05) n++;
	if (xg >= 1.05) n++;
	if (btts >= 55 && (gf >= 1.1 || (venueGf || 0) >= 1.0)) n++;
	const form = Array.isArray(ud.form) ? ud.form : [];
	const venueHa = favorite === "home" ? "A" : favorite === "away" ? "H" : "";
	const venueRows = venueHa ? form.filter((m) => m.ha === venueHa) : form;
	const rows = venueRows.length >= 3 ? venueRows : form;
	if (rows.length >= 4) {
		const scored = rows.filter((m) => m.scoreFor > 0).length / rows.length;
		if (scored >= 0.6 && (gf >= 1.1 || (venueGf || 0) >= 1.0)) n++;
	}
	return n >= 2;
}
function band(pct: number): ConfidenceBreakdown["band"] {
	if (pct >= 88) return "Premium";
	if (pct >= 85) return "Strong";
	if (pct >= 70) return "Playable MIXED ONLY";
	return "No execution";
}
function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}
function parseScore(score: string) {
	const [h, a] = score.split(/[:\-]/).map((x) => Number(x.trim()));
	return {
		h: h || 0,
		a: a || 0
	};
}
function favGoals(score: string, favorite: FavoriteSide) {
	const s = parseScore(score);
	if (favorite === "away") return s.a;
	return s.h;
}
function udGoals(score: string, favorite: FavoriteSide) {
	const s = parseScore(score);
	if (favorite === "away") return s.h;
	return s.a;
}
function isClean(score: string, favorite: FavoriteSide) {
	return udGoals(score, favorite) === 0 && favGoals(score, favorite) > 0;
}
function isMixed(score: string, favorite: FavoriteSide) {
	return favGoals(score, favorite) > udGoals(score, favorite) && udGoals(score, favorite) > 0;
}
function isDraw(score: string) {
	const s = parseScore(score);
	return s.h === s.a;
}
function isHigher(score: string, favorite: FavoriteSide) {
	return favGoals(score, favorite) >= 3;
}
function isMinimal(score: string, favorite: FavoriteSide) {
	return favGoals(score, favorite) === 1 && udGoals(score, favorite) === 0;
}
function isLowPure(score: string, favorite: FavoriteSide) {
	const g = favGoals(score, favorite);
	const u = udGoals(score, favorite);
	return u === 0 && (g === 1 || g === 2);
}
function isMixed21(score: string, favorite: FavoriteSide) {
	return favGoals(score, favorite) === 2 && udGoals(score, favorite) === 1;
}
function isSoftHigh(score: string, favorite: FavoriteSide) {
	const g = favGoals(score, favorite);
	const u = udGoals(score, favorite);
	if (g >= 3) return true;
	if (g >= 2 && u >= 2) return true;
	if (u >= 3) return true;
	return false;
}
function isUnderdogWin(score: string, favorite: FavoriteSide) {
	return udGoals(score, favorite) > favGoals(score, favorite);
}
function isChaosExact(score: string, favorite: FavoriteSide) {
	if (isDraw(score)) return true;
	return favGoals(score, favorite) === 3 && udGoals(score, favorite) === 2;
}
function foldClub(s: string) {
	return s
		.toLowerCase()
		.replace(/ł/g, "l")
		.replace(/đ/g, "d")
		.replace(/ø/g, "o")
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}
function sameClub(a: string, b: string) {
	const x = foldClub(a);
	const y = foldClub(b);
	if (!x || !y) return false;
	return x === y || x.includes(y) || y.includes(x);
}
function displayPct(rank: number, epf: number) {
	const base = [
		90.2,
		85.8,
		81.4,
		76.6,
		72.9,
		69.4
	];
	const tweak = (epf - 8) * .35;
	return Math.round(((base[rank] ?? 68) + tweak) * 10) / 10;
}
function roleFor(i: number, score: string, favorite: FavoriteSide): ExactRole {
	if (i === 0) return "CORE";
	if (i === 1) return "VALUE";
	if (i === 2) return "BALANCED";
	if (isDraw(score) || isMixed(score, favorite) && i > 2) return "CHAOS";
	return "Protection";
}
function findScore(list: ExactCandidate[], pred: (c: ExactCandidate) => boolean) {
	return list.find(pred);
}
function mergeCandidates(ai: PhasePayload["candidates"], ctx: ExactCtx) {
	return mergeExactPool(ai, ctx);
}
function implied(odds?: number) {
	if (!odds || odds <= 1) return void 0;
	return Math.round(1 / odds * 1e3) / 10;
}
export function runEngine(input: MatchInput, p1: PhasePayload, p2?: PhasePayload): EngineOutput {
	const data: PhasePayload = {
		...p1,
		...p2,
		home: mergeTeamBlocks(p1.home, p2?.home),
		away: mergeTeamBlocks(p1.away, p2?.away),
		odds: mergeOdds(p1.odds, p2?.odds),
		h2h: (p2?.h2h?.length ?? 0) >= (p1.h2h?.length ?? 0) ? (p2?.h2h ?? p1.h2h) : p1.h2h,
	};
	const glued = attachPrevSeason(data.home, data.away, input.league);
	data.home = glued.home;
	data.away = glued.away;
	data.odds = mergeOdds(data.odds, {
		home: input.oddsHome,
		draw: input.oddsDraw,
		away: input.oddsAway,
		exacts: input.exactOdds,
	});
	const favorite = inferFavorite(input, data.favorite);
	const odds = favOdds(input, favorite) ?? pickOdds(data.odds.home) ?? pickOdds(data.odds.away);
	const notes = [];
	const processErrors = [];
	const log = [];
	if (favorite === "none" && isCoinFlipOdds(input.oddsHome, input.oddsAway)) {
		log.push(`Coin-flip Δ=${Math.abs((input.oddsHome ?? 0) - (input.oddsAway ?? 0)).toFixed(2)} < 0.35 — faworyt none, Direction NIE`);
	}
	if (input.home && data.home.name && !clubNameMatches(data.home.name, input.home)) {
		processErrors.push(`Gospodarz z API (${data.home.name}) ≠ ${input.home} — homonim, EPL nie lock`);
	}
	if (input.away && data.away.name && !clubNameMatches(data.away.name, input.away)) {
		processErrors.push(`Gość z API (${data.away.name}) ≠ ${input.away} — homonim, EPL nie lock`);
	}
	const raw = data.gatesRaw;
	const favTeam = favorite === "away" ? data.away : data.home;
	const udTeam = favorite === "away" ? data.home : data.away;
	if (data.home.prevSeason) {
		const n = venueNThisSeason(data.home.form, "H");
		log.push(`25.19 prevSeason ${data.home.name} HOME n=${n} w=${blendWeight(n)} ${data.home.prevSource || "dump"} — λ blend, nie Conf`);
	}
	if (data.away.prevSeason) {
		const n = venueNThisSeason(data.away.form, "A");
		log.push(`25.19 prevSeason ${data.away.name} AWAY n=${n} w=${blendWeight(n)} ${data.away.prevSource || "dump"} — λ blend, nie Conf`);
	}
	const matches = raw.matchesPlayedFav || favTeam.played || favTeam.form.length || 0;
	const sampleN = Math.max(matches, favTeam.played || 0, favTeam.form.length);
	const venueHa = favorite === "away" ? "A" : "H";
	const venueRows = favTeam.form.filter((f) => f.ha === venueHa).slice(0, 5);
	let venueCs = raw.csFavLast5Venue;
	let conceded5 = raw.goalsConcededFavLast5Venue;
	if (venueRows.length) {
		venueCs = Math.round((venueRows.filter((r) => r.scoreAgainst === 0).length / venueRows.length) * 100);
		conceded5 = venueRows.reduce((s, r) => s + r.scoreAgainst, 0);
	}
	const cs10 = raw.csFavLast10 || favTeam.csPctOverall;
	let csFav = classifyCS(cs10, venueCs, conceded5, sampleN);
	const squadVerified = !!(data.squadVerified || p1.squadVerified || input.squadVerified);
	let keyOutFav = !!(data.keyOutFav || p1.keyOutFav) || /(kluczow|captain|napastnik).*(out|kontuz|zawiesz)/i.test(data.injuries || p1.injuries || "");
	const gkOutFav = !!(data.gkOutFav || p1.gkOutFav) || /(bramkarz).*(out|kontuz|zawiesz)/i.test(data.injuries || p1.injuries || "");
	const massOutFav = !!(data.massOutFav || p1.massOutFav);
	const keyOutUd = !!(data.keyOutUd || p1.keyOutUd);
	const injAll = `${data.injuries || ""} ${p1.injuries || ""}`;
	if (
		keyOutFav &&
		!gkOutFav &&
		!massOutFav &&
		!input.keyOutFav &&
		!/attack|forward|striker|napast|winger|skrzydl|captain|goalkeeper|keeper|bramkarz|(^|\b)gk(\b|$)/i.test(injAll)
	) {
		keyOutFav = false;
		notes.push("S3: lista Missing Fixture bez napastnika/GK w opisie — nie ścinam 0–105");
	}
	if (gkOutFav) csFav = "Weak";
	else if (keyOutFav || massOutFav) { if (csFav === "Strong") csFav = "Medium"; }
	const csData = `CS10=${cs10}% / CS5 ${venueHa}=${venueCs}% / stracone 5 venue=${conceded5} / n=${sampleN} → ${csFav}${sampleN <= 5 && cs10 >= 50 ? " (≤5 meczów: Strong zakazany, max Medium)" : ""}`;
	const hvByLeague = isHighVarianceLeague(input.league);
	const teamGoals = Math.max(gfGaForHv(data.home), gfGaForHv(data.away), raw.avgGoalsRelevant || 0);
	const hvByGoals = teamGoals >= 3.8;
	// Reguła 18: HV = TAK tylko gdy ≥1 warunek: GF+GA jednej drużyny ≥3.80 | BTTS ≥65% | liga na oficjalnej liście HV
	// Allsvenskan NIE jest na liście — BTTS sam wystarcza dopiero od 65%
	const hvByBtts = raw.bttsRelevant >= 65;
	const hvActive = hvByLeague || hvByGoals || hvByBtts;
	const superFav = typeof odds === "number" && odds <= 1.4;
	const hvFromGoalsOnly = hvByGoals && !hvByLeague;
	const hvYieldsToStrong =
		(hvByLeague && favorite === "home" && typeof odds === "number" && odds <= 1.4) ||
		(superFav && hvFromGoalsOnly);
	const lambdaCapHv = hvActive && !(superFav && hvFromGoalsOnly);
	const hv = gate(
		hvActive,
		`liga HV=${hvByLeague} | GF+GA max drużyny=${teamGoals.toFixed(2)} | BTTS=${raw.bttsRelevant}% (Reguła 18: OR)`,
		hvActive
			? hvYieldsToStrong
				? "High Variance Filter TAK — superprzewaga / kurs ≤1.40: czysty CORE dozwolony, mixed zostaje w TOP3"
			: "High Variance Filter TAK — czysty exact nie może być EPL1, mixed obowiązkowy w TOP3; bez korekty 0–105 (Sample i tak ≤3/5)"
			: "Filtr HV nieaktywny (Calcutta/Ekstraklasa/Allsvenskan: tylko progi GF+GA≥3.80 lub BTTS≥65)",
	);
	const udVenueGf = favorite === "home" ? udTeam.gfAway : favorite === "away" ? udTeam.gfHome : udTeam.gfAvg;
	const udOff = underdogOffensiveQuality(udTeam, favorite, raw.underdogOffQuality);
	let ugoMet = [
		csFav === "Weak" || csFav === "Medium",
		typeof odds === "number" && odds >= 1.4 && odds <= 1.85,
		raw.favConcededInLast10Pct >= 50,
		hvActive || udOff || isUgoPlusLeague(input.league)
	].filter(Boolean).length;
	if (isUgoPlusLeague(input.league)) {
		ugoMet = Math.min(4, ugoMet + 1);
		notes.push("Liga Botola/Egipt/Tunezja/Grecja/Turcja — Underdog Goal Risk +1 poziom");
	}
	let ugoActive = ugoMet >= 2;
	if (keyOutUd) ugoActive = false;
	let ugoOffByOdds = false;
	if (typeof odds === "number" && odds < 1.4 && !isSuperettan(input.league)) {
		ugoActive = false;
		ugoOffByOdds = true;
		notes.push(`UGO NIE — kurs faworyta < 1.40 (${ugoMet}/4 warunków, override kursu)`);
	}
	const ugoReason = ugoActive
		? "UGO TAK — mixed exact ma priorytet rankingowy"
		: ugoOffByOdds
			? `UGO NIE — kurs faworyta < 1.40 (warunki ${ugoMet}/4, override)`
			: ugoMet >= 2
				? "UGO NIE — override"
				: "UGO NIE — poniżej 2/4 warunków";
	const ugo = Object.assign(gate(ugoActive, `${ugoMet}/4 warunków`, ugoReason), {
		met: ugoMet,
		details: [
			`CS faworyta ${csFav} (Weak/Medium = warunek)`,
			`Kurs faworyta ${odds ?? "brak"} (1.40–1.85)`,
			`Strata gola w ostatnich 8–10: ${raw.favConcededInLast10Pct}% (≥50%)`,
			`HV lub jakość underdoga: HV=${hvActive} / off=${udOff} (gf ${udTeam.gfAvg} / xG ${udTeam.xg || "—"} / BTTS ${udTeam.bttsPct}% / split ${udVenueGf ?? "—"})`
		]
	});
	const posGap = Math.abs((data.match.homePos || 0) - (data.match.awayPos || 0));
	const bqgActive = typeof odds === "number" && odds <= 1.6 && posGap >= 8 && raw.xgFavVsThisTier >= 1.6;
	const bqg = gate(bqgActive, `kurs=${odds ?? "brak"} | Δ miejsc=${posGap} | xG vs tier=${raw.xgFavVsThisTier}`, bqgActive ? "Big Quality Gap — Higher Exact 3+ w TOP3 + Minimal Exact Protection" : "Big Quality Gap nieaktywny");
	let earlyCap;
	if (sampleN <= 3) earlyCap = 82;
	else if (sampleN <= 6) earlyCap = 85;
	const lastH2h = recentH2h(data.h2h, input.kickoff).slice(0, 4);
	let h2hUdWins = 0;
	for (const m of lastH2h) {
		const [hg, ag] = (m.score || "").split(/[:\-]/).map((n) => Number(n.trim()));
		if (!Number.isFinite(hg) || !Number.isFinite(ag) || hg === ag) continue;
		if (sameClub(m.home, udTeam.name) && hg > ag) h2hUdWins++;
		if (sameClub(m.away, udTeam.name) && ag > hg) h2hUdWins++;
	}
	const h2hContradicts = lastH2h.length >= 3 && h2hUdWins >= 3;
	const flowDetails = [
		`Pytanie kontrolne: czy na pewno ${favTeam.name} jest faworytem flow?`,
		`Kurs faworyta ${odds ?? "brak"} (≤1.65 = mocny kierunek)`,
		`GF fav ${favTeam.gfAvg} vs UD ${udTeam.gfAvg}`,
		`CS fav ${favTeam.csPctOverall}% / BTTS ${favTeam.bttsPct}%`,
	];
	let flowMet = 0;
	if (typeof odds === "number" && odds <= 1.65) flowMet++;
	if (udTeam.gfAvg > 0 && udTeam.gfAvg <= 1.1) flowMet++;
	if (favTeam.csPctOverall >= 35 || (favTeam.bttsPct > 0 && favTeam.bttsPct <= 55)) flowMet++;
	if (favTeam.gfAvg >= udTeam.gfAvg && favTeam.gfAvg > 0) flowMet++;
	let profile = inferProfile(favorite, odds, data.profileDraft);
	// Strong CS Lean wymaga reguły 25.12 — przy CS Medium/Weak profil max Controlled + Medium CS
	if (csFav === "Medium" || csFav === "Weak") {
		if (profile === "Strong Home Favorite") profile = "Controlled Home Favorite";
		if (profile === "High Dominator") profile = "Controlled Away Favorite";
	}
	const homeApproved = flowMet >= 3;
	if (!homeApproved) {
		if (profile === "Controlled Home Favorite" || profile === "Strong Home Favorite") profile = "Slight Home Edge";
		if (profile === "Controlled Away Favorite" || profile === "High Dominator") profile = "Balanced";
		notes.push(`Direction Gate: NIE — ${favTeam.name} nie jest pewnym faworytem flow (${flowMet}/4). Low-tempo.`);
		flowDetails.push("Odpowiedź: NIE");
	} else {
		flowDetails.push("Odpowiedź: TAK");
	}
	const aiRaw = p2?.confidenceParts ?? p1.confidenceParts ?? {};
	const aiParts = {
		forma: aiRaw.forma ?? 0,
		xg: aiRaw.xg ?? 0,
		h2h: aiRaw.h2h ?? 0,
		homeAway: aiRaw.homeAway ?? aiRaw.atakObrona ?? 0,
		qoi: aiRaw.qoi ?? 0,
		flow: aiRaw.flow ?? 0,
		market: aiRaw.market ?? 0,
		squad: aiRaw.squad ?? aiRaw.override ?? 0,
		sample: aiRaw.sample ?? 0,
	};
	const aiSum = Object.values(aiParts).reduce((a, b) => a + b, 0);
	const coinFlipGate = isCoinFlipOdds(input.oddsHome, input.oddsAway)
		|| (typeof input.oddsHome === "number" && typeof input.oddsAway === "number"
			&& Math.abs(input.oddsHome - input.oddsAway) < 0.55);
	const softOdds = typeof odds === "number" && odds >= 1.7 && odds <= 2.1;
	const scored = computedConfidence(p1, input, favorite, hvActive, {
		directionTak: homeApproved,
		coinFlip: coinFlipGate,
		softOrEarlyOrHv: softOdds || sampleN <= 5 || hvActive,
	});
	const parts = {
		forma: clamp(aiSum >= 20 ? Math.min(aiParts.forma, scored.forma + 2) : scored.forma, 0, 20),
		xg: clamp(aiSum >= 20 ? aiParts.xg : scored.xg, 0, 15),
		h2h: clamp(aiSum >= 20 ? Math.min(aiParts.h2h, scored.h2h || aiParts.h2h) : scored.h2h, 0, 10),
		homeAway: clamp(aiSum >= 20 ? aiParts.homeAway || scored.homeAway : scored.homeAway, 0, 15),
		qoi: clamp(aiSum >= 20 ? Math.max(aiParts.qoi, scored.qoi) : scored.qoi, 0, 10),
		flow: clamp(aiSum >= 20 ? aiParts.flow : scored.flow, 0, 10),
		market: clamp(aiSum >= 20 ? aiParts.market : scored.market, 0, 10),
		squad: clamp(aiSum >= 20 && aiParts.squad ? aiParts.squad : scored.squad, 0, 10),
		sample: scored.sample,
	};
	if (aiSum >= 20 && aiParts.forma > scored.forma + 2) {
		notes.push(`Forma z L5 (W-D-GD) ${scored.forma}/20 — AI ${aiParts.forma} ścięte (nie n meczów)`);
	}
	if (h2hContradicts) {
		parts.h2h = Math.min(parts.h2h, 4);
		notes.push(`H2H przeczy kierunkowi faworyta (${h2hUdWins} wygranych underdoga w ${lastH2h.length}) — H2H max 4/10`);
	}
	if (hvActive) {
		notes.push("HV aktywny — czysty exact nie EPL1, mixed obowiązkowy w TOP3; bez korekty 0–105. Sample i tak ≤3/5.");
	}
	if (sampleN <= 3) {
		parts.forma = Math.min(parts.forma, 14);
		parts.xg = Math.min(parts.xg, 12);
		notes.push(`Early Season n=${sampleN}: Forma max 14/20, xG max 12/15, Conf max 82% (jedyna kara za n≤3; Sample=${parts.sample}/5, UGO nie dubluje)`);
	} else if (sampleN <= 5) {
		parts.forma = Math.min(parts.forma, 17);
		notes.push(`Early Season n=${sampleN}: Forma max 17/20, Conf max 85%, Sample=${parts.sample}/5`);
	}
	if (typeof odds === "number" && odds <= 1.3 && (favorite === "home" ? data.home.gfAvg : data.away.gfAvg) > 1.8 && (favorite === "home" ? data.away.gfAvg : data.home.gfAvg) < .8 && (csFav === "Medium" || csFav === "Strong")) {
		parts.homeAway = Math.min(15, parts.homeAway + 5);
		notes.push("Dominator Confidence Boost +5 do Home/Away Split (kurs ≤1.30)");
	}
	let sum = Object.values(parts).reduce((a, b) => a + b, 0);
	let pct = Math.round(sum / 105 * 1e3) / 10;
	if (earlyCap && pct > earlyCap) {
		pct = earlyCap;
		notes.push(`Early Season CAP Confidence ${earlyCap}%`);
	}
	if (!squadVerified) {
		notes.push("S1 SKŁAD NIEZWERYFIKOWANY — NO EXECUTION (0–105 bez zmian, % = suma/105)");
	}
	if (keyOutFav || gkOutFav || massOutFav) {
		notes.push("S3 kluczowy/GK/3+ out faworyta — NO EXECUTION (0–105 bez zmian, % = suma/105)");
	}
	const sideBox = (t: { corners: number; shotsOnTarget: number; xg: number }) =>
		t.corners > 0 || t.shotsOnTarget > 0 || t.xg > 0;
	const missingBox = !sideBox(data.home) || !sideBox(data.away);
	if (missingBox) {
		notes.push("Brak rożnych, SOT i xG — WAIT (0–105 bez zmian, % = suma/105)");
	}
	if (isAllsvenskan(input.league) && pct < 83) notes.push("Allsvenskan + Conf < 83% — podwyższona wariancja, surowszy Draw Resistance");
	const oddsDelta = typeof input.oddsHome === "number" && typeof input.oddsAway === "number"
		? Math.abs(input.oddsHome - input.oddsAway)
		: 99;
	const nearEven = isCoinFlipOdds(input.oddsHome, input.oddsAway) || oddsDelta < 0.55;
	if (nearEven && pct < 83) notes.push(`Near even Δkurs ${oddsDelta.toFixed(2)} < 0.55 — GREEN zablokowane`);
	const mixedOnly = pct >= 70 && pct < 85;
	if (mixedOnly) notes.push("Pasmo 70–84% MIXED ONLY (15.2 / 25.18) — nie Dominator, zakaz GREEN na czysty CS CORE, zakaz 4:0/4:1/5:1 w TOP3");
	const gapWatch = pct >= 70 && pct <= 85 && posGap >= 8 && typeof odds === "number" && odds <= 1.45;
	if (gapWatch) notes.push("WATCH 15.2: krótki kurs + luka ≥8 — 1:1 obowiązkowo w TOP3 (05.09)");
	const confidence = {
		...parts,
		sum,
		pct,
		band: band(pct),
		notes
	};
	const remisActive = pct >= 80 && pct <= 90 && (hvActive || isMediumVarianceLeague(input.league)) || pct <= 80 && favorite === "away" && hvActive || pct >= 83 && pct <= 90 && (hvActive || isMediumVarianceLeague(input.league));
	const remis = gate(remisActive, `Conf ${pct}% | HV=${hvActive} | medium var=${isMediumVarianceLeague(input.league)} | awayFav=${favorite === "away"}`, remisActive ? "Remis Safety — 0:0 lub 1:1 obowiązkowo w TOP3" : "Remis Safety nieaktywny");
	const controlled = profile === "Controlled Home Favorite" || profile === "Controlled Away Favorite" || profile === "Strong Home Favorite" || profile === "High Dominator";
	const controlledHome = profile === "Controlled Home Favorite" || profile === "Strong Home Favorite";
	const blockUdWinTop3 = homeApproved && controlled;
	const blockChaosTop3 = homeApproved && controlledHome && !hvActive;
	const lowKursDom = !mixedOnly && pct >= 88 && typeof odds === "number" && odds <= 1.3 && raw.xgFavVsThisTier >= 2;
	const domExp = !mixedOnly && (pct >= 88 && typeof odds === "number" && odds <= 1.55 && controlled || pct >= 88 && typeof odds === "number" && odds <= 1.5 || pct >= 88 && posGap >= 8 || lowKursDom);
	const dominator = gate(domExp, `Conf ${pct}% | kurs ${odds ?? "brak"} | profil ${profile}${lowKursDom ? " | Low Kurs xG≥2" : ""}${mixedOnly ? " | MIXED ONLY — expansion OFF" : ""}`, mixedOnly ? "Dominator Expansion NIE — pasmo 70–84% MIXED ONLY (15.2)" : domExp ? "Dominator Expansion — 3+ goli faworyta obowiązkowo w TOP3" : "Dominator Expansion nieaktywny");
	const extreme = pct >= 87 && controlled && raw.leagueGapScore >= 2 && (favorite === "home" ? data.home.gfAvg : data.away.gfAvg) >= 2.8 && raw.xgFavVsThisTier >= 2.3 && !hvActive && !ugoActive;
	const extremeG = gate(extreme, `Conf ${pct}% | gap ${raw.leagueGapScore} | HV=${hvActive} | UGO=${ugoActive}`, extreme ? "Extreme Dominator Boost — 4:0/5:0 jako Value/TOP4" : "Extreme Dominator nieaktywny");
	const soft = typeof odds === "number" && odds >= 1.7 && odds <= 2.1;
	const lFavRawSoft = venueLambdaBlended(favTeam, favorite === "away" ? "A" : "H");
	const lFavSoft = cappedLambda(lFavRawSoft, lambdaCapHv, typeof odds === "number" ? odds : undefined);
	const softLowLambda = soft && lFavSoft < 1;
	const softG = gate(
		soft,
		`kurs faworyta ${odds ?? "brak"} | λ fav ${lFavSoft.toFixed(2)}`,
		soft
			? softLowLambda
				? "Soft Band + λ fav < 1.0 — CORE 1:0, bez 2:0, Central Exact 1:1 zostaje"
				: "Soft Band 1.70–2.10 — priorytet 1:0/2:0, 3:0 max EPL3"
			: "Soft Band nieaktywny",
	);
	const lowKurs = typeof odds === "number" && odds <= 1.4;
	const lowKursG = gate(lowKurs, `kurs ${odds ?? "brak"} | xG fav ${raw.xgFavVsThisTier}`, lowKurs ? raw.xgFavVsThisTier > 2 ? "Low Kurs Dominator — xG potwierdza eskalację" : "Low Kurs Dominator — brak xG>2.0, obniżyć stawkę / sprawdzić 0:0" : "Low Kurs Dominator nieaktywny");
	const oppGf = raw.opponentGfVenue;
	const oppBtts = raw.opponentBttsPct;
	const strongCsCore = csFav === "Strong" && oppGf <= .9 && oppBtts <= 40 && !hvActive && typeof odds === "number" && odds <= 1.45;
	if (csFav === "Strong" && !strongCsCore) notes.push("Strong CS Lean nie spełnia 25.12 — CS max Medium jako CORE, mixed min EPL2");
	const marketClean = gate(false, "kursy exact po K14", "sprawdzane przy locku EPL");
	const ugoOddsBand = typeof odds === "number" && odds >= 1.4 && odds <= 1.85;
	const superettanUgo = isSuperettan(input.league) && ugoActive;
	const ugoForceMixed = ugoActive && (ugoOddsBand || superettanUgo) && (csFav === "Weak" || hvActive || typeof odds === "number" && odds <= 1.5 || !(pct >= 85 && pct <= 89 && (csFav === "Strong" || csFav === "Medium") && !hvActive));
	const exception16 = ugoActive && pct >= 85 && pct <= 89 && (csFav === "Strong" || csFav === "Medium") && !hvActive;
	const gates = {
		highVariance: hv,
		ugo,
		csFav: strongCsCore ? "Strong" : csFav === "Strong" && !strongCsCore ? "Medium" : csFav,
		csFavData: csData,
		homeDirection: {
			met: flowMet,
			approved: homeApproved,
			details: flowDetails
		},
		earlySeason: {
			matches: sampleN,
			capPct: earlyCap,
			note: sampleN <= 3 ? "≤3 meczów" : sampleN <= 5 ? "4–5 meczów (early)" : "próbka OK"
		},
		bigQualityGap: bqg,
		remisSafety: remis,
		dominatorExpansion: dominator,
		extremeDominator: extremeG,
		softBand: softG,
		lowKursDominator: lowKursG,
		chaosReserve: gate(hvActive, `HV=${hvActive}`, hvActive ? "Chaos Reserve — mixed/BTTS w TOP3" : "nieaktywny"),
		mixedExactPriority: gate(ugoForceMixed && !soft, `UGO=${ugoActive} | kurs=${odds ?? "brak"} | SoftBand=${soft}`, soft && ugoActive ? "Soft Band ma pierwszeństwo przed UGO — mixed 2:1 max EPL2, CORE 1:0/2:0" : "Mixed Exact Priority według kursu i UGO"),
		minimalExact: gate(bqgActive && typeof odds === "number" && odds <= 1.5, `BQG=${bqgActive} | kurs=${odds ?? "brak"}`, bqgActive ? "Minimal Exact Protection 1:0/0:1" : "nieaktywny"),
		marketCleanExact: marketClean,
		strongCsCoreAllowed: strongCsCore
	};
	let pool = mergeCandidates(data.candidates, {
		favorite,
		profile,
		home: data.home,
		away: data.away,
		h2hAvg: data.h2hAvgGoals,
		h2hN: data.h2h.length,
		csFav,
		hv: lambdaCapHv,
		ugo: ugoActive,
		oddsFav: typeof odds === "number" ? odds : undefined,
		exactOdds: {
			...p1.odds.exacts,
			...p2?.odds.exacts,
			...input.exactOdds,
		},
	});
	pool.sort((a: ExactCandidate, b: ExactCandidate) => b.epf.total - a.epf.total || b.epl.raw - a.epl.raw);
	const central = pool[0];
	const centralExact = central?.score ?? (favorite === "away" ? "0:2" : "2:0");
	const cleanOdds = {
		...p1.odds.exacts,
		...p2?.odds.exacts,
		...input.exactOdds
	}[centralExact];
	if (typeof cleanOdds === "number" && isClean(centralExact, favorite)) {
		if (cleanOdds > 9.5) log.push(`Market Odds Clean Exact Filter: ${centralExact} kurs ${cleanOdds} > 9.50 — zdejmujemy z CORE`);
		else if (cleanOdds > 8.5) log.push(`Market Odds Clean Exact Filter: ${centralExact} kurs ${cleanOdds} > 8.50 — −1 pozycja`);
	}
	const required = [];
	if (hvActive) required.push({
		rule: "HV mixed TOP3",
		pred: (c: ExactCandidate) => isMixed(c.score, favorite) || c.score === "2:2",
		top: "TOP3"
	});
	if (ugoForceMixed && !exception16) required.push({
		rule: "UGO mixed TOP3",
		pred: (c: ExactCandidate) => isMixed(c.score, favorite),
		top: "TOP3"
	});
	if ((bqgActive || dominator.active) && !mixedOnly) required.push({
		rule: "Higher Exact 3+",
		pred: (c: ExactCandidate) => isHigher(c.score, favorite),
		top: "TOP3"
	});
	if (bqgActive && typeof odds === "number" && odds <= 1.35) required.push({
		rule: "Minimal Exact TOP3",
		pred: (c: ExactCandidate) => isMinimal(c.score, favorite),
		top: "TOP3"
	});
	if (hvActive && pct < 85) required.push({
		rule: "HV + Conf<85 mixed",
		pred: (c: ExactCandidate) => isMixed(c.score, favorite),
		top: "TOP3"
	});
	if (mixedOnly) required.push({
		rule: "MIXED ONLY 70–84 mixed TOP3",
		pred: (c: ExactCandidate) => isMixed(c.score, favorite),
		top: "TOP3"
	});
	if (csFav !== "Strong" && typeof odds === "number" && odds <= 1.5) required.push({
		rule: "Kurs ≤1.50 + CS≠Strong mixed TOP3",
		pred: (c: ExactCandidate) => isMixed(c.score, favorite),
		top: "TOP3"
	});
	if (remisActive) required.push({
		rule: "Remis Safety 1:1 TOP3",
		pred: (c: ExactCandidate) => c.score === "1:1" || c.score === "0:0",
		top: "TOP3"
	});
	if (isVeikkausliiga(input.league) && favorite === "away" && typeof odds === "number" && odds >= 1.55 && odds <= 1.65) required.push({
		rule: "Veikkausliiga 1:1",
		pred: (c: ExactCandidate) => c.score === "1:1",
		top: "TOP3"
	});
	const uniqueTop3Rules = [];
	const seen = /* @__PURE__ */ new Set();
	for (const r of required.filter((x) => x.top === "TOP3")) {
		r.pred.toString() + r.rule.split(" ")[0];
		const family = r.rule.includes("mixed") || r.rule.includes("UGO") || r.rule.includes("HV") ? "mixed" : r.rule.includes("Higher") ? "higher" : r.rule.includes("Minimal") ? "minimal" : r.rule;
		if (seen.has(family) && family !== "minimal" && family !== "higher") continue;
		seen.add(family);
		uniqueTop3Rules.push(r);
	}
	const picks: ExactCandidate[] = [];
	const used = new Set<string>();
	const take = (c: ExactCandidate | undefined, fn: "CORE/CENTRAL" | "OVERRIDE" | "PROTECTION/VOLUME", sat: string) => {
		if (!c || used.has(c.score) || picks.length >= 3) return;
		if (mixedOnly && favGoals(c.score, favorite) >= 4) return;
		if (blockUdWinTop3 && isUnderdogWin(c.score, favorite)) return;
		if (blockChaosTop3 && isChaosExact(c.score, favorite) && !(softLowLambda && c.score === "1:1") && !(remisActive && (c.score === "1:1" || c.score === "0:0"))) return;
		const copy = {
			...c,
			functions: [...c.functions, fn],
			satisfies: [...c.satisfies, sat]
		};
		picks.push(copy);
		used.add(c.score);
	};
	const higherMixed = findScore(pool, (c: ExactCandidate) => isHigher(c.score, favorite) && isMixed(c.score, favorite) && !(blockChaosTop3 && isChaosExact(c.score, favorite)));
	const fourMixed = findScore(pool, (c: ExactCandidate) => isHigher(c.score, favorite) && isMixed(c.score, favorite) && favGoals(c.score, favorite) >= 4);
	const mixed21 = findScore(pool, (c: ExactCandidate) => isMixed21(c.score, favorite));
	const mixed = mixed21 ?? findScore(pool, (c: ExactCandidate) => isMixed(c.score, favorite) && !isSoftHigh(c.score, favorite));
	const higherClean = findScore(pool, (c: ExactCandidate) => isHigher(c.score, favorite) && isClean(c.score, favorite));
	const centralCand = pool.find((c: ExactCandidate) => c.score === centralExact);
	const minimal = findScore(pool, (c: ExactCandidate) => isMinimal(c.score, favorite));
	const clean2 = findScore(pool, (c: ExactCandidate) => isClean(c.score, favorite) && favGoals(c.score, favorite) === 2);
	const needMixed = uniqueTop3Rules.some((r) => r.rule.toLowerCase().includes("mixed") || r.rule.includes("UGO") || r.rule.includes("HV"));
	const needHigher = uniqueTop3Rules.some((r) => r.rule.includes("Higher"));
	const needMinimal = uniqueTop3Rules.some((r) => r.rule.includes("Minimal"));
	const higherMixedPick = lowKursDom && fourMixed ? fourMixed : higherMixed;
	const compressedHigherUgo = !!(needMixed && needHigher && higherMixedPick);
	if (compressedHigherUgo) log.push(`UGO + HIGHER EXACT = COMPRESSED na ${higherMixedPick!.score}`);
	function blockFillCandidate(c: ExactCandidate): boolean {
		const g = favGoals(c.score, favorite);
		const chaos = ["2:2", "3:2", "2:3", "3:3"].includes(c.score);
		const tail = g >= 4;
		const higher31 = g === 3 && udGoals(c.score, favorite) === 1;
		if (chaos) return true;
		if (tail && pct < 88) return true;
		if (higher31 && !(ugoActive || needHigher)) return true;
		if (higher31 && pct < 70) {
			const central31 = c.score === centralExact && c.epf.total >= 7.5;
			if (!central31) return true;
		}
		return false;
	}
	const cleanBlockedAsEpl1 = hvActive && !hvYieldsToStrong || ugoForceMixed && !exception16 && !soft || typeof cleanOdds === "number" && cleanOdds > 9.5 || !gates.strongCsCoreAllowed && isClean(centralExact, favorite) && csFav !== "Strong";
	const softBlockedBySquad = soft && (keyOutFav || gkOutFav || massOutFav);
	if (softBlockedBySquad) {
		const draw11 = findScore(pool, (c: ExactCandidate) => c.score === "1:1");
		take(draw11 ?? minimal ?? clean2, "CORE/CENTRAL", "S4 SOFT VS SKŁAD — 1:1 zostaje, zakaz CORE strony z keyOut");
		if (minimal && picks[0]?.score !== minimal.score) take(minimal, "PROTECTION/VOLUME", "S4 Minimal protection");
		log.push("S4 SOFT VS SKŁAD — 1:1 zostaje, zakaz CORE strony z keyOut");
	} else if (soft) {
		take(minimal ?? clean2, "CORE/CENTRAL", "Soft Band 25.16.2 — priorytet 1:0");
		if (softLowLambda) {
			const draw11 = centralCand && centralCand.score === "1:1" ? centralCand : findScore(pool, (c: ExactCandidate) => c.score === "1:1");
			take(draw11 ?? centralCand, "OVERRIDE", "Soft Band λ<1.0 — Central Exact zostaje");
			log.push("Soft Band + λ fav < 1.0: CORE 1:0, bez forsowania 2:0, 1:1 zostaje");
		} else if (ugoActive) {
			take(mixed21 ?? mixed, "OVERRIDE", "Soft Band + UGO: mixed 2:1 max EPL2");
			if (picks.length < 2) take(clean2, "PROTECTION/VOLUME", "Soft Band 2:0");
			log.push("Soft Band: CORE 1:0, EPL2 2:0, 3:1 zakaz, 3:0 max EPL3 gdy UGO=NIE");
		} else {
			take(clean2, "PROTECTION/VOLUME", "Soft Band 2:0");
			log.push("Soft Band: CORE 1:0, EPL2 2:0, 3:1 zakaz, 3:0 max EPL3 gdy UGO=NIE");
		}
		if (picks[0] && isMixed21(picks[0].score, favorite)) {
			const pure = minimal ?? clean2;
			if (pure) {
				const rest = picks.filter((p: ExactCandidate) => p.score !== pure.score);
				picks.splice(0, picks.length, {
					...pure,
					functions: [...pure.functions, "CORE/CENTRAL"],
					satisfies: [...pure.satisfies, "Soft Band: 2:1 nie CORE"],
				}, ...rest);
				if (picks.length > 3) picks.length = 3;
				used.add(pure.score);
				log.push("Soft Band: 2:1 zrzucony z CORE");
			}
		}
	} else if (exception16 && !hvActive) {
		take(centralCand && isClean(centralExact, favorite) ? centralCand : clean2, "CORE/CENTRAL", "Wyjątek 16.1 — 2:0 może zostać EPL1");
		take(mixed ?? higherMixedPick, "OVERRIDE", "UGO ochrona");
		if (needHigher) take(higherClean ?? higherMixedPick, "PROTECTION/VOLUME", "Higher Exact");
	} else {
		if (needMixed && !hvYieldsToStrong) {
			const coreMix = compressedHigherUgo ? higherMixedPick : mixed ?? higherMixedPick;
			take(coreMix, "CORE/CENTRAL", compressedHigherUgo ? "UGO+Higher compressed" : ugoActive ? "UGO/HV mixed CORE" : "HV mixed CORE");
			if (centralCand && coreMix && centralCand.score !== coreMix.score && !blockFillCandidate(centralCand)) take(centralCand, "PROTECTION/VOLUME", "Central Exact z EPF");
		} else if (!cleanBlockedAsEpl1 && centralCand) {
			if (centralCand && !blockFillCandidate(centralCand)) take(centralCand, "CORE/CENTRAL", "Central Exact z EPF");
			else if (centralCand && blockFillCandidate(centralCand)) log.push("25.20 Central Exact zablokowany (chaos/higher/ogon): " + centralCand.score);
		} else {
			const coreEp = centralCand && !blockFillCandidate(centralCand) ? centralCand : mixed ?? clean2;
			take(coreEp, "CORE/CENTRAL", "CORE z EPF");
		}
		if (needHigher && !picks.some((p: ExactCandidate) => isHigher(p.score, favorite))) take(compressedHigherUgo ? undefined : higherMixedPick ?? higherClean, "OVERRIDE", "Higher Exact Mandatory");
		if (needMixed && !picks.some((p: ExactCandidate) => isMixed(p.score, favorite))) take(mixed ?? higherMixedPick, "OVERRIDE", ugoActive ? "Mixed/UGO" : "Mixed · kurs ≤1.50 / HV");
		if (needMinimal && !picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) {
			if (typeof odds === "number" && odds <= 1.35 && clean2 && minimal && clean2.epf.total - minimal.epf.total >= .7 && csFav !== "Weak" && !hvActive && ugo.met < 3 && !used.has(clean2.score)) take(clean2, "CORE/CENTRAL", "Central 2:0 wyjątek Minimal Protection");
			take(minimal, "PROTECTION/VOLUME", "Minimal Exact Protection");
		}
	}
	if (remisActive && !picks.some((p: ExactCandidate) => p.score === "1:1" || p.score === "0:0")) {
		const d11 = findScore(pool, (c: ExactCandidate) => c.score === "1:1");
		const d00 = findScore(pool, (c: ExactCandidate) => c.score === "0:0");
		take(d11 ?? d00, "OVERRIDE", "Remis Safety 1:1/0:0 TOP3");
		log.push("Remis Safety: 1:1 w TOP3 przed EPF fill (2:2 nie w slocie remisu)");
	}
	for (const c of pool as ExactCandidate[]) {
		if (picks.length >= 3) break;
		if (used.has(c.score)) continue;
		if (soft) {
			const is30 = isClean(c.score, favorite) && favGoals(c.score, favorite) === 3;
			if (isSoftHigh(c.score, favorite) && !(is30 && !ugoActive)) continue;
		}
		if (!picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) {
			take(minimal, "PROTECTION/VOLUME", "Minimal Exact 0:1/1:0");
		}
		if (blockFillCandidate(c)) continue;
		take(c, picks.length === 0 ? "CORE/CENTRAL" : "PROTECTION/VOLUME", "EPF fill (λ tej pary)");
	}
	if (soft && !softLowLambda && picks[0] && !isMinimal(picks[0].score, favorite)) {
		const pure = minimal ?? picks.find((p: ExactCandidate) => isLowPure(p.score, favorite)) ?? clean2;
		if (pure && isMinimal(pure.score, favorite)) {
			const rest = picks.filter((p: ExactCandidate) => p.score !== pure.score);
			picks.splice(0, picks.length, { ...pure, functions: [...pure.functions, "CORE/CENTRAL"], satisfies: [...pure.satisfies, "Soft Band CORE 1:0"] }, ...rest);
			used.add(pure.score);
			log.push("Soft Band: czysty 1:0 na CORE");
		} else if (pure) {
			const rest = picks.filter((p: ExactCandidate) => p.score !== pure.score);
			picks.splice(0, picks.length, { ...pure, functions: [...pure.functions, "CORE/CENTRAL"], satisfies: [...pure.satisfies, "Soft Band CORE 1:0/2:0"] }, ...rest);
			used.add(pure.score);
			log.push("Soft Band: czysty 1:0/2:0 na CORE");
		}
	}
	if (soft && !softLowLambda) {
		const top2 = picks.slice(0, 2);
		if (top2.length && !top2.some((p: ExactCandidate) => isLowPure(p.score, favorite))) {
			const insert = clean2 ?? minimal;
			if (insert && !top2.some((p: ExactCandidate) => p.score === insert.score)) {
				const head = picks[0];
				picks.splice(0, picks.length, head, { ...insert, functions: [...insert.functions, "PROTECTION/VOLUME"], satisfies: [...insert.satisfies, "Soft Band + UGO: czysty w EPL1/2"] }, ...picks.slice(1).filter((p: ExactCandidate) => p.score !== insert.score));
				if (picks.length > 3) picks.length = 3;
			}
		}
		if (picks[0] && isSoftHigh(picks[0].score, favorite)) {
			log.push("Soft Band: zrzut wysokiego mixed z CORE");
			const rest = picks.filter((p: ExactCandidate) => !isSoftHigh(p.score, favorite));
			picks.splice(0, picks.length, ...rest, ...picks.filter((p: ExactCandidate) => isSoftHigh(p.score, favorite)));
			if (picks.length > 3) picks.length = 3;
		}
	}
	if (soft && !ugoActive && !softLowLambda) {
		const threeNil = findScore(pool, (c: ExactCandidate) => isClean(c.score, favorite) && favGoals(c.score, favorite) === 3);
		if (threeNil && !used.has(threeNil.score)) {
			if (picks.length >= 3 && picks[2] && isMixed(picks[2].score, favorite) && favGoals(picks[2].score, favorite) < 3) {
				used.delete(picks[2].score);
				picks[2] = {
					...threeNil,
					functions: [...threeNil.functions, "PROTECTION/VOLUME"],
					satisfies: [...threeNil.satisfies, "Soft Band 3:0 fill (UGO off)"],
				};
				used.add(threeNil.score);
				log.push("Soft Band + UGO=NIE: 3:0 fill EPL3 zamiast mixed");
			} else if (picks.length < 3) {
				take(threeNil, "PROTECTION/VOLUME", "Soft Band 3:0 fill (UGO off)");
			}
		}
	}
	if (hvYieldsToStrong) {
		log.push(
			superFav && hvFromGoalsOnly
				? "Superprzewaga ≤1.40: HV z GF+GA nie blokuje czystego CORE, λ pod sufit wg kursu"
				: "HV z listy ustępuje kursowi ≤1.40 — clean może być EPL1, mixed zostaje w TOP3",
		);
	}
	if (superFav && hvFromGoalsOnly && picks[0] && !isClean(picks[0].score, favorite)) {
		const cleanCore = clean2 ?? minimal;
		if (cleanCore) {
			const rest = picks.filter((p: ExactCandidate) => p.score !== cleanCore.score);
			picks.splice(0, picks.length, {
				...cleanCore,
				functions: [...cleanCore.functions, "CORE/CENTRAL"],
				satisfies: [...cleanCore.satisfies, "Superprzewaga ≤1.40 — czysty CORE"],
			}, ...rest);
			used.add(cleanCore.score);
			if (picks.length > 3) picks.length = 3;
			log.push("Superprzewaga ≤1.40: czysty CORE (2:0/1:0) zamiast mixed");
		}
	}
	const controlledNoDrawCore = controlledHome && typeof odds === "number" && odds <= 1.4 && !remisActive;
	if (controlledNoDrawCore && picks[0] && isDraw(picks[0].score)) {
		const cleanCore = clean2 ?? minimal;
		if (cleanCore) {
			const rest = picks.filter((p: ExactCandidate) => p.score !== cleanCore.score);
			picks.splice(0, picks.length, {
				...cleanCore,
				functions: [...cleanCore.functions, "CORE/CENTRAL"],
				satisfies: [...cleanCore.satisfies, "Controlled Home ≤1.40 — CORE 1:0/2:0, nie remis"],
			}, ...rest);
			used.add(cleanCore.score);
			if (picks.length > 3) picks.length = 3;
			log.push("Controlled Home + kurs ≤1.40 + Remis Safety NIE: CORE czysty, 1:1 nie EPL1");
		}
	}
	if (superFav && csFav !== "Weak" && clean2 && !used.has(clean2.score)) {
		if (picks.length < 3) {
			take(clean2, "PROTECTION/VOLUME", "Superprzewaga ≤1.40 — 2:0 obowiązkowo w TOP3");
		} else {
			const dropAt = picks.findIndex((p: ExactCandidate, i: number) => i > 0 && p.score !== clean2.score);
			if (dropAt > 0) {
				used.delete(picks[dropAt].score);
				picks[dropAt] = {
					...clean2,
					functions: [...clean2.functions, "PROTECTION/VOLUME"],
					satisfies: [...clean2.satisfies, "Superprzewaga ≤1.40 — 2:0 obowiązkowo w TOP3"],
				};
				used.add(clean2.score);
				log.push("Superprzewaga ≤1.40: 2:0 wstawione do TOP3");
			}
		}
	}
	if (hvActive && !hvYieldsToStrong && picks[0] && isClean(picks[0].score, favorite) && !soft) {
		const mix = picks.find((p: ExactCandidate) => isMixed(p.score, favorite));
		if (mix) {
			const rest = picks.filter((p: ExactCandidate) => p.score !== mix.score);
			picks.splice(0, picks.length, mix, ...rest);
			log.push("HV Gate: czysty exact zepchnięty z EPL1");
		}
	}
	if (picks.length > 3) picks.length = 3;
	if (blockUdWinTop3 || blockChaosTop3) {
		const blocked = picks.filter((p: ExactCandidate) =>
			(blockUdWinTop3 && isUnderdogWin(p.score, favorite)) ||
			(blockChaosTop3 && isChaosExact(p.score, favorite) && !(softLowLambda && p.score === "1:1"))
		);
		if (blocked.length) {
			for (const r of blocked) {
				const i = picks.findIndex((p: ExactCandidate) => p.score === r.score);
				if (i >= 0) picks.splice(i, 1);
				used.delete(r.score);
			}
			log.push("Direction Gate TAK + Controlled: TOP3 bez wygranej underdoga i chaosu (2:3, 3:2, 2:2, 1:1 bez Remis Safety)");
			for (const c of pool as ExactCandidate[]) {
				if (picks.length >= 3) break;
				take(c, "PROTECTION/VOLUME", "Controlled fill — kierunek faworyta");
			}
		}
	}
	if (picks.length > 3) picks.length = 3;
	// 1:1 i 2:2 = ta sama rodzina remisów — 2:2 nie siada w TOP3 obok 1:1 (także przy HV).
	// Wyjątek: Central Exact = 2:2 i w TOP3 nie ma 1:1 — wtedy 2:2 zostaje.
	const has11 = picks.some((p: ExactCandidate) => p.score === "1:1");
	const idx22 = picks.findIndex((p: ExactCandidate) => p.score === "2:2");
	const keepCentral22 = centralExact === "2:2" && !has11;
	const lowScoringForm = ((data.home.over25Pct || 0) + (data.away.over25Pct || 0)) / 2 < 45
		&& (data.home.over25Pct > 0 || data.away.over25Pct > 0);
	if (idx22 >= 0 && (has11 || lowScoringForm) && !keepCentral22) {
		used.delete("2:2");
		picks.splice(idx22, 1);
		log.push(has11
			? "1:1 i 2:2 ta sama rodzina — 2:2 zrzut z TOP3 (brak Multi-Rule Compression)"
			: "Low Scoring (O2.5 formy) — 2:2 zrzut z TOP3");
		for (const c of pool as ExactCandidate[]) {
			if (picks.length >= 3) break;
			if (used.has(c.score) || c.score === "2:2" || isDraw(c.score)) continue;
			if (!picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) {
				take(minimal, "PROTECTION/VOLUME", "Minimal Exact 0:1/1:0");
			}
			if (blockFillCandidate(c)) continue;
			take(c, "PROTECTION/VOLUME", "fill po zrzucie 2:2");
		}
	}
	if (picks.length > 3) picks.length = 3;
	function ensureMinimalProtection() {
		if (!minimal || picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) return;
		const droppable = (p: ExactCandidate, i: number) => {
			if (i === 0) return false;
			if (p.functions.includes("CORE/CENTRAL")) return false;
			if (remisActive && (p.score === "1:1" || p.score === "0:0")) return false;
			if (isMinimal(p.score, favorite)) return false;
			if (isHigher(p.score, favorite)) return true;
			const hasClean2 = picks.some((x: ExactCandidate) => isClean(x.score, favorite) && favGoals(x.score, favorite) === 2);
			return isMixed21(p.score, favorite) && hasClean2;
		};
		if (picks.length < 3) {
			take(minimal, "PROTECTION/VOLUME", "Minimal Exact protection");
			return;
		}
		let dropAt = -1;
		for (let i = picks.length - 1; i >= 1; i--) {
			if (droppable(picks[i], i)) {
				dropAt = i;
				break;
			}
		}
		if (dropAt < 1) return;
		const dropped = picks[dropAt].score;
		used.delete(dropped);
		picks[dropAt] = {
			...minimal,
			functions: [...minimal.functions, "PROTECTION/VOLUME"],
			satisfies: [...minimal.satisfies, "Minimal Exact protection"],
		};
		used.add(minimal.score);
		log.push(`Minimal Exact protection: ${dropped} → ${minimal.score}`);
	}
	ensureMinimalProtection();
	// 2:2 w TOP3 tylko przy HV / silnym chaosie — inaczej zrzut do protection
	if (!hvActive && !keepCentral22) {
		const chaosIdx = picks.findIndex((p: ExactCandidate) => p.score === "2:2");
		if (chaosIdx >= 0) {
			picks.splice(chaosIdx, 1);
			used.delete("2:2");
			log.push("HV=NIE: 2:2 usunięte z TOP3 (brak sygnału chaosu)");
		}
		// Uzupełnij TOP3 pure/higher (np. 2:0) zamiast chaosu
		for (const c of pool as ExactCandidate[]) {
			if (picks.length >= 3) break;
			if (used.has(c.score) || c.score === "2:2") continue;
			if (soft) {
				const is30 = isClean(c.score, favorite) && favGoals(c.score, favorite) === 3;
				if (isSoftHigh(c.score, favorite) && !(is30 && !ugoActive)) continue;
			}
			if (!picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) {
				take(minimal, "PROTECTION/VOLUME", "Minimal Exact 0:1/1:0");
			}
			if (blockFillCandidate(c)) continue;
			take(c, "PROTECTION/VOLUME", "HV=NIE fill — pure/higher zamiast 2:2");
		}
	}
	if (picks.length > 3) picks.length = 3;
	ensureMinimalProtection();
	function ensureCsBridge() {
		const has = (s: string) => picks.some((p: ExactCandidate) => p.score === s);
		const dropForbidden = (p: ExactCandidate) =>
			p.functions.includes("CORE/CENTRAL") ||
			(remisActive && (p.score === "1:1" || p.score === "0:0")) ||
			isMinimal(p.score, favorite) ||
			(isClean(p.score, favorite) && favGoals(p.score, favorite) <= 2) ||
			(ugoActive && isMixed(p.score, favorite) && (p.functions.includes("CORE/CENTRAL") || picks[0]?.score === p.score));
		const s01 = favorite === "away" ? "0:1" : "1:0";
		const s02 = favorite === "away" ? "0:2" : "2:0";
		const s03 = favorite === "away" ? "0:3" : "3:0";
		if (has(s01) && has(s03) && !has(s02)) {
			const cand = findScore(pool, (c: ExactCandidate) => c.score === s02);
			if (cand && !used.has(cand.score)) {
				const dropAt = picks.findIndex((p: ExactCandidate) => p.score === s03 && !dropForbidden(p));
				if (dropAt >= 0) {
					used.delete(picks[dropAt].score);
					picks[dropAt] = {
						...cand,
						functions: [...cand.functions, "PROTECTION/VOLUME"],
						satisfies: [...cand.satisfies, "Mostek CS 0:2"],
					};
					used.add(cand.score);
					log.push(`Mostek CS 0:2: ${s03} → ${s02}`);
				} else if (picks.length < 3) {
					take(cand, "PROTECTION/VOLUME", "Mostek CS 0:2");
				}
			}
		}
		const oddsFav = typeof odds === "number" ? odds : 99;
		const csLock = csFav === "Strong" || csFav === "Medium";
		const has20 = picks.some((p: ExactCandidate) => isClean(p.score, favorite) && favGoals(p.score, favorite) === 2);
		const has31 = picks.some((p: ExactCandidate) => isMixed(p.score, favorite) && favGoals(p.score, favorite) === 3);
		const has30 = picks.some((p: ExactCandidate) => isClean(p.score, favorite) && favGoals(p.score, favorite) === 3);
		if (oddsFav <= 1.4 && csLock && has20 && has31 && !has30 && oddsFav < 1.7) {
			const cand30 = findScore(pool, (c: ExactCandidate) => isClean(c.score, favorite) && favGoals(c.score, favorite) === 3);
			if (!cand30 || blockFillCandidate(cand30)) return;
			const beside = pct < 83 && ugoActive;
			if (picks.length < 3) {
				take(cand30, "PROTECTION/VOLUME", beside ? "Mostek CS 3:0 obok 3:1" : "Mostek CS 3:0");
				return;
			}
			const dropAt = picks.findIndex((p: ExactCandidate, i: number) => {
				if (i === 0) return false;
				if (dropForbidden(p)) return false;
				if (beside && isMixed(p.score, favorite) && favGoals(p.score, favorite) === 3) return false;
				if (beside) return i === 2;
				return isMixed(p.score, favorite) && favGoals(p.score, favorite) === 3 && i === 2;
			});
			if (dropAt >= 1) {
				used.delete(picks[dropAt].score);
				picks[dropAt] = {
					...cand30,
					functions: [...cand30.functions, "PROTECTION/VOLUME"],
					satisfies: [...cand30.satisfies, beside ? "Mostek CS 3:0 obok 3:1" : "Mostek CS 3:0"],
				};
				used.add(cand30.score);
				log.push(beside ? `Mostek CS 3:0 obok 3:1 → ${cand30.score}` : `Mostek CS 3:0 → ${cand30.score}`);
			}
		}
	}
	function applyTop3Patches05() {
		const scoreOf = (s: string) => findScore(pool, (c: ExactCandidate) => c.score === s);
		const scoreOrMint = (s: string): ExactCandidate | undefined => {
			const hit = scoreOf(s);
			if (hit) return hit;
			const base = pool[0] || picks[0];
			if (!base) return undefined;
			return { ...base, score: s, reasons: [...base.reasons], functions: [...base.functions], satisfies: [...base.satisfies] };
		};
		const stamp = (cand: ExactCandidate, sat: string): ExactCandidate => ({
			...cand,
			functions: [...cand.functions, "OVERRIDE"],
			satisfies: [...cand.satisfies, sat],
		});
		const putLast = (cand: ExactCandidate | undefined, sat: string, keep: (p: ExactCandidate) => boolean) => {
			if (!cand || picks.some((p: ExactCandidate) => p.score === cand.score)) return false;
			if (picks.length < 3) {
				picks.push(stamp(cand, sat));
				used.add(cand.score);
				log.push(sat);
				return true;
			}
			let dropAt = 2;
			for (let i = picks.length - 1; i >= 1; i--) {
				if (!keep(picks[i])) {
					dropAt = i;
					break;
				}
			}
			used.delete(picks[dropAt].score);
			picks[dropAt] = stamp(cand, sat);
			used.add(cand.score);
			log.push(`${sat} → ${cand.score} (slot ${dropAt + 1})`);
			return true;
		};
		if (gapWatch && !picks.some((p: ExactCandidate) => p.score === "1:1")) {
			const d11 = scoreOf("1:1");
			putLast(
				d11,
				"WATCH 15.2: 1:1 obowiązkowo w TOP3 (pułapka krótki kurs + luka)",
				(p: ExactCandidate) => isMixed(p.score, favorite) || (isClean(p.score, favorite) && favGoals(p.score, favorite) === 2) || p.score === "1:1",
			);
		}
		if (!mixedOnly && pct >= 85 && !gapWatch && picks[0] && favorite !== "none") {
			const core = picks[0].score;
			const neighbor = core === "1:3" ? "1:2" : core === "3:0" ? "2:0" : core === "0:3" ? "0:2" : "";
			if (neighbor) {
				const already = picks.findIndex((p: ExactCandidate) => p.score === neighbor);
				if (already === 1) {
					/* EPL2 już sąsiad */
				} else if (already > 1) {
					const tmp = picks[1];
					picks[1] = picks[already];
					picks[already] = tmp;
					log.push(`GREEN ≥85%: ${neighbor} → EPL2 (sąsiad −1 gol)`);
				} else {
					const cand = scoreOf(neighbor);
					if (cand && picks.length >= 2) {
						if (picks.length < 3) {
							picks.push(picks[1]);
							picks[1] = stamp(cand, "GREEN ≥85%: sąsiad −1 gol jako EPL2");
						} else {
							used.delete(picks[2].score);
							picks[2] = picks[1];
							picks[1] = stamp(cand, "GREEN ≥85%: sąsiad −1 gol jako EPL2");
						}
						used.add(cand.score);
						log.push(`GREEN ≥85% CORE ${core} → EPL2 ${neighbor}`);
					}
				}
			}
		}
		if (mixedOnly && favorite !== "none") {
			const s02 = favorite === "away" ? "0:2" : "2:0";
			const s03 = favorite === "away" ? "0:3" : "3:0";
			const s31 = favorite === "away" ? "1:3" : "3:1";
			const hasClean23 = picks.some((p: ExactCandidate) => p.score === s02 || p.score === s03);
			const idx31 = picks.findIndex((p: ExactCandidate) => p.score === s31);
			const otherMixed = picks.some((p: ExactCandidate) => isMixed(p.score, favorite) && p.score !== s31);
			if (idx31 >= 0 && !picks.some((p: ExactCandidate) => p.score === s03) && otherMixed) {
				const cand = scoreOf(s03);
				if (cand) {
					used.delete(picks[idx31].score);
					picks[idx31] = stamp(cand, "MIXED 70–84: czyste 3:0 zamiast 3:1");
					used.add(cand.score);
					log.push(`MIXED 70–84: ${s31} → ${s03}`);
				}
			} else if (!hasClean23) {
				const prefer = picks.some((p: ExactCandidate) => isMixed21(p.score, favorite)) ? s03 : s02;
				const cand = scoreOf(prefer) ?? scoreOf(s02) ?? scoreOf(s03);
				putLast(
					cand,
					"MIXED 70–84: czyste 2:0/3:0 zostaje w TOP3",
					(p: ExactCandidate) => isMixed(p.score, favorite) || p.score === "1:1" || p.score === "0:0",
				);
			}
		}
		const favOdds = typeof odds === "number" ? odds : 99;
		const h2hRows = recentH2h(data.h2h, input.kickoff);
		let h2hBoth = 0;
		let h2hN = 0;
		for (const m of h2hRows.slice(0, 5)) {
			const sc = parseScore(m.score);
			if (!Number.isFinite(sc.h) && !Number.isFinite(sc.a)) continue;
			h2hN++;
			if (sc.h > 0 && sc.a > 0) h2hBoth++;
		}
		const lastH2h = h2hRows[0];
		const lastH2hUdWon = (() => {
			if (!lastH2h || favorite === "none") return false;
			const sc = parseScore(lastH2h.score);
			if (sc.h === sc.a) return false;
			const winner = sc.h > sc.a ? lastH2h.home : lastH2h.away;
			const udNames = favorite === "home"
				? [data.away.name, input.away]
				: [data.home.name, input.home];
			return udNames.some((n) => sameClub(winner, n || ""));
		})();
		const favXg = favorite === "away" ? data.away.xg : data.home.xg;
		const udXg = favorite === "away" ? data.home.xg : data.away.xg;
		const allCs = picks.length >= 3 && favorite !== "none" && picks.every((p: ExactCandidate) => isClean(p.score, favorite));
		const sitkoA = favorite !== "none" && favOdds >= 1.85 && allCs && ((udXg > 0 && favXg > 0 && udXg > favXg) || lastH2hUdWon);
		if (sitkoA) {
			const inject = lastH2hUdWon ? (favorite === "away" ? "1:0" : "0:1") : "1:1";
			putLast(
				scoreOrMint(inject),
				`06.09 A: CS-only + kurs≥1.85 — ${inject} w TOP3 (xG/H2H underdoga)`,
				(p: ExactCandidate) => isMixed(p.score, favorite) || p.score === "1:1" || (isClean(p.score, favorite) && favGoals(p.score, favorite) <= 2),
			);
			notes.push(`06.09 A: CS-only przy ${favOdds.toFixed(2)} — ${inject} za 3:0`);
		}
		const udBtts = favorite === "home" ? data.away.bttsPct : data.home.bttsPct;
		const favGaHome = data.home.gaHome || data.home.gaAvg;
		const sitkoB = favorite === "home" && h2hN >= 4 && h2hBoth >= 4 && udBtts >= 80 && favGaHome >= 1.0;
		if (sitkoB) {
			if (picks[0]?.score === "2:0") {
				const i21 = picks.findIndex((p: ExactCandidate) => p.score === "2:1");
				if (i21 > 0) {
					const tmp = picks[0];
					picks[0] = picks[i21];
					picks[i21] = tmp;
					log.push("06.09 B: EPL1 2:0 ↔ 2:1 (H2H zawsze strzelają)");
				} else {
					const cand21 = scoreOrMint("2:1");
					if (cand21) {
						used.add("2:1");
						const old = picks[0];
						picks[0] = stamp(cand21, "06.09 B: 2:1 CORE zamiast 2:0");
						picks.splice(1, 0, old);
						if (picks.length > 3) {
							const drop = picks.findIndex((p: ExactCandidate, i: number) => i >= 2 && p.score !== "2:0" && p.score !== "2:1");
							if (drop >= 2) {
								used.delete(picks[drop].score);
								picks.splice(drop, 1);
							} else picks.length = 3;
						}
						log.push("06.09 B: 2:1 jako EPL1, 2:0 schodzi");
					}
				}
			}
			putLast(
				scoreOrMint("1:2"),
				"06.09 B: 1:2 obowiązkowo (H2H BTTS 4/5)",
				(p: ExactCandidate) => p.score === "2:1" || p.score === "2:0" || p.score === "1:2",
			);
			notes.push("06.09 B: H2H zawsze strzelają — EPL1 nie 2:0, 1:2 w TOP3");
		}
		const csSeason = favorite === "away" ? data.away.csPctOverall : data.home.csPctOverall;
		const udGfVenue = favorite === "away" ? data.home.gfHome : data.away.gfAway;
		const s03 = favorite === "away" ? "0:3" : "3:0";
		const favPlayed = favorite === "away" ? data.away.played : data.home.played;
		const sitkoC1 = favorite !== "none" && csSeason >= 80 && udGfVenue <= 0.2 && favPlayed >= 2 && !picks.some((p: ExactCandidate) => p.score === s03);
		if (sitkoC1) {
			putLast(
				scoreOrMint(s03),
				"06.09 C1: CS sezon ≥80% → 3:0 w TOP3",
				(p: ExactCandidate) =>
					isMixed(p.score, favorite) ||
					isMinimal(p.score, favorite) ||
					p.score === "1:1" ||
					p.score === "0:0",
			);
			notes.push(`06.09 C1: CS ${csSeason}% — ${s03} w TOP3 (bez 4:0)`);
		}
		const sitkoC2 =
			favorite === "away" &&
			favOdds <= 1.8 &&
			(data.away.csPctAway || 0) >= 60 &&
			(data.home.gfAvg || 0) <= 0.6 &&
			picks.some((p: ExactCandidate) => p.score === "0:0") &&
			!picks.some((p: ExactCandidate) => p.score === "0:2");
		if (sitkoC2) {
			const cand02 = scoreOrMint("0:2");
			const idx00 = picks.findIndex((p: ExactCandidate) => p.score === "0:0");
			if (cand02 && idx00 >= 0) {
				used.delete("0:0");
				picks[idx00] = stamp(cand02, "06.09 C2: 0:2 zamiast 0:0 (CS wyjazd ≥60%)");
				used.add("0:2");
				log.push("06.09 C2: 0:0 → 0:2");
				notes.push("06.09 C2: 0:2 zamiast 0:0 — bez 0:4");
			}
		}
		if (picks.length > 3) picks.length = 3;
	}
	ensureCsBridge();
	if (soft) {
		const threeOneIdx = picks.findIndex((p: ExactCandidate) => isHigher(p.score, favorite) && isMixed(p.score, favorite) && favGoals(p.score, favorite) === 3 && udGoals(p.score, favorite) === 1);
		if (threeOneIdx >= 0) {
			used.delete(picks[threeOneIdx].score);
			picks.splice(threeOneIdx, 1);
			log.push("Soft Band: 3:1 usunięte z TOP3");
			for (const c of pool as ExactCandidate[]) {
				if (picks.length >= 3) break;
				if (used.has(c.score)) continue;
				const is30 = isClean(c.score, favorite) && favGoals(c.score, favorite) === 3;
				if (isSoftHigh(c.score, favorite) && !(is30 && !ugoActive)) continue;
				take(c, "PROTECTION/VOLUME", "Soft Band fill zamiast 3:1");
			}
		}
	}
	if (lowKursDom) {
		const four = fourMixed ?? findScore(pool, (c: ExactCandidate) => favGoals(c.score, favorite) >= 4);
		if (four && !picks.some((p: ExactCandidate) => favGoals(p.score, favorite) >= 4)) {
			if (picks.length >= 3) {
				used.delete(picks[2].score);
				picks[2] = {
					...four,
					functions: [...four.functions, "PROTECTION/VOLUME"],
					satisfies: [...four.satisfies, "Low Kurs Dominator 4:1 (Conf ≥88)"],
				};
				used.add(four.score);
			} else {
				take(four, "PROTECTION/VOLUME", "Low Kurs Dominator 4:1 (Conf ≥88)");
			}
			log.push("Low Kurs ≤1.30 + xG≥2 + Conf≥88: 4:1/4+ w TOP3");
		}
	}
	if (mixedOnly) {
		const fat = picks.filter((p: ExactCandidate) => favGoals(p.score, favorite) >= 4);
		for (const r of fat) {
			const i = picks.findIndex((p: ExactCandidate) => p.score === r.score);
			if (i >= 0) {
				used.delete(r.score);
				picks.splice(i, 1);
			}
		}
		if (fat.length) log.push("MIXED ONLY 70–84: zrzut 4:0/4:1/5:1 z TOP3 (15.2)");
		if (!picks.some((p: ExactCandidate) => isMixed(p.score, favorite))) {
			const mix = mixed21 ?? mixed ?? higherMixed;
			if (mix && !used.has(mix.score)) {
				const copy: ExactCandidate = { ...mix, functions: [...mix.functions, "OVERRIDE"], satisfies: [...mix.satisfies, "MIXED ONLY 70–84 — mixed obowiązkowy w TOP3"] };
				if (picks.length >= 3) {
					used.delete(picks[picks.length - 1].score);
					picks[picks.length - 1] = copy;
				} else {
					picks.push(copy);
				}
				used.add(mix.score);
				log.push("MIXED ONLY 70–84: mixed wstawiony do TOP3");
			}
		}
		for (const c of pool as ExactCandidate[]) {
			if (picks.length >= 3) break;
			if (used.has(c.score) || favGoals(c.score, favorite) >= 4) continue;
			take(c, "PROTECTION/VOLUME", "MIXED ONLY fill");
		}
		if (picks.length > 3) picks.length = 3;
	}
	if (favorite === "none" && picks[0]) {
		const s = parseScore(picks[0].score);
		if (s.h >= 2 || s.a >= 2) {
			const d11 = findScore(pool, (c: ExactCandidate) => c.score === "1:1");
			const d10 = findScore(pool, (c: ExactCandidate) => c.score === "1:0" || c.score === "0:1");
			const insert = d11 ?? d10;
			if (insert && insert.score !== picks[0].score) {
				const rest = picks.filter((p: ExactCandidate) => p.score !== insert.score);
				picks.splice(0, picks.length, {
					...insert,
					functions: [...insert.functions, "CORE/CENTRAL"],
					satisfies: [...insert.satisfies, "Coin-flip CORE 1:1/1:0 — zakaz 2:1"],
				}, ...rest);
				if (picks.length > 3) picks.length = 3;
				used.add(insert.score);
				log.push("Coin-flip: CORE max 1:1 / 1:0 / 0:1 — zakaz 2:1");
			}
		}
	}
	if (picks.length > 3) picks.length = 3;
	const lowBtts = data.home.bttsPct > 0 && data.away.bttsPct > 0 && data.home.bttsPct < 50 && data.away.bttsPct < 50;
	const nilNilTop3 = (soft && pct < 80 && lowBtts) || centralExact === "0:0";
	if (nilNilTop3) {
		const zz = pool.find((c: ExactCandidate) => c.score === "0:0");
		if (zz && !picks.some((p: ExactCandidate) => p.score === "0:0")) {
			const dropRank = (p: ExactCandidate) => {
				if (isMinimal(p.score, favorite) || p.score === "0:0") return 100;
				if (softLowLambda && p.score === "1:1") return 100;
				if (isChaosExact(p.score, favorite) || p.score === "2:2") return 0;
				if (isUnderdogWin(p.score, favorite)) return 1;
				if (isMixed21(p.score, favorite)) return 3;
				return 10;
			};
			let dropAt = -1;
			let best = 99;
			for (let i = 0; i < picks.length; i++) {
				const r = dropRank(picks[i]);
				if (r < best) {
					best = r;
					dropAt = i;
				}
			}
			if (picks.length >= 3 && dropAt >= 0 && best < 100) {
				used.delete(picks[dropAt].score);
				picks.splice(dropAt, 1);
			}
			picks.push({
				...zz,
				functions: [...zz.functions, "OVERRIDE"],
				satisfies: [...zz.satisfies, "0:0 VALUE/BAL — CORE 1:0 zostaje"],
			});
			used.add("0:0");
			if (picks.length > 3) picks.length = 3;
			log.push("0:0 w TOP3 (VALUE/BAL), CORE 1:0 nietknięty");
		}
	}
	const formBtts =
		data.home.bttsPct > 0 && data.away.bttsPct > 0
			? (data.home.bttsPct + data.away.bttsPct) / 2
			: 0;
	if (picks[0]?.score === "1:1" && formBtts > 0 && formBtts < 45) {
		const cleanCore = minimal ?? clean2;
		if (cleanCore && cleanCore.score !== "1:1") {
			const draw11 = picks[0];
			const rest = picks.slice(1).filter((p: ExactCandidate) => p.score !== cleanCore.score);
			const already = picks.find((p: ExactCandidate) => p.score === cleanCore.score);
			picks.splice(0, picks.length, {
				...(already ?? cleanCore),
				functions: [...(already ?? cleanCore).functions, "CORE/CENTRAL"],
				satisfies: [...(already ?? cleanCore).satisfies, "CORE 1:0 — 1:1 zablokowane przy BTTS formy <45%"],
			}, {
				...draw11,
				functions: [...draw11.functions.filter((f) => f !== "CORE/CENTRAL"), "OVERRIDE"],
				satisfies: [...draw11.satisfies, "1:1 ochrona — BTTS formy <45%, nie CORE"],
			}, ...rest);
			used.add(cleanCore.score);
			if (picks.length > 3) picks.length = 3;
			log.push(`BTTS formy ${formBtts.toFixed(0)}% <45: CORE 1:1 → ${cleanCore.score}, 1:1 zostaje w TOP3`);
		}
	}
	if (picks.length < 3) processErrors.push("TOP3 niepełne po kompresji");
	const top3Before = uniqueTop3Rules.map((r) => r.rule);
	const conflict = uniqueTop3Rules.length > 3;
	const protection: ExactCandidate[] = [];
	const draw = findScore(pool, (c: ExactCandidate) => c.score === "1:1" || c.score === "0:0");
	if (remisActive && draw && !picks.some((p: ExactCandidate) => p.score === "1:1" || p.score === "0:0")) protection.push({
		...draw,
		role: "Protection",
		satisfies: ["Remis Safety 1:1/0:0"],
		functions: ["PROTECTION/VOLUME"]
	});
	if (hvActive && !picks.some((p: ExactCandidate) => p.score === "2:2") && !protection.some((p: ExactCandidate) => p.score === "2:2")) {
		const d22 = findScore(pool, (c: ExactCandidate) => c.score === "2:2");
		if (d22) protection.push({
			...d22,
			role: "Protection",
			satisfies: ["2:2 protection/EPL4 przy HV — nie slot remisu"],
			functions: ["PROTECTION/VOLUME"],
		});
	}
	const nilNilTop4 = pct < 80 && lowBtts && !(ugoActive && !soft);
	if (nilNilTop4) {
		const zz = findScore(pool, (c: ExactCandidate) => c.score === "0:0");
		if (zz && !picks.some((p: ExactCandidate) => p.score === "0:0") && !protection.some((p: ExactCandidate) => p.score === "0:0")) {
			protection.push({
				...zz,
				role: "Protection",
				satisfies: ["0:0 ochrona TOP4 (BTTS<50, Conf<80)"],
				functions: ["PROTECTION/VOLUME"],
			});
			log.push("0:0 ochrona TOP4 — TOP3 UGO/mixed nietknięty");
		}
	}
	if (extreme && higherClean && !picks.some((p: ExactCandidate) => p.score === higherClean.score)) {
		const four = findScore(pool, (c: ExactCandidate) => favGoals(c.score, favorite) >= 4) ?? higherClean;
		if (four && !picks.some((p: ExactCandidate) => p.score === four.score)) protection.push({
			...four,
			role: "Protection",
			satisfies: ["Extreme Dominator 4:0/5:0 TOP4"],
			functions: ["PROTECTION/VOLUME"]
		});
	}
	if (bqgActive && typeof odds === "number" && odds > 1.35 && odds <= 1.5 && minimal && !picks.some((p: ExactCandidate) => isMinimal(p.score, favorite))) protection.push({
		...minimal,
		role: "Protection",
		satisfies: ["Minimal Exact TOP4"],
		functions: ["PROTECTION/VOLUME"]
	});
	if (mixedOnly) {
		for (let i = picks.length - 1; i >= 0; i--) {
			if (favGoals(picks[i].score, favorite) >= 4) {
				used.delete(picks[i].score);
				picks.splice(i, 1);
				log.push("MIXED ONLY: 4+/5+ usunięte z TOP3 przed lockiem");
			}
		}
		if (!picks.some((p: ExactCandidate) => isMixed(p.score, favorite))) {
			const mix = mixed21 ?? mixed;
			if (mix) {
				const copy: ExactCandidate = { ...mix, functions: [...mix.functions, "OVERRIDE"], satisfies: [...mix.satisfies, "MIXED ONLY — mixed w TOP3"] };
				if (picks.length >= 3) picks[2] = copy;
				else picks.push(copy);
				used.add(mix.score);
			}
		}
		if (picks.length > 3) picks.length = 3;
	}
	ensureCsBridge();
	applyTop3Patches05();
	{
		const core = picks[0]?.score;
		const has00 = picks.some((p: ExactCandidate) => p.score === "0:0");
		const has11 = picks.some((p: ExactCandidate) => p.score === "1:1");
		if ((core === "1:0" || core === "0:1") && has00 && !has11) {
			let d11 = findScore(pool, (c: ExactCandidate) => c.score === "1:1");
			if (!d11) {
				const base = pool[0] || picks[0];
				if (base) {
					d11 = {
						...base,
						score: "1:1",
						reasons: [...base.reasons],
						functions: [...base.functions],
						satisfies: [...base.satisfies],
					};
				}
			}
			if (d11) {
				const zz = picks.find((p: ExactCandidate) => p.score === "0:0")!;
				used.delete("0:0");
				picks.splice(0, picks.length, ...picks.filter((p: ExactCandidate) => p.score !== "0:0"));
				picks.push({
					...d11,
					functions: [...d11.functions.filter((f) => f !== "CORE/CENTRAL"), "OVERRIDE"],
					satisfies: [...d11.satisfies, "slot remisu: 1:1 na EPL3, 0:0 ochrona TOP4"],
				});
				used.add("1:1");
				if (picks.length > 3) picks.length = 3;
				if (!protection.some((p: ExactCandidate) => p.score === "0:0")) {
					protection.push({
						...zz,
						role: "Protection",
						satisfies: [...zz.satisfies, "0:0 ochrona TOP4 — slot remisu zajął 1:1"],
						functions: [...zz.functions.filter((f) => f !== "CORE/CENTRAL"), "PROTECTION/VOLUME"],
					});
				}
				log.push("slot remisu: 1:1 na EPL3, 0:0 → ochrona TOP4 (CORE nietknięty)");
			}
		}
	}
	const epl: ExactCandidate[] = picks.slice(0, 3).map((c: ExactCandidate, i: number) => ({
		...c,
		role: roleFor(i, c.score, favorite),
		epl: {
			...c.epl,
			pct: displayPct(i, c.epf.total)
		}
	}));
	const protRanked: ExactCandidate[] = protection.map((c: ExactCandidate, i: number) => ({
		...c,
		epl: {
			...c.epl,
			pct: displayPct(3 + i, c.epf.total)
		}
	}));
	let consistencyOk = true;
	if (processErrors.some((e) => /homonim|nie lock/i.test(e))) consistencyOk = false;
	if (!soft && pct < 83 && (csFav === "Medium" || csFav === "Weak") && ugoActive) {
		const top = epl[0];
		if (top && isClean(top.score, favorite) && epl.some((x: ExactCandidate) => isMixed(x.score, favorite))) {
			const mix = epl.find((x: ExactCandidate) => isMixed(x.score, favorite));
			const clean = top;
			if (mix && epl.indexOf(mix) > 0) {
				epl.splice(0, epl.length, mix!, clean, ...epl.filter((x: ExactCandidate) => x !== mix && x !== clean));
				epl.forEach((c: ExactCandidate, i: number) => {
					c.role = roleFor(i, c.score, favorite);
					c.epl.pct = displayPct(i, c.epf.total);
				});
				log.push("Final EPL Consistency Check — relock K12 (K13 nie zmienia rankingu): mixed przed clean (Conf<83 + UGO)");
			}
		}
	}
	if (pct >= 88 && (profile === "High Dominator" || csFav === "Strong") && !epl.some((x: ExactCandidate) => isHigher(x.score, favorite))) {
		processErrors.push("Conf ≥88% High Dominator bez higher exactu w TOP3 — błąd procesu");
		consistencyOk = false;
	}
	if (hvActive && pct < 85 && !epl.some((x: ExactCandidate) => isMixed(x.score, favorite))) {
		processErrors.push("HV + Conf<85% bez mixed w TOP3 — błąd procesu");
		consistencyOk = false;
	}
	const thesisClean = epl[0] && isClean(epl[0].score, favorite);
	const coupons = buildCoupons(epl, protRanked, pct, hvActive, thesisClean ?? false);
	const gfHomeVenue = data.home.gfHome ?? data.home.gfAvg;
	const last3HomeGf = data.home.form.filter((f) => f.ha === "H").slice(0, 3)
		.reduce((s, f) => s + (f.scoreFor || 0), 0);
	const injBlob = `${data.injuries || ""} ${p1.injuries || ""}`;
	const t60Dead = /P2 atak gospodarza martwy/i.test(injBlob);
	const t60P2ok = /P2 atak gospodarza OK po XI/i.test(injBlob);
	const p2DeadHome = t60Dead || (!t60P2ok && (gfHomeVenue <= 0.4 || last3HomeGf <= 1));
	const delta1x2 = (typeof input.oddsHome === "number" && typeof input.oddsAway === "number")
		? Math.abs(input.oddsHome - input.oddsAway) : 99;
	const p5Gate = delta1x2 >= 0.4 && csFav !== "Weak";
	notes.push(t60Dead || t60P2ok
		? `P2 martwy gospodarz=${p2DeadHome} (po XI T−60, GF home=${gfHomeVenue}, last3H=${last3HomeGf})`
		: `P2 martwy gospodarz=${p2DeadHome} (GF home=${gfHomeVenue}, last3H=${last3HomeGf})`);
	notes.push(`P5 Δkurs=${delta1x2.toFixed(2)} gate=${p5Gate}`);
	let decision: EngineOutput["decision"] = "GREEN LIGHT";
	const awayOddsP2 = typeof input.oddsAway === "number" ? input.oddsAway : 99;
	const p2Coupon = favorite === "away" && awayOddsP2 >= 1.7 && awayOddsP2 <= 2.2;
	const p2Block = p2Coupon && !p2DeadHome;
	const p5Block = delta1x2 < 0.4;
	if (!squadVerified) decision = "NO EXECUTION";
	else if (keyOutFav || gkOutFav || massOutFav) decision = "NO EXECUTION";
	else if (pct < 70) decision = "NO EXECUTION";
	else if (processErrors.some((e) => /homonim|nie lock/i.test(e))) decision = "NO EXECUTION";
	else if (missingBox) {
		decision = "WAIT";
		notes.push("K12: brak boxu (rożne/SOT) i xG — nie zamykać exactu, dociągnij dane");
	} else if (gapWatch) {
		decision = "WATCH";
		notes.push("25.18.3 / 15.2: Conf 70–85% + kurs ≤1.45 + luka ≥8 — nie eskalujemy exactu, WATCH albo AH −1.5 / Home+Over");
	} else if (mixedOnly) decision = "MIXED ONLY";
	else if (processErrors.length) decision = "WAIT";
	else if (!homeApproved && pct < 88) decision = "WATCH";
	if (nearEven && pct < 83 && decision !== "NO EXECUTION") decision = "WATCH";
	if (p2Block && decision === "GREEN LIGHT") {
		decision = "WATCH";
		notes.push("P2 sitko: gość 1.70–2.20, atak gospodarza nie martwy po XI/GF — brak GREEN (EPL bez zmian)");
	}
	if (p5Block && decision === "GREEN LIGHT") {
		decision = "WATCH";
		notes.push("P5 sitko: Δkurs < 0.40 — brak GREEN (HIT modelu ≠ kupon, Burnley)");
	}
	const hasOdds = typeof input.oddsHome === "number" && typeof input.oddsAway === "number";
	const homeWin = hasOdds ? (implied(input.oddsHome) ?? 0) : 0;
	const awayWin = hasOdds ? (implied(input.oddsAway) ?? 0) : 0;
	const drawP = hasOdds ? (implied(input.oddsDraw) ?? 0) : 0;
	const totalImp = homeWin + awayWin + drawP;
	const homeWinN = totalImp ? Math.round((homeWin / totalImp) * 1e3) / 10 : 0;
	const awayWinN = totalImp ? Math.round((awayWin / totalImp) * 1e3) / 10 : 0;
	const drawN = totalImp ? Math.round((100 - homeWinN - awayWinN) * 10) / 10 : 0;
	const hasBtts = data.home.bttsPct > 0 || data.away.bttsPct > 0 || data.home.form.length + data.away.form.length >= 4;
	const bttsRaw = data.home.bttsPct * 0.5 + data.away.bttsPct * 0.5 + (hvActive && hasBtts ? 6 : 0);
	const bttsProj = hasBtts ? clamp(Math.round(bttsRaw * 10) / 10, 8, 88) : 0;
	const gfSum = data.home.gfAvg + data.away.gfAvg;
	const over25 = gfSum > 0 ? clamp(Math.round((gfSum / 2.6) * 55 + (hvActive ? 6 : 0)), 8, 88) : 0;
	const direction = favorite === "home" ? `Gospodarz (${data.home.name})` : favorite === "away" ? `Gość (${data.away.name})` : "Brak faworyta flow";
	const directionProb = hasOdds ? (favorite === "home" ? homeWinN : favorite === "away" ? awayWinN : drawN) : 0;
	const checklistK12 = {
		"Zero Domysłów": true,
		"UGO + Late Goal w TOP3/TOP4 jeśli aktywne": !(ugoActive && raw.lateGoalUnderdogPct > 20) || epl.some((e: ExactCandidate) => isMixed(e.score, favorite)) || protRanked.some((e: ExactCandidate) => e.score === "2:2"),
		"Ranking spójny z override": !ugoForceMixed || soft || epl.some((e: ExactCandidate) => isMixed(e.score, favorite)) || exception16,
		"Central Exact wskazany": !!centralExact,
		"Multi-Rule Compression jeśli >3": !conflict || true
	};
	const checklistK15 = {
		"Checklista K12 TAK": Object.values(checklistK12).every(Boolean),
		"Remis Safety w TOP3 jeśli aktywny": !remisActive || epl.some((p: ExactCandidate) => p.score === "1:1" || p.score === "0:0") || protRanked.some((p: ExactCandidate) => p.score === "1:1" || p.score === "0:0"),
		"Dominator Expansion jeśli Conf≥88": mixedOnly || !dominator.active || epl.some((e: ExactCandidate) => isHigher(e.score, favorite)),
		"Soft Band jeśli 1.70–2.10": !soft || isLowPure(epl[0]?.score ?? "2:0", favorite) && !isSoftHigh(epl[0]?.score ?? "", favorite),
		"Soft Band + UGO: czysty w EPL1/2": !(soft && ugoActive) || epl.slice(0, 2).some((e: ExactCandidate) => isLowPure(e.score, favorite)),
		"Early Season CAP": !(sampleN <= 3) || pct <= 82,
		"MIXED ONLY 70–84, nie GREEN-Dominator": !mixedOnly || decision === "MIXED ONLY" || decision === "WATCH" || decision === "WAIT",
		"Mixed w TOP3 przy 70–84": !mixedOnly || epl.some((e: ExactCandidate) => isMixed(e.score, favorite)),
		"Zakaz 4+/5+ w TOP3 przy 70–84": !mixedOnly || !epl.some((e: ExactCandidate) => favGoals(e.score, favorite) >= 4),
		"QOI za lukę ≥8 to 7–8+": posGap < 8 || parts.qoi >= 7,
		"Market nie z EPL%−implied": true,
		"Mostek CS 0:2 przy 0:1+0:3":
			!(picks.some((p: ExactCandidate) => p.score === (favorite === "away" ? "0:1" : "1:0")) &&
				picks.some((p: ExactCandidate) => p.score === (favorite === "away" ? "0:3" : "3:0"))) ||
			picks.some((p: ExactCandidate) => p.score === (favorite === "away" ? "0:2" : "2:0")),
		"Mostek CS 3:0 obok 3:1 gdy Conf<83+UGO":
			!(typeof odds === "number" && odds <= 1.4 && (csFav === "Strong" || csFav === "Medium") && pct < 83 && ugoActive &&
				picks.some((p: ExactCandidate) => isClean(p.score, favorite) && favGoals(p.score, favorite) === 2) &&
				picks.some((p: ExactCandidate) => isMixed(p.score, favorite) && favGoals(p.score, favorite) === 3)) ||
			picks.some((p: ExactCandidate) => isClean(p.score, favorite) && favGoals(p.score, favorite) === 3),
		"Mostek nie zrzucił 1:0/2:0/1:1/1:2 CORE": true,
	};
	if (Object.values(checklistK15).some((v: boolean) => !v) && (decision === "GREEN LIGHT" || decision === "MIXED ONLY")) {
		decision = decision === "MIXED ONLY" ? "WATCH" : "WAIT";
		processErrors.push("Checklista K15 niepełna — brak GREEN LIGHT");
	}
	if (!((data.steps ?? []).length >= 8)) processErrors.push("Niekompletne kroki V26");
	const stats = {
		goalsHome: data.home.gfAvg,
		goalsAway: data.away.gfAvg,
		cornersHome: data.home.corners,
		cornersAway: data.away.corners,
		sotHome: data.home.shotsOnTarget,
		sotAway: data.away.shotsOnTarget,
		cardsHome: data.home.cards,
		cardsAway: data.away.cards,
		bttsHomePct: data.home.bttsPct,
		bttsAwayPct: data.away.bttsPct,
		bttsProjectedPct: bttsProj,
		over25ProjectedPct: over25,
		direction,
		directionProb,
		homeWinProb: homeWinN,
		drawProb: drawN,
		awayWinProb: awayWinN
	};
	return {
		profile,
		favorite,
		direction,
		gates,
		centralExact,
		centralEpf: central?.epf.total ?? 0,
		centralWhy: central?.reasons.join("; ") || "Najwyższy EPF bez hard gates",
		compression: {
			conflict,
			applied: conflict || compressedHigherUgo,
			before: top3Before,
			after: epl.map((e: ExactCandidate) => e.score),
			multiRuleExact: compressedHigherUgo ? higherMixed?.score ?? "—" : "—",
			log
		},
		epl,
		protection: protRanked,
		confidence,
		coupons,
		decision,
		processErrors,
		consistencyOk,
		gustaw: {
			k4: data.gustawK4 || p1.gustawK4 || "",
			k12: data.gustawK12 || p2?.gustawK12 || "",
			k17: data.gustawK17 || p2?.gustawK17 || ""
		},
		stats,
		checklistK12,
		checklistK15,
		markets: (() => {
			const board = buildMarkets(input, data, { stats, favorite, direction, centralExact, epl });
			if (gapWatch) {
				const side = favorite === "away" ? "Away −1.5" : "Home −1.5";
				board.surest = [
					{
						id: "ah-mixed-only-15",
						market: "AH / Over",
						pick: `${side} / Home+Over`,
						pct: 61,
						why: "Conf 70–84% MIXED ONLY + luka ≥8 + kurs ≤1.45 — nie eskalujemy exactu (15.2 / 25.18.3)",
						fairOdds: 1.64,
						source: "kurs",
					},
					...board.surest,
				];
			}
			return board;
		})(),
	};
}
function buildCoupons(epl: ExactCandidate[], protection: ExactCandidate[], pct: number, hv: boolean, cleanCore: boolean) {
	const e1 = epl[0]?.score;
	const e2 = epl[1]?.score;
	const e3 = epl[2]?.score;
	const p4 = protection[0]?.score;
	if (!e1) return [];
	if (pct >= 85 && cleanCore && !hv) return [{
		id: 1,
		exacts: [e1],
		thesis: "Główna teza — powielenie EPL1",
		weight: "65%"
	}, {
		id: 2,
		exacts: [e1, e2].filter(Boolean),
		thesis: "EPL1 + alternatywa",
		weight: "25%"
	}];
	if (pct >= 80 && pct < 85) return [{
		id: 1,
		exacts: [e1],
		thesis: "Główna teza",
		weight: "60%"
	}, {
		id: 2,
		exacts: [e2, e3].filter(Boolean),
		thesis: "Alternatywa TOP3",
		weight: "30%"
	}];
	const third = hv ? [e3, p4].filter(Boolean) : [e3].filter(Boolean);
	return [
		{
			id: 1,
			exacts: [e1],
			thesis: "Powielenie EPL1",
			weight: "55%"
		},
		{
			id: 2,
			exacts: [e1, e2].filter(Boolean),
			thesis: "Teza + VALUE",
			weight: "30%"
		},
		{
			id: 3,
			exacts: third,
			thesis: hv ? "Chaos reserve" : "Trzeci exact",
			weight: "15%"
		}
	];
}
export function mergeSteps(p1?: PhasePayload, p2?: PhasePayload): StepResult[] {
	const s1 = p1 ? overlaySteps(p1.steps ?? [], fillPhase1Steps(p1)) : [];
	const s2 = p2 ? overlaySteps(p2.steps ?? [], fillPhase2Steps(p2)) : [];
	const map = new Map<number, StepResult>();
	for (const s of s1) map.set(s.k, s);
	for (const s of s2) map.set(s.k, s);
	return [...map.values()].sort((a, b) => a.k - b.k);
}
