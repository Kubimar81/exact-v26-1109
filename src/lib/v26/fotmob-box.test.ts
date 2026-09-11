import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avgSide, fotmobLeagueId, parseFotmobH2hMatches, mergeH2h, parseTopStats, fotmobClubHit } from "./fotmob-box.ts";

describe("FotMob box — Superettan / OBOS", () => {
  it("liga → id FotMob", () => {
    assert.equal(fotmobLeagueId("1. Division Norway"), 203);
    assert.equal(fotmobLeagueId("Norwegia - 1.Division"), 203);
    assert.equal(fotmobLeagueId("Superettan"), 168);
    assert.equal(fotmobLeagueId("Eliteserien"), null);
    assert.equal(fotmobLeagueId("Premier League"), null);
    assert.equal(fotmobLeagueId("Calcutta Premier Division"), null);
    assert.equal(fotmobLeagueId("Cymru Premier"), 116);
    assert.equal(fotmobLeagueId("Walia - Cymru Premier"), 116);
    assert.equal(fotmobLeagueId("Uzbekistan Super League"), 540);
    assert.equal(fotmobLeagueId("Uzbekistan - Super League"), 540);
    assert.equal(fotmobLeagueId("Uruguay Primera División"), 161);
    assert.equal(fotmobLeagueId("Urugwaj - Primera Division"), 161);
    assert.equal(fotmobLeagueId("Superliga Denmark"), 46);
    assert.equal(fotmobLeagueId("Dania - Superliga"), 46);
    assert.equal(fotmobLeagueId("Belarus Premier League"), 263);
    assert.equal(fotmobLeagueId("Meistriliiga"), 248);
    assert.equal(fotmobLeagueId("Estonia - Meistriliiga"), 248);
    assert.equal(fotmobLeagueId("Premium Liiga"), 248);
    assert.equal(fotmobLeagueId("Chile Primera B"), 9126);
    assert.equal(fotmobLeagueId("Chile - Primera B"), 9126);
    assert.equal(fotmobLeagueId("Chile Primera División"), null);
    assert.equal(fotmobLeagueId("Colombia Primera B"), 9125);
    assert.equal(fotmobLeagueId("Kolumbia - Primera B"), 9125);
    assert.equal(fotmobLeagueId("Colombia Primera A"), null);
    assert.equal(fotmobLeagueId("Mizoram Premier League"), null);
    assert.equal(fotmobLeagueId("Premier League"), null);
  });

  it("alias klubów pod FT: Riga FS=RFS, Vitoria BA, Union de Santa Fe", () => {
    assert.equal(fotmobClubHit("RFS", "Riga FS"), true);
    assert.equal(fotmobClubHit("FK Liepāja", "Liepaja"), true);
    assert.equal(fotmobClubHit("Vitória", "Vitoria BA"), true);
    assert.equal(fotmobClubHit("Grêmio", "Gremio RS"), true);
    assert.equal(fotmobClubHit("Unión", "Union de Santa Fe"), true);
    assert.equal(fotmobClubHit("FC Midtjylland", "Midtjylland"), true);
  });

  it("SOT i rożne z Top stats, nie Total shots", () => {
    const details = {
      content: {
        stats: {
          Periods: {
            All: {
              stats: [
                {
                  title: "Top stats",
                  stats: [
                    { title: "Ball possession", stats: [63, 37] },
                    { title: "Total shots", stats: [15, 10] },
                    { title: "Shots on target", stats: [8, 7] },
                    { title: "Corners", stats: [6, 5] },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const box = parseTopStats(details);
    assert.deepEqual(box, { sotH: 8, sotA: 7, corH: 6, corA: 5 });
  });

  it("średnia min. 2 mecze", () => {
    assert.equal(avgSide([8]), 0);
    assert.equal(avgSide([8, 4]), 6);
    assert.equal(avgSide([6, 5, 4]), 5);
  });

  it("H2H z karty FotMob, bez NS", () => {
    const rows = parseFotmobH2hMatches({
      content: {
        h2h: {
          matches: [
            {
              time: { utcTime: "2026-07-04T14:00:00.000Z" },
              league: { name: "1. Divisjon" },
              home: { name: "Hødd" },
              away: { name: "Strømsgodset" },
              status: { finished: true, scoreStr: "4 - 3" },
            },
            {
              time: { utcTime: "2026-08-26T17:00:00.000Z" },
              league: { name: "1. Divisjon" },
              home: { name: "Strømsgodset" },
              away: { name: "Hødd" },
              status: { finished: false, scoreStr: "" },
            },
          ],
        },
      },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].score, "4:3");
    assert.equal(rows[0].date, "2026-07-04");
  });

  it("merge H2H po dacie, bez duplikatów", () => {
    const a = [{ date: "2026-07-04", competition: "1. Division", home: "hodd", away: "Stromsgodset", score: "4:3" }];
    const b = [
      { date: "2026-07-04", competition: "1. Divisjon", home: "Hødd", away: "Strømsgodset", score: "4:3" },
      { date: "2006-07-31", competition: "1. Divisjon", home: "Hodd", away: "Stromsgodset", score: "1:2" },
    ];
    const m = mergeH2h(a, b);
    assert.equal(m.length, 2);
    assert.equal(m[0].date, "2026-07-04");
  });
});
