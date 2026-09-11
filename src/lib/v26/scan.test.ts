import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildScanPrompt, normalizeScan } from "./scan.ts";

describe("skan kuponu — godzina meczu", () => {
  const scanAt = new Date("2026-09-04T08:12:10.578Z");

  it("prompt ma dzisiejszą datę Warszawy i zakazuje pustego kickoff", () => {
    const p = buildScanPrompt(scanAt);
    assert.match(p, /2026-09-04/);
    assert.match(p, /2026-09-05/);
    assert.match(p, /NIGDY pusty/);
    assert.match(p, /Dziś/);
  });

  it("puste kickoff + Dziś w notes → ISO Warszawa", () => {
    const r = normalizeScan(
      {
        home: "Mjallby",
        away: "Djurgarden IF",
        league: "Allsvenskan",
        kickoff: "",
        oddsHome: 4.2,
        oddsDraw: 3.6,
        oddsAway: 1.75,
        notes: "Dziś 19:00. Superprzewaga.",
        sourceHint: "bukmacher",
      },
      scanAt,
    );
    assert.ok(r.kickoff);
    assert.ok(r.fieldsFilled.includes("termin"));
    const warsaw = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).format(new Date(r.kickoff));
    assert.equal(warsaw, "19:00");
  });

  it("naive YYYY-MM-DDTHH:mm z vision = Warszawa, nie UTC serwera", () => {
    const r = normalizeScan(
      {
        home: "PSG",
        away: "Monaco",
        league: "Ligue 1",
        kickoff: "2026-09-04T21:05",
        notes: "Dziś 21:05",
        sourceHint: "bukmacher",
      },
      scanAt,
    );
    const warsaw = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).format(new Date(r.kickoff));
    assert.equal(warsaw, "21:05");
  });

  it("kickoff jako tekst Dziś HH:mm", () => {
    const r = normalizeScan(
      { home: "A", away: "B", league: "Ekstraklasa", kickoff: "Dziś, 20:30", notes: "" },
      scanAt,
    );
    assert.ok(r.kickoff);
    const warsaw = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).format(new Date(r.kickoff));
    assert.equal(warsaw, "20:30");
  });
});
