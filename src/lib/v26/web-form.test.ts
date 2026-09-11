import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  factsFromAwayEnd,
  mplClubHit,
  parseAwayEndResults,
  parseAwayEndTable,
} from "./web-form.ts";

const HTML = `
<table>
<tr><th>pos</th><th>team</th><th>p</th><th>w</th><th>d</th><th>l</th><th>pts</th><th>gf</th><th>ga</th><th>gd</th></tr>
<tr><td>1</td><td>Aizawl FC</td><td>4</td><td>4</td><td>0</td><td>0</td><td>12</td><td>20</td><td>2</td><td>18</td></tr>
<tr><td>2</td><td>Mizoram Police FC</td><td>4</td><td>2</td><td>2</td><td>0</td><td>8</td><td>6</td><td>4</td><td>2</td></tr>
<tr><td>6</td><td>MLS FC</td><td>4</td><td>1</td><td>1</td><td>2</td><td>4</td><td>5</td><td>9</td><td>-4</td></tr>
<tr><td>8</td><td>Kanan FC</td><td>4</td><td>0</td><td>0</td><td>4</td><td>0</td><td>2</td><td>16</td><td>-14</td></tr>
</table>
<table>
<tr><th>date</th><th>stage</th><th>home</th><th>result</th><th>away</th><th>goalscorer home</th><th>goalscorer away</th></tr>
<tr><td>August 25 2026</td><td>round 1</td><td>Ramthar Veng FC</td><td>0-0</td><td>MLS FC, Lawngtlai</td><td></td><td></td></tr>
<tr><td>August 26 2026</td><td>round 1</td><td>Mizoram Police FC</td><td>1-0</td><td>Dinthar FC</td><td>39&#8242; Isaak</td><td></td></tr>
<tr><td>August 28 2026</td><td>round 2</td><td>Chanmari FC</td><td>0-0</td><td>Mizoram Police FC</td><td></td><td></td></tr>
<tr><td>August 29 2026</td><td>round 2</td><td>MLS FC, Lawngtlai</td><td>2-5</td><td>Aizawl FC</td><td>51&#8242; OG, 75&#8242; Lalfamkima</td><td>14&#8242; 36&#8242;</td></tr>
<tr><td>September 4 2026</td><td>round 4</td><td>MLS FC, Lawngtlai</td><td>3-0</td><td>Kanan FC</td><td>56&#8242; 78&#8242; 76&#8242;</td><td></td></tr>
<tr><td>September 4 2026</td><td>round 4</td><td>Mizoram Police FC</td><td>2-1</td><td>Saikhamakawn FC</td><td>10&#8242; 80&#8242;</td><td>53&#8242;</td></tr>
<tr><td>September 8 2026</td><td>round 5</td><td>Mizoram Police FC</td><td></td><td>MLS FC, Lawngtlai</td><td></td><td></td></tr>
</table>`;

describe("The Away End — Mizoram Premier League", () => {
  it("OCR klubów trafia Police / MLS Lawngtlai, nie EPL", () => {
    assert.equal(mplClubHit("Mizoram Police FC", "Mizoram"), true);
    assert.equal(mplClubHit("MLS FC, Lawngtlai", "Mis FC Lawtngtlai"), true);
    assert.equal(mplClubHit("MLS FC", "Mis FC Lawtngtlai"), true);
    assert.equal(mplClubHit("MLS FC", "Mls FC Lawtngtlai"), true);
    assert.equal(mplClubHit("Manchester City", "Mizoram"), false);
    assert.equal(mplClubHit("LA Galaxy", "Mis FC Lawtngtlai"), false);
  });

  it("tabela + wyniki FT, bez NS z kolejki 5", () => {
    const table = parseAwayEndTable(HTML);
    assert.equal(table[0]?.team, "Aizawl FC");
    assert.equal(table.find((t) => t.team.includes("Police"))?.pos, 2);
    assert.equal(table.find((t) => t.team === "MLS FC")?.points, 4);
    const results = parseAwayEndResults(HTML);
    assert.equal(results.some((r) => r.home.includes("Police") && r.hg === 1 && r.ag === 0), true);
    assert.equal(results.some((r) => /MLS/.test(r.home) && r.hg === 3 && r.ag === 0), true);
    assert.equal(results.some((r) => r.date === "2026-09-08"), false);
  });

  it("facts OCR:  forma ≥2, liga MPL, bez EPL", () => {
    const packed = factsFromAwayEnd(HTML, {
      home: "Mizoram",
      away: "Mis FC Lawtngtlai",
      league: "Premier League",
    });
    assert.ok(packed);
    assert.ok((packed?.formN || 0) >= 4);
    const home = packed?.facts.home as { tablePos: number; form: { scoreFor: number }[] };
    const away = packed?.facts.away as { tablePos: number; form: { scoreFor: number }[] };
    assert.equal(home.tablePos, 2);
    assert.equal(away.tablePos, 6);
    assert.ok(home.form.length >= 2);
    assert.ok(away.form.length >= 2);
    assert.equal(packed?.facts.league, "Mizoram Premier League");
  });
});
