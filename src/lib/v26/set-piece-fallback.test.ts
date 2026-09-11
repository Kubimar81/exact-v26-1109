import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  statsClubHit,
  inSetPieceBounds,
  missingSetPieces,
  cornerAverages,
  overlaySetPieces,
  overlayNumericStats,
  parseBookieCorners,
  shouldSkipSetPieceScout,
  sparseBoxLeague,
} from "./set-piece-fallback.ts";
import type { PhasePayload, TeamBlock } from "./types.ts";

function team(over: Partial<TeamBlock> & { name: string }): TeamBlock {
  return {
    tablePos: 1,
    points: 0,
    played: 6,
    form: [],
    csPctOverall: 0,
    csPctHome: 0,
    csPctAway: 0,
    bttsPct: 0,
    over25Pct: 0,
    gfAvg: 1,
    gaAvg: 1,
    gfHome: 1,
    gaHome: 1,
    gfAway: 1,
    gaAway: 1,
    xg: 1.08,
    xga: 1,
    possession: 0,
    corners: 0,
    shotsOnTarget: 0,
    cards: 0,
    goalsAfter60Pct: 0,
    goalsSecondHalfPct: 0,
    finishingLabel: "Neutral",
    ...over,
  };
}

function payload(over: Partial<PhasePayload> = {}): PhasePayload {
  return {
    sources: [],
    match: { league: "Calcutta Premier Division", kickoff: "", homePos: 6, awayPos: 12, ptsHome: 10, ptsAway: 6, motivation: "" },
    odds: { exacts: {} },
    favorite: "away",
    profileDraft: "Away Favorite",
    home: over.home ?? team({ name: "United SC" }),
    away: over.away ?? team({ name: "Police AC" }),
    h2h: [],
    h2hAvgGoals: 0,
    injuries: "",
    weather: "",
    coach: "",
    steps: [],
    gatesRaw: {
      csFavLast10: 0,
      csFavLast5Venue: 0,
      goalsConcededFavLast5Venue: 0,
      bttsRelevant: 0,
      avgGoalsRelevant: 0,
      favConcededInLast10Pct: 0,
      underdogOffQuality: false,
      matchesPlayedFav: 0,
      lateGoalUnderdogPct: 0,
      leagueGapScore: 0,
      xgFavVsThisTier: 0,
      udCsPct: 0,
      opponentGfVenue: 0,
      opponentBttsPct: 0,
    },
    ...over,
  };
}

describe("set-piece fallback — tylko luka, bez zgadywania", () => {
  it("Police AC ≠ Calcutta Police", () => {
    assert.equal(statsClubHit("Police AC", "Police AC"), true);
    assert.equal(statsClubHit("Calcutta Police Club", "Police AC"), false);
    assert.equal(statsClubHit("United Kolkata SC", "United SC"), false);
    assert.equal(statsClubHit("United SC", "United SC"), true);
    assert.equal(statsClubHit("Levski Sofia", "CSKA 1948 Sofia"), false);
    assert.equal(statsClubHit("CSKA Sofia", "CSKA 1948 Sofia"), false);
    assert.equal(statsClubHit("CSKA 1948", "CSKA 1948 Sofia"), true);
    assert.equal(statsClubHit("Flint", "Flint Town United"), true);
    assert.equal(statsClubHit("Connahs Q.", "Connah's Quay Nomads"), true);
    assert.equal(statsClubHit("GAP Connah S Quay FC", "Connah's Quay Nomads"), true);
  });

  it("SOT z TotalCorner (total shots ~7) odrzucone; 2.43 OK", () => {
    assert.equal(inSetPieceBounds("shotsOnTarget", 7.14), false);
    assert.equal(inSetPieceBounds("shotsOnTarget", 2.43), true);
    assert.equal(inSetPieceBounds("shotsOnTarget", 4.71), true);
    assert.equal(inSetPieceBounds("shotsOnTarget", 0), false);
    assert.equal(inSetPieceBounds("corners", 8.57), true);
    assert.equal(inSetPieceBounds("corners", 0), false);
  });

  it("średnia rożnych z meczów TotalCorner, min. 2 spotkania", () => {
    const rows = [
      { home: "United SC", away: "Mohammedan SC Reserves", cornersH: 7, cornersA: 7 },
      { home: "United SC", away: "Calcutta Police Club", cornersH: 4, cornersA: 1 },
      { home: "Coal India", away: "Police AC", cornersH: 8, cornersA: 3 },
      { home: "Suruchi Sangha", away: "Police AC", cornersH: 1, cornersA: 3 },
      { home: "Police AC", away: "Wari AC", cornersH: 4, cornersA: 6 },
    ];
    const avg = cornerAverages(rows, "United SC", "Police AC");
    assert.equal(avg.home, 5.5);
    assert.equal(avg.away, 3.33);
  });

  it("overlay nie rusza istniejącego SOT i nie bierze 0 / total shots", () => {
    const base = payload({
      home: team({ name: "United SC", shotsOnTarget: 5.4, corners: 0, cards: 0 }),
      away: team({ name: "Police AC", shotsOnTarget: 0, corners: 0, cards: 0 }),
    });
    const extra = {
      sources: ["https://www.totalcorner.com/league/view/11313"],
      home: { corners: 5.5, shotsOnTarget: 7.14, cards: 0 },
      away: { corners: 3.33, shotsOnTarget: 2.43, cards: null },
    };
    const { facts, filled } = overlaySetPieces(base, extra, ["corners", "shotsOnTarget", "cards"]);
    const h = facts.home as Record<string, number>;
    const a = facts.away as Record<string, number>;
    assert.equal(h.shotsOnTarget, undefined);
    assert.equal(h.corners, 5.5);
    assert.equal(a.corners, 3.33);
    assert.equal(a.shotsOnTarget, 2.43);
    assert.equal(h.cards, undefined);
    assert.ok(filled.includes("corners"));
    assert.ok(filled.includes("shotsOnTarget"));
    assert.ok(!filled.includes("cards"));
  });

  it("gdy API ma rożne — luka SOT/kartek, nie kasuje rożnych", () => {
    const p = payload({
      home: team({ name: "Lech", corners: 6.1, shotsOnTarget: 5.4, cards: 1.8 }),
      away: team({ name: "Radomiak", corners: 3.9, shotsOnTarget: 3.2, cards: 2.3 }),
    });
    assert.deepEqual(missingSetPieces(p), []);
  });

  it("luka PER KLUB: Örebro kreska, Varberg ma liczby — scout się odpala, overlay nie rusza Varberga", () => {
    const p = payload({
      home: team({ name: "Orebro SK", corners: 0, shotsOnTarget: 0, cards: 1.6 }),
      away: team({ name: "Varberg BoIS", corners: 3, shotsOnTarget: 5, cards: 1 }),
    });
    const miss = missingSetPieces(p);
    assert.ok(miss.includes("corners"));
    assert.ok(miss.includes("shotsOnTarget"));
    assert.equal(miss.includes("cards"), false);
    const extra = {
      sources: ["https://www.fotmob.com/matches/ik-brage-vs-orebro/1wxvqw"],
      home: { corners: 5.2, shotsOnTarget: 3.8, cards: 1.6 },
      away: { corners: 9.9, shotsOnTarget: 7.14, cards: 4 },
    };
    const { facts } = overlaySetPieces(p, extra, miss);
    const h = facts.home as Record<string, number>;
    const a = facts.away as Record<string, number>;
    assert.equal(h.corners, 5.2);
    assert.equal(h.shotsOnTarget, 3.8);
    assert.equal(a.corners, undefined);
    assert.equal(a.shotsOnTarget, undefined);
  });

  it("SOT z matches[] FotMob, min. 2, nie nadpisuje strony z API", () => {
    const base = payload({
      home: team({ name: "Orebro SK", corners: 0, shotsOnTarget: 0, cards: 1.6 }),
      away: team({ name: "Varberg BoIS", corners: 3, shotsOnTarget: 5, cards: 1 }),
    });
    const extra = {
      sources: ["https://www.fotmob.com/"],
      matches: [
        { home: "IK Brage", away: "Orebro SK", cornersH: 5, cornersA: 4, sotH: 5, sotA: 4 },
        { home: "Orebro SK", away: "IFK Varnamo", cornersH: 6, cornersA: 3, sotH: 4, sotA: 3 },
      ],
    };
    const { facts } = overlaySetPieces(base, extra, ["corners", "shotsOnTarget"]);
    const h = facts.home as Record<string, number>;
    const a = facts.away as Record<string, number>;
    assert.equal(h.shotsOnTarget, 4);
    assert.equal(h.corners, 5);
    assert.equal(a.shotsOnTarget, undefined);
    assert.equal(a.corners, undefined);
  });

  it("średnia z matches[] TotalCorner, bez mieszania Police AC z Calcutta Police", () => {
    const base = payload();
    const extra = {
      sources: ["https://www.totalcorner.com/league/view/11313"],
      matches: [
        { home: "United SC", away: "Mohammedan SC Reserves", cornersH: 7, cornersA: 7 },
        { home: "United SC", away: "Calcutta Police Club", cornersH: 4, cornersA: 1 },
        { home: "Coal India", away: "Police AC", cornersH: 8, cornersA: 3 },
        { home: "Suruchi Sangha", away: "Police AC", cornersH: 1, cornersA: 3 },
      ],
    };
    const { facts, filled } = overlaySetPieces(base, extra, ["corners", "shotsOnTarget", "cards"]);
    const h = facts.home as Record<string, number>;
    const a = facts.away as Record<string, number>;
    assert.equal(h.corners, 5.5);
    assert.equal(a.corners, 3);
    assert.ok(filled.includes("corners"));
    assert.equal(h.shotsOnTarget, undefined);
  });

  it("Superettan i 1. Division Norway = sparse box, EPL nie", () => {
    assert.equal(sparseBoxLeague("Superettan"), true);
    assert.equal(sparseBoxLeague("1. Division Norway"), true);
    assert.equal(sparseBoxLeague("Norwegia - 1.Division"), true);
    assert.equal(sparseBoxLeague("Calcutta Premier Division"), true);
    assert.equal(sparseBoxLeague("Indie - Calcutta Premier Division"), true);
    assert.equal(sparseBoxLeague("Premier League"), false);
    assert.equal(sparseBoxLeague("Eliteserien"), false);
    assert.equal(sparseBoxLeague("Cymru Premier"), true);
    assert.equal(sparseBoxLeague("Walia - Premier League"), true);
    assert.equal(sparseBoxLeague("Wales Premier League"), true);
    assert.equal(sparseBoxLeague("Uganda Premier League"), true);
    assert.equal(sparseBoxLeague("Premier League", "NEC FC", "Lugazi FC"), true);
    assert.equal(sparseBoxLeague("Premier League"), false);
    assert.equal(sparseBoxLeague("Ligat Ha'Al"), true);
    assert.equal(sparseBoxLeague("Premier League", "Hapoel Beer Sheva", "Hapoel Haifa"), true);
    assert.equal(sparseBoxLeague("Premijer Liga"), true);
    assert.equal(sparseBoxLeague("Bośnia i Hercegowina - Premier Liga"), true);
    assert.equal(sparseBoxLeague("Saudi First Division"), true);
    assert.equal(sparseBoxLeague("Saudi Pro League", "Al Najma", "Al Jabalain"), true);
    assert.equal(sparseBoxLeague("Saudi Pro League"), false);
    assert.equal(sparseBoxLeague("Championship"), false);
    assert.equal(sparseBoxLeague("Parva Liga"), true);
    assert.equal(sparseBoxLeague("Bułgaria - Parva Liga"), true);
    assert.equal(sparseBoxLeague("Parva Liga", "Arda Kardzhali", "Botev Plovdiv"), true);
    assert.equal(sparseBoxLeague("Azerbaijan Premier League"), true);
    assert.equal(sparseBoxLeague("Azerbejdżan - Premyer Liqa"), true);
    assert.equal(sparseBoxLeague("Uzbekistan Super League"), true);
    assert.equal(sparseBoxLeague("Uzbekistan - Super League"), true);
    assert.equal(sparseBoxLeague("Uruguay Primera División"), true);
    assert.equal(sparseBoxLeague("Urugwaj - Primera Division"), true);
    assert.equal(sparseBoxLeague("Süper Lig", "Danubio", "CA Penarol"), true);
    assert.equal(sparseBoxLeague("Meistriliiga"), true);
    assert.equal(sparseBoxLeague("Estonia - Meistriliiga"), true);
    assert.equal(sparseBoxLeague("Premium Liiga"), true);
    assert.equal(sparseBoxLeague("Premier League"), false);
    assert.equal(sparseBoxLeague("Mizoram Premier League"), true);
    assert.equal(sparseBoxLeague("Indie - Mizoram Premier League"), true);
    assert.equal(sparseBoxLeague("Premier League", "Mizoram", "Mis FC Lawtngtlai"), true);
    assert.equal(sparseBoxLeague("Premier League", "Mizoram Police FC", "MLS FC Lawngtlai"), true);
    assert.equal(sparseBoxLeague("Premier League"), false);
    assert.equal(sparseBoxLeague("Chile Primera B"), true);
    assert.equal(sparseBoxLeague("Chile - Primera B"), true);
    assert.equal(sparseBoxLeague("Chile Primera División"), false);
    assert.equal(sparseBoxLeague("Chile Primera Division", "Deportes Antofagasta", "Cobreloa Calama"), true);
    assert.equal(sparseBoxLeague("Colombia Primera B"), true);
    assert.equal(sparseBoxLeague("Kolumbia - Primera B"), true);
    assert.equal(sparseBoxLeague("Colombia Primera A"), false);
    assert.equal(sparseBoxLeague("Colombia Primera A", "Patriotas Boyaca", "Barranquilla FC"), true);
    assert.equal(sparseBoxLeague("Ykkönen"), true);
    assert.equal(sparseBoxLeague("Czech FNL"), true);
    assert.equal(sparseBoxLeague("Czechy - FNL"), true);
    assert.equal(sparseBoxLeague("Swiss Challenge League"), true);
    assert.equal(sparseBoxLeague("Szwajcaria - Challenge League"), true);
    assert.equal(sparseBoxLeague("Veikkausliiga"), false);
    assert.equal(sparseBoxLeague("Swiss Super League"), false);
    assert.equal(sparseBoxLeague("Czech First League"), false);
    assert.equal(sparseBoxLeague("I Liga"), true);
    assert.equal(sparseBoxLeague("Ekstraklasa"), false);
    assert.equal(sparseBoxLeague("Ekstraklasa", "Polonia Warszawa", "Polonia Bytom"), true);
    assert.equal(sparseBoxLeague("V-League"), true);
    assert.equal(sparseBoxLeague("Wietnam - V-League 1"), true);
    assert.equal(sparseBoxLeague("Thai League 1"), true);
    assert.equal(sparseBoxLeague("Tajlandia - Thai League 1"), true);
    assert.equal(sparseBoxLeague("Singapore Premier League"), true);
    assert.equal(sparseBoxLeague("Premier League"), false);
    assert.equal(sparseBoxLeague("Premier League", "Tampines Rovers", "Balestier Khalsa"), true);
  });

  it("statsClubHit Chile/Uzbek/Estonia", () => {
    assert.ok(statsClubHit("Antofagasta", "Deportes Antofagasta"));
    assert.ok(statsClubHit("Cobreloa", "Cobreloa Calama"));
    assert.ok(statsClubHit("Patriotas", "Patriotas Boyaca"));
    assert.ok(statsClubHit("Barranquilla", "Barranquilla FC"));
    assert.equal(statsClubHit("Deportes Recoleta", "Deportes Antofagasta"), false);
    assert.equal(statsClubHit("Deportes Santa Cruz", "Deportes Antofagasta"), false);
    assert.ok(statsClubHit("Andijon", "Andijan"));
    assert.ok(statsClubHit("Atletico Torque", "Montevideo City Torque"));
    assert.ok(statsClubHit("Kalju", "Nomme Kalju"));
    assert.ok(statsClubHit("Nomme Utd", "Nomme United"));
    assert.equal(statsClubHit("Nomme Utd", "Nomme Kalju"), false);
    assert.equal(statsClubHit("Kalju", "Nomme United"), false);
  });

  it("scout skip gdy została tylko luka kartek", () => {
    const p = payload({
      home: team({ name: "Suruchi Sangha", corners: 2.33, shotsOnTarget: 2.5, cards: 0 }),
      away: team({ name: "Wari AC", corners: 4.5, shotsOnTarget: 2.83, cards: 0 }),
    });
    assert.deepEqual(missingSetPieces(p), ["cards"]);
    assert.equal(shouldSkipSetPieceScout(p), true);
    const empty = payload();
    assert.equal(shouldSkipSetPieceScout(empty), false);
    const mpl = payload({
      match: { league: "Mizoram Premier League", kickoff: "", homePos: 2, awayPos: 6, ptsHome: 8, ptsAway: 4, motivation: "" },
      home: team({ name: "Mizoram Police FC" }),
      away: team({ name: "MLS FC" }),
    });
    assert.equal(shouldSkipSetPieceScout(mpl), true);
  });

  it("rożne ze screena Superbet, bez zgadywania poza zakresem", () => {
    const notes =
      "Ze screena (bukmacher): Dziś 11:30. Liczba rzutów rożnych: Śr. w sezonie: NSS 2.0* - WAR 5.1*.";
    assert.deepEqual(parseBookieCorners(notes), { home: 2, away: 5.1 });
    assert.equal(parseBookieCorners("brak statystyk"), null);
    assert.equal(parseBookieCorners("Śr. w sezonie: NSS 0.2* - WAR 0.1*"), null);
  });

  it("overlayNumericStats: zero nie kasuje Flashscore", () => {
    const keep = team({ name: "Wari", corners: 0, shotsOnTarget: 0, cards: 0 });
    const extra = team({ name: "Wari", corners: 4.5, shotsOnTarget: 2.83, cards: 0 });
    const m = overlayNumericStats(keep, extra);
    assert.equal(m.corners, 4.5);
    assert.equal(m.shotsOnTarget, 2.83);
    assert.equal(overlayNumericStats(extra, keep).corners, 4.5);
  });
});
