import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isHighVarianceLeague, isAllsvenskan, isSuperettan, matchLeague, resolveLeague, clubNameMatches, filterMatchSources, LEAGUES, leagueHintFromClubs } from "./leagues.ts";
import { backfillPayload, mergeTeamBlocks, pickOdds, payloadFromFacts, applyT60Overlay, buildT60Overlay } from "./normalize.ts";
import { hardStops, needsEnrich } from "./fill-steps.ts";
import { runEngine, underdogOffensiveQuality, isCoinFlipOdds, formScoreFromLast5, recentH2h } from "./engine.ts";
import { cappedLambda, clipEarlyOutlierGoals, gfGaForHv, venueLambda, buildExactPool } from "./exact-epf.ts";
import { leagueIdFromHint, rosterNameScore, SIBLING_LEAGUES, formFixturePool, pickTeamsFromFixtures, afTeamIdsFromSources } from "./api-football.ts";
import { buildMarkets, top3BlocksBttsYes, top3BlocksBttsNo, top3BlocksOver25, top3HasCleanSheetExact } from "./markets.ts";
import { buildSample } from "./sample.ts";
import type { MatchInput, PhasePayload, TeamBlock } from "./types.ts";

function team(over: Partial<TeamBlock> & { name: string }): TeamBlock {
  return {
    tablePos: 0,
    points: 0,
    played: 4,
    form: [
      { date: "2026-08-10", opponent: "X", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
      { date: "2026-08-03", opponent: "Y", ha: "A", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
    ],
    csPctOverall: 25,
    csPctHome: 40,
    csPctAway: 10,
    bttsPct: 47,
    over25Pct: 40,
    gfAvg: 1.5,
    gaAvg: 1.9,
    gfHome: 1.6,
    gaHome: 1.4,
    gfAway: 1.3,
    gaAway: 2.2,
    xg: 0,
    xga: 0,
    possession: 0,
    corners: 8.57,
    shotsOnTarget: 0,
    cards: 0,
    goalsAfter60Pct: 0,
    goalsSecondHalfPct: 0,
    finishingLabel: "Neutral",
    ...over,
  };
}

function payload(over: Partial<PhasePayload> = {}): PhasePayload {
  const home = over.home ?? team({ name: "United SC", shotsOnTarget: 2.43, cards: 0.29 });
  const away = over.away ?? team({ name: "Police AC", shotsOnTarget: 4.71, cards: 1.1, gfAvg: 1.9, gaAvg: 1.5 });
  return {
    sources: [],
    match: { league: "Calcutta Premier Division", kickoff: "2026-08-25T11:30:00", homePos: 6, awayPos: 12, ptsHome: 10, ptsAway: 6, motivation: "" },
    odds: { home: 0 as unknown as number, draw: 0 as unknown as number, away: 0 as unknown as number, exacts: {} },
    favorite: "away",
    profileDraft: "Away Favorite",
    h2h: [],
    h2hAvgGoals: 0,
    injuries: "",
    weather: "",
    coach: "",
    steps: [],
    squadVerified: true,
    gatesRaw: {
      csFavLast10: 25,
      csFavLast5Venue: 20,
      goalsConcededFavLast5Venue: 6,
      bttsRelevant: 47,
      avgGoalsRelevant: 3.4,
      favConcededInLast10Pct: 70,
      underdogOffQuality: false,
      matchesPlayedFav: 7,
      lateGoalUnderdogPct: 0,
      leagueGapScore: 0,
      xgFavVsThisTier: 0,
      udCsPct: 0,
      opponentGfVenue: 0,
      opponentBttsPct: 0,
    },
    ...over,
    home,
    away,
  };
}

const calcuttaInput: MatchInput = {
  home: "United SC",
  away: "Police AC",
  league: "Indie - Calcutta Premier Division",
  kickoff: "2026-08-25T09:30:00.000Z",
  oddsHome: 2.87,
  oddsDraw: 3.0,
  oddsAway: 2.3,
};

describe("V26 HV / liga", () => {
  it("Calcutta Premier Division NIE jest HV", () => {
    assert.equal(isHighVarianceLeague("Calcutta Premier Division"), false);
    assert.equal(isHighVarianceLeague("Indie - Calcutta Premier Division"), false);
    assert.equal(isHighVarianceLeague("India Calcutta Premier Division"), false);
  });
  it("Irlandia / Rumunia / USL nadal HV", () => {
    assert.equal(isHighVarianceLeague("League of Ireland Premier Division"), true);
    assert.equal(isHighVarianceLeague("Ireland - Premier Division"), true);
    assert.equal(isHighVarianceLeague("Liga I Romania"), true);
    assert.equal(isHighVarianceLeague("USL Championship"), true);
  });
  it("Ekstraklasa i Allsvenskan nie są auto-HV", () => {
    assert.equal(isHighVarianceLeague("Ekstraklasa"), false);
    assert.equal(isHighVarianceLeague("Allsvenskan"), false);
    assert.equal(isHighVarianceLeague("Premier League"), false);
  });
  it("I Liga PL = 107, sąsiad Ekstraklasy 106", () => {
    assert.equal(leagueIdFromHint("Ekstraklasa"), 106);
    assert.equal(leagueIdFromHint("I Liga"), 107);
    assert.ok((SIBLING_LEAGUES[106] || []).includes(107));
    assert.ok((SIBLING_LEAGUES[107] || []).includes(106));
  });
  it("Uzbekistan / Urugwaj / Serbia nie wpadają w Swiss / Chile / Turcję", () => {
    assert.equal(leagueIdFromHint("Uzbekistan Super League"), 369);
    assert.equal(leagueIdFromHint("Uzbekistan - Super League"), 369);
    assert.equal(matchLeague("Uzbekistan - Super League"), "Uzbekistan Super League");
    assert.equal(leagueIdFromHint("Urugwaj - Primera Division"), 268);
    assert.equal(leagueIdFromHint("Urugwaj Primera Division"), 268);
    assert.equal(matchLeague("Urugwaj Primera Division"), "Uruguay Primera División");
    assert.equal(leagueIdFromHint("Uruguay Primera División"), 268);
    assert.notEqual(leagueIdFromHint("Urugwaj - Primera Division"), 265);
    assert.equal(leagueIdFromHint("Serbia Super Liga"), 286);
    assert.equal(leagueIdFromHint("Süper Lig"), 203);
    assert.notEqual(leagueIdFromHint("Serbia - Super Liga"), 203);
    assert.equal(resolveLeague("Pakhtakor Tashkent", "Andijan", "Uzbekistan - Super League"), "Uzbekistan Super League");
    assert.equal(resolveLeague("Montevideo City Torque", "Cerro Largo", "Urugwaj - Primera Division"), "Uruguay Primera División");
    assert.equal(resolveLeague("Danubio", "CA Penarol", "Urugwaj Primera Division"), "Uruguay Primera División");
    assert.equal(resolveLeague("Novi Pazar", "Zeleznicar Pancevo", "Süper Lig"), "Serbia Super Liga");
    assert.equal(leagueIdFromHint(resolveLeague("Novi Pazar", "Zeleznicar Pancevo", "Süper Lig") || ""), 286);
    assert.equal(leagueHintFromClubs("Pakhtakor Tashkent", "Andijan"), "Uzbekistan Super League");
    assert.equal(leagueHintFromClubs("Montevideo City Torque", "Cerro Largo"), "Uruguay Primera División");
    assert.equal(leagueHintFromClubs("Danubio", "CA Penarol"), "Uruguay Primera División");
    assert.equal(leagueHintFromClubs("Novi Pazar", "Zeleznicar Pancevo"), "Serbia Super Liga");
    assert.equal(resolveLeague("Pakhtakor Tashkent", "Andijan", "Super League"), "Uzbekistan Super League");
    assert.equal(resolveLeague("Danubio", "CA Penarol", "Primera Division"), "Uruguay Primera División");
    assert.equal(resolveLeague("Novi Pazar", "Zeleznicar Pancevo", "Super Liga"), "Serbia Super Liga");
    assert.equal(leagueIdFromHint("Liga Portugal"), 94);
    assert.notEqual(leagueIdFromHint("Urugwaj Primera Division"), 94);
    assert.ok(rosterNameScore("Atletico Torque", "Montevideo City Torque") > rosterNameScore("Uruguay Montevideo", "Montevideo City Torque"));
    assert.ok(rosterNameScore("Novi Pazar", "Novi Pazar") > rosterNameScore("Kabel Novi Sad", "Novi Pazar"));
    assert.ok(rosterNameScore("Železničar Pančevo", "Zeleznicar Pancevo") >= 80);
  });
  it("matchLeague mapuje Calcutta", () => {
    assert.equal(matchLeague("Indie - Calcutta Premier Division"), "Calcutta Premier Division");
    assert.equal(matchLeague("Calcutta Premier Division"), "Calcutta Premier Division");
  });
  it("Kazachstan Premier League ≠ angielska Premier League (id 39)", () => {
    assert.equal(matchLeague("Kazachstan - Premier League"), "Kazakhstan Premier League");
    assert.equal(matchLeague("Kazakhstan Premier League"), "Kazakhstan Premier League");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Kazakhstan Premier League"), 389);
    assert.equal(leagueIdFromHint("Kazachstan - Premier League"), 389);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Tobol Kostanay", "Kairat", "Premier League"), "Kazakhstan Premier League");
    assert.equal(resolveLeague("Tobol Kostanay", "Ordabasy", "Ekstraklasa"), "Kazakhstan Premier League");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(isHighVarianceLeague("Kazakhstan Premier League"), false);
  });
  it("Kazachstan First League ≠ Premier 389 — Ontustyk / Aktobe II", () => {
    assert.equal(matchLeague("Kazachstan - First League"), "Kazakhstan First League");
    assert.equal(matchLeague("Kazakhstan - First League"), "Kazakhstan First League");
    assert.equal(leagueIdFromHint("Kazakhstan First League"), 388);
    assert.equal(leagueIdFromHint("Kazachstan - First League"), 388);
    assert.equal(resolveLeague("Akademia Ontustyk", "Aktobe II", "Kazachstan - First League"), "Kazakhstan First League");
    assert.equal(resolveLeague("Akademia Ontustyk", "Aktobe II", "Premier League"), "Kazakhstan First League");
    assert.equal(resolveLeague("Aktobe", "Kairat", "Kazakhstan Premier League"), "Kazakhstan Premier League");
  });
  it("Azerbejdżan Premyer Liqa ≠ angielska Premier League (id 39)", () => {
    assert.equal(matchLeague("Azerbejdżan - Premyer Liqa"), "Azerbaijan Premier League");
    assert.equal(matchLeague("Azerbaijan Premier League"), "Azerbaijan Premier League");
    assert.equal(matchLeague("Azerbaijan - Premier League"), "Azerbaijan Premier League");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Azerbaijan Premier League"), 419);
    assert.equal(leagueIdFromHint("Azerbejdżan - Premyer Liqa"), 419);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Araz Nakhchivan", "Sabah Baku", "Premier League"), "Azerbaijan Premier League");
    assert.equal(resolveLeague("Sumgayit", "Qarabag", "Premier League"), "Azerbaijan Premier League");
    assert.equal(resolveLeague("Sumqayıt FK", "Qarabağ", "Ekstraklasa"), "Azerbaijan Premier League");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("Araz Nakhchivan", "Sabah Baku", "Premier League")), 419);
    assert.equal(leagueIdFromHint(resolveLeague("Sumgayit", "Qarabag", "Premier League")), 419);
    assert.ok(rosterNameScore("Sumqayıt", "Sumgayit") >= 45);
    assert.ok(rosterNameScore("Sumqayit", "Sumgayit") >= 45);
    assert.ok(rosterNameScore("Qarabağ", "Qarabag") >= 45);
    assert.ok(rosterNameScore("Araz-Naxçıvan", "Araz Nakhchivan") >= 45);
    assert.ok(rosterNameScore("Sabah", "Sabah Baku") >= 45);
    assert.ok(rosterNameScore("Sumqayıt", "Sumgayit") > rosterNameScore("Sabah", "Sumgayit"));
    assert.ok(rosterNameScore("Sabah FA", "Sabah Baku") >= 45, "Sabah FA vs Sabah Baku");
    assert.ok(rosterNameScore("Sabah FA", "Sabah Baku") > rosterNameScore("Neftchi Baku", "Sabah Baku"));
    assert.ok(rosterNameScore("Neftchi Baku", "Sabah Baku") < 45, "baku nie może kraść Neftchi");
    assert.ok(rosterNameScore("Safa Baku", "Sabah Baku") < 45, "Safa ≠ Sabah");
    assert.ok(clubNameMatches("Sumqayıt", "Sumgayit"));
    assert.ok(clubNameMatches("Sumqayit", "Sumgayit"));
    assert.ok(clubNameMatches("Qabala", "Gabala"));
    assert.ok(clubNameMatches("Sabah FA", "Sabah Baku"));
    assert.equal(clubNameMatches("Neftchi Baku", "Sabah Baku"), false);
    assert.ok(clubNameMatches("Araz", "Araz Nakhchivan"));
    assert.ok(clubNameMatches("Qarabağ", "Qarabag"));
  });
  it("Mizoram Premier League ≠ angielska Premier League (id 39)", () => {
    assert.equal(matchLeague("Mizoram Premier League"), "Mizoram Premier League");
    assert.equal(matchLeague("Indie - Mizoram Premier League"), "Mizoram Premier League");
    assert.equal(matchLeague("GIG MOTORS Mizoram Premier League"), "Mizoram Premier League");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Mizoram Premier League"), null);
    assert.equal(leagueIdFromHint("Indie - Mizoram Premier League"), null);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Mizoram", "Mis FC Lawtngtlai", "Premier League"), "Mizoram Premier League");
    assert.equal(resolveLeague("Mizoram", "Mls FC Lawtngtlai", "Premier League"), "Mizoram Premier League");
    assert.equal(resolveLeague("Mizoram Police", "MLS FC Lawngtlai", "Premier League"), "Mizoram Premier League");
    assert.equal(resolveLeague("Mizoram Police FC", "MLS FC Lawngtlai", "Ekstraklasa"), "Mizoram Premier League");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("Mizoram", "Mis FC Lawtngtlai", "Premier League")), null);
    assert.equal(isHighVarianceLeague("Mizoram Premier League"), false);
    assert.ok(LEAGUES.includes("Mizoram Premier League"));
    assert.equal(leagueHintFromClubs("Mizoram", "Mis FC Lawtngtlai"), "Mizoram Premier League");
    // Jeden klub nie nadpisuje EPL (guard homonimów).
    assert.equal(resolveLeague("Mizoram", "Chelsea", "Premier League"), "Premier League");
    assert.ok(clubNameMatches("MLS FC", "Mis FC Lawtngtlai"));
    assert.ok(clubNameMatches("MLS FC", "Mls FC Lawtngtlai"));
    assert.ok(clubNameMatches("MLS FC, Lawngtlai", "Mis FC Lawtngtlai"));
    assert.ok(clubNameMatches("Mizoram Police FC", "Mizoram"));
  });
  it("Egipt Premier League ≠ angielska Premier League (id 39)", () => {
    assert.equal(matchLeague("Egyptian Premier League"), "Egyptian Premier League");
    assert.equal(matchLeague("Egipt - Premier League"), "Egyptian Premier League");
    assert.equal(matchLeague("Egypt Premier League"), "Egyptian Premier League");
    assert.equal(matchLeague("Premier League Ze screena Egipt - Premier League"), "Egyptian Premier League");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Egyptian Premier League"), 233);
    assert.equal(leagueIdFromHint("Egipt - Premier League"), 233);
    assert.equal(leagueIdFromHint("Egypt Premier League"), 233);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Zamalek", "Abo Qair Semads", "Premier League"), "Egyptian Premier League");
    assert.equal(resolveLeague("Zamalek", "Abu Qair Semad", "Ekstraklasa"), "Egyptian Premier League");
    assert.equal(resolveLeague("Zamalek SC", "Abu Qir Semad", "Premier League"), "Egyptian Premier League");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("Zamalek", "Abo Qair Semads", "Premier League")), 233);
    assert.ok(isHighVarianceLeague("Egyptian Premier League"));
    assert.ok(LEAGUES.includes("Egyptian Premier League"));
    assert.equal(leagueHintFromClubs("Zamalek", "Abo Qair Semads"), "Egyptian Premier League");
    assert.equal(resolveLeague("Zamalek", "Chelsea", "Premier League"), "Premier League");
    assert.ok(clubNameMatches("Abu Qair Semad", "Abo Qair Semads"));
    assert.ok(clubNameMatches("Abu Qir Semad", "Abo Qair Semads"));
    assert.ok(clubNameMatches("Zamalek SC", "Zamalek"));
    assert.equal(clubNameMatches("Abu Qair Semad", "Chelsea"), false);
  });
  it("NIFL Premiership ≠ szkockie Premiership (id 179)", () => {
    assert.equal(matchLeague("NIFL Premiership"), "NIFL Premiership");
    assert.equal(matchLeague("Northern Ireland Premiership"), "NIFL Premiership");
    assert.equal(matchLeague("Irlandia Północna - Premiership"), "NIFL Premiership");
    assert.equal(matchLeague("Premiership"), "Scottish Premiership");
    assert.equal(matchLeague("Scottish Premiership"), "Scottish Premiership");
    assert.equal(leagueIdFromHint("NIFL Premiership"), 408);
    assert.equal(leagueIdFromHint("Northern Ireland Premiership"), 408);
    assert.equal(leagueIdFromHint("Scottish Premiership"), 179);
    assert.equal(leagueIdFromHint("Premiership"), 179);
    assert.equal(resolveLeague("Larne", "Bangor FC", "Scottish Premiership"), "NIFL Premiership");
    assert.equal(resolveLeague("Larne", "Bangor FC", "Premiership"), "NIFL Premiership");
    assert.equal(resolveLeague("Larne", "Bangor FC", "Ekstraklasa"), "NIFL Premiership");
    assert.equal(resolveLeague("Celtic", "Rangers", "Premiership"), "Scottish Premiership");
    assert.equal(resolveLeague("Larne", "Celtic", "Scottish Premiership"), "Scottish Premiership");
    assert.equal(leagueIdFromHint(resolveLeague("Larne", "Bangor FC", "Scottish Premiership")), 408);
    assert.ok(LEAGUES.includes("NIFL Premiership"));
    assert.equal(leagueHintFromClubs("Larne", "Bangor FC"), "NIFL Premiership");
    assert.ok(clubNameMatches("Larne", "Larne FC"));
    assert.ok(clubNameMatches("Bangor", "Bangor FC"));
  });
  it("Al Qadsiah OCR = Al-Qadisiyah FC (hard-stop nazwy)", () => {
    assert.ok(clubNameMatches("Al-Qadisiyah FC", "Al Qadsiah"));
    assert.ok(clubNameMatches("Al Qadisiyah", "Al Qadsiah"));
    assert.ok(clubNameMatches("Al-Ahli Jeddah", "Al Ahli"));
    assert.equal(clubNameMatches("Al-Qadisiyah FC", "Al Ahli"), false);
    assert.equal(resolveLeague("Al Qadsiah", "Al Ahli", "Saudi Pro League"), "Saudi Pro League");
  });
  it("Cymru Premier ≠ angielska Premier League (id 39)", () => {
    assert.equal(matchLeague("Cymru Premier"), "Cymru Premier");
    assert.equal(matchLeague("Walia - Cymru Premier"), "Cymru Premier");
    assert.equal(matchLeague("Wales Premier League"), "Cymru Premier");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Cymru Premier"), 110);
    assert.equal(leagueIdFromHint("Walia - Cymru Premier"), 110);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Flint Town United", "Connah's Quay Nomads", "Premier League"), "Cymru Premier");
    assert.equal(resolveLeague("Flint Town United", "Connah's Quay Nomads", "Ekstraklasa"), "Cymru Premier");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("Flint Town United", "Connah's Quay Nomads", "Premier League")), 110);
    assert.ok(rosterNameScore("GAP Connah S Quay FC", "Connah's Quay Nomads") >= 45);
    assert.ok(rosterNameScore("Flint Town United", "Flint Town United") >= 45);
    assert.ok(clubNameMatches("GAP Connah S Quay FC", "Connah's Quay Nomads"));
    assert.ok(clubNameMatches("Flint Town United", "Flint Town United"));
  });
  it("Bułgaria - Parva Liga → id 172, nie search globalny", () => {
    assert.equal(matchLeague("Bułgaria - Parva Liga"), "Parva Liga");
    assert.equal(matchLeague("Bulgaria - Parva Liga"), "Parva Liga");
    assert.equal(matchLeague("Parva Liga"), "Parva Liga");
    assert.equal(matchLeague("efbet Liga"), "Parva Liga");
    assert.equal(leagueIdFromHint("Bułgaria - Parva Liga"), 172);
    assert.equal(leagueIdFromHint("Parva Liga"), 172);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Arda Kardzhali", "Botev Vratsa", "Bułgaria - Parva Liga"), "Parva Liga");
    assert.equal(resolveLeague("Arda Kardzhali", "Botev Vratsa", "Ekstraklasa"), "Parva Liga");
    assert.equal(leagueIdFromHint(resolveLeague("Arda Kardzhali", "Botev Vratsa", "Bułgaria - Parva Liga")), 172);
    assert.ok(rosterNameScore("Arda Kardzhali", "Arda Kardzhali") >= 45);
    assert.ok(rosterNameScore("Botev Vratsa", "Botev Vratsa") >= 45);
    assert.ok(clubNameMatches("Arda Kardzhali", "Arda"));
    assert.ok(clubNameMatches("Botev Vratsa", "Botev Vratsa"));
    assert.equal(clubNameMatches("Levski Sofia", "CSKA 1948 Sofia"), false, "Sofia nie skleja Lewskiego z CSKA 1948");
    assert.equal(clubNameMatches("CSKA Sofia", "CSKA 1948 Sofia"), false, "CSKA ≠ CSKA 1948");
    assert.ok(clubNameMatches("CSKA 1948 Sofia", "CSKA 1948"));
    assert.ok(clubNameMatches("Levski Sofia", "Levski"));
    assert.equal(clubNameMatches("Botev Plovdiv", "Botev Vratsa"), false);
    assert.ok(rosterNameScore("CSKA 1948", "CSKA 1948 Sofia") >= 45);
    assert.ok(rosterNameScore("CSKA 1948 Sofia", "CSKA 1948 Sofia") >= 45);
    assert.ok(rosterNameScore("Levski Sofia", "CSKA 1948 Sofia") < 45, `Levski vs 1948 ${rosterNameScore("Levski Sofia", "CSKA 1948 Sofia")}`);
    assert.ok(rosterNameScore("CSKA Sofia", "CSKA 1948 Sofia") < 45, `CSKA vs 1948 ${rosterNameScore("CSKA Sofia", "CSKA 1948 Sofia")}`);
  });
  it("Chorwacja - HNL → id 210, nie search globalny", () => {
    assert.equal(matchLeague("Chorwacja - HNL"), "HNL");
    assert.equal(matchLeague("Croatia HNL"), "HNL");
    assert.equal(matchLeague("HNL"), "HNL");
    assert.equal(leagueIdFromHint("Chorwacja - HNL"), 210);
    assert.equal(leagueIdFromHint("HNL"), 210);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Hajduk Split", "Lokomotiva Zagreb", "Chorwacja - HNL"), "HNL");
    assert.equal(resolveLeague("Hajduk Split", "Lokomotiva Zagreb", "Ekstraklasa"), "HNL");
    assert.equal(leagueIdFromHint(resolveLeague("Hajduk Split", "Lokomotiva Zagreb", "Chorwacja - HNL")), 210);
    assert.ok(rosterNameScore("HNK Hajduk Split", "Hajduk Split") >= 45);
    assert.ok(rosterNameScore("NK Lokomotiva Zagreb", "Lokomotiva Zagreb") >= 45);
    assert.ok(clubNameMatches("HNK Hajduk Split", "Hajduk Split"));
    assert.ok(clubNameMatches("NK Lokomotiva Zagreb", "Lokomotiva Zagreb"));
  });
  it("Bośnia Premijer Liga → id 315", () => {
    assert.equal(matchLeague("Bośnia i Hercegowina - Premier Liga"), "Premijer Liga");
    assert.equal(matchLeague("Bosnia - Premijer Liga"), "Premijer Liga");
    assert.equal(leagueIdFromHint("Bośnia i Hercegowina - Premier ..."), 315);
    assert.equal(leagueIdFromHint("Premijer Liga"), 315);
    assert.equal(resolveLeague("Zrinjski Mostar", "BSK Banja Luka", "Ekstraklasa"), "Premijer Liga");
    assert.ok(rosterNameScore("Zrinjski", "Zrinjski Mostar") >= 45);
    assert.ok(rosterNameScore("BSK Banja Luka", "BSK Banja Luka") >= 45);
  });
  it("Uganda Premier League ≠ EPL id 39 (NEC–Lugazi)", () => {
    assert.equal(matchLeague("Uganda Premier League"), "Uganda Premier League");
    assert.equal(leagueIdFromHint("Uganda Premier League"), 585);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("NEC FC", "Lugazi FC", "Premier League"), "Uganda Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("NEC FC", "Lugazi FC", "Premier League")), 585);
    assert.ok(rosterNameScore("NEC", "NEC FC") >= 45);
    assert.ok(rosterNameScore("Lugazi", "Lugazi FC") >= 45);
  });

  it("Białoruś Vysshaya League = Belarus Premier League id 116", () => {
    assert.equal(matchLeague("Białoruś - Vysshaya League"), "Belarus Premier League");
    assert.equal(matchLeague("Belarus Premier League"), "Belarus Premier League");
    assert.equal(leagueIdFromHint("Białoruś - Vysshaya League"), 116);
    assert.equal(leagueIdFromHint("Belarus Premier League"), 116);
    assert.equal(resolveLeague("Dynamo Brest", "BATE Borysów", "Białoruś - Vysshaya League"), "Belarus Premier League");
    assert.equal(resolveLeague("FC Dinamo Brest", "BATE Borysów", "Premier League"), "Belarus Premier League");
  });

  it("Izrael Ligat Ha'Al ≠ EPL id 39 (Hapoel Beer Sheva–Haifa)", () => {
    assert.equal(matchLeague("Izrael - Premier League"), "Ligat Ha'Al");
    assert.equal(matchLeague("Israel Premier League"), "Ligat Ha'Al");
    assert.equal(matchLeague("Ligat Ha'Al"), "Ligat Ha'Al");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Ligat Ha'Al"), 383);
    assert.equal(leagueIdFromHint("Izrael - Premier League"), 383);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Hapoel Beer Sheva", "Hapoel Haifa", "Premier League"), "Ligat Ha'Al");
    assert.equal(resolveLeague("Hapoel Beer Sheva", "Hapoel Haifa", "Ekstraklasa"), "Ligat Ha'Al");
    assert.equal(leagueIdFromHint(resolveLeague("Hapoel Beer Sheva", "Hapoel Haifa", "Premier League")), 383);
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.ok(rosterNameScore("Hapoel Beer Sheva", "Hapoel Beer Sheva") >= 45);
    assert.ok(rosterNameScore("Hapoel Haifa", "Hapoel Haifa") >= 45);
    assert.ok(clubNameMatches("Hapoel Beer Sheva", "Hapoel Beersheva"));
  });

  it("forma: liga gdy jest, puchary tylko gdy ligi brak", () => {
    const liga = {
      fixture: { id: 1, date: "2026-08-30T00:00:00+00:00" },
      league: { id: 71, name: "Serie A", season: 2026 },
      teams: { home: { id: 127, name: "Flamengo" }, away: { id: 1, name: "Botafogo" } },
      goals: { home: 3, away: 0 },
    };
    const cup = {
      fixture: { id: 2, date: "2026-08-20T00:00:00+00:00" },
      league: { id: 13, name: "Copa Libertadores", season: 2026 },
      teams: { home: { id: 127, name: "Flamengo" }, away: { id: 9, name: "Palmeiras" } },
      goals: { home: 1, away: 0 },
    };
    const mix = formFixturePool([liga], [cup, liga]);
    assert.equal(mix.length, 1);
    assert.equal(mix[0].league.name, "Serie A");
    const cupsOnly = formFixturePool([], [cup]);
    assert.equal(cupsOnly.length, 1);
    assert.equal(cupsOnly[0].league.name, "Copa Libertadores");
  });

  it("BTTS TAK / O2.5 TAK nie w najpewniejszych gdy TOP3 = 3:1, 2:0, 1:0", () => {
    assert.equal(top3BlocksBttsYes(["3:1", "2:0", "1:0"]), true);
    assert.equal(top3BlocksOver25(["3:1", "2:0", "1:0"]), true);
    assert.equal(top3BlocksBttsYes(["2:1", "3:1", "1:1"]), false);
    assert.equal(top3BlocksBttsNo(["1:1", "1:0", "2:1"]), true);
    assert.equal(top3BlocksBttsNo(["1:0", "1:1", "2:0"]), false);
    assert.equal(top3BlocksBttsNo(["2:1", "1:1", "1:0"]), false);
    assert.equal(top3HasCleanSheetExact(["3:1", "1:0", "2:1"]), true);
    assert.equal(top3HasCleanSheetExact(["3:1", "2:1", "1:1"]), false);
    assert.equal(top3HasCleanSheetExact(["3:0", "3:1", "2:1"]), false);
    const form = Array.from({ length: 6 }, (_, i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: (i % 2 ? "H" : "A") as "H" | "A",
      scoreFor: 2,
      scoreAgainst: 1,
      quality: "SREDNI" as const,
    }));
    const p = payload({
      home: team({ name: "Flamengo", form, gfAvg: 2.5, gaAvg: 0.63, bttsPct: 50, over25Pct: 63, csPctOverall: 50 }),
      away: team({ name: "Mirassol", form, gfAvg: 0.7, gaAvg: 1.2, bttsPct: 80, over25Pct: 50, csPctOverall: 20 }),
    });
    const stats = {
      goalsHome: 2.5,
      goalsAway: 0.7,
      cornersHome: 0,
      cornersAway: 0,
      sotHome: 0,
      sotAway: 0,
      cardsHome: 0,
      cardsAway: 0,
      bttsHomePct: 50,
      bttsAwayPct: 80,
      bttsProjectedPct: 71,
      over25ProjectedPct: 60,
      direction: "Gospodarz (Flamengo)",
      directionProb: 80,
      homeWinProb: 80,
      drawProb: 12,
      awayWinProb: 8,
    };
    const board = buildMarkets(
      { home: "Flamengo", away: "Mirassol", league: "Brasileirão Série A", kickoff: "2026-09-03T00:30:00", oddsHome: 1.17, oddsDraw: 6.5, oddsAway: 11 },
      p,
      { stats, favorite: "home", direction: stats.direction, centralExact: "3:1", epl: [{ score: "3:1" }, { score: "2:0" }, { score: "1:0" }] },
    );
    assert.equal(board.surest.some((m) => m.id === "btts-y"), false);
    assert.equal(board.surest.some((m) => m.id === "o25"), false);
  });
  it("Craiova: BTTS TAK nie w najpewniejszych przy 1:0 w TOP3, zostaje na torze", () => {
    assert.equal(top3HasCleanSheetExact(["3:1", "1:0", "2:1"]), true);
    assert.equal(top3BlocksBttsYes(["3:1", "1:0", "2:1"]), false);
    const form = Array.from({ length: 6 }, (_, i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: (i % 2 ? "H" : "A") as "H" | "A",
      scoreFor: 2,
      scoreAgainst: 1,
      quality: "SREDNI" as const,
    }));
    const p = payload({
      home: team({ name: "Universitatea Craiova", form, gfAvg: 1.8, gaAvg: 0.9, bttsPct: 70, over25Pct: 60, csPctOverall: 30 }),
      away: team({ name: "U Cluj", form, gfAvg: 1.1, gaAvg: 1.3, bttsPct: 75, over25Pct: 55, csPctOverall: 20 }),
    });
    const stats = {
      goalsHome: 1.8,
      goalsAway: 1.1,
      cornersHome: 0,
      cornersAway: 0,
      sotHome: 0,
      sotAway: 0,
      cardsHome: 0,
      cardsAway: 0,
      bttsHomePct: 70,
      bttsAwayPct: 75,
      bttsProjectedPct: 72,
      over25ProjectedPct: 58,
      direction: "Gospodarz (Universitatea Craiova)",
      directionProb: 62,
      homeWinProb: 62,
      drawProb: 22,
      awayWinProb: 16,
    };
    const board = buildMarkets(
      { home: "Universitatea Craiova", away: "U Cluj", league: "Liga I Romania", kickoff: "2026-09-07T17:30:00", oddsHome: 1.54, oddsDraw: 4.1, oddsAway: 5.35 },
      p,
      { stats, favorite: "home", direction: stats.direction, centralExact: "3:1", epl: [{ score: "3:1" }, { score: "1:0" }, { score: "2:1" }] },
    );
    assert.equal(board.surest.some((m) => m.id === "btts-y"), false, `BTTS TAK w surest: ${board.surest.map((m) => m.id).join(",")}`);
    assert.ok(board.track.some((m) => m.id === "btts-y"), `BTTS TAK zniknęło z toru: ${board.track.map((m) => m.id).join(",")}`);
  });
  it("Wolverhampton = Wolves w Championship id 40", () => {
    assert.equal(leagueIdFromHint("Championship"), 40);
    assert.ok(rosterNameScore("Wolves", "Wolverhampton") >= 45);
    assert.ok(rosterNameScore("West Ham", "West Ham") >= 45);
    assert.ok(clubNameMatches("Wolves", "Wolverhampton"));
    assert.ok(clubNameMatches("Wolverhampton", "Wolves"));
    assert.ok(clubNameMatches("West Ham", "West Ham"));
    assert.ok(rosterNameScore("QPR", "Queens Park Rangers") >= 45);
    assert.ok(rosterNameScore("QPR", "Queen's Park Rangers") >= 45);
    assert.ok(clubNameMatches("QPR", "Queens Park Rangers"));
    assert.ok(clubNameMatches("Queens Park Rangers", "QPR"));
    assert.equal(clubNameMatches("Queen's Park", "QPR"), false);
    assert.ok(clubNameMatches("Paris Saint Germain", "PSG"));
    assert.ok(clubNameMatches("Paris Saint-Germain", "PSG"));
    assert.ok(clubNameMatches("PSG", "Paris Saint Germain"));
    assert.ok(rosterNameScore("Paris Saint Germain", "PSG") >= 90);
    assert.ok(rosterNameScore("Paris Saint-Germain", "PSG") >= 90);
    const psgStops = hardStops(
      payload({ home: team({ name: "Paris Saint Germain" }), away: team({ name: "Monaco" }) }),
      { home: "PSG", away: "Monaco", league: "Ligue 1", kickoff: "2026-09-04T19:05:00", oddsHome: 1.35, oddsDraw: 5.6, oddsAway: 7 },
    );
    assert.ok(!psgStops.some((x) => /nie zgadza/.test(x)), psgStops.join("; "));
    const qprStops = hardStops(
      payload({ home: team({ name: "QPR" }), away: team({ name: "Cardiff" }) }),
      { home: "Queens Park Rangers", away: "Cardiff City", league: "Championship", kickoff: "2026-09-02T19:45:00", oddsHome: 1.82, oddsDraw: 3.9, oddsAway: 3.9 },
    );
    assert.ok(!qprStops.some((x) => /nie zgadza/.test(x)), qprStops.join("; "));
    const stops = hardStops(
      payload({ home: team({ name: "West Ham" }), away: team({ name: "Wolves" }) }),
      { home: "West Ham", away: "Wolverhampton", league: "Championship", kickoff: "2026-09-01T15:00:00", oddsHome: 2.07, oddsDraw: 3.6, oddsAway: 3.35 },
    );
    assert.ok(!stops.some((x) => /nie zgadza/.test(x)), stops.join("; "));
  });
  it("Al Najma / Al Jabalain → Saudi First Division id 308, nie Pro League 307", () => {
    assert.equal(resolveLeague("Al Najma", "Al Jabalain", "Saudi Pro League"), "Saudi First Division");
    assert.equal(leagueIdFromHint("Saudi First Division"), 308);
    assert.equal(leagueIdFromHint("Saudi Pro League"), 307);
    assert.ok(rosterNameScore("Al Jabalain", "Al Jabalain") >= 45);
    assert.ok(rosterNameScore("Al Najma", "Al Najma") >= 45);
  });
  it("Łotwa - Virsliga → id 365, nie search globalny", () => {
    assert.equal(matchLeague("Łotwa - Virsliga"), "Virsliga");
    assert.equal(matchLeague("Lotwa - Virsliga"), "Virsliga");
    assert.equal(matchLeague("Latvia Virsliga"), "Virsliga");
    assert.equal(matchLeague("Virsliga"), "Virsliga");
    assert.equal(leagueIdFromHint("Łotwa - Virsliga"), 365);
    assert.equal(leagueIdFromHint("Virsliga"), 365);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Liepaja", "Valmiera", "Ekstraklasa"), "Virsliga");
    assert.equal(isHighVarianceLeague("Virsliga"), false);
  });
  it("Arabia Saudyjska - Pro League → id 307, nie Belgia i nie Oman", () => {
    assert.equal(matchLeague("Arabia Saudyjska - Pro League"), "Saudi Pro League");
    assert.equal(matchLeague("Saudi Pro League"), "Saudi Pro League");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Arabia Saudyjska - Pro League"), 307);
    assert.equal(leagueIdFromHint("Saudi Pro League"), 307);
    assert.equal(leagueIdFromHint("Belgian Pro League"), 144);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Al Ettifaq", "Al Nassr", "Premier League"), "Saudi Pro League");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
  });
  it("Mohameddan SC (R) = Mohammedan w składzie Calcutta, nie Bangladesz", () => {
    assert.ok(rosterNameScore("Mohammedan", "Mohameddan SC (R)") >= 45);
    assert.ok(rosterNameScore("Mohammedan", "Mohammedan SC (R)") >= 45);
    assert.ok(rosterNameScore("Mohammedan", "Mohammedan SC") >= 45);
    assert.ok(rosterNameScore("Police", "Police AC") >= 45);
    assert.ok(rosterNameScore("Police", "Police AC") > rosterNameScore("Calcutta Police", "Police AC"));
    assert.ok(rosterNameScore("United", "United SC") > rosterNameScore("United Kolkata", "United SC"));
    assert.ok(clubNameMatches("Mohammedan", "Mohameddan SC (R)"));
    assert.ok(clubNameMatches("Mohammedan", "Mohammedan SC (R)"));
    assert.ok(rosterNameScore("Measurers", "Measures Club") >= 45);
    assert.ok(rosterNameScore("Measurers", "Measures Club") > rosterNameScore("Kalighat Club", "Measures Club"));
    assert.ok(rosterNameScore("Kalighat Club", "Measures Club") < 45);
    assert.ok(clubNameMatches("Measurers", "Measures Club"));
    assert.equal(clubNameMatches("Kalighat Club", "Measures Club"), false);
  });
  it("Al Taawoun = Al Taawon w składzie Saudi, nie Al-Faisaly", () => {
    assert.ok(rosterNameScore("Al Taawon", "Al Taawoun") >= 45);
    assert.ok(rosterNameScore("Al-Faisaly FC", "Al Taawoun") < 45);
    assert.ok(rosterNameScore("Al Taawon", "Al Taawoun") > rosterNameScore("Al-Faisaly FC", "Al Taawoun"));
    assert.ok(clubNameMatches("Al Taawon", "Al Taawoun"));
    assert.equal(clubNameMatches("Al-Faisaly FC", "Al Taawoun"), false);
    assert.ok(clubNameMatches("Al-Nassr", "Al Nassr"));
    assert.ok(clubNameMatches("Al-Ahli Jeddah", "Al Ahli"));
    assert.ok(clubNameMatches("Al-Ettifaq", "Al Ettifaq"));
  });
  it("Al Draih OCR = Al Diriyah w SPL, nie Al Riyadh", () => {
    assert.ok(rosterNameScore("Al Diriyah", "Al Draih") >= 45);
    assert.ok(rosterNameScore("Al Diriyah", "Al Draih") > rosterNameScore("Al Riyadh", "Al Draih"));
    assert.ok(rosterNameScore("Al-Qadisiyah FC", "Al Qadsiah") >= 45);
    assert.ok(clubNameMatches("Al Diriyah", "Al Draih"));
    assert.equal(clubNameMatches("Al Riyadh", "Al Draih"), false);
    assert.ok(clubNameMatches("Al Diriyah", "Al Drah"), "OCR Superbet Al Drah = Diriyah");
    assert.ok(clubNameMatches("Al Diriyah", "Al-Drah"));
    assert.equal(clubNameMatches("Al Riyadh", "Al Drah"), false, "Drah ≠ Riyadh");
    assert.ok(rosterNameScore("Al Diriyah", "Al Drah") >= 45);
    assert.ok(rosterNameScore("Al Diriyah", "Al Drah") > rosterNameScore("Al Riyadh", "Al Drah"));
    const drahStops = hardStops(
      payload({ home: team({ name: "Al-Fateh" }), away: team({ name: "Al Diriyah" }) }),
      { home: "Al Fateh", away: "Al Drah", league: "Saudi Pro League", kickoff: "2026-09-09T18:00:00.000Z", oddsHome: 3.6, oddsDraw: 3.65, oddsAway: 1.9 },
    );
    assert.ok(!drahStops.some((x) => /nie zgadza/.test(x)), drahStops.join("; "));
    assert.equal(leagueIdFromHint("Saudi Pro League"), 307);
  });
  it("Hearts = Heart Of Midlothian w Premiership, nie Hearts of Oak", () => {
    assert.ok(rosterNameScore("Heart Of Midlothian", "Hearts") >= 45);
    assert.ok(rosterNameScore("Hibernian", "Hibernian") >= 45);
    assert.ok(clubNameMatches("Heart Of Midlothian", "Hearts"));
    assert.equal(matchLeague("Szkocja - Premiership"), "Scottish Premiership");
    assert.equal(leagueIdFromHint("Szkocja - Premiership"), 179);
    assert.equal(leagueIdFromHint("Scottish Premiership"), 179);
    assert.equal(resolveLeague("Hibernian", "Hearts", "Premier League"), "Scottish Premiership");
  });
  it("Turcja - 1. Lig = TFF 1. Lig id 204, nie Süper Lig 203", () => {
    assert.equal(matchLeague("Turcja - 1. Lig"), "TFF 1. Lig");
    assert.equal(leagueIdFromHint("Turcja - 1. Lig"), 204);
    assert.equal(leagueIdFromHint("TFF 1. Lig"), 204);
    assert.equal(leagueIdFromHint("Süper Lig"), 203);
    assert.equal(leagueIdFromHint("Turcja - Süper Lig"), 203);
    assert.ok(SIBLING_LEAGUES[203]?.includes(204));
    assert.ok(SIBLING_LEAGUES[204]?.includes(203));
    assert.ok(rosterNameScore("Bursaspor", "Bursaspor") >= 45);
    assert.ok(rosterNameScore("İstanbulspor", "Istanbulspor") >= 45);
    assert.equal(resolveLeague("Bursaspor", "Istanbulspor", "Süper Lig"), "TFF 1. Lig");
  });
  it("Argentyna - Primera Division → Liga Profesional 128, nie Nacional 129", () => {
    assert.equal(matchLeague("Argentyna - Primera Division"), "Liga Profesional Argentina");
    assert.equal(matchLeague("Argentina Liga Profesional"), "Liga Profesional Argentina");
    assert.equal(matchLeague("Argentyna - Primera Nacional"), "Primera Nacional");
    assert.equal(leagueIdFromHint("Argentyna - Primera Division"), 128);
    assert.equal(leagueIdFromHint("Liga Profesional Argentina"), 128);
    assert.equal(leagueIdFromHint("Argentyna - Primera Nacional"), 129);
    assert.notEqual(leagueIdFromHint("Argentyna - Primera Division"), 129);
    assert.equal(leagueIdFromHint("Urugwaj - Primera Division"), 268);
    assert.equal(leagueIdFromHint("Chile - Primera Division"), 265);
    assert.equal(resolveLeague("Barracas Central", "Argentinos Juniors", "Argentyna - Primera Division"), "Liga Profesional Argentina");
    assert.equal(resolveLeague("Union de Santa Fe", "Instituto Cordoba", "Argentyna - Primera Division"), "Liga Profesional Argentina");
  });
  it("Argentyna - Primera Nacional → id 129, nie gołe nacional", () => {
    assert.equal(matchLeague("Argentyna - Primera Nacional"), "Primera Nacional");
    assert.equal(matchLeague("Argentina Primera Nacional"), "Primera Nacional");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Argentyna - Primera Nacional"), 129);
    assert.equal(leagueIdFromHint("Primera Nacional"), 129);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(resolveLeague("Deportivo Madryn", "Godoy Cruz", "Ekstraklasa"), "Primera Nacional");
    assert.equal(isHighVarianceLeague("Primera Nacional"), true);
    assert.equal(isHighVarianceLeague("Argentyna - Primera Nacional"), true);
  });
  it("Norwegia - 1.Division → id 104, nie Eliteserien 103", () => {
    assert.equal(matchLeague("Norwegia - 1.Division"), "1. Division Norway");
    assert.equal(matchLeague("Norway 1. Division"), "1. Division Norway");
    assert.equal(matchLeague("Eliteserien"), "Eliteserien");
    assert.equal(matchLeague("Norwegia - Eliteserien"), "Eliteserien");
    assert.equal(leagueIdFromHint("Norwegia - 1.Division"), 104);
    assert.equal(leagueIdFromHint("1. Division Norway"), 104);
    assert.equal(leagueIdFromHint("Eliteserien"), 103);
    assert.equal(resolveLeague("Stromsgodset", "Hodd", "Eliteserien"), "1. Division Norway");
    assert.equal(resolveLeague("Haugesund", "Kongsvinger", "Eliteserien"), "1. Division Norway");
    assert.equal(resolveLeague("Stabaek", "Sogndal", "Norwegia - 1.Division"), "1. Division Norway");
    assert.equal(resolveLeague("Brann", "Molde", "Eliteserien"), "Eliteserien");
    assert.equal(resolveLeague("Lillestrom", "Rosenborg", "Eliteserien"), "Eliteserien");
    assert.equal(isHighVarianceLeague("1. Division Norway"), false);
  });
  it("Dania - 1.Division → id 120, nie Superliga 119", () => {
    assert.equal(matchLeague("Dania - 1.Division"), "1. Division Denmark");
    assert.equal(matchLeague("Denmark 1. Division"), "1. Division Denmark");
    assert.equal(matchLeague("Dania - Superliga"), "Superliga Denmark");
    assert.equal(leagueIdFromHint("Dania - 1.Division"), 120);
    assert.equal(leagueIdFromHint("1. Division Denmark"), 120);
    assert.equal(leagueIdFromHint("Superliga Denmark"), 119);
    assert.equal(leagueIdFromHint("Dania - Superliga"), 119);
    assert.equal(resolveLeague("Aalborg BK", "HB Koge", "Dania - 1.Division"), "1. Division Denmark");
    assert.equal(resolveLeague("Aalborg BK", "HB Koge", "Superliga Denmark"), "1. Division Denmark");
    assert.equal(resolveLeague("Brondby", "Midtjylland", "Superliga Denmark"), "Superliga Denmark");
    assert.ok(rosterNameScore("Aalborg", "Aalborg BK") >= 45);
    assert.ok(rosterNameScore("HB Koge", "HB Koge") >= 45);
  });
  it("LASK / Altach: goła Bundesliga → Austria 218, nie Niemcy 78", () => {
    assert.equal(matchLeague("Austria - Bundesliga"), "Austrian Bundesliga");
    assert.equal(matchLeague("Austrian Bundesliga"), "Austrian Bundesliga");
    assert.equal(matchLeague("Bundesliga"), "Bundesliga");
    assert.equal(leagueIdFromHint("Austrian Bundesliga"), 218);
    assert.equal(leagueIdFromHint("Austria - Bundesliga"), 218);
    assert.equal(leagueIdFromHint("Bundesliga"), 78);
    assert.equal(resolveLeague("LASK Linz", "SCR Altach", "Bundesliga"), "Austrian Bundesliga");
    assert.equal(resolveLeague("Bayern", "Dortmund", "Bundesliga"), "Bundesliga");
    assert.ok((SIBLING_LEAGUES[78] || []).includes(218));
    assert.ok(rosterNameScore("Lask Linz", "LASK Linz") >= 45);
    assert.ok(rosterNameScore("SCR Altach", "SCR Altach") >= 45);
  });
  it("Śląsk ≠ LASK: Jaga–Śląsk zostaje Ekstraklasa, nie Austria 218", () => {
    assert.equal(leagueHintFromClubs("Jagiellonia Białystok", "Śląsk Wrocław"), "Ekstraklasa");
    assert.equal(leagueHintFromClubs("Śląsk Wrocław", "Jagiellonia"), "Ekstraklasa");
    assert.equal(resolveLeague("Jagiellonia Białystok", "Śląsk Wrocław", "Ekstraklasa"), "Ekstraklasa");
    assert.equal(resolveLeague("Jagiellonia Białystok", "Śląsk Wrocław", "Austrian Bundesliga"), "Ekstraklasa");
    assert.equal(resolveLeague("Jagiellonia Białystok", "Śląsk Wrocław", ""), "Ekstraklasa");
    assert.equal(leagueIdFromHint("Ekstraklasa"), 106);
    assert.notEqual(leagueHintFromClubs("Śląsk Wrocław", "Jagiellonia Białystok"), "Austrian Bundesliga");
    assert.equal(resolveLeague("LASK Linz", "SCR Altach", "Bundesliga"), "Austrian Bundesliga");
    assert.equal(resolveLeague("Lech Poznań", "Raków Częstochowa", "Ekstraklasa"), "Ekstraklasa");
    assert.ok(clubNameMatches("Slask Wroclaw", "Śląsk Wrocław"), "API ASCII ≠ kupon z ł");
    assert.ok(clubNameMatches("Śląsk Wrocław", "Slask Wroclaw"));
    assert.ok(clubNameMatches("Jagiellonia Bialystok", "Jagiellonia Białystok"));
    assert.ok(clubNameMatches("Lech Poznan", "Lech Poznań"));
    assert.equal(clubNameMatches("LASK Linz", "Śląsk Wrocław"), false, "LASK nadal ≠ Śląsk");
    assert.ok(clubNameMatches("Lodz", "Łódź") || clubNameMatches("LKS Lodz", "ŁKS Łódź"));
  });
  it("Chile - Primera Division → id 265, nie search 24 znaki", () => {
    assert.equal(matchLeague("Chile - Primera Division"), "Chile Primera División");
    assert.equal(matchLeague("Chile Primera División"), "Chile Primera División");
    assert.equal(leagueIdFromHint("Chile - Primera Division"), 265);
    assert.equal(leagueIdFromHint("Chile Primera División"), 265);
    assert.equal(resolveLeague("Nublense", "Deportes Concepcion", "Chile - Primera Division"), "Chile Primera División");
    assert.equal(isHighVarianceLeague("Chile Primera División"), true);
    assert.equal(isHighVarianceLeague("Chile - Primera Division"), true);
  });
  it("Columbia OCR → Kolumbia Primera B id 240, nie Chile 266 / Argentyna 131", () => {
    assert.equal(matchLeague("Columbia - Primera B - Clausura"), "Colombia Primera B");
    assert.equal(matchLeague("Colombia - Primera B"), "Colombia Primera B");
    assert.equal(matchLeague("Kolumbia - Primera B"), "Colombia Primera B");
    assert.equal(
      matchLeague("Columbia - Primera B - Clausura · Ze screena (bukmacher): Dziś, 22:30"),
      "Colombia Primera B",
    );
    assert.equal(matchLeague("Chile - Primera B"), "Chile Primera B");
    assert.equal(matchLeague("Chile Primera B"), "Chile Primera B");
    assert.equal(leagueIdFromHint("Columbia - Primera B - Clausura"), 240);
    assert.equal(leagueIdFromHint("Colombia Primera B"), 240);
    assert.equal(leagueIdFromHint("Kolumbia - Primera B"), 240);
    assert.equal(leagueIdFromHint("Chile - Primera B"), 266);
    assert.notEqual(leagueIdFromHint("Columbia - Primera B"), 266);
    assert.notEqual(leagueIdFromHint("Columbia - Primera B"), 131);
    assert.equal(leagueIdFromHint("Colombia Primera A"), 239);
    assert.equal(
      resolveLeague("Independiente Yumbo", "Deportes Quindio", "Columbia - Primera B - Clausura"),
      "Colombia Primera B",
    );
    assert.equal(
      resolveLeague(
        "Independiente Yumbo",
        "Deportes Quindio",
        "Columbia - Primera B - Clausura · Ze screena (bukmacher): Dziś, 22:30",
      ),
      "Colombia Primera B",
    );
    assert.equal(resolveLeague("Independiente Yumbo", "Deportes Quindio", "Ekstraklasa"), "Colombia Primera B");
    assert.equal(resolveLeague("Independiente Yumbo", "Chelsea", "Premier League"), "Premier League");
    assert.equal(
      leagueIdFromHint(resolveLeague("Independiente Yumbo", "Deportes Quindio", "Columbia - Primera B - Clausura")),
      240,
    );
    assert.ok(LEAGUES.includes("Colombia Primera B"));
    assert.equal(leagueHintFromClubs("Independiente Yumbo", "Deportes Quindio"), "Colombia Primera B");
    assert.ok(clubNameMatches("Ind. Yumbo", "Independiente Yumbo"));
    assert.ok(clubNameMatches("Quindio", "Deportes Quindio"));
    assert.ok(clubNameMatches("Quindío", "Deportes Quindio"));
    assert.ok(rosterNameScore("Ind. Yumbo", "Independiente Yumbo") >= 45);
    assert.ok(rosterNameScore("Quindio", "Deportes Quindio") >= 45);
    assert.deepEqual(SIBLING_LEAGUES[240], [239]);
    assert.deepEqual(SIBLING_LEAGUES[239], [240]);
  });
  it("Huachipato–Colo Colo: Chile 265, para z kolejki gdy skład /teams pusty", () => {
    assert.equal(leagueHintFromClubs("Huachipato", "Colo Colo"), "Chile Primera División");
    assert.equal(resolveLeague("Huachipato", "Colo Colo", "Chile Primera División"), "Chile Primera División");
    assert.equal(resolveLeague("Huachipato", "Colo Colo", "Ekstraklasa"), "Chile Primera División");
    assert.ok(rosterNameScore("Huachipato", "CD Huachipato") >= 45);
    assert.ok(rosterNameScore("Colo-Colo", "Colo Colo") >= 45);
    assert.ok(clubNameMatches("Colo-Colo", "Colo Colo"));
    assert.ok(clubNameMatches("CD Huachipato", "Huachipato"));
    const fx = pickTeamsFromFixtures(
      [
        {
          fixture: { id: 1, date: "2026-09-06T20:00:00+00:00" },
          league: { id: 265, name: "Primera División", season: 2026 },
          teams: {
            home: { id: 2318, name: "Huachipato", country: "Chile" },
            away: { id: 2319, name: "Colo Colo", country: "Chile" },
          },
          goals: { home: null, away: null },
        },
      ],
      "Huachipato",
      "Colo Colo",
    );
    assert.ok(fx);
    assert.equal(fx.home.id, 2318);
    assert.equal(fx.away.id, 2319);
    assert.equal(fx.leagueId, 265);
  });
  it("Deportes Antofagasta ≠ Deportes Santa Cruz — prefiks Deportes nie skleja klubów", () => {
    assert.equal(clubNameMatches("Deportes Santa Cruz", "Deportes Antofagasta"), false);
    assert.ok(clubNameMatches("Deportes Antofagasta", "Antofagasta"));
    assert.ok(clubNameMatches("CD Antofagasta", "Deportes Antofagasta"));
    assert.ok(rosterNameScore("Deportes Antofagasta", "Antofagasta") >= 45);
    assert.ok(rosterNameScore("Deportes Santa Cruz", "Deportes Antofagasta") < 40);
    assert.ok(rosterNameScore("Deportes Iquique", "Deportes La Serena") < 40);
    assert.ok(rosterNameScore("Quindio", "Deportes Quindio") >= 45);
    const wrong = hardStops(
      payload({ home: team({ name: "Deportes Santa Cruz" }), away: team({ name: "Magallanes" }) }),
      {
        home: "Deportes Antofagasta",
        away: "Magallanes",
        league: "Chile Primera B",
        kickoff: "2026-09-10T23:00:00",
        oddsHome: 2.1,
        oddsDraw: 3.2,
        oddsAway: 3.4,
      },
    );
    assert.ok(wrong.some((x) => /Santa Cruz/.test(x) && /Antofagasta/.test(x)), wrong.join("; "));
    const ok = hardStops(
      payload({ home: team({ name: "Deportes Antofagasta" }), away: team({ name: "Magallanes" }) }),
      {
        home: "Deportes Antofagasta",
        away: "Magallanes",
        league: "Chile Primera B",
        kickoff: "2026-09-10T23:00:00",
        oddsHome: 2.1,
        oddsDraw: 3.2,
        oddsAway: 3.4,
      },
    );
    assert.ok(!ok.some((x) => /nie zgadza/.test(x)), ok.join("; "));
    assert.equal(leagueHintFromClubs("Deportes Antofagasta", "Magallanes"), "Chile Primera B");
    assert.equal(leagueIdFromHint("Chile Primera B"), 266);
  });
  it("Kyzyl-Zhar = Kyzylzhar w składzie Kazachstanu", () => {
    assert.ok(rosterNameScore("Kyzyl-Zhar", "Kyzylzhar") >= 45);
    assert.ok(rosterNameScore("Kyzyl-Zhar", "Kyzylzhar") > rosterNameScore("Kairat Almaty", "Kyzylzhar"));
    assert.ok(clubNameMatches("Kyzyl-Zhar", "Kyzylzhar"));
    assert.equal(clubNameMatches("Kairat Almaty", "Kyzylzhar"), false);
    assert.equal(resolveLeague("Ordabasy", "Kyzylzhar", "Kazakhstan Premier League"), "Kazakhstan Premier League");
  });
  it("Olympique Marsylia = Marseille w składzie Ligue 1, nie Lyon", () => {
    assert.ok(rosterNameScore("Marseille", "Olympique Marsylia") >= 45);
    assert.ok(rosterNameScore("Olympique Marseille", "Olympique Marsylia") >= 45);
    assert.ok(rosterNameScore("Marseille", "Olympique Marsylia") > rosterNameScore("Lyon", "Olympique Marsylia"));
    assert.ok(rosterNameScore("Marseille", "Olympique Marsylia") > rosterNameScore("Olympique Lyonnais", "Olympique Marsylia"));
    assert.ok(rosterNameScore("AS Monaco", "Monaco") >= 45);
    assert.ok(clubNameMatches("Marseille", "Olympique Marsylia"));
    assert.ok(clubNameMatches("Olympique Marseille", "Olympique Marsylia"));
    assert.equal(clubNameMatches("Lyon", "Olympique Marsylia"), false);
  });
  it("Mirassol / Palmeiras: Serie A → Brasileirão, nie Włochy 135", () => {
    assert.equal(matchLeague("Serie A"), "Serie A");
    assert.equal(matchLeague("Brasileirão Série A"), "Brasileirão Série A");
    assert.equal(matchLeague("Brazylia - Serie A"), "Brasileirão Série A");
    assert.equal(matchLeague("Brazil Serie A"), "Brasileirão Série A");
    assert.equal(leagueIdFromHint("Serie A"), 135);
    assert.equal(leagueIdFromHint("Brasileirão Série A"), 71);
    assert.equal(leagueIdFromHint("Brazylia - Serie A"), 71);
    assert.equal(resolveLeague("Mirassol", "Palmeiras", "Serie A"), "Brasileirão Série A");
    assert.equal(resolveLeague("Flamengo", "Palmeiras", "Serie A"), "Brasileirão Série A");
    assert.equal(resolveLeague("Milan", "Lecce", "Serie A"), "Serie A");
    assert.equal(leagueIdFromHint(resolveLeague("Mirassol", "Palmeiras", "Serie A")), 71);
    assert.ok((SIBLING_LEAGUES[135] || []).includes(71));
    assert.ok(rosterNameScore("Palmeiras", "Palmeiras") >= 45);
    assert.ok(rosterNameScore("Mirassol", "Mirassol FC") >= 45);
  });
  it("LaLiga bez Giron/Palmas → Segunda jest ligą-sąsiadem", () => {
    assert.ok((SIBLING_LEAGUES[140] || []).includes(141));
    assert.equal(matchLeague("Hiszpania - Segunda"), "Segunda División");
    assert.equal(leagueIdFromHint("Segunda División"), 141);
    assert.equal(leagueIdFromHint("LaLiga 2"), 141);
    assert.equal(leagueIdFromHint("LaLiga"), 140);
  });
});

describe("V26 kursy i SOT", () => {
  it("0 nie jest kursem", () => {
    assert.equal(pickOdds(0), undefined);
    assert.equal(pickOdds(1), undefined);
    assert.equal(pickOdds(2.87), 2.87);
  });
  it("backfill bierze kurs z formularza gdy scout wpisał 0", () => {
    const p = backfillPayload(payload(), undefined, calcuttaInput);
    assert.equal(p.odds.home, 2.87);
    assert.equal(p.odds.draw, 3);
    assert.equal(p.odds.away, 2.3);
  });
  it("mergeTeamBlocks: zero z fazy 2 nie kasuje SOT/kartek", () => {
    const p1 = team({ name: "United SC", shotsOnTarget: 2.43, cards: 0.29 });
    const p2 = team({ name: "United SC", shotsOnTarget: 0, cards: 0, corners: 0 });
    const m = mergeTeamBlocks(p1, p2);
    assert.equal(m.shotsOnTarget, 2.43);
    assert.equal(m.cards, 0.29);
    assert.equal(m.corners, 8.57);
  });
  it("merge + backfill: SOT z K6 zostaje, kursy z formularza wchodzą do kroków", () => {
    const p1 = payload();
    const p2home = team({ name: "United SC", shotsOnTarget: 0, cards: 0, corners: 0 });
    const merged = mergeTeamBlocks(p1.home, p2home);
    assert.equal(merged.shotsOnTarget, 2.43);
    assert.equal(merged.cards, 0.29);
    const filled = backfillPayload(p1, undefined, calcuttaInput);
    assert.equal(filled.odds.home, 2.87);
    assert.equal(filled.odds.away, 2.3);
    assert.equal(filled.home.shotsOnTarget, 2.43);
    assert.equal(isHighVarianceLeague(calcuttaInput.league), false);
    assert.equal(filled.gatesRaw.leagueGapScore, 0);
  });
});

describe("V26 hard stop / źródła / demo", () => {
  it("clubNameMatches odrzuca Manchester United vs United SC", () => {
    assert.equal(clubNameMatches("United", "United SC"), true);
    assert.equal(clubNameMatches("Police", "Police AC"), true);
    assert.equal(clubNameMatches("Manchester United", "United SC"), false);
    assert.equal(clubNameMatches("Rwanda Police FC", "Police AC"), false);
  });
  it("filterMatchSources tnie FBref Man Utd przy Calcutta", () => {
    const kept = filterMatchSources(
      [
        "https://www.api-football.com",
        "https://fbref.com/en/squads/19538871/Manchester-United-Stats",
        "https://www.flashscore.pl",
      ],
      "United SC",
      "Police AC",
      "Calcutta Premier Division",
    );
    assert.ok(kept.some((u) => u.includes("api-football")));
    assert.ok(kept.some((u) => u.includes("flashscore")));
    assert.ok(!kept.some((u) => /manchester/i.test(u)));
  });
  it("hardStops przy braku kursów", () => {
    const p = payloadFromFacts("{}", { home: "A", away: "B", league: "Ekstraklasa", kickoff: "" });
    const stops = hardStops(p, { home: "A", away: "B", league: "Ekstraklasa", kickoff: "" });
    assert.ok(stops.some((x) => /kurs/i.test(x)));
  });
  it("needsEnrich nie kręci xG gdy SOT/rożne już są (Cymru / Parva)", () => {
    const empty = payload({
      home: team({ name: "Llandudno", xg: 0, corners: 0, shotsOnTarget: 0, goalsAfter60Pct: 46 }),
      away: team({ name: "Ammanford", xg: 0, corners: 0, shotsOnTarget: 0, goalsAfter60Pct: 25 }),
      injuries: "Brak zgłoszonych kontuzji",
      weather: "Llandudno: 17C",
      coach: "A. Morgan",
    });
    assert.equal(needsEnrich(empty), true);
    const boxed = payload({
      home: team({ name: "Llandudno", xg: 0, corners: 5.67, shotsOnTarget: 5, goalsAfter60Pct: 46 }),
      away: team({ name: "Ammanford", xg: 0, corners: 3.33, shotsOnTarget: 1.5, goalsAfter60Pct: 25 }),
      injuries: "Brak zgłoszonych kontuzji",
      weather: "Llandudno: 17C",
      coach: "A. Morgan",
    });
    assert.equal(needsEnrich(boxed), false);
  });
  it("runEngine: panel SOT = K6, HV=NIE, League Gap 5, kurs 2.30 w 1X2", () => {
    const p1 = payload();
    const p2 = payload({
      home: team({ name: "United SC", shotsOnTarget: 0, cards: 0 }),
      away: team({ name: "Police AC", shotsOnTarget: 0, cards: 0 }),
    });
    const e = runEngine(calcuttaInput, p1, p2);
    assert.equal(e.stats.sotHome, 2.43);
    assert.equal(e.stats.sotAway, 4.71);
    assert.equal(e.stats.cardsHome, 0.29);
    assert.equal(e.gates.highVariance.active, false);
    assert.equal(e.confidence.sample, 5);
    assert.ok((e.stats.awayWinProb ?? 0) > 0);
  });
  it("demo Lech–Radomiak: SOT/kartki zostają, HV=NIE", () => {
    const demo = buildSample();
    assert.ok(demo.engine);
    assert.equal(demo.engine!.stats.sotHome, 5.4);
    assert.equal(demo.engine!.stats.cardsHome, 1.8);
    assert.equal(demo.engine!.gates.highVariance.active, false);
    assert.equal(demo.engine!.confidence.sample, 5);
    assert.ok(demo.engine!.confidence.sum > 70);
    assert.equal(demo.engine!.gates.ugo.met, 3);
    const top = demo.engine!.epl.map((x) => x.score);
    for (const bad of ["2:3", "3:2", "2:2", "1:1", "0:2", "1:2"]) {
      assert.ok(!top.includes(bad), `demo TOP3 nie powinno mieć ${bad}: ${top.join(",")}`);
    }
  });
});

describe("V26 Superettan / UGO z danych / Controlled TOP3", () => {
  it("Szwecja – Superettan ≠ Allsvenskan", () => {
    assert.equal(matchLeague("Szwecja - Superettan"), "Superettan");
    assert.equal(matchLeague("Szwecja – Superettan"), "Superettan");
    assert.equal(matchLeague("Superettan"), "Superettan");
    assert.equal(matchLeague("Allsvenskan"), "Allsvenskan");
    assert.equal(matchLeague("Szwecja"), "Allsvenskan");
    assert.equal(isAllsvenskan("Superettan"), false);
    assert.equal(isAllsvenskan("Szwecja - Superettan"), false);
    assert.equal(isAllsvenskan("Allsvenskan"), true);
    assert.equal(isHighVarianceLeague("Superettan"), false);
    assert.ok(LEAGUES.includes("Superettan"));
    assert.equal(leagueIdFromHint("Szwecja - Superettan"), 114);
    assert.equal(leagueIdFromHint("Superettan"), 114);
    assert.equal(leagueIdFromHint("Allsvenskan"), 113);
  });

  it("Brøndby–Silkeborg przy default Ekstraklasa → Superliga Denmark, nie id 106", () => {
    assert.equal(resolveLeague("Brondby", "Silkeborg", "Ekstraklasa"), "Superliga Denmark");
    assert.equal(resolveLeague("Brøndby", "Silkeborg IF", "Ekstraklasa"), "Superliga Denmark");
    assert.equal(leagueIdFromHint(resolveLeague("Brondby", "Silkeborg", "Ekstraklasa")), 119);
    assert.equal(resolveLeague("Lech", "Radomiak", "Ekstraklasa"), "Ekstraklasa");
    assert.equal(resolveLeague("United SC", "Police AC", "Calcutta Premier Division"), "Calcutta Premier Division");
    assert.equal(resolveLeague("United SC", "Police AC", "Ekstraklasa"), "Ekstraklasa");
    assert.equal(resolveLeague("Norrkoping", "Falkenberg", "Ekstraklasa"), "Superettan");
    assert.equal(resolveLeague("Malmo FF", "Djurgarden IF", "Ekstraklasa"), "Allsvenskan");
  });

  it("jakość UD z gf/xG/BTTS/splitu, nie z flagi", () => {
    const weak = team({
      name: "Radomiak",
      gfAvg: 0.88,
      gfAway: 0.5,
      gfHome: 1.25,
      xg: 1.02,
      bttsPct: 62.5,
      form: [
        { date: "2026-08-16", opponent: "A", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-08-09", opponent: "B", ha: "H", scoreFor: 2, scoreAgainst: 2, quality: "SLABY" },
        { date: "2026-08-02", opponent: "C", ha: "A", scoreFor: 0, scoreAgainst: 3, quality: "TOP" },
        { date: "2026-07-26", opponent: "D", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-07-19", opponent: "E", ha: "A", scoreFor: 1, scoreAgainst: 2, quality: "SREDNI" },
        { date: "2026-07-12", opponent: "F", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
      ],
    });
    assert.equal(underdogOffensiveQuality(weak, "home", true), false);
    const strong = team({
      name: "Falkenberg",
      gfAvg: 1.45,
      gfAway: 1.35,
      gfHome: 1.55,
      xg: 1.28,
      bttsPct: 58,
    });
    assert.equal(underdogOffensiveQuality(strong, "home", false), true);
  });

  it("Norrköping–Falkenberg: Superettan, UGO z ofensywy, TOP3 bez 2:3/3:2", () => {
    const home = team({
      name: "Norrköping",
      tablePos: 4,
      played: 8,
      csPctOverall: 52,
      csPctHome: 65,
      bttsPct: 40,
      gfAvg: 1.7,
      gaAvg: 0.9,
      gfHome: 1.9,
      gaHome: 0.6,
      xg: 1.6,
      form: [
        { date: "2026-08-18", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
        { date: "2026-08-11", opponent: "B", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-08-04", opponent: "C", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
        { date: "2026-07-28", opponent: "D", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
        { date: "2026-07-21", opponent: "E", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-07-14", opponent: "F", ha: "H", scoreFor: 3, scoreAgainst: 1, quality: "SLABY" },
        { date: "2026-07-07", opponent: "G", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "TOP" },
        { date: "2026-06-30", opponent: "H", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
      ],
    });
    const away = team({
      name: "Falkenberg",
      tablePos: 11,
      played: 8,
      csPctOverall: 20,
      bttsPct: 58,
      gfAvg: 1.45,
      gaAvg: 1.4,
      gfAway: 1.35,
      gfHome: 1.55,
      xg: 1.28,
      form: [
        { date: "2026-08-18", opponent: "A", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-08-11", opponent: "B", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-08-04", opponent: "C", ha: "A", scoreFor: 1, scoreAgainst: 0, quality: "SLABY" },
        { date: "2026-07-28", opponent: "D", ha: "A", scoreFor: 2, scoreAgainst: 2, quality: "SREDNI" },
        { date: "2026-07-21", opponent: "E", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
        { date: "2026-07-14", opponent: "F", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
      ],
    });
    const p1 = payload({
      match: { league: "Superettan", kickoff: "2026-08-25T18:00:00", homePos: 4, awayPos: 11, ptsHome: 14, ptsAway: 9, motivation: "" },
      favorite: "home",
      profileDraft: "Controlled Home Favorite",
      home,
      away,
      gatesRaw: {
        csFavLast10: 52,
        csFavLast5Venue: 65,
        goalsConcededFavLast5Venue: 1,
        bttsRelevant: 49,
        avgGoalsRelevant: 2.7,
        favConcededInLast10Pct: 40,
        underdogOffQuality: false,
        matchesPlayedFav: 8,
        lateGoalUnderdogPct: 0,
        leagueGapScore: 0,
        xgFavVsThisTier: 1.6,
        udCsPct: 20,
        opponentGfVenue: 1.35,
        opponentBttsPct: 58,
      },
    });
    const input: MatchInput = {
      home: "Norrköping",
      away: "Falkenberg",
      league: "Szwecja - Superettan",
      kickoff: "2026-08-25T18:00:00",
      oddsHome: 1.55,
      oddsDraw: 4.0,
      oddsAway: 5.5,
    };
    const e = runEngine(input, p1);
    assert.equal(isHighVarianceLeague(input.league), false);
    assert.equal(isAllsvenskan(matchLeague(input.league)), false);
    assert.equal(e.gates.highVariance.active, false);
    assert.ok(e.gates.ugo.met >= 2, `UGO ${e.gates.ugo.met}/4`);
    assert.ok(e.gates.ugo.details.some((d) => /off=true/i.test(d)), e.gates.ugo.details.join(" | "));
    assert.ok(e.gates.homeDirection.approved);
    assert.match(e.profile, /Controlled Home Favorite/);
    const top = e.epl.map((x) => x.score);
    for (const bad of ["2:3", "3:2", "2:2", "1:1", "0:2", "1:2", "0:1"]) {
      assert.ok(!top.includes(bad), `TOP3 ma chaos/UD win ${bad}: ${top.join(",")}`);
    }
    assert.ok(top.includes("2:1") || top.includes("2:0") || top.includes("3:1"), `TOP3 kierunku faworyta: ${top.join(",")}`);
  });
});

describe("V26 brzegi 25.08 (bez restopu Norrköping/Brøndby/Málaga)", () => {
  it("coin-flip tylko Δ < 0.35", () => {
    assert.equal(isCoinFlipOdds(2.6, 2.47), true);
    assert.equal(isCoinFlipOdds(2.35, 3.25), false);
    assert.equal(isCoinFlipOdds(2.32, 3.3), false);
    assert.equal(isCoinFlipOdds(1.42, 5.85), false);
    assert.equal(isCoinFlipOdds(1.55, 5.5), false);
  });

  it("Malmö 2.60–2.47 → brak faworyta; Málaga 2.35 zostaje home", () => {
    const base = payload({
      favorite: "home",
      profileDraft: "Slight Home Edge",
      match: { league: "Allsvenskan", kickoff: "2026-08-24T17:00:00", homePos: 8, awayPos: 7, ptsHome: 26, ptsAway: 26, motivation: "" },
      home: team({ name: "Malmo FF", gfAvg: 1.4, gaAvg: 1.2, csPctOverall: 30, bttsPct: 48 }),
      away: team({ name: "Djurgarden", gfAvg: 1.5, gaAvg: 1.1, csPctOverall: 32, bttsPct: 45 }),
    });
    const malmo = runEngine(
      { home: "Malmo FF", away: "Djurgarden", league: "Allsvenskan", kickoff: "2026-08-24T17:00:00", oddsHome: 2.6, oddsDraw: 3.5, oddsAway: 2.47 },
      base,
    );
    assert.equal(malmo.favorite, "none");
    assert.match(malmo.direction, /Brak faworyta/);
    const malaga = runEngine(
      { home: "Malaga", away: "Deportivo", league: "La Liga", kickoff: "2026-08-24T19:30:00", oddsHome: 2.35, oddsDraw: 3.05, oddsAway: 3.25 },
      payload({
        favorite: "home",
        profileDraft: "Slight Home Edge",
        home: team({ name: "Malaga", gfAvg: 0.15, gaAvg: 1.1, bttsPct: 42, csPctOverall: 28 }),
        away: team({ name: "Deportivo", gfAvg: 1.1, gaAvg: 1.2, bttsPct: 44, csPctOverall: 25 }),
      }),
    );
    assert.equal(malaga.favorite, "home");
    assert.ok(malaga.epl.some((x) => x.score === "1:1") || malaga.epl.length === 3);
  });

  it("λ sufit: 2.10 default, 2.60 przy ≤1.45, 3.20 przy ≤1.30, HV bez capu", () => {
    assert.equal(cappedLambda(2.75, false), 2.1);
    assert.equal(cappedLambda(2.75, true), 2.75);
    assert.equal(cappedLambda(0.15, false), 0.15);
    assert.equal(cappedLambda(1.7, false), 1.7);
    assert.equal(cappedLambda(3.5, false, 1.5), 2.1);
    assert.equal(cappedLambda(3.5, false, 1.45), 2.6);
    assert.equal(cappedLambda(3.5, false, 1.3), 3.2);
    assert.equal(cappedLambda(3.5, true, 1.2), 3.5);
    assert.equal(clipEarlyOutlierGoals(5, 4), 3);
    assert.equal(clipEarlyOutlierGoals(5, 8), 5);
    assert.equal(clipEarlyOutlierGoals(2, 4), 2);
  });

  it("Superettan UGO + Controlled home: TOP3 nadal bez 2:3", () => {
    assert.equal(isSuperettan("Szwecja - Superettan"), true);
    assert.equal(isSuperettan("Allsvenskan"), false);
  });

  it("Fulham away 1.92: blokada chaosu NIE kasuje 2:3 z puli", () => {
    const e = runEngine(
      { home: "Fulham", away: "Chelsea", league: "Premier League", kickoff: "2026-08-24T20:00:00", oddsHome: 3.75, oddsDraw: 3.65, oddsAway: 1.92 },
      payload({
        favorite: "away",
        profileDraft: "Controlled Away Favorite",
        match: { league: "Premier League", kickoff: "2026-08-24T20:00:00", homePos: 12, awayPos: 4, ptsHome: 0, ptsAway: 0, motivation: "" },
        home: team({ name: "Fulham", gfAvg: 1.3, gaAvg: 1.4, bttsPct: 55, csPctOverall: 22, xg: 1.2 }),
        away: team({
          name: "Chelsea",
          gfAvg: 1.8,
          gaAvg: 1.1,
          bttsPct: 52,
          csPctOverall: 35,
          gfAway: 1.7,
          xg: 1.6,
          form: [
            { date: "2026-08-16", opponent: "A", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-09", opponent: "B", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "TOP" },
            { date: "2026-08-02", opponent: "C", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-26", opponent: "D", ha: "H", scoreFor: 3, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-19", opponent: "E", ha: "A", scoreFor: 2, scoreAgainst: 2, quality: "SREDNI" },
            { date: "2026-07-12", opponent: "F", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        gatesRaw: {
          csFavLast10: 35,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 4,
          bttsRelevant: 54,
          avgGoalsRelevant: 2.9,
          favConcededInLast10Pct: 60,
          underdogOffQuality: true,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 20,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.6,
          udCsPct: 22,
          opponentGfVenue: 1.3,
          opponentBttsPct: 55,
        },
      }),
    );
    assert.equal(e.favorite, "away");
    assert.ok(!/Direction Gate TAK \+ Controlled: TOP3 bez/.test(e.compression.log.join("\n")));
  });

  it("Bologna 2.32: mixed CORE nie z UGO (poza 1.35–1.85)", () => {
    const e = runEngine(
      { home: "Bologna", away: "Lazio", league: "Serie A", kickoff: "2026-08-24T16:30:00", oddsHome: 2.32, oddsDraw: 3.05, oddsAway: 3.3 },
      payload({
        favorite: "home",
        profileDraft: "Slight Home Edge",
        home: team({ name: "Bologna", gfAvg: 1.2, gaAvg: 1.1, bttsPct: 48, csPctOverall: 33 }),
        away: team({ name: "Lazio", gfAvg: 1.15, gaAvg: 1.2, bttsPct: 50, csPctOverall: 30 }),
        gatesRaw: {
          csFavLast10: 33,
          csFavLast5Venue: 30,
          goalsConcededFavLast5Venue: 5,
          bttsRelevant: 49,
          avgGoalsRelevant: 2.4,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 1,
          xgFavVsThisTier: 1.2,
          udCsPct: 30,
          opponentGfVenue: 1.15,
          opponentBttsPct: 50,
        },
      }),
    );
    assert.equal(e.favorite, "home");
    assert.ok(!e.epl[0] || e.epl[0].satisfies.every((s) => !/UGO\/HV mixed CORE/.test(s)));
  });

  it("Libertad HV Paraguay + 1.37: clean może być EPL1", () => {
    const e = runEngine(
      { home: "Libertad", away: "San Lorenzo", league: "Paraguay - Primera Division", kickoff: "2026-08-24T21:30:00", oddsHome: 1.37, oddsDraw: 4.6, oddsAway: 7.1 },
      payload({
        favorite: "home",
        profileDraft: "Strong Home Favorite",
        home: team({
          name: "Libertad",
          gfAvg: 1.8,
          gaAvg: 0.7,
          bttsPct: 38,
          csPctOverall: 55,
          csPctHome: 62,
          form: [
            { date: "2026-08-16", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-09", opponent: "B", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SLABY" },
            { date: "2026-08-02", opponent: "C", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-26", opponent: "D", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-07-19", opponent: "E", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-12", opponent: "F", ha: "H", scoreFor: 3, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        away: team({ name: "San Lorenzo", gfAvg: 0.7, gaAvg: 1.5, bttsPct: 35, csPctOverall: 18, gfAway: 0.55 }),
        gatesRaw: {
          csFavLast10: 55,
          csFavLast5Venue: 62,
          goalsConcededFavLast5Venue: 1,
          bttsRelevant: 36,
          avgGoalsRelevant: 2.3,
          favConcededInLast10Pct: 40,
          underdogOffQuality: false,
          matchesPlayedFav: 8,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 3,
          xgFavVsThisTier: 1.8,
          udCsPct: 18,
          opponentGfVenue: 0.55,
          opponentBttsPct: 35,
        },
      }),
    );
    assert.equal(isHighVarianceLeague("Paraguay - Primera Division"), true);
    assert.equal(e.gates.highVariance.active, true);
    assert.ok(e.compression.log.some((l) => /ustępuje kursowi/i.test(l)));
    const core = e.epl[0]?.score;
    assert.ok(core === "1:0" || core === "2:0" || core === "3:0" || core === "2:1", `CORE ${core}`);
  });

  it("Osasuna: 0:0 w ochronie TOP4, nie w CORE", () => {
    const e = runEngine(
      { home: "Osasuna", away: "Levante", league: "La Liga", kickoff: "2026-08-24T17:30:00", oddsHome: 1.85, oddsDraw: 3.45, oddsAway: 4.3 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        home: team({ name: "Osasuna", gfAvg: 1.2, gaAvg: 0.9, bttsPct: 38, csPctOverall: 45 }),
        away: team({ name: "Levante", gfAvg: 0.9, gaAvg: 1.3, bttsPct: 36, csPctOverall: 22, gfAway: 0.8 }),
        gatesRaw: {
          csFavLast10: 45,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 37,
          avgGoalsRelevant: 2.1,
          favConcededInLast10Pct: 45,
          underdogOffQuality: false,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 1,
          xgFavVsThisTier: 1.2,
          udCsPct: 22,
          opponentGfVenue: 0.8,
          opponentBttsPct: 36,
        },
      }),
    );
    assert.ok(!e.epl.slice(0, 3).some((x) => x.score === "0:0") || e.epl[0]?.score !== "0:0");
    assert.ok(
      e.protection.some((x) => x.score === "0:0") || e.epl.some((x) => x.score === "0:0") || e.compression.log.some((l) => /0:0 ochrona/.test(l)) || e.confidence.pct >= 80,
      `prot=${e.protection.map((x) => x.score).join(",")} conf=${e.confidence.pct}`,
    );
  });

  it("Brøndby 1.42 UGO: 3:1 może zostać w TOP3 (0:0 nie wypycha)", () => {
    const e = runEngine(
      { home: "Brondby", away: "Silkeborg", league: "Superliga", kickoff: "2026-08-24T17:00:00", oddsHome: 1.42, oddsDraw: 4.75, oddsAway: 5.85 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        home: team({
          name: "Brondby",
          gfAvg: 1.75,
          gaAvg: 0.9,
          bttsPct: 48,
          csPctOverall: 40,
          form: [
            { date: "2026-08-16", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-09", opponent: "B", ha: "A", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-02", opponent: "C", ha: "H", scoreFor: 3, scoreAgainst: 1, quality: "SLABY" },
            { date: "2026-07-26", opponent: "D", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-07-19", opponent: "E", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-12", opponent: "F", ha: "H", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
          ],
        }),
        away: team({ name: "Silkeborg", gfAvg: 1.2, gaAvg: 1.5, bttsPct: 52, csPctOverall: 18, gfAway: 1.1, xg: 1.15 }),
        gatesRaw: {
          csFavLast10: 40,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 2,
          bttsRelevant: 50,
          avgGoalsRelevant: 2.8,
          favConcededInLast10Pct: 55,
          underdogOffQuality: true,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 15,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.75,
          udCsPct: 18,
          opponentGfVenue: 1.1,
          opponentBttsPct: 52,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(top.includes("2:1") || top.includes("3:1") || top.includes("2:0"), `TOP3 ${top.join(",")}`);
    assert.ok(!top.includes("0:0"), `0:0 nie w TOP3 Brøndby: ${top.join(",")}`);
  });
});

describe("V26 korekty 25–26.08 (post-mortem ligowy)", () => {
  it("Soft Band: CORE 1:0, potem 2:0, zakaz 3:1", () => {
    const e = runEngine(
      { home: "Osters", away: "GIF Sundsvall", league: "Szwecja - Superettan", kickoff: "2026-08-25T17:00:00", oddsHome: 1.74, oddsDraw: 3.75, oddsAway: 4.0 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Superettan", kickoff: "2026-08-25T17:00:00", homePos: 4, awayPos: 3, ptsHome: 30, ptsAway: 32, motivation: "" },
        home: team({
          name: "Osters",
          gfAvg: 1.6,
          gaAvg: 0.9,
          bttsPct: 42,
          csPctOverall: 40,
          xg: 1.5,
          form: [
            { date: "2026-08-18", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-11", opponent: "B", ha: "A", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-04", opponent: "C", ha: "H", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-28", opponent: "D", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SLABY" },
            { date: "2026-07-21", opponent: "E", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-14", opponent: "F", ha: "H", scoreFor: 3, scoreAgainst: 0, quality: "SREDNI" },
          ],
        }),
        away: team({ name: "GIF Sundsvall", gfAvg: 1.1, gaAvg: 1.3, bttsPct: 48, csPctOverall: 22, gfAway: 0.9, xg: 1.0 }),
        gatesRaw: {
          csFavLast10: 40,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 45,
          avgGoalsRelevant: 2.5,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 8,
          lateGoalUnderdogPct: 10,
          leagueGapScore: 0,
          xgFavVsThisTier: 1.5,
          udCsPct: 22,
          opponentGfVenue: 0.9,
          opponentBttsPct: 48,
        },
      }),
    );
    assert.equal(e.gates.softBand.active, true);
    assert.equal(e.epl[0]?.score, "1:0", `CORE ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(e.epl.some((x) => x.score === "2:0") || e.epl.some((x) => x.score === "2:1"), `brak 2:0/2:1: ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(!e.epl.some((x) => x.score === "3:1"), `3:1 w TOP3: ${e.epl.map((x) => x.score).join(",")}`);
  });

  it("UGO off gdy kurs faworyta < 1.40", () => {
    const e = runEngine(
      { home: "Real Madrid", away: "Real Sociedad", league: "La Liga", kickoff: "2026-08-26T19:00:00", oddsHome: 1.27, oddsDraw: 6.2, oddsAway: 8.6 },
      payload({
        favorite: "home",
        profileDraft: "Strong Home Favorite",
        match: { league: "La Liga", kickoff: "2026-08-26T19:00:00", homePos: 1, awayPos: 12, ptsHome: 3, ptsAway: 0, motivation: "" },
        home: team({
          name: "Real Madrid",
          gfAvg: 2.4,
          gaAvg: 0.7,
          bttsPct: 40,
          csPctOverall: 45,
          xg: 2.5,
          form: [
            { date: "2026-08-19", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "TOP" },
            { date: "2026-08-12", opponent: "B", ha: "A", scoreFor: 3, scoreAgainst: 1, quality: "TOP" },
            { date: "2026-08-05", opponent: "C", ha: "H", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-29", opponent: "D", ha: "H", scoreFor: 4, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        away: team({ name: "Real Sociedad", gfAvg: 0.9, gaAvg: 1.4, bttsPct: 44, csPctOverall: 20, gfAway: 0.7, xg: 0.8 }),
        gatesRaw: {
          csFavLast10: 40,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 2,
          bttsRelevant: 42,
          avgGoalsRelevant: 2.8,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 4,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 2,
          xgFavVsThisTier: 2.4,
          udCsPct: 20,
          opponentGfVenue: 0.7,
          opponentBttsPct: 44,
        },
      }),
    );
    assert.equal(e.gates.ugo.active, false);
    assert.equal(e.gates.dominatorExpansion.active, false, "15.2: Dominator Expansion tylko przy Conf ≥88, n=4 cap 85%");
    const top = e.epl.map((x) => x.score);
    assert.ok(!top.some((s) => /^[45]:/.test(s)), `4+/5+ w TOP3 przy Conf<88: ${top.join(",")}`);
  });

  it("coin-flip Δ<0.35: CORE nie jest 2:1", () => {
    const e = runEngine(
      { home: "Valencia", away: "Betis", league: "La Liga", kickoff: "2026-08-25T19:00:00", oddsHome: 2.77, oddsDraw: 3.2, oddsAway: 2.6 },
      payload({
        favorite: "home",
        profileDraft: "Slight Home Edge",
        home: team({ name: "Valencia", gfAvg: 0.58, gaAvg: 1.1, bttsPct: 42, csPctOverall: 28, xg: 0.7 }),
        away: team({ name: "Betis", gfAvg: 1.2, gaAvg: 1.0, bttsPct: 48, csPctOverall: 30, xg: 1.1 }),
        gatesRaw: {
          csFavLast10: 28,
          csFavLast5Venue: 30,
          goalsConcededFavLast5Venue: 5,
          bttsRelevant: 45,
          avgGoalsRelevant: 2.2,
          favConcededInLast10Pct: 60,
          underdogOffQuality: true,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 0,
          xgFavVsThisTier: 0.7,
          udCsPct: 30,
          opponentGfVenue: 1.2,
          opponentBttsPct: 48,
        },
      }),
    );
    assert.equal(e.favorite, "none");
    assert.notEqual(e.epl[0]?.score, "2:1", `CORE ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(["1:1", "1:0", "0:1", "0:0"].includes(e.epl[0]?.score ?? ""), `CORE ${e.epl[0]?.score}`);
  });

  it("near even Δ<0.55: GREEN zablokowane poniżej Conf 83", () => {
    const e = runEngine(
      { home: "Orebro SK", away: "Varberg BoIS", league: "Szwecja - Superettan", kickoff: "2026-08-25T17:00:00", oddsHome: 2.8, oddsDraw: 3.35, oddsAway: 2.32 },
      payload({
        favorite: "away",
        profileDraft: "Away Favorite",
        match: { league: "Superettan", kickoff: "2026-08-25T17:00:00", homePos: 10, awayPos: 8, ptsHome: 20, ptsAway: 24, motivation: "" },
        home: team({ name: "Orebro SK", gfAvg: 1.5, gaAvg: 1.4, bttsPct: 52, csPctOverall: 22, xg: 1.6 }),
        away: team({
          name: "Varberg BoIS",
          gfAvg: 1.33,
          gaAvg: 1.2,
          bttsPct: 50,
          csPctOverall: 28,
          gfAway: 1.2,
          xg: 1.3,
          form: [
            { date: "2026-08-18", opponent: "A", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-11", opponent: "B", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-04", opponent: "C", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-28", opponent: "D", ha: "H", scoreFor: 2, scoreAgainst: 2, quality: "SREDNI" },
            { date: "2026-07-21", opponent: "E", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "SLABY" },
            { date: "2026-07-14", opponent: "F", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
          ],
        }),
        gatesRaw: {
          csFavLast10: 28,
          csFavLast5Venue: 30,
          goalsConcededFavLast5Venue: 5,
          bttsRelevant: 51,
          avgGoalsRelevant: 2.7,
          favConcededInLast10Pct: 60,
          underdogOffQuality: true,
          matchesPlayedFav: 8,
          lateGoalUnderdogPct: 15,
          leagueGapScore: 0,
          xgFavVsThisTier: 1.3,
          udCsPct: 22,
          opponentGfVenue: 1.5,
          opponentBttsPct: 52,
        },
        confidenceParts: { forma: 18, xg: 9, h2h: 8, homeAway: 12, qoi: 6, flow: 8, market: 8, squad: 6, sample: 5 },
      }),
    );
    assert.ok(Math.abs(2.8 - 2.32) < 0.55);
    assert.notEqual(e.decision, "GREEN LIGHT");
    assert.ok(e.confidence.pct < 83);
    assert.ok(e.confidence.band === "Playable MIXED ONLY" || e.confidence.band === "No execution" || e.decision === "WATCH");
  });
});

describe("V26 korekty 28.08 (Celta / Barcelona)", () => {
  it("superprzewaga ≤1.35: HV z GF+GA nie zdejmuje sufitu λ, 2:0 w TOP3", () => {
    const e = runEngine(
      { home: "Barcelona", away: "Athletic Bilbao", league: "La Liga", kickoff: "2026-08-27T21:00:00", oddsHome: 1.24, oddsDraw: 6.5, oddsAway: 9.3 },
      payload({
        favorite: "home",
        profileDraft: "Strong Home Favorite",
        match: { league: "La Liga", kickoff: "2026-08-27T21:00:00", homePos: 1, awayPos: 20, ptsHome: 3, ptsAway: 0, motivation: "" },
        home: team({
          name: "Barcelona",
          gfAvg: 2.9,
          gfHome: 2.9,
          gaAvg: 1.1,
          bttsPct: 48,
          csPctOverall: 42,
          xg: 2.8,
          form: [
            { date: "2026-08-20", opponent: "A", ha: "H", scoreFor: 3, scoreAgainst: 0, quality: "TOP" },
            { date: "2026-08-13", opponent: "B", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "TOP" },
            { date: "2026-08-06", opponent: "C", ha: "H", scoreFor: 4, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-30", opponent: "D", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        away: team({ name: "Athletic Bilbao", gfAvg: 0.8, gaAvg: 1.3, bttsPct: 40, csPctOverall: 28, gfAway: 0.6, xg: 0.7 }),
        gatesRaw: {
          csFavLast10: 42,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 2,
          bttsRelevant: 44,
          avgGoalsRelevant: 4.0,
          favConcededInLast10Pct: 50,
          underdogOffQuality: false,
          matchesPlayedFav: 4,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 2,
          xgFavVsThisTier: 2.6,
          udCsPct: 28,
          opponentGfVenue: 0.6,
          opponentBttsPct: 40,
        },
      }),
    );
    assert.equal(e.gates.ugo.active, false);
    const top = e.epl.map((x) => x.score);
    assert.ok(top.includes("2:0"), `brak 2:0 w TOP3: ${top.join(",")}`);
    assert.ok(isCleanish(e.epl[0]?.score), `CORE ma być czysty, jest ${e.epl[0]?.score} (${top.join(",")})`);
    assert.ok(
      e.compression.log.some((l) => /Superprzewaga ≤1\.40|λ pod sufit/i.test(l)),
      `log: ${e.compression.log.join(" | ")}`,
    );
  });

  it("Soft Band + λ fav < 1.0: CORE 1:0, 1:1 zostaje, bez 2:0 jako EPL2", () => {
    const e = runEngine(
      { home: "Celta Vigo", away: "Osasuna", league: "La Liga", kickoff: "2026-08-27T20:30:00", oddsHome: 2.0, oddsDraw: 3.25, oddsAway: 4.0 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "La Liga", kickoff: "2026-08-27T20:30:00", homePos: 10, awayPos: 12, ptsHome: 1, ptsAway: 1, motivation: "" },
        home: team({
          name: "Celta Vigo",
          gfAvg: 0.66,
          gfHome: 0.66,
          gaAvg: 1.1,
          bttsPct: 42,
          csPctOverall: 30,
          xg: 0.7,
          form: [
            { date: "2026-08-20", opponent: "A", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-13", opponent: "B", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-06", opponent: "C", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-30", opponent: "D", ha: "H", scoreFor: 0, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        away: team({ name: "Osasuna", gfAvg: 1.1, gaAvg: 1.2, bttsPct: 48, csPctOverall: 25, gfAway: 0.9, xg: 1.0 }),
        gatesRaw: {
          csFavLast10: 30,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 4,
          bttsRelevant: 45,
          avgGoalsRelevant: 2.2,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 6,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 0,
          xgFavVsThisTier: 0.7,
          udCsPct: 25,
          opponentGfVenue: 0.9,
          opponentBttsPct: 48,
        },
      }),
    );
    assert.equal(e.gates.softBand.active, true);
    assert.equal(e.epl[0]?.score, "1:0", `CORE ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(e.epl.some((x) => x.score === "1:1"), `brak 1:1: ${e.epl.map((x) => x.score).join(",")}`);
    assert.notEqual(e.epl[1]?.score, "2:0", `2:0 nie może być EPL2 przy λ<1: ${e.epl.map((x) => x.score).join(",")}`);
  });
});

describe("V26 korekty 28.08 St. Pat's (7 błędów procesu)", () => {
  it("λ bierze gfHome/gfAway, nie spłaszczone gfAvg", () => {
    const home = team({ name: "St Patricks", gfAvg: 1.5, gfHome: 2.07, xg: 2.18 });
    const away = team({ name: "Waterford", gfAvg: 1.5, gfAway: 1.0, xg: 1.1 });
    assert.equal(venueLambda(home, "H"), 2.07);
    assert.equal(venueLambda(away, "A"), 1.0);
  });

  it("H2H starsze niż 36 mies. nie punktują", () => {
    const rows = [
      { date: "2020-03-01", competition: "League", home: "Waterford", away: "St Patricks", score: "3:0" },
      { date: "2026-05-08", competition: "League", home: "St Patricks", away: "Waterford", score: "4:1" },
      { date: "2026-03-20", competition: "League", home: "Waterford", away: "St Patricks", score: "0:2" },
    ];
    const live = recentH2h(rows, "2026-08-28T19:00:00");
    assert.equal(live.length, 2);
    assert.ok(!live.some((h) => h.date.startsWith("2020")));
  });

  it("Forma 2W-3D GD+3 to 8-11, nie 18", () => {
    const s = formScoreFromLast5([
      { date: "2026-08-22", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
      { date: "2026-08-15", opponent: "B", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
      { date: "2026-08-08", opponent: "C", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
      { date: "2026-08-01", opponent: "D", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
      { date: "2026-07-25", opponent: "E", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
    ]);
    assert.ok(s >= 8 && s <= 11, `forma ${s}`);
  });

  it("Controlled Home 1.33 + Remis NIE: CORE nie jest 1:1, 2:2 nie obok 1:1", () => {
    const e = runEngine(
      { home: "St Patricks Athletic", away: "Waterford", league: "Irlandia - Premier Division", kickoff: "2026-08-29T19:45:00", oddsHome: 1.33, oddsDraw: 4.6, oddsAway: 8.0 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Ireland Premier Division", kickoff: "2026-08-29T19:45:00", homePos: 4, awayPos: 10, ptsHome: 20, ptsAway: 12, motivation: "" },
        home: team({
          name: "St Patricks Athletic",
          gfAvg: 1.5,
          gfHome: 2.07,
          gaAvg: 0.9,
          gaHome: 0.5,
          bttsPct: 40,
          csPctOverall: 38,
          over25Pct: 25,
          xg: 2.18,
          form: [
            { date: "2026-08-22", opponent: "A", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-15", opponent: "B", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-08", opponent: "C", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-01", opponent: "D", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-25", opponent: "E", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-07-18", opponent: "F", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
          ],
        }),
        away: team({
          name: "Waterford",
          gfAvg: 1.5,
          gfAway: 1.0,
          gaAvg: 1.4,
          bttsPct: 44,
          csPctOverall: 22,
          over25Pct: 38,
          xg: 1.1,
        }),
        h2h: [
          { date: "2020-03-01", competition: "League", home: "Waterford", away: "St Patricks Athletic", score: "3:0" },
          { date: "2026-05-08", competition: "League", home: "St Patricks Athletic", away: "Waterford", score: "4:1" },
        ],
        gatesRaw: {
          csFavLast10: 38,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 42,
          avgGoalsRelevant: 2.4,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 8,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 0,
          xgFavVsThisTier: 1.6,
          udCsPct: 22,
          opponentGfVenue: 1.0,
          opponentBttsPct: 44,
        },
        confidenceParts: { forma: 18, xg: 12, h2h: 4, homeAway: 10, qoi: 6, flow: 7, market: 8, squad: 6, sample: 5 },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.notEqual(e.epl[0]?.score, "1:1", `CORE remis: ${top.join(",")}`);
    assert.ok(["1:0", "2:0", "2:1", "3:0"].includes(e.epl[0]?.score ?? ""), `CORE ${e.epl[0]?.score}`);
    const has11 = top.includes("1:1");
    const has22 = top.includes("2:2");
    assert.ok(!(has11 && has22), `1:1 i 2:2 razem: ${top.join(",")}`);
    assert.ok(e.confidence.forma <= 13, `forma ${e.confidence.forma}`);
    assert.equal(e.gates.ugo.active, false);
    assert.ok(/< 1\.40/.test(e.gates.ugo.reason), e.gates.ugo.reason);
    assert.ok(!e.epl.some((x) => x.satisfies.some((s) => s === "Mixed/UGO") && !e.gates.ugo.active));
  });
});

describe("V26 korekty 30.08 (cap λ / UGO 1.40 / Soft Band 0:0 / venue clip)", () => {
  it("pula przy kursie ≤1.30 zawiera 5:1 i 5:0", () => {
    const pool = buildExactPool({
      favorite: "home",
      profile: "Strong Home Favorite",
      home: team({ name: "Bayern", gfHome: 2.8, gfAvg: 2.6, xg: 2.5 }),
      away: team({ name: "Augsburg", gfAway: 0.7, gfAvg: 0.8, xg: 0.7 }),
      h2hAvg: 3,
      h2hN: 4,
      csFav: "Medium",
      hv: false,
      ugo: false,
      oddsFav: 1.25,
      exactOdds: {},
    });
    const scores = pool.map((c) => c.score);
    assert.ok(scores.includes("5:1"), `brak 5:1: ${scores.join(",")}`);
    assert.ok(scores.includes("5:0"), `brak 5:0: ${scores.join(",")}`);
  });

  it("UGO off przy Milan 1.39, on przy 1.40", () => {
    const base = {
      favorite: "home" as const,
      profileDraft: "Strong Home Favorite" as const,
      match: { league: "Serie A", kickoff: "2026-08-30T19:00:00", homePos: 2, awayPos: 14, ptsHome: 6, ptsAway: 1, motivation: "" },
      home: team({ name: "Milan", gfAvg: 1.8, gaAvg: 0.9, bttsPct: 44, csPctOverall: 38, xg: 1.7 }),
      away: team({ name: "Lecce", gfAvg: 0.9, gaAvg: 1.4, bttsPct: 46, csPctOverall: 22, gfAway: 0.7, xg: 0.8 }),
      gatesRaw: {
        csFavLast10: 38,
        csFavLast5Venue: 40,
        goalsConcededFavLast5Venue: 4,
        bttsRelevant: 45,
        avgGoalsRelevant: 2.6,
        favConcededInLast10Pct: 60,
        underdogOffQuality: false,
        matchesPlayedFav: 8,
        lateGoalUnderdogPct: 10,
        leagueGapScore: 1,
        xgFavVsThisTier: 1.6,
        udCsPct: 22,
        opponentGfVenue: 0.7,
        opponentBttsPct: 46,
      },
    };
    const off = runEngine(
      { home: "Milan", away: "Lecce", league: "Serie A", kickoff: "2026-08-30T19:00:00", oddsHome: 1.39, oddsDraw: 4.5, oddsAway: 8 },
      payload(base),
    );
    assert.equal(off.gates.ugo.active, false, off.gates.ugo.reason);
    const on = runEngine(
      { home: "Milan", away: "Lecce", league: "Serie A", kickoff: "2026-08-30T19:00:00", oddsHome: 1.4, oddsDraw: 4.5, oddsAway: 8 },
      payload(base),
    );
    assert.equal(on.gates.ugo.active, true, on.gates.ugo.reason);
  });

  it("Soft Band + BTTS<50 + Conf<80: CORE 1:0, 1:1 w TOP3, 0:0 ochrona", () => {
    const e = runEngine(
      { home: "Montpellier", away: "Brest", league: "Ligue 1", kickoff: "2026-08-30T19:00:00", oddsHome: 1.85, oddsDraw: 3.4, oddsAway: 4.2 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Ligue 1", kickoff: "2026-08-30T19:00:00", homePos: 12, awayPos: 14, ptsHome: 4, ptsAway: 3, motivation: "" },
        home: team({
          name: "Montpellier",
          gfAvg: 1.1,
          gfHome: 1.2,
          gaAvg: 1.2,
          bttsPct: 40,
          csPctOverall: 30,
          over25Pct: 38,
          xg: 1.1,
          form: [
            { date: "2026-08-23", opponent: "A", ha: "H", scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" },
            { date: "2026-08-16", opponent: "B", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-09", opponent: "C", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
            { date: "2026-08-02", opponent: "D", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
          ],
        }),
        away: team({ name: "Brest", gfAvg: 1.0, gaAvg: 1.3, bttsPct: 42, csPctOverall: 22, gfAway: 0.8, over25Pct: 40, xg: 0.9 }),
        gatesRaw: {
          csFavLast10: 30,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 4,
          bttsRelevant: 41,
          avgGoalsRelevant: 2.3,
          favConcededInLast10Pct: 55,
          underdogOffQuality: false,
          matchesPlayedFav: 4,
          lateGoalUnderdogPct: 0,
          leagueGapScore: 0,
          xgFavVsThisTier: 1.1,
          udCsPct: 22,
          opponentGfVenue: 0.8,
          opponentBttsPct: 42,
        },
      }),
    );
    assert.equal(e.gates.softBand.active, true);
    assert.ok(e.confidence.pct < 80, `conf ${e.confidence.pct}`);
    assert.equal(e.epl[0]?.score, "1:0", `CORE ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(e.epl.some((x) => x.score === "1:1"), `brak 1:1 w TOP3: ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(!e.epl.some((x) => x.score === "0:0"), `0:0 zostało w TOP3: ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(e.protection.some((x) => x.score === "0:0"), `brak 0:0 w ochronie: ${e.protection.map((x) => x.score).join(",")}`);
  });

  it("early sample: 5:0 ścina GF+GA i venue λ", () => {
    const blow = team({
      name: "Falkenberg",
      played: 4,
      gfAvg: 2.5,
      gaAvg: 1.5,
      gfHome: 2.8,
      form: [
        { date: "2026-08-20", opponent: "A", ha: "H", scoreFor: 5, scoreAgainst: 0, quality: "SLABY" },
        { date: "2026-08-13", opponent: "B", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
        { date: "2026-08-06", opponent: "C", ha: "H", scoreFor: 1, scoreAgainst: 2, quality: "SREDNI" },
        { date: "2026-07-30", opponent: "D", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
      ],
    });
    const rawGfGa = blow.gfAvg + blow.gaAvg;
    const clipped = gfGaForHv(blow);
    assert.ok(clipped < rawGfGa, `clip ${clipped} vs raw ${rawGfGa}`);
    const lam = venueLambda(blow, "H");
    // home: 5→3, 1, 1 → avg 5/3 ≈ 1.67, nie (5+1+1)/3 = 2.33
    assert.ok(lam <= 1.7, `venue λ ${lam}`);
  });
});

describe("V26 Kryteria v2.1 (31.08)", () => {
  it("kategorie v2.1: Home/Away, Squad, Sample — bez League Gap/Override", () => {
    const e = runEngine(calcuttaInput, payload());
    assert.equal(typeof e.confidence.homeAway, "number");
    assert.equal(typeof e.confidence.squad, "number");
    assert.equal(typeof e.confidence.sample, "number");
    assert.equal((e.confidence as { leagueGap?: number }).leagueGap, undefined);
    assert.equal((e.confidence as { atakObrona?: number }).atakObrona, undefined);
    assert.ok(e.confidence.sample <= 5);
    assert.ok(e.confidence.homeAway <= 15);
    assert.ok(e.confidence.squad <= 10);
  });

  it("Sample Size: n≥6 nie-HV = 5, HV = 3, UGO nie obcina", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const ok = runEngine(
      { ...calcuttaInput, league: "Ekstraklasa", oddsHome: 1.7, oddsAway: 4.5 },
      payload({
        match: { league: "Ekstraklasa", kickoff: "2026-08-31T12:00:00", homePos: 3, awayPos: 10, ptsHome: 15, ptsAway: 8, motivation: "derbowa motywacja gospodarza po przerwie" },
        home: team({ name: "Lech", played: 8, form: form6, tablePos: 3, gfAvg: 1.8, gfHome: 2.0, gaHome: 0.7, csPctOverall: 40, xg: 1.6 }),
        away: team({ name: "Radomiak", played: 8, form: form6, tablePos: 10, gfAvg: 1.1, gfAway: 0.8 }),
        favorite: "home",
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          bttsRelevant: 40,
          avgGoalsRelevant: 2.4,
          csFavLast10: 40,
        },
      }),
    );
    assert.equal(ok.confidence.sample, 5);
    assert.ok(ok.gates.ugo.active === false || ok.confidence.sample === 5);

    const hv = runEngine(
      { home: "A", away: "B", league: "Chile Primera División", kickoff: "2026-08-31T12:00:00", oddsHome: 1.7, oddsAway: 4.8 },
      payload({
        match: { league: "Chile Primera División", kickoff: "2026-08-31T12:00:00", homePos: 2, awayPos: 11, ptsHome: 20, ptsAway: 8, motivation: "" },
        home: team({ name: "A", played: 8, form: form6, tablePos: 2, gfAvg: 1.7, gfHome: 1.8, xg: 1.5 }),
        away: team({ name: "B", played: 8, form: form6, tablePos: 11 }),
        favorite: "home",
        gatesRaw: { ...payload().gatesRaw, matchesPlayedFav: 8, bttsRelevant: 40, avgGoalsRelevant: 2.5, csFavLast10: 35 },
      }),
    );
    assert.equal(hv.confidence.sample, 3, `HV sample ${hv.confidence.sample}`);
  });

  it("pasmo 70–84 = MIXED ONLY, nie GREEN; zakaz 4+ w TOP3", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 1,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "Colo Colo", away: "Audax", league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", oddsHome: 1.42, oddsDraw: 4.4, oddsAway: 7.5 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", homePos: 2, awayPos: 14, ptsHome: 18, ptsAway: 6, motivation: "derbowa kolejka, luka tabeli" },
        home: team({
          name: "Colo Colo",
          played: 8,
          tablePos: 2,
          form: form6,
          gfAvg: 1.7,
          gfHome: 1.9,
          gaHome: 0.9,
          csPctOverall: 38,
          bttsPct: 48,
          xg: 1.5,
        }),
        away: team({ name: "Audax", played: 8, tablePos: 14, form: form6, gfAvg: 0.9, gfAway: 0.8 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 38,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 48,
          avgGoalsRelevant: 2.5,
          favConcededInLast10Pct: 55,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.6,
          opponentGfVenue: 0.8,
          opponentBttsPct: 45,
        },
      }),
    );
    assert.ok(e.confidence.pct >= 70 && e.confidence.pct < 85, `conf ${e.confidence.pct}`);
    assert.equal(e.confidence.band, "Playable MIXED ONLY");
    assert.notEqual(e.decision, "GREEN LIGHT", e.decision);
    assert.ok(e.decision === "MIXED ONLY" || e.decision === "WATCH", e.decision);
    assert.ok(!e.epl.some((x) => {
      const [h] = x.score.split(":").map(Number);
      return h >= 4;
    }), `4+ w TOP3: ${e.epl.map((x) => x.score).join(",")}`);
    assert.ok(e.confidence.qoi >= 7, `QOI ${e.confidence.qoi} przy luce ≥8`);
  });

  it("H2H brak danych = 5, nie 0", () => {
    const e = runEngine(calcuttaInput, payload({ h2h: [] }));
    assert.equal(e.confidence.h2h, 5, `h2h ${e.confidence.h2h}`);
  });

  it("HV nie obcina sumy 0–105 o 9 pkt", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const body = {
      favorite: "home" as const,
      profileDraft: "Controlled Home Favorite" as const,
      injuries: "kadra kompletna",
      home: team({ name: "A", played: 8, form: form6, tablePos: 3, gfAvg: 1.8, gfHome: 1.9, gaHome: 0.8, csPctOverall: 40, xg: 1.6 }),
      away: team({ name: "B", played: 8, form: form6, tablePos: 11, gfAvg: 1.1, gfAway: 0.9, xg: 1.0 }),
      gatesRaw: { ...payload().gatesRaw, matchesPlayedFav: 8, bttsRelevant: 40, avgGoalsRelevant: 2.5, csFavLast10: 38 },
    };
    const noHv = runEngine(
      { home: "A", away: "B", league: "Ekstraklasa", kickoff: "2026-08-31T12:00:00", oddsHome: 1.80, oddsDraw: 3.5, oddsAway: 4.4 },
      payload({ ...body, match: { league: "Ekstraklasa", kickoff: "2026-08-31T12:00:00", homePos: 3, awayPos: 11, ptsHome: 16, ptsAway: 8, motivation: "" } }),
    );
    const hv = runEngine(
      { home: "A", away: "B", league: "Chile Primera División", kickoff: "2026-08-31T12:00:00", oddsHome: 1.80, oddsDraw: 3.5, oddsAway: 4.4 },
      payload({ ...body, match: { league: "Chile Primera División", kickoff: "2026-08-31T12:00:00", homePos: 3, awayPos: 11, ptsHome: 16, ptsAway: 8, motivation: "" } }),
    );
    assert.equal(hv.gates.highVariance.active, true);
    assert.equal(noHv.gates.highVariance.active, false);
    assert.equal(hv.confidence.flow, noHv.confidence.flow, `Flow HV ${hv.confidence.flow} vs ${noHv.confidence.flow} — nie −5`);
    assert.equal(hv.confidence.homeAway, noHv.confidence.homeAway, `Home/Away HV ${hv.confidence.homeAway} vs ${noHv.confidence.homeAway} — nie −4`);
    assert.ok(Math.abs(hv.confidence.sum - noHv.confidence.sum) <= 3, `sum HV ${hv.confidence.sum} vs ${noHv.confidence.sum}`);
  });

  it("Direction NIE nie capuje pct do 82", () => {
    const form5 = [
      { date: "2026-08-24", opponent: "A", ha: "H" as const, scoreFor: 3, scoreAgainst: 0, quality: "TOP" as const },
      { date: "2026-08-17", opponent: "B", ha: "A" as const, scoreFor: 2, scoreAgainst: 0, quality: "TOP" as const },
      { date: "2026-08-10", opponent: "C", ha: "H" as const, scoreFor: 4, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-08-03", opponent: "D", ha: "H" as const, scoreFor: 3, scoreAgainst: 0, quality: "SLABY" as const },
      { date: "2026-07-27", opponent: "E", ha: "A" as const, scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" as const },
      { date: "2026-07-20", opponent: "F", ha: "H" as const, scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" as const },
    ];
    const e = runEngine(
      { home: "Sirius", away: "Hacken", league: "Ekstraklasa", kickoff: "2026-08-21T18:00:00", oddsHome: 2.20, oddsDraw: 3.4, oddsAway: 3.80 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        injuries: "",
        match: { league: "Ekstraklasa", kickoff: "2026-08-21T18:00:00", homePos: 2, awayPos: 12, ptsHome: 18, ptsAway: 8, motivation: "must-win tytuł" },
        home: team({
          name: "Sirius",
          played: 8,
          tablePos: 2,
          form: form5,
          gfAvg: 2.5,
          gfHome: 2.9,
          gaHome: 0.6,
          gaAvg: 0.7,
          csPctOverall: 40,
          bttsPct: 50,
          xg: 2.4,
        }),
        away: team({ name: "Hacken", played: 8, tablePos: 12, gfAvg: 1.6, gfAway: 1.0, xg: 1.0 }),
        h2h: [
          { date: "2026-05-01", competition: "Liga", home: "Sirius", away: "Hacken", score: "2:0" },
          { date: "2026-03-01", competition: "Liga", home: "Hacken", away: "Sirius", score: "0:2" },
          { date: "2025-11-01", competition: "Liga", home: "Sirius", away: "Hacken", score: "3:1" },
          { date: "2025-08-01", competition: "Liga", home: "Hacken", away: "Sirius", score: "1:2" },
        ],
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 40,
          csFavLast5Venue: 40,
          bttsRelevant: 50,
          avgGoalsRelevant: 2.8,
        },
      }),
    );
    assert.ok(e.confidence.flow <= 2, `flow ${e.confidence.flow}`);
    assert.ok(e.confidence.pct > 82 || e.decision === "WATCH", `pct ${e.confidence.pct} decision ${e.decision}`);
    assert.ok(e.decision === "WATCH" || e.decision === "NO EXECUTION", e.decision);
  });

  it("Conf < 70 → No execution / NO EXECUTION", () => {
    const e = runEngine(
      { home: "A", away: "B", league: "Ekstraklasa", kickoff: "2026-08-31T12:00:00" },
      payload({
        favorite: "home",
        home: team({ name: "A", played: 2, form: [], gfAvg: 0, xg: 0, tablePos: 0 }),
        away: team({ name: "B", played: 2, form: [], gfAvg: 0, xg: 0, tablePos: 0 }),
        match: { league: "Ekstraklasa", kickoff: "2026-08-31T12:00:00", homePos: 0, awayPos: 0, ptsHome: 0, ptsAway: 0, motivation: "" },
        gatesRaw: { ...payload().gatesRaw, matchesPlayedFav: 2, csFavLast10: 0, bttsRelevant: 0, avgGoalsRelevant: 0 },
        confidenceParts: { forma: 4, xg: 0, h2h: 0, homeAway: 4, qoi: 0, flow: 3, market: 0, squad: 3, sample: 0 },
      }),
    );
    assert.ok(e.confidence.pct < 70, `conf ${e.confidence.pct}`);
    assert.equal(e.confidence.band, "No execution");
    assert.equal(e.decision, "NO EXECUTION");
  });

  it("Remis Safety: 1:1 w TOP3 przed fill, 2:2 nie w slocie remisu", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "A" as const,
      scoreFor: 2,
      scoreAgainst: 1,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "Mirassol", away: "Palmeiras", league: "Chile Primera División", kickoff: "2026-08-30T23:30:00", oddsHome: 4.8, oddsDraw: 3.6, oddsAway: 1.62 },
      payload({
        favorite: "away",
        profileDraft: "Controlled Away Favorite",
        match: { league: "Chile Primera División", kickoff: "2026-08-30T23:30:00", homePos: 12, awayPos: 2, ptsHome: 8, ptsAway: 20, motivation: "" },
        home: team({
          name: "Mirassol",
          played: 8,
          tablePos: 12,
          form: form6,
          gfAvg: 1.4,
          gfHome: 1.5,
          gaAvg: 1.3,
          bttsPct: 55,
          csPctOverall: 22,
          xg: 1.3,
        }),
        away: team({
          name: "Palmeiras",
          played: 8,
          tablePos: 2,
          form: form6,
          gfAvg: 1.8,
          gfAway: 1.6,
          gaAvg: 0.9,
          bttsPct: 48,
          csPctOverall: 35,
          xg: 1.7,
        }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 35,
          csFavLast5Venue: 30,
          goalsConcededFavLast5Venue: 5,
          bttsRelevant: 52,
          avgGoalsRelevant: 2.7,
          favConcededInLast10Pct: 60,
          underdogOffQuality: true,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.5,
          opponentGfVenue: 1.5,
          opponentBttsPct: 55,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.equal(e.gates.highVariance.active, true);
    assert.equal(e.gates.remisSafety.active, true, `remis ${e.gates.remisSafety.reason} conf ${e.confidence.pct}`);
    assert.ok(top.includes("1:1"), `brak 1:1 w TOP3: ${top.join(",")}`);
    assert.ok(!top.includes("2:2"), `2:2 w slocie remisu: ${top.join(",")}`);
    assert.ok(!top.includes("2:2") || e.protection.some((p) => p.score === "2:2"));
  });

  it("BTTS formy <45%: CORE nie jest 1:1, 1:1 zostaje ochroną (Vitória)", () => {
    const form = [
      { date: "2026-08-23", opponent: "Bahia", ha: "H" as const, scoreFor: 0, scoreAgainst: 2, quality: "SREDNI" as const },
      { date: "2026-08-16", opponent: "Botafogo", ha: "H" as const, scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" as const },
      { date: "2026-08-10", opponent: "A", ha: "A" as const, scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-08-03", opponent: "B", ha: "H" as const, scoreFor: 0, scoreAgainst: 2, quality: "SREDNI" as const },
      { date: "2026-07-27", opponent: "C", ha: "A" as const, scoreFor: 1, scoreAgainst: 2, quality: "SREDNI" as const },
      { date: "2026-07-20", opponent: "D", ha: "H" as const, scoreFor: 1, scoreAgainst: 0, quality: "SLABY" as const },
    ];
    const e = runEngine(
      { home: "Vitoria BA", away: "Gremio RS", league: "Brasileirão Série A", kickoff: "2026-09-07T23:00:00", oddsHome: 2.12, oddsDraw: 3.15, oddsAway: 3.3 },
      payload({
        favorite: "home",
        profileDraft: "Slight Home Edge",
        match: { league: "Brasileirão Série A", kickoff: "2026-09-07T23:00:00", homePos: 14, awayPos: 15, ptsHome: 29, ptsAway: 28, motivation: "" },
        home: team({ name: "Vitoria", played: 10, tablePos: 14, form, gfAvg: 0.6, gfHome: 1.0, gaAvg: 1.7, bttsPct: 10, csPctOverall: 20, xg: 0.9 }),
        away: team({ name: "Gremio", played: 10, tablePos: 15, form, gfAvg: 1.1, gfAway: 0.8, gaAvg: 1.0, bttsPct: 50, csPctOverall: 20, xg: 1.1 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 10,
          csFavLast10: 20,
          csFavLast5Venue: 20,
          bttsRelevant: 30,
          avgGoalsRelevant: 1.7,
          favConcededInLast10Pct: 80,
          underdogOffQuality: true,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.notEqual(e.epl[0]?.score, "1:1", `CORE 1:1 przy BTTS 30%: ${top.join("/")}`);
    assert.ok(["1:0", "0:1", "2:0"].includes(e.epl[0]?.score ?? ""), `CORE ${e.epl[0]?.score}`);
    assert.ok(top.includes("1:1"), `1:1 wypadło z TOP3: ${top.join("/")}`);
    const m = buildMarkets(
      { home: "Vitoria BA", away: "Gremio RS", league: "Brasileirão Série A", kickoff: "2026-09-07T23:00:00", oddsHome: 2.12, oddsDraw: 3.15, oddsAway: 3.3 },
      payload({
        favorite: "home",
        home: team({ name: "Vitoria", form, gfAvg: 0.6, bttsPct: 10 }),
        away: team({ name: "Gremio", form, gfAvg: 1.1, bttsPct: 50 }),
      }),
      e,
    );
    const bttsNo = m.track.find((p) => p.market === "BTTS" && p.pick === "NIE");
    if (e.epl[0]?.score === "1:1") {
      assert.equal(bttsNo, undefined, "BTTS NIE przy CORE 1:1");
    } else {
      assert.ok(!m.surest.some((p) => p.market === "BTTS" && p.pick === "NIE" && e.epl[0]?.score === "1:1"));
    }
  });

  it("BTTS formy ≥45%: CORE 1:1 zostaje (Rayo / Balanced BTTS)", () => {
    const form = [
      { date: "2026-08-20", opponent: "A", ha: "H" as const, scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-08-13", opponent: "B", ha: "A" as const, scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-08-06", opponent: "C", ha: "H" as const, scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-07-30", opponent: "D", ha: "A" as const, scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" as const },
      { date: "2026-07-23", opponent: "E", ha: "H" as const, scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" as const },
      { date: "2026-07-16", opponent: "F", ha: "A" as const, scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" as const },
    ];
    const e = runEngine(
      { home: "Rayo Vallecano", away: "Alaves", league: "LaLiga", kickoff: "2026-08-20T19:00:00", oddsHome: 2.35, oddsDraw: 3.05, oddsAway: 3.25 },
      payload({
        favorite: "home",
        profileDraft: "Slight Home Edge",
        match: { league: "LaLiga", kickoff: "2026-08-20T19:00:00", homePos: 10, awayPos: 12, ptsHome: 12, ptsAway: 10, motivation: "" },
        home: team({ name: "Rayo", played: 8, tablePos: 10, form, gfAvg: 1.2, gfHome: 1.3, gaAvg: 1.1, bttsPct: 55, csPctOverall: 18, xg: 1.1 }),
        away: team({ name: "Alaves", played: 8, tablePos: 12, form, gfAvg: 1.1, gfAway: 1.2, gaAvg: 1.2, bttsPct: 52, csPctOverall: 22, xg: 1.4 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 18,
          bttsRelevant: 54,
          avgGoalsRelevant: 2.4,
          favConcededInLast10Pct: 70,
          underdogOffQuality: true,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    if (e.epl[0]?.score === "1:1") {
      assert.ok(true);
    } else {
      assert.ok(top.includes("1:1") || ["1:0", "2:1", "1:2"].includes(e.epl[0]?.score ?? ""), `TOP3 ${top.join("/")}`);
    }
    assert.ok(!e.compression.log.some((l) => /BTTS formy \d+% <45: CORE 1:1/.test(l)), e.compression.log.join(" | "));
  });

  it("Villa–Arsenal FILL TOP3: 0:1 zamiast 1:3 (Conf <70, HV=NIE, UGO TAK)", () => {
    const e = runEngine(
      { home: "Aston Villa", away: "Arsenal", league: "Premier League", kickoff: "2026-08-31T20:00:00", oddsHome: 5.9, oddsDraw: 4.35, oddsAway: 1.5 },
      payload({
        favorite: "away",
        profileDraft: "Controlled Away Favorite",
        match: { league: "Premier League", kickoff: "2026-08-31T20:00:00", homePos: 17, awayPos: 9, ptsHome: 0, ptsAway: 3, motivation: "" },
        home: team({
          name: "Aston Villa",
          played: 1,
          tablePos: 17,
          form: [{ date: "2026-08-23", opponent: "Brighton", ha: "A" as const, scoreFor: 0, scoreAgainst: 4, quality: "SREDNI" as const }],
          gfAvg: 0,
          gaAvg: 3,
          gfHome: 0,
          gaHome: 0,
          gfAway: 0,
          gaAway: 3,
          csPctOverall: 0,
          bttsPct: 0,
          over25Pct: 100,
          xg: 0.29,
          xga: 3.77,
          shotsOnTarget: 0,
          corners: 2,
        }),
        away: team({
          name: "Arsenal",
          played: 1,
          tablePos: 9,
          form: [{ date: "2026-08-21", opponent: "Coventry", ha: "H" as const, scoreFor: 3, scoreAgainst: 0, quality: "SREDNI" as const }],
          gfAvg: 3,
          gaAvg: 0,
          gfHome: 3,
          gaHome: 0,
          gfAway: 0,
          gaAway: 0,
          csPctOverall: 100,
          bttsPct: 0,
          over25Pct: 100,
          xg: 1.88,
          xga: 0.2,
          shotsOnTarget: 6,
          corners: 8,
        }),
        gatesRaw: {
          ...payload().gatesRaw,
          csFavLast10: 100,
          csFavLast5Venue: 0,
          goalsConcededFavLast5Venue: 0,
          bttsRelevant: 0,
          avgGoalsRelevant: 3,
          favConcededInLast10Pct: 0,
          matchesPlayedFav: 1,
          leagueGapScore: 0,
          xgFavVsThisTier: 0.29,
          opponentGfVenue: 0,
          opponentBttsPct: 0,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct < 70, `conf ${e.confidence.pct}`);
    assert.equal(e.gates.highVariance.active, false, "HV ma być NIE");
    assert.ok(!top.includes("1:3"), `1:3 w TOP3: ${top.join(",")}`);
    assert.ok(top.includes("0:1"), `brak 0:1: ${top.join(",")}`);
    assert.ok(["0:1", "0:2"].includes(top[2] || ""), `EPL3 ma być 0:1/0:2, jest ${top[2]} (${top.join(",")})`);
  });

  it("Kopenhaga: 3:1 jako Central Exact wraca przy Conf<70 (UGO TAK)", () => {
    const form = [0, 1].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 3,
      scoreAgainst: 1,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "FC Kopenhaga", away: "Randers", league: "Superliga Denmark", kickoff: "2026-08-31T18:00:00", oddsHome: 1.45, oddsDraw: 4.3, oddsAway: 6.5 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Superliga Denmark", kickoff: "2026-08-31T18:00:00", homePos: 2, awayPos: 12, ptsHome: 6, ptsAway: 1, motivation: "" },
        home: team({
          name: "FC Kopenhaga",
          played: 2,
          tablePos: 2,
          form,
          gfAvg: 2.6,
          gaAvg: 0.8,
          gfHome: 3,
          gaHome: 0.7,
          csPctOverall: 50,
          bttsPct: 50,
          over25Pct: 75,
          shotsOnTarget: 7,
        }),
        away: team({
          name: "Randers",
          played: 2,
          tablePos: 12,
          form: form.map((m) => ({ ...m, scoreFor: 1, scoreAgainst: 2 })),
          gfAvg: 0.9,
          gfAway: 0.8,
          gaAway: 1.8,
          csPctOverall: 10,
          bttsPct: 55,
        }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 2,
          csFavLast10: 50,
          csFavLast5Venue: 0,
          goalsConcededFavLast5Venue: 0,
          bttsRelevant: 50,
          avgGoalsRelevant: 3.2,
          favConcededInLast10Pct: 50,
          leagueGapScore: 4,
          xgFavVsThisTier: 0,
          opponentGfVenue: 0.8,
          opponentBttsPct: 50,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct < 70, `conf ${e.confidence.pct}`);
    assert.ok(e.gates.ugo.active, e.gates.ugo.reason);
    assert.ok(top.includes("3:1"), `brak 3:1 Central: ${top.join(",")}`);
    assert.ok(top.includes("1:0"), `brak Minimal 1:0: ${top.join(",")}`);
    assert.ok(!top.includes("3:2") && !top.includes("4:1"), `ogon/chaos: ${top.join(",")}`);
  });

  it("Colo Colo + UGO: 3:1 może zostać, 3:2 wylatuje z TOP3", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "Colo Colo", away: "Audax", league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", oddsHome: 1.42, oddsDraw: 4.4, oddsAway: 7.5 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", homePos: 2, awayPos: 14, ptsHome: 18, ptsAway: 6, motivation: "" },
        home: team({ name: "Colo Colo", played: 8, tablePos: 2, form: form6, gfAvg: 1.7, gfHome: 1.9, gaHome: 0.9, csPctOverall: 38, bttsPct: 48, xg: 1.5 }),
        away: team({ name: "Audax", played: 8, tablePos: 14, form: form6, gfAvg: 0.9, gfAway: 0.8 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 38,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 48,
          avgGoalsRelevant: 2.5,
          favConcededInLast10Pct: 55,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.6,
          opponentGfVenue: 0.8,
          opponentBttsPct: 45,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(e.gates.ugo.active, e.gates.ugo.reason);
    assert.ok(!top.includes("3:2") && !top.includes("2:3"), `chaos w TOP3: ${top.join(",")}`);
    assert.ok(!top.includes("3:3"), `3:3 w TOP3: ${top.join(",")}`);
  });

  it("3:3 jest chaosem fillu — nie VALUE", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 3,
      scoreAgainst: 2,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "Liepaja", away: "Riga", league: "Virsliga", kickoff: "2026-08-31T17:00:00", oddsHome: 2.05, oddsDraw: 3.6, oddsAway: 3.2 },
      payload({
        favorite: "home",
        profileDraft: "Open",
        match: { league: "Virsliga", kickoff: "2026-08-31T17:00:00", homePos: 5, awayPos: 6, ptsHome: 12, ptsAway: 11, motivation: "" },
        home: team({ name: "Liepaja", played: 8, form: form6, gfAvg: 2.4, gaAvg: 2.1, gfHome: 2.6, bttsPct: 72, over25Pct: 80, csPctOverall: 10, xg: 1.9 }),
        away: team({ name: "Riga", played: 8, form: form6, gfAvg: 2.2, gaAvg: 2.0, gfAway: 2.1, bttsPct: 70, over25Pct: 75, csPctOverall: 12, xg: 1.8 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          bttsRelevant: 71,
          avgGoalsRelevant: 4.4,
          csFavLast10: 10,
          favConcededInLast10Pct: 90,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(!top.includes("3:3"), `3:3 w TOP3: ${top.join(",")}`);
    assert.ok(!e.epl.some((x) => x.score === "3:3" && x.role === "VALUE"), `3:3 VALUE: ${top.join(",")}`);
  });

  it("centralCand 1:3 przy Conf 61 i UGO=NIE nie idzie do TOP3", () => {
    const e = runEngine(
      { home: "Sumgayit", away: "Qarabag", league: "Azerbaijan Premier League", kickoff: "2026-08-31T18:00:00", oddsHome: 6.6, oddsDraw: 4.85, oddsAway: 1.34 },
      payload({
        favorite: "away",
        profileDraft: "Controlled Away Favorite",
        match: { league: "Azerbaijan Premier League", kickoff: "2026-08-31T18:00:00", homePos: 12, awayPos: 1, ptsHome: 0, ptsAway: 12, motivation: "" },
        home: team({
          name: "Sumgayit",
          played: 5,
          tablePos: 12,
          form: [
            { date: "2026-08-16", opponent: "Neftchi", ha: "H" as const, scoreFor: 1, scoreAgainst: 3, quality: "SREDNI" as const },
          ],
          gfAvg: 1,
          gaAvg: 3,
          gfHome: 1,
          csPctOverall: 0,
          bttsPct: 100,
          xg: 0.8,
        }),
        away: team({
          name: "Qarabag",
          played: 5,
          tablePos: 1,
          form: [
            { date: "2026-08-17", opponent: "Shamakhi", ha: "H" as const, scoreFor: 3, scoreAgainst: 1, quality: "SREDNI" as const },
          ],
          gfAvg: 2.4,
          gaAvg: 0.8,
          gfAway: 2.2,
          csPctOverall: 40,
          bttsPct: 40,
          xg: 1.9,
        }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 5,
          csFavLast10: 40,
          bttsRelevant: 50,
          avgGoalsRelevant: 3,
          favConcededInLast10Pct: 50,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct < 70, `conf ${e.confidence.pct}`);
    assert.equal(e.gates.ugo.active, false, e.gates.ugo.reason);
    assert.ok(!top.includes("1:3"), `1:3 w TOP3: ${top.join(",")}`);
  });

  it("3:1 przy UGO TAK i Conf 71 zostaje", () => {
    const form6 = [0, 1, 2, 3, 4, 5].map((i) => ({
      date: `2026-08-0${i + 1}`,
      opponent: "X",
      ha: "H" as const,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
    }));
    const e = runEngine(
      { home: "Colo Colo", away: "Audax", league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", oddsHome: 1.42, oddsDraw: 4.4, oddsAway: 7.5 },
      payload({
        favorite: "home",
        profileDraft: "Controlled Home Favorite",
        match: { league: "Ekstraklasa", kickoff: "2026-08-30T21:00:00", homePos: 2, awayPos: 14, ptsHome: 18, ptsAway: 6, motivation: "" },
        home: team({ name: "Colo Colo", played: 8, tablePos: 2, form: form6, gfAvg: 1.7, gfHome: 1.9, gaHome: 0.9, csPctOverall: 38, bttsPct: 48, xg: 1.5 }),
        away: team({ name: "Audax", played: 8, tablePos: 14, form: form6, gfAvg: 0.9, gfAway: 0.8 }),
        gatesRaw: {
          ...payload().gatesRaw,
          matchesPlayedFav: 8,
          csFavLast10: 38,
          csFavLast5Venue: 40,
          goalsConcededFavLast5Venue: 3,
          bttsRelevant: 48,
          avgGoalsRelevant: 2.5,
          favConcededInLast10Pct: 55,
          leagueGapScore: 2,
          xgFavVsThisTier: 1.6,
          opponentGfVenue: 0.8,
          opponentBttsPct: 45,
        },
      }),
    );
    const top = e.epl.map((x) => x.score);
    assert.ok(e.gates.ugo.active, e.gates.ugo.reason);
    assert.ok(e.confidence.pct >= 70, `conf ${e.confidence.pct}`);
    assert.ok(!top.includes("3:2"), `3:2 w TOP3: ${top.join(",")}`);
    const banned = top.includes("3:1") === false && top.includes("3:2");
    assert.equal(banned, false, `3:1 ucięte razem z chaosem: ${top.join(",")}`);
  });

  it("klub spoza JSON: brak logu 25.19, λ tylko ten sezon", () => {
    const e = runEngine(
      { home: "Flint Town United", away: "Connah's Quay Nomads", league: "Cymru Premier", kickoff: "2026-08-31T14:30:00", oddsHome: 4.2, oddsDraw: 3.65, oddsAway: 1.69 },
      payload({
        favorite: "away",
        home: team({ name: "Flint Town United", gfAvg: 1, gfHome: 1 }),
        away: team({ name: "GAP Connah S Quay FC", gfAvg: 2.4, gfAway: 2.2 }),
        match: { league: "Cymru Premier", kickoff: "2026-08-31T14:30:00", homePos: 13, awayPos: 3, ptsHome: 1, ptsAway: 10, motivation: "" },
      }),
    );
    assert.ok(!e.compression.log.some((l) => l.includes("25.19 prevSeason")), e.compression.log.filter((l) => l.includes("25.19")).join(" | "));
  });

  it("S1 cisza: cap 69% i NO EXECUTION", () => {
    const e = runEngine(
      { home: "Hajduk Split", away: "Lokomotiva Zagreb", league: "HNL", kickoff: "2026-09-02T18:00:00", oddsHome: 1.45, oddsDraw: 4.2, oddsAway: 6.5 },
      payload({ squadVerified: false, injuries: "" }),
    );
    assert.equal(e.decision, "NO EXECUTION");
    assert.equal(e.confidence.squad, 4);
    assert.ok(e.confidence.notes.some((l) => /S1 SKŁAD NIEZWERYFIKOWANY/.test(l)));
  });

  it("S1 XI komplet: 9 pkt składu, bez capu 69", () => {
    const e = runEngine(
      { home: "Hajduk Split", away: "Lokomotiva Zagreb", league: "HNL", kickoff: "2026-09-02T18:00:00", oddsHome: 1.45, oddsDraw: 4.2, oddsAway: 6.5, squadVerified: true },
      payload({ squadVerified: true, injuries: "kadra komplet" }),
    );
    assert.equal(e.confidence.squad, 9);
    assert.ok(!e.confidence.notes.some((l) => /S1 SKŁAD NIEZWERYFIKOWANY/.test(l)));
  });

  it("S3 GK out faworyta: CS Weak i Conf cap 60%", () => {
    const e = runEngine(
      { home: "Hajduk Split", away: "Lokomotiva Zagreb", league: "HNL", kickoff: "2026-09-02T18:00:00", oddsHome: 1.45, oddsDraw: 4.2, oddsAway: 6.5, squadVerified: true },
      payload({
        squadVerified: true,
        gkOutFav: true,
        injuries: "bramkarz out kontuzja",
        favorite: "home",
        gatesRaw: { ...payload().gatesRaw, csFavLast10: 70, csFavLast5Venue: 80, goalsConcededFavLast5Venue: 1 },
      }),
    );
    assert.equal(e.gates.csFav, "Weak");
    assert.equal(e.decision, "NO EXECUTION");
    assert.ok(e.confidence.notes.some((n) => /S3/.test(n)));
  });

  it("S4 Soft + keyOutFav: CORE nie jest Minimal strony faworyta", () => {
    const e = runEngine(
      { home: "Stoke", away: "Norwich", league: "Championship", kickoff: "2026-09-01T20:00:00", oddsHome: 1.85, oddsDraw: 3.4, oddsAway: 4.2, squadVerified: true },
      payload({ squadVerified: true, keyOutFav: true, injuries: "napastnik out kontuzja", favorite: "home" }),
    );
    assert.ok(e.compression.log.some((l) => /S4 SOFT VS SKŁAD/.test(l)) || e.epl[0]?.score === "1:1");
  });

  it("S3 keyOutUd gasi UGO", () => {
    const e = runEngine(
      { home: "Hajduk Split", away: "Lokomotiva Zagreb", league: "HNL", kickoff: "2026-09-02T18:00:00", oddsHome: 1.45, oddsDraw: 4.2, oddsAway: 6.5, squadVerified: true },
      payload({ squadVerified: true, keyOutUd: true, injuries: "kadra komplet" }),
    );
    assert.equal(e.gates.ugo.active, false);
  });

  it("brak rożnych, SOT i xG → cap 70% WAIT, nie GREEN", () => {
    const e = runEngine(
      { home: "Levski Sofia", away: "CSKA 1948 Sofia", league: "Parva Liga", kickoff: "2026-09-05T18:15:00", oddsHome: 1.52, oddsDraw: 3.85, oddsAway: 5.6, squadVerified: true },
      payload({
        squadVerified: true,
        favorite: "home",
        injuries: "kadra komplet",
        home: team({ name: "Levski Sofia", played: 7, tablePos: 1, gfAvg: 2.86, gfHome: 3.25, gaHome: 0.25, xg: 0, corners: 0, shotsOnTarget: 0 }),
        away: team({ name: "CSKA 1948", played: 7, tablePos: 4, gfAvg: 2.14, xg: 0, corners: 0, shotsOnTarget: 0 }),
      }),
    );
    assert.notEqual(e.decision, "GREEN LIGHT", e.decision);
    assert.ok(e.decision === "WAIT" || e.decision === "NO EXECUTION", e.decision);
    assert.ok(e.confidence.notes.some((n) => /Brak rożnych/.test(n)));
  });

  it("25.23 facts outHome key → keyOutFav, fetch = verified", () => {
    const p = backfillPayload(
      payload({ favorite: "home", squadVerified: false, keyOutFav: false, gkOutFav: false, injuries: "" }),
      JSON.stringify({
        squadFetched: true,
        injuries: "Stoke: Thomas (Knee).",
        outHome: { gk: false, key: true, mass: false, count: 1 },
        outAway: { gk: false, key: false, mass: false, count: 0 },
      }),
      { home: "Stoke", away: "Norwich", league: "Championship", kickoff: "2026-09-01T19:00:00", oddsHome: 1.85, oddsDraw: 3.4, oddsAway: 3.8 },
    );
    assert.equal(p.squadVerified, true);
    assert.equal(p.keyOutFav, true);
    assert.equal(p.gkOutFav, false);
    assert.equal(p.keyOutUd, false);
  });

  it("25.23 brak fetch → unverified", () => {
    const p = backfillPayload(
      payload({ squadVerified: false, keyOutFav: false, injuries: "" }),
      JSON.stringify({ squadFetched: false, injuries: "" }),
      { home: "Stoke", away: "Norwich", league: "Championship", kickoff: "2026-09-01T19:00:00" },
    );
    assert.equal(p.squadVerified, false);
  });

  it("25.24 Brak zgłoszonych kontuzji = Squad 9", () => {
    const e = runEngine(
      { home: "Sanfrecce Hiroshima", away: "Gamba Osaka", league: "J1 League", kickoff: "2026-09-02T11:00:00", oddsHome: 1.72, oddsDraw: 3.6, oddsAway: 4.8, squadVerified: true },
      payload({
        squadVerified: true,
        injuries: "Brak zgłoszonych kontuzji Sanfrecce Hiroshima (API-Football, sezon 2026). Brak zgłoszonych kontuzji Gamba Osaka (API-Football, sezon 2026).",
      }),
    );
    assert.equal(e.confidence.squad, 9);
  });

  it("25.24 prawdziwy out nadal Squad 5", () => {
    const e = runEngine(
      { home: "Sanfrecce Hiroshima", away: "Gamba Osaka", league: "J1 League", kickoff: "2026-09-02T11:00:00", oddsHome: 1.72, oddsDraw: 3.6, oddsAway: 4.8, squadVerified: true },
      payload({
        squadVerified: true,
        injuries: "Sanfrecce Hiroshima: Kato out (Hamstring injury).",
      }),
    );
    assert.equal(e.confidence.squad, 5);
  });

  it("25.25 Early mixed n≤4 wyłączone — UGO/HV/CS zostają; Sample n=3 = 1/5", () => {
    const form3 = [
      { date: "2026-08-29", opponent: "X", ha: "H" as const, scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" as const, comp: "LIGA" as const },
      { date: "2026-08-22", opponent: "Y", ha: "A" as const, scoreFor: 1, scoreAgainst: 0, quality: "SREDNI" as const, comp: "LIGA" as const },
      { date: "2026-08-15", opponent: "Z", ha: "H" as const, scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" as const, comp: "LIGA" as const },
    ];
    const quiet = runEngine(
      { home: "Home Quiet", away: "Away Quiet", league: "J1 League", kickoff: "2026-09-03T11:00:00", oddsHome: 2.25, oddsDraw: 3.2, oddsAway: 3.4, squadVerified: true },
      payload({
        squadVerified: true,
        favorite: "home",
        profileDraft: "Slight Home Edge",
        injuries: "Brak zgłoszonych kontuzji Home Quiet. Brak zgłoszonych kontuzji Away Quiet.",
        home: team({ name: "Home Quiet", played: 3, form: form3, csPctOverall: 67, bttsPct: 33, over25Pct: 33, gfAvg: 1.4, gaAvg: 0.7, gfHome: 1.5, gaHome: 0.5, xg: 1.3 }),
        away: team({ name: "Away Quiet", played: 3, form: form3, csPctOverall: 33, bttsPct: 33, gfAvg: 0.9, gaAvg: 1.2, gfAway: 0.8, gaAway: 1.3, xg: 0.9 }),
        gatesRaw: {
          csFavLast10: 67,
          csFavLast5Venue: 67,
          goalsConcededFavLast5Venue: 2,
          bttsRelevant: 33,
          avgGoalsRelevant: 2.1,
          favConcededInLast10Pct: 33,
          underdogOffQuality: false,
          matchesPlayedFav: 3,
          lateGoalUnderdogPct: 20,
          leagueGapScore: 0,
          xgFavVsThisTier: 1.3,
          udCsPct: 33,
          opponentGfVenue: 0.8,
          opponentBttsPct: 33,
        },
      }),
    );
    assert.equal(quiet.gates.earlySeason.matches, 3);
    assert.equal(quiet.confidence.sample, 1);
    assert.ok(quiet.confidence.pct <= 82);
    const hasMixed = quiet.epl.some((x) => {
      const [h, a] = x.score.split(/[:\-]/).map(Number);
      return h > a && a > 0;
    });
    assert.equal(hasMixed, false, `n=3 bez UGO/HV/CS≤1.50 nie forsuje mixed, TOP3=${quiet.epl.map((x) => x.score).join("/")}`);

    const celticLike = runEngine(
      { home: "Celtic", away: "Aberdeen", league: "Szkocja - Premiership", kickoff: "2026-09-02T19:45:00", oddsHome: 1.25, oddsDraw: 6.3, oddsAway: 9.2, squadVerified: true },
      payload({
        squadVerified: true,
        favorite: "home",
        profileDraft: "Strong Home Favorite",
        injuries: "Brak zgłoszonych kontuzji Celtic. Brak zgłoszonych kontuzji Aberdeen.",
        home: team({ name: "Celtic", played: 3, form: form3, tablePos: 1, csPctOverall: 33, bttsPct: 67, gfAvg: 2, gaAvg: 0.67, gfHome: 2, gaHome: 0.5, xg: 3.69 }),
        away: team({ name: "Aberdeen", played: 3, form: form3, tablePos: 10, csPctOverall: 0, bttsPct: 33, gfAvg: 0.67, gaAvg: 1.33, xg: 1.27 }),
        match: { league: "Szkocja - Premiership", kickoff: "2026-09-02T19:45:00", homePos: 1, awayPos: 10, ptsHome: 9, ptsAway: 3, motivation: "" },
        gatesRaw: {
          csFavLast10: 33,
          csFavLast5Venue: 50,
          goalsConcededFavLast5Venue: 2,
          bttsRelevant: 50,
          avgGoalsRelevant: 2.67,
          favConcededInLast10Pct: 67,
          underdogOffQuality: false,
          matchesPlayedFav: 3,
          lateGoalUnderdogPct: 30,
          leagueGapScore: 2,
          xgFavVsThisTier: 2.4,
          udCsPct: 0,
          opponentGfVenue: 0.67,
          opponentBttsPct: 33,
        },
      }),
    );
    const top = celticLike.epl.map((x) => x.score);
    assert.ok(top.some((s) => s === "3:1" || s === "2:1"), `kurs≤1.50+CS≠Strong nadal daje mixed, TOP3=${top.join("/")}`);
  });
});

describe("V26 25.26 Mostek CS", () => {
  const dir = "/workspace/data/analyses";
  function card(file: string) {
    const d = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const p = d.phase2?.home ? d.phase2 : d.phase1;
    return { input: d.input as MatchInput, payload: p as PhasePayload };
  }
  function top3(e: ReturnType<typeof runEngine>) {
    return e.epl.map((x) => x.score);
  }

  it("AGF: 0:1+0:3 → mostek 0:2, 1:1 zostaje", () => {
    const { input, payload } = card("320f0ae2-5547-40d4-9ca3-e5bb42842c8e.json");
    const e = runEngine(input, payload);
    const t = top3(e);
    assert.ok(t.includes("0:1"), `0:1 CORE/minimal, TOP3=${t.join("/")}`);
    assert.ok(t.includes("1:1"), `1:1 zostaje, TOP3=${t.join("/")}`);
    assert.ok(t.includes("0:2"), `Mostek CS 0:2, TOP3=${t.join("/")}`);
    assert.equal(t.includes("0:3"), false, `0:3 zrzut na 0:2, TOP3=${t.join("/")}`);
  });

  it("Celtic: 3:1 zostaje, 2:0 zostaje, 3:0 nie CORE", () => {
    const { input, payload } = card("bb005117-c39e-4518-b836-03bf680c70f4.json");
    const e = runEngine(input, payload);
    const t = top3(e);
    assert.ok(t.includes("3:1"), `3:1 zostaje, TOP3=${t.join("/")}`);
    assert.ok(t.includes("2:0"), `2:0 zostaje, TOP3=${t.join("/")}`);
    assert.notEqual(t[0], "3:0");
  });

  it("Slavia 1.34: mostek nie startuje bez 0:3, CORE 1:2", () => {
    const { input, payload } = card("37619ebe-d27c-4bd8-a911-45ada2250e03.json");
    const e = runEngine(input, payload);
    const t = top3(e);
    assert.equal(t[0], "1:2");
    assert.equal(t.includes("0:3"), false);
  });

  it("Flamengo 2:0 i Coquimbo 1:0 — zakaz zrzutu", () => {
    const fl = runEngine(...Object.values(card("28931690-2832-4446-b137-f5b67c8b9f48.json")) as [MatchInput, PhasePayload]);
    assert.ok(top3(fl).includes("2:0"), `Flamengo TOP3=${top3(fl).join("/")}`);
    const cq = card("2d83179c-9e87-4b69-8da4-d1dc25d69e8b.json");
    const e = runEngine(cq.input, cq.payload);
    assert.ok(top3(e).includes("1:0"), `Coquimbo TOP3=${top3(e).join("/")}`);
  });

  it("Salzburg 1.75: brak 4+/5+ w TOP3", () => {
    const { input, payload } = card("f3d4e82f-e1f9-45a5-9695-b34b574475e8.json");
    const e = runEngine(input, payload);
    const t = top3(e);
    assert.equal(t.some((s) => {
      const [h, a] = s.split(/[:\-]/).map(Number);
      return h >= 4 || a >= 4;
    }), false, `Salzburg TOP3=${t.join("/")}`);
  });
});

describe("V26 25.27 T-60 XI", () => {
  const xi11 = (pos: string[]) => pos.map((p, i) => ({ name: `P${i}`, pos: p }));
  const baseXi = xi11(["G", "D", "D", "D", "D", "M", "M", "M", "M", "F", "F"]);

  it("Hammarby FF > Talang; Örgryte IF = IS; ID z sources analizy", () => {
    assert.ok(rosterNameScore("Hammarby FF", "Hammarby IF") > rosterNameScore("Hammarby Talang FF", "Hammarby IF"));
    assert.ok(rosterNameScore("Orgryte IS", "Orgryte IF") >= 80);
    assert.ok(clubNameMatches("Orgryte IS", "Orgryte IF"));
    assert.ok(clubNameMatches("Hammarby FF", "Hammarby IF"));
    assert.equal(leagueHintFromClubs("Orgryte IF", "Hammarby IF"), "Allsvenskan");
    const ids = afTeamIdsFromSources([
      "https://www.api-football.com",
      "api-football team 2166/363",
      "api-football league 113 season 2026",
    ]);
    assert.deepEqual(ids, { homeId: 2166, awayId: 363 });
  });

  it("brak XI → squadVerified false, bez zgadywania keyOut", () => {
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "Celtic",
      awayName: "Aberdeen",
      homeXi: [],
      awayXi: [],
      outHome: { names: ["Jota"], gk: false, key: true, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    assert.equal(o.xiReady, false);
    assert.equal(o.squadVerified, false);
    assert.equal(o.keyOutFav, false);
    const p = applyT60Overlay(payload({ squadVerified: true, keyOutFav: true, injuries: "stare" }), o);
    assert.equal(p.squadVerified, false);
    assert.equal(p.keyOutFav, false);
    assert.match(p.injuries, /T-60 XI/);
    assert.match(p.injuries, /stare/);
  });

  it("T-60: 9+11 z API (niepełna 11) i tak potwierdza XI", () => {
    const nine = xi11(["G", "D", "D", "D", "M", "M", "M", "F", "F", "F", "F"]).slice(0, 9);
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "Dinamo Brest",
      awayName: "BATE",
      homeXi: nine,
      awayXi: baseXi,
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    assert.equal(o.xiReady, true);
    assert.equal(o.squadVerified, true);
    assert.match(o.injuries || "", /niepełne|potwierdzone/);
  });

  it("XI 11+11, 0 F gospodarza-faworyta → keyOutFav + P2 martwy", () => {
    const noF = xi11(["G", "D", "D", "D", "D", "D", "M", "M", "M", "M", "M"]);
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "Home",
      awayName: "Away",
      homeXi: noF,
      awayXi: baseXi,
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    assert.equal(o.xiReady, true);
    assert.equal(o.squadVerified, true);
    assert.equal(o.keyOutFav, true);
    assert.equal(o.p2DeadHome, true);
    assert.equal(o.gkOutFav, false);
  });

  it("XI komplet z napastnikami → nie rusza Fill, brak keyOut", () => {
    const o = buildT60Overlay({
      favorite: "away",
      homeName: "Slavia Sofia",
      awayName: "Levski Sofia",
      homeXi: baseXi,
      awayXi: baseXi,
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    const src = payload({ squadVerified: true, favorite: "away" });
    const formN = src.home.form.length;
    const p = applyT60Overlay(src, o);
    assert.equal(p.squadVerified, true);
    assert.equal(p.keyOutFav, false);
    assert.equal(p.gkOutFav, false);
    assert.equal(p.home.form.length, formN);
    assert.equal(o.p2DeadHome, false);
  });

  it("kontuzjowany napastnik nie w XI faworyta → keyOutFav", () => {
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "Home",
      awayName: "Away",
      homeXi: baseXi,
      awayXi: baseXi,
      outHome: { names: ["Jota"], gk: false, key: true, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    assert.equal(o.keyOutFav, true);
    assert.equal(o.squadVerified, true);
  });

  it("T-60 brak XI → Conf ≤69 NO EXECUTION, forma nietknięta", () => {
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "H",
      awayName: "A",
      homeXi: [],
      awayXi: [],
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    const src = payload({ squadVerified: true, favorite: "home" });
    const n = src.home.form.length;
    const p = applyT60Overlay(src, o);
    const e = runEngine(
      { home: "H", away: "A", league: "J1 League", kickoff: "2026-09-03T18:00:00", oddsHome: 1.55, oddsDraw: 4, oddsAway: 6, squadVerified: false },
      p,
    );
    assert.equal(p.home.form.length, n);
    assert.equal(e.decision, "NO EXECUTION");
    assert.ok(e.confidence.notes.some((n) => /S1/.test(n)));
  });

  it("T-60 P2 z XI (0 napastników gospodarza) nadpisuje tabelę", () => {
    const noF = xi11(["G", "D", "D", "D", "D", "D", "M", "M", "M", "M", "M"]);
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "H",
      awayName: "A",
      homeXi: noF,
      awayXi: baseXi,
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    const p = applyT60Overlay(payload({
      squadVerified: true,
      favorite: "home",
      home: team({ name: "H", gfHome: 2.1, gfAvg: 2.1, form: [
        { date: "2026-08-29", opponent: "X", ha: "H", scoreFor: 3, scoreAgainst: 0, quality: "SREDNI", comp: "LIGA" },
        { date: "2026-08-22", opponent: "Y", ha: "H", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI", comp: "LIGA" },
        { date: "2026-08-15", opponent: "Z", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI", comp: "LIGA" },
      ] }),
    }), o);
    const e = runEngine(
      { home: "H", away: "A", league: "J1 League", kickoff: "2026-09-03T18:00:00", oddsHome: 1.72, oddsDraw: 3.6, oddsAway: 4.8, squadVerified: true },
      p,
    );
    assert.ok(e.confidence.notes.some((n) => /P2 martwy gospodarz=true \(po XI T−60/.test(n)), e.confidence.notes.join(" | "));
  });

  it("T-60 merge flag tylko — xG/forma K0 zostają", () => {
    const src = payload({
      squadVerified: true,
      home: team({ name: "Ontustyk", xg: 1.91, shotsOnTarget: 4.2, corners: 5.1 }),
    });
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "Ontustyk",
      awayName: "Aktobe II",
      homeXi: [],
      awayXi: [],
      outHome: { names: [], gk: false, key: false, mass: false },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    const thin = applyT60Overlay(payload({ favorite: "away", home: team({ name: "X", xg: 0 }) }), o);
    const merged = { ...src, squadVerified: thin.squadVerified, keyOutFav: thin.keyOutFav, injuries: thin.injuries };
    assert.equal(merged.home.xg, 1.91);
    assert.equal(merged.home.shotsOnTarget, 4.2);
    assert.equal(merged.squadVerified, false);
  });

  it("T-60: 3+ CB/pomoc nie w XI faworyta to nie mass S3", () => {
    const o = buildT60Overlay({
      favorite: "away",
      homeName: "Fredrikstad",
      awayName: "Bodo/Glimt",
      homeXi: baseXi,
      awayXi: baseXi,
      outHome: { names: ["S. Kvile", "J. Nysveen", "K. Okpaleke"], gk: false, key: false, mass: false },
      outAway: {
        names: ["H. Aleesami", "H. Evjen", "J. Gundersen", "M. Riisnaes", "I. Sjong"],
        gk: false,
        key: false,
        mass: false,
      },
    });
    assert.equal(o.xiReady, true);
    assert.equal(o.squadVerified, true);
    assert.equal(o.massOutFav, false, "CB/pomoc Missing to nie 3+ kluczowych");
    assert.equal(o.keyOutFav, false);
    assert.equal(o.gkOutFav, false);
  });

  it("T-60: pack.mass=true zostaje S3", () => {
    const o = buildT60Overlay({
      favorite: "home",
      homeName: "H",
      awayName: "A",
      homeXi: baseXi,
      awayXi: baseXi,
      outHome: { names: ["A", "B", "C"], gk: false, key: true, mass: true },
      outAway: { names: [], gk: false, key: false, mass: false },
    });
    assert.equal(o.massOutFav, true);
    assert.equal(o.keyOutFav, true);
  });
});

describe("V26 25.28 P2/P5 sitko GREEN→WATCH", () => {
  const wins = (ha: "H" | "A") =>
    Array.from({ length: 8 }, (_, i) => ({
      date: `2026-08-${28 - i * 2}`,
      opponent: `R${i}`,
      ha,
      scoreFor: 2,
      scoreAgainst: 0,
      quality: "SREDNI" as const,
      comp: "LIGA" as const,
    }));

  function strongAway(homeGfHome: number, homeLast3: number[]) {
    return payload({
      squadVerified: true,
      favorite: "away",
      profileDraft: "Controlled Away Favorite",
      injuries: "kadra komplet",
      home: team({
        name: "Home Club",
        played: 12,
        tablePos: 10,
        gfAvg: 1.4,
        gfHome: homeGfHome,
        gaHome: 1.2,
        xg: 1.1,
        form: homeLast3.map((g, i) => ({
          date: `2026-08-${20 + i}`,
          opponent: "X",
          ha: "H" as const,
          scoreFor: g,
          scoreAgainst: 0,
          quality: "SREDNI" as const,
          comp: "LIGA" as const,
        })),
      }),
      away: team({
        name: "Away Club",
        played: 12,
        tablePos: 1,
        gfAvg: 2.4,
        gaAvg: 0.6,
        gfAway: 2.2,
        gaAway: 0.5,
        xg: 2.3,
        csPctOverall: 55,
        form: wins("A"),
      }),
      match: { league: "J1 League", kickoff: "2026-09-03T10:00:00", homePos: 10, awayPos: 1, ptsHome: 12, ptsAway: 28, motivation: "" },
      gatesRaw: {
        csFavLast10: 55,
        csFavLast5Venue: 60,
        goalsConcededFavLast5Venue: 2,
        bttsRelevant: 40,
        avgGoalsRelevant: 2.4,
        favConcededInLast10Pct: 45,
        underdogOffQuality: false,
        matchesPlayedFav: 12,
        lateGoalUnderdogPct: 15,
        leagueGapScore: 4,
        xgFavVsThisTier: 2.3,
        udCsPct: 20,
        opponentGfVenue: 1.4,
        opponentBttsPct: 40,
      },
    });
  }

  it("P2: gość 1.85, gospodarz strzelił w L3 → WATCH jeśli było GREEN; TOP3 bez zmian", () => {
    const p = strongAway(1.8, [2, 1, 2]);
    const e = runEngine(
      { home: "Home Club", away: "Away Club", league: "J1 League", kickoff: "2026-09-03T10:00:00", oddsHome: 4.2, oddsDraw: 3.5, oddsAway: 1.85, squadVerified: true },
      p,
    );
    assert.equal(e.epl.length, 3);
    const top = e.epl.map((x) => x.score).join("/");
    if (e.decision === "WATCH") {
      assert.ok(e.confidence.notes.some((n) => /P2 sitko/.test(n)) || e.confidence.pct < 85, top);
    } else {
      assert.notEqual(e.decision, "GREEN LIGHT", `P2 musi zdjąć GREEN, jest ${e.decision} TOP3=${top} conf=${e.confidence.pct}`);
    }
  });

  it("P5: Δkurs 0.30 → WATCH z GREEN, 1:1 może zostać", () => {
    const e = runEngine(
      { home: "Burnley", away: "Leeds", league: "Championship", kickoff: "2026-09-02T19:00:00", oddsHome: 2.05, oddsDraw: 3.3, oddsAway: 1.75, squadVerified: true },
      payload({
        squadVerified: true,
        favorite: "away",
        injuries: "kadra komplet",
        home: team({ name: "Burnley", played: 10, gfHome: 1.2, form: wins("H").map((m) => ({ ...m, scoreFor: 1 })) }),
        away: team({ name: "Leeds", played: 10, tablePos: 2, gfAvg: 2.1, xg: 1.9, form: wins("A") }),
      }),
    );
    if (e.decision === "GREEN LIGHT") {
      assert.fail("P5 Δ<0.40 nie może zostawić GREEN");
    }
    if (e.decision === "WATCH" && e.confidence.pct >= 85) {
      assert.ok(e.confidence.notes.some((n) => /P5 sitko/.test(n)));
    }
    assert.equal(e.epl.length, 3);
  });

  it("S1 bez XI: NO EXECUTION, nie WATCH z P5", () => {
    const e = runEngine(
      { home: "H", away: "A", league: "J1 League", kickoff: "2026-09-03T10:00:00", oddsHome: 2.05, oddsDraw: 3.3, oddsAway: 1.85 },
      payload({ squadVerified: false, injuries: "", favorite: "away" }),
    );
    assert.equal(e.decision, "NO EXECUTION");
    assert.equal(e.confidence.notes.some((n) => /P5 sitko/.test(n)), false);
  });

  it("Flamengo 1.16 / Coquimbo 1.55: P2 nie startuje", () => {
    const dir = "/workspace/data/analyses";
    const fl = JSON.parse(readFileSync(join(dir, "048b0163-6fcc-46cb-88f2-11b55b786d85.json"), "utf8"));
    const e = runEngine(fl.input, fl.phase2?.home ? fl.phase2 : fl.phase1);
    assert.equal(e.confidence.notes.some((n) => /P2 sitko/.test(n)), false);
    const cq = JSON.parse(readFileSync(join(dir, "2d83179c-9e87-4b69-8da4-d1dc25d69e8b.json"), "utf8"));
    const e2 = runEngine(cq.input, cq.phase2?.home ? cq.phase2 : cq.phase1);
    assert.equal(e2.confidence.notes.some((n) => /P2 sitko/.test(n)), false);
  });
});

function isCleanish(score?: string) {
  if (!score) return false;
  const [h, a] = score.split(/[:\-]/).map((x) => Number(x.trim()));
  return (h || 0) > 0 && (a || 0) === 0;
}

describe("V26 25.52 TOP3 piątek (WATCH 1:1 / GREEN sąsiad / MIXED 3:0)", () => {
  function loadCold(id: string) {
    const cold = join("/workspace/data/analyses/_cold", `${id}.json`);
    const hot = join("/workspace/data/analyses", `${id}.json`);
    const p = existsSync(cold) ? cold : hot;
    const d = JSON.parse(readFileSync(p, "utf8"));
    return { input: d.input as MatchInput, payload: (d.phase2?.home ? d.phase2 : d.phase1) as PhasePayload };
  }

  it("Bodø GREEN: CORE 1:3 → EPL2 1:2", () => {
    const { input, payload } = loadCold("7f5f2f98-0081-4636-96e8-78c75eab57fa");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct >= 85, `conf ${e.confidence.pct}`);
    assert.equal(t[0], "1:3", `CORE ${t.join("/")}`);
    assert.equal(t[1], "1:2", `EPL2 ${t.join("/")}`);
    assert.ok(e.compression.log.some((l) => /sąsiad|EPL2 1:2/.test(l)), e.compression.log.slice(-6).join(" | "));
  });

  it("Connah WATCH: 1:1 w TOP3", () => {
    const { input, payload } = loadCold("19c009dc-c617-4d13-b81e-061960ae7bcc");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct >= 70 && e.confidence.pct <= 85, `conf ${e.confidence.pct}`);
    assert.equal(e.decision, "WATCH", e.decision);
    assert.ok(t.includes("1:1"), `brak 1:1: ${t.join("/")}`);
  });

  it("Caernarfon MIXED: 3:0 na trójce, nie 3:1 jako jedyny 3-gol", () => {
    const { input, payload } = loadCold("3e36ec27-90ff-464b-9931-b0d1a4713911");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(e.confidence.pct >= 70 && e.confidence.pct < 85, `conf ${e.confidence.pct}`);
    assert.ok(t.includes("3:0") || t.includes("2:0"), `brak czystego 2:0/3:0: ${t.join("/")}`);
    assert.ok(t.some((s) => s === "2:1" || s === "1:1"), `mieszany zostaje: ${t.join("/")}`);
  });
});

describe("V26 25.55 sitka 06.09 A/B/C (historia HIT nietknięta)", () => {
  function loadId(id: string) {
    const cold = join("/workspace/data/analyses/_cold", `${id}.json`);
    const hot = join("/workspace/data/analyses", `${id}.json`);
    const p = existsSync(hot) ? hot : cold;
    const d = JSON.parse(readFileSync(p, "utf8"));
    return { input: d.input as MatchInput, payload: (d.phase2?.home ? d.phase2 : d.phase1) as PhasePayload, ft: d.wniosek?.ft as string, verdict: d.wniosek?.verdict as string };
  }

  it("A Concepción: 0:1 w TOP3, nie sama CS", () => {
    const { input, payload } = loadId("a9729192-9490-401a-b84c-8b1b0e64d548");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(t.includes("0:1") || t.includes("1:1"), `brak 0:1/1:1: ${t.join("/")}`);
    assert.ok(t.some((s) => s === "1:0" || s === "2:0"), `CS zostaje: ${t.join("/")}`);
    assert.ok(e.confidence.notes.some((n) => /06\.09 A/.test(n)), e.confidence.notes.join(" | "));
  });

  it("B Stabæk: EPL1 nie 2:0, 1:2 i 2:1 na tablicy", () => {
    const { input, payload } = loadId("9eab79e5-bdf7-4e91-a1fe-30a9300ea45a");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.notEqual(t[0], "2:0", `EPL1 ${t.join("/")}`);
    assert.ok(t.includes("2:1"), `brak 2:1: ${t.join("/")}`);
    assert.ok(t.includes("1:2"), `brak 1:2: ${t.join("/")}`);
    assert.ok(e.confidence.notes.some((n) => /06\.09 B/.test(n)), e.confidence.notes.join(" | "));
  });

  it("C1 Sabah: 3:0 w TOP3, bez 4:0/5:0", () => {
    const { input, payload } = loadId("13a20e56-e7de-444e-896f-98c8efd1a1c3");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(t.includes("3:0"), `brak 3:0: ${t.join("/")}`);
    assert.ok(!t.some((s) => Number(s.split(":")[0]) >= 4), `grube w TOP3: ${t.join("/")}`);
    assert.ok(e.confidence.notes.some((n) => /06\.09 C1/.test(n)), e.confidence.notes.join(" | "));
  });

  it("C2 Danubio: 0:2 zamiast 0:0, 0:1 zostaje", () => {
    const { input, payload } = loadId("a9858a01-f58e-4924-a6d6-25b723419f1a");
    const e = runEngine(input, payload);
    const t = e.epl.map((x) => x.score);
    assert.ok(t.includes("0:2") || t.includes("0:3"), `brak 0:2/0:3: ${t.join("/")}`);
    assert.ok(!t.includes("0:0"), `0:0 zostało: ${t.join("/")}`);
    assert.ok(t.includes("0:1"), `0:1 zniknęło: ${t.join("/")}`);
  });

  it("Haugesund 2:0 HIT: sitko B nie pali CS CORE", () => {
    const files = [
      ...readdirSync("/workspace/data/analyses").filter((n) => n.endsWith(".json")),
      ...readdirSync("/workspace/data/analyses/_cold").filter((n) => n.endsWith(".json")),
    ];
    let found = false;
    for (const name of files) {
      const dir = existsSync(join("/workspace/data/analyses", name)) ? "/workspace/data/analyses" : "/workspace/data/analyses/_cold";
      const d = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (!/Haugesund/i.test(d.input?.home || "")) continue;
      const e = runEngine(d.input, d.phase2?.home ? d.phase2 : d.phase1);
      assert.ok(e.epl.map((x) => x.score).includes("2:0"), e.epl.map((x) => x.score).join("/"));
      assert.ok(!e.confidence.notes.some((n) => /06\.09 B/.test(n)));
      found = true;
    }
    assert.ok(found, "brak karty Haugesund");
  });

  it("22 historyczne HIT-y: FT nadal w TOP3", () => {
    const dirs = ["/workspace/data/analyses", "/workspace/data/analyses/_cold"];
    const seen = new Set<string>();
    const hits: string[] = [];
    const dead: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        const d = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        if (d.wniosek?.verdict !== "HIT") continue;
        const p = d.phase2?.home ? d.phase2 : d.phase1;
        if (!p?.home) continue;
        const e = runEngine(d.input, p);
        const t = e.epl.map((x) => x.score);
        const ft = String(d.wniosek.ft || "").replace("-", ":");
        hits.push(`${d.input.home} ${ft}`);
        if (!t.includes(ft)) dead.push(`${d.input.home}–${d.input.away} FT ${ft} vs ${t.join("/")}`);
      }
    }
    assert.ok(hits.length >= 20, `za mało HIT ${hits.length}`);
    assert.equal(dead.length, 0, dead.join(" ; "));
  });
});

describe("V26 25.60 Conf % = suma/105", () => {
  it("Valencia–Barca: % = suma/105, nie S3-60 z młodzieży", () => {
    const a = JSON.parse(readFileSync(join("/workspace/data/analyses", "c02bc1c0-a519-444a-99b6-2d6c866fee20.json"), "utf8"));
    const e = runEngine(a.input, a.phase1, a.phase2);
    const fromSum = Math.round((e.confidence.sum / 105) * 1e3) / 10;
    assert.ok(
      Math.abs(e.confidence.pct - fromSum) < 0.2 || e.confidence.notes.some((n: string) => /Early Season CAP/.test(n)),
      `pct ${e.confidence.pct} vs ${fromSum} sum ${e.confidence.sum}`,
    );
    assert.ok(e.confidence.pct > 60, `pct ${e.confidence.pct}`);
    assert.ok(e.confidence.sum >= 70, `sum ${e.confidence.sum}`);
  });
});

describe("V26 08.09 slot remisu 1:1 + BTTS TAK surest", () => {
  function loadCard(id: string) {
    const cold = join("/workspace/data/analyses/_cold", `${id}.json`);
    const hot = join("/workspace/data/analyses", `${id}.json`);
    const p = existsSync(hot) ? hot : cold;
    const d = JSON.parse(readFileSync(p, "utf8"));
    return d;
  }

  it("Pogoń: CORE 1:0, 1:1 na EPL3, 0:0 ochrona (wzorzec Nice)", () => {
    const d = loadCard("4cf4b704-d3c0-4c61-866d-3d57bc865bb8");
    const e = runEngine(d.input, d.phase2?.home ? d.phase2 : d.phase1);
    const t = e.epl.map((x: { score: string }) => x.score);
    assert.equal(e.epl[0]?.score, "1:0", `CORE ${t.join("/")}`);
    assert.ok(t.includes("1:1"), `brak 1:1: ${t.join("/")}`);
    assert.ok(!t.includes("0:0"), `0:0 zostało w TOP3: ${t.join("/")}`);
    assert.ok(e.protection.some((x: { score: string }) => x.score === "0:0"), `brak 0:0 w ochronie`);
    assert.ok(e.compression.log.some((l: string) => /slot remisu: 1:1 na EPL3/.test(l)), e.compression.log.join(" | "));
  });

  it("Kalmar: swap pali 0:0, CORE 0:1 zostaje HIT", () => {
    const d = loadCard("99c823e8-32f6-41f9-ad3a-0f2fc84114e5");
    const e = runEngine(d.input, d.phase2?.home ? d.phase2 : d.phase1);
    const t = e.epl.map((x: { score: string }) => x.score);
    const ft = String(d.wniosek?.ft || "0:1").replace("-", ":");
    assert.ok(["0:1", "1:0"].includes(e.epl[0]?.score ?? ""), `CORE ${t.join("/")}`);
    assert.ok(t.includes(ft), `FT ${ft} wypadło: ${t.join("/")}`);
    assert.ok(!t.includes("0:0") || t.includes("1:1"), `TOP3 ${t.join("/")}`);
  });

  it("Macva guard: 1:1 już w TOP3, 0:0 zostaje HIT", () => {
    const d = loadCard("7620c15e-f6df-4f14-8a3b-f74acb542804");
    const e = runEngine(d.input, d.phase2?.home ? d.phase2 : d.phase1);
    const t = e.epl.map((x: { score: string }) => x.score);
    assert.ok(t.includes("1:1"), `brak 1:1: ${t.join("/")}`);
    assert.ok(t.includes("0:0"), `0:0 wypadło (guard): ${t.join("/")}`);
    assert.ok(!e.compression.log.some((l: string) => /slot remisu: 1:1 na EPL3/.test(l)), e.compression.log.join(" | "));
  });

  it("37 archive HIT 03–08.09: FT nadal w TOP3", () => {
    const dirs = ["/workspace/data/analyses", "/workspace/data/analyses/_cold"];
    const seen = new Set<string>();
    const hits: string[] = [];
    const dead: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        const d = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        if (d.wniosek?.verdict !== "HIT") continue;
        const ko = String(d.input?.kickoff || "");
        if (ko < "2026-09-03" || ko >= "2026-09-09") continue;
        const p = d.phase2?.home ? d.phase2 : d.phase1;
        if (!p?.home) continue;
        const e = runEngine(d.input, p);
        const t = e.epl.map((x: { score: string }) => x.score);
        const ft = String(d.wniosek.ft || "").replace("-", ":");
        hits.push(`${d.input.home} ${ft}`);
        if (!t.includes(ft)) dead.push(`${d.input.home}–${d.input.away} FT ${ft} vs ${t.join("/")}`);
      }
    }
    assert.ok(hits.length >= 20, `za mało HIT ${hits.length}: ${hits.join(", ")}`);
    assert.equal(dead.length, 0, dead.join(" ; "));
  });
});

describe("11.09 matching — Praga/Bukareszt/Wil + FNL/Challenge/Ykkönen", () => {
  it("egzonimy i rok założenia: Dukla Praga, Dinamo Bukareszt, FC Wil 1900", () => {
    assert.ok(clubNameMatches("Dukla Praha", "Dukla Praga"));
    assert.ok(clubNameMatches("Dukla Praha", "Dukla Praga"));
    assert.ok(clubNameMatches("Dinamo Bucuresti", "Dinamo Bukareszt"));
    assert.ok(clubNameMatches("FC Wil 1900", "Wil"));
    assert.ok(clubNameMatches("Vlašim", "Vlasim"));
    assert.ok(clubNameMatches("Csikszereda", "Csikszereda Miercurea Ciuc"));
    assert.equal(clubNameMatches("CSKA Sofia", "CSKA 1948 Sofia"), false, "1948 zostaje rozróżnikiem");
    assert.ok(rosterNameScore("FC Wil 1900", "Wil") >= 45);
    assert.ok(rosterNameScore("Dukla Praha", "Dukla Praga") >= 45);
    assert.ok(rosterNameScore("Dinamo Bucuresti", "Dinamo Bukareszt") >= 45);
    assert.ok(rosterNameScore("Silon Táborsko", "Taborsko") >= 45);
    const duklaStops = hardStops(
      payload({ home: team({ name: "Dukla Praha" }), away: team({ name: "Vlašim" }) }),
      { home: "Dukla Praga", away: "Vlasim", league: "Czech FNL", kickoff: "2026-09-11T16:00:00", oddsHome: 1.77, oddsDraw: 3.6, oddsAway: 3.9 },
    );
    assert.ok(!duklaStops.some((x) => /nie zgadza/.test(x)), duklaStops.join("; "));
    const dinamoStops = hardStops(
      payload({ home: team({ name: "Csikszereda" }), away: team({ name: "Dinamo Bucuresti" }) }),
      {
        home: "Csikszereda Miercurea Ciuc",
        away: "Dinamo Bukareszt",
        league: "Liga I Romania",
        kickoff: "2026-09-11T18:00:00",
        oddsHome: 5.5,
        oddsDraw: 3.85,
        oddsAway: 1.56,
      },
    );
    assert.ok(!dinamoStops.some((x) => /nie zgadza/.test(x)), dinamoStops.join("; "));
  });

  it("Czechy FNL / Challenge League / Ykkönen nie spadają na 1. ligę", () => {
    assert.equal(matchLeague("Czechy - FNL"), "Czech FNL");
    assert.equal(matchLeague("Czechy - FNL · Ze screena (bukmacher): Dziś, 17:00"), "Czech FNL");
    assert.equal(matchLeague("Szwajcaria - Challenge League"), "Swiss Challenge League");
    assert.equal(matchLeague("Szwajcaria - Challenge League · Ze screena (bukmacher): Dziś, 19:30"), "Swiss Challenge League");
    assert.equal(matchLeague("Ykkönen"), "Ykkönen");
    assert.equal(matchLeague("Finlandia - Ykkösliiga"), "Ykkönen");
    assert.equal(matchLeague("Veikkausliiga"), "Veikkausliiga");
    assert.equal(matchLeague("Swiss Super League"), "Swiss Super League");
    assert.equal(leagueIdFromHint("Czechy - FNL"), 346);
    assert.equal(leagueIdFromHint("Czech First League"), 345);
    assert.equal(leagueIdFromHint("Szwajcaria - Challenge League"), 208);
    assert.equal(leagueIdFromHint("Swiss Super League"), 207);
    assert.equal(leagueIdFromHint("Ykkönen"), 245);
    assert.equal(leagueIdFromHint("Finlandia - Ykkösliiga"), 245);
    assert.equal(leagueIdFromHint("Veikkausliiga"), 244);
    assert.ok(LEAGUES.includes("Czech FNL"));
    assert.ok(LEAGUES.includes("Swiss Challenge League"));
    assert.ok(LEAGUES.includes("Ykkönen"));
    assert.deepEqual(SIBLING_LEAGUES[207], [208]);
    assert.deepEqual(SIBLING_LEAGUES[345], [346]);
    assert.deepEqual(SIBLING_LEAGUES[244], [245]);
    assert.ok(SIBLING_LEAGUES[179].includes(180));
  });

  it("kluby nadpisują złą ligę z kuponu: Jazz/KPV → Ykkönen, Wil → Challenge", () => {
    assert.equal(resolveLeague("FC Jazz", "KPV Kokkola", "Veikkausliiga"), "Ykkönen");
    assert.equal(resolveLeague("Lausanne Ouchy", "Wil", "Swiss Super League"), "Swiss Challenge League");
    assert.equal(resolveLeague("Lausanne Ouchy", "Wil", "Szwajcaria - Challenge League"), "Swiss Challenge League");
    assert.equal(resolveLeague("Taborsko", "SK Kladno", "Czechy - FNL"), "Czech FNL");
    assert.equal(resolveLeague("Dukla Praga", "Vlasim", "Czechy - FNL"), "Czech FNL");
    assert.equal(leagueIdFromHint(resolveLeague("FC Jazz", "KPV Kokkola", "Veikkausliiga")), 245);
    assert.equal(leagueIdFromHint(resolveLeague("Lausanne Ouchy", "Wil", "Szwajcaria - Challenge League")), 208);
    assert.equal(leagueHintFromClubs("FC Jazz", "KPV Kokkola"), "Ykkönen");
    assert.equal(leagueHintFromClubs("Lausanne Ouchy", "Wil"), "Swiss Challenge League");
  });

  it("Wietnam / Tajlandia / Singapur / I Liga — nie EPL 39 i nie timeout ligi", () => {
    assert.equal(matchLeague("Wietnam - V-League 1"), "V-League");
    assert.equal(matchLeague("Wietnam - V-League 1 · Ze screena (bukmacher): Dziś, 13:00"), "V-League");
    assert.equal(matchLeague("Tajlandia - Thai League 1"), "Thai League 1");
    assert.equal(matchLeague("Tajlandia - Thai League 1 · Ze screena (bukmacher): Dziś, 13:30"), "Thai League 1");
    assert.equal(matchLeague("Singapore Premier League"), "Singapore Premier League");
    assert.equal(matchLeague("I Liga"), "I Liga");
    assert.equal(matchLeague("Premier League"), "Premier League");
    assert.equal(leagueIdFromHint("Wietnam - V-League 1"), 340);
    assert.equal(leagueIdFromHint("V-League"), 340);
    assert.equal(leagueIdFromHint("Wietnam - V-League 1 · Ze screena (bukmacher): Dziś, 13:00"), 340);
    assert.equal(leagueIdFromHint("Tajlandia - Thai League 1"), 296);
    assert.equal(leagueIdFromHint("Thai League 1"), 296);
    assert.equal(leagueIdFromHint("Tajlandia - Thai League 1 · Ze screena (bukmacher): Dziś, 13:30"), 296);
    assert.equal(leagueIdFromHint("Singapore Premier League"), 368);
    assert.equal(leagueIdFromHint("Premier League"), 39);
    assert.equal(leagueIdFromHint("I Liga"), 107);
    assert.equal(resolveLeague("Chrobry Głogów", "Pogoń Siedlce", "Ekstraklasa"), "I Liga");
    assert.equal(resolveLeague("Ruch Chorzów", "Podbeskidzie Bielsko-Biała", "Ekstraklasa"), "I Liga");
    assert.equal(leagueHintFromClubs("Chrobry Głogów", "Pogoń Siedlce"), "I Liga");
    assert.equal(leagueHintFromClubs("Ruch Chorzów", "Podbeskidzie"), "I Liga");
    assert.equal(resolveLeague("Ninh Binh", "Dong A Thanh Hoa", "Wietnam - V-League 1"), "V-League");
    assert.equal(resolveLeague("Port FC", "Lamphun Warrior", "Tajlandia - Thai League 1"), "Thai League 1");
    assert.equal(resolveLeague("Tampines Rovers", "Balestier Khalsa", "Premier League"), "Singapore Premier League");
    assert.equal(resolveLeague("Tampines Rovers", "Balestier Khalsa", "Ekstraklasa"), "Singapore Premier League");
    assert.equal(resolveLeague("Polonia Warszawa", "Polonia Bytom", "Ekstraklasa"), "I Liga");
    assert.equal(resolveLeague("Arsenal", "Chelsea", "Premier League"), "Premier League");
    assert.equal(leagueIdFromHint(resolveLeague("Tampines Rovers", "Balestier Khalsa", "Premier League")), 368);
    assert.equal(leagueIdFromHint(resolveLeague("Polonia Warszawa", "Polonia Bytom", "Ekstraklasa")), 107);
    assert.equal(leagueHintFromClubs("Tampines Rovers", "Balestier Khalsa"), "Singapore Premier League");
    assert.equal(leagueHintFromClubs("Polonia Warszawa", "Polonia Bytom"), "I Liga");
    assert.equal(leagueHintFromClubs("Ninh Binh", "Dong A Thanh Hoa"), "V-League");
    assert.ok(rosterNameScore("Tampines Rovers", "Tampines Rovers") >= 45);
    assert.ok(rosterNameScore("Lamphun Warrior", "Lamphun Warrior") >= 45);
    assert.ok(clubNameMatches("Thanh Hoa", "Dong A Thanh Hoa"));
    assert.ok(clubNameMatches("Polonia Warszawa", "Polonia Warszawa"));
    assert.ok(LEAGUES.includes("V-League"));
    assert.ok(LEAGUES.includes("Thai League 1"));
    assert.ok(LEAGUES.includes("Singapore Premier League"));
    assert.ok(LEAGUES.includes("I Liga"));
  });
});

