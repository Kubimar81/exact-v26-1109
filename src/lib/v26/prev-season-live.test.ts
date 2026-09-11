import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flashscoreLivePath,
  parseFBrefHomeAway,
  parseFlashscoreScored,
  parseSofascoreTeamStats,
  sumsFromFlashscore,
  toSplit,
} from "./prev-season-live.ts";

describe("25.19 live scrape", () => {
  it("toSplit: 4 liczby → średnie, brak playedAway → null", () => {
    const split = toSplit({
      playedHome: 17,
      playedAway: 16,
      gfHomeSum: 37,
      gaHomeSum: 10,
      gfAwaySum: 34,
      gaAwaySum: 17,
      source: "test",
      url: "x",
    });
    assert.ok(split);
    assert.equal(split?.gfHome, 2.18);
    assert.equal(split?.gfAway, 2.13);
    assert.equal(split?.gaHome, 0.59);
    assert.equal(toSplit({ playedHome: 17, playedAway: 0, gfHomeSum: 37, gaHomeSum: 10, gfAwaySum: 0, gaAwaySum: 0, source: "x", url: "x" }), null);
  });

  it("Flashscore path: AZ / Cymru, nie kradnie EPL", () => {
    assert.equal(flashscoreLivePath("Azerbaijan Premier League"), "/football/azerbaijan/premier-league/");
    assert.equal(flashscoreLivePath("Cymru Premier"), "/football/wales/cymru-premier/");
    assert.equal(flashscoreLivePath("Parva Liga"), "/football/bulgaria/parva-liga/");
    assert.equal(flashscoreLivePath("Bułgaria - Parva Liga"), "/football/bulgaria/parva-liga/");
    assert.equal(flashscoreLivePath("Chorwacja - HNL"), "/football/croatia/hnl/");
    assert.equal(flashscoreLivePath("Uganda Premier League"), "/football/uganda/premier-league/");
    assert.equal(flashscoreLivePath("Premijer Liga"), "/football/bosnia-and-herzegovina/wwin-liga-bih/");
    assert.equal(flashscoreLivePath("Saudi First Division"), "/football/saudi-arabia/division-1/");
    assert.equal(flashscoreLivePath("Premier League"), "/football/england/premier-league/");
    assert.equal(flashscoreLivePath("Egyptian Premier League"), "/football/egypt/premier-league/");
    assert.equal(flashscoreLivePath("Egipt - Premier League"), "/football/egypt/premier-league/");
    assert.equal(flashscoreLivePath("NIFL Premiership"), "/football/northern-ireland/nifl-premiership/");
    assert.equal(flashscoreLivePath("Northern Ireland Premiership"), "/football/northern-ireland/nifl-premiership/");
    assert.equal(flashscoreLivePath("Mizoram Premier League"), null);
    assert.equal(flashscoreLivePath("Indie - Mizoram Premier League"), null);
  });

  it("Flashscore results: Qarabag H/A sumy", () => {
    const html =
      "¬~AA÷aaaaaaa1¬AB÷3¬AE÷Qarabag¬AF÷Kapaz¬AG÷3¬AH÷0¬~AA÷aaaaaaa2¬AB÷3¬AE÷Shamakhi¬AF÷Qarabag¬AG÷0¬AH÷1¬~AA÷aaaaaaa3¬AB÷1¬AE÷Qarabag¬AF÷Zira¬AG÷0¬AH÷0¬";
    const events = parseFlashscoreScored(html);
    const sums = sumsFromFlashscore(events, "Qarabağ");
    assert.ok(sums);
    assert.equal(sums?.playedHome, 1);
    assert.equal(sums?.gfHomeSum, 3);
    assert.equal(sums?.playedAway, 1);
    assert.equal(sums?.gfAwaySum, 1);
  });

  it("FBref Home/Away parser", () => {
    const html = `<table><tr><th>Home</th><td>19</td><td>41</td><td>16</td></tr><tr><th>Away</th><td>19</td><td>34</td><td>20</td></tr></table>`;
    const p = parseFBrefHomeAway(html);
    assert.ok(p);
    assert.equal(p?.playedHome, 19);
    assert.equal(p?.gfHomeSum, 41);
    assert.equal(p?.playedAway, 19);
    assert.equal(p?.gfAwaySum, 34);
  });

  it("Sofascore team stats Home/Away", () => {
    const p = parseSofascoreTeamStats({
      statisticsItems: [
        { name: "Matches played", home: "17", away: "16" },
        { name: "Goals", home: "37", away: "34" },
        { name: "Goals conceded", home: "10", away: "17" },
      ],
    });
    assert.ok(p);
    assert.equal(p?.gfHomeSum, 37);
    assert.equal(p?.playedAway, 16);
  });
});
