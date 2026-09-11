import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyMatchInjuries, lookupSquad, foldPlayerName } from "./injuries-s3.ts";

const kick = "2026-09-04T17:00:00.000Z";

describe("S3 absencje na ten mecz", () => {
  it("katalog sezonu (lipiec) nie robi mass — tylko fixture kickoff", () => {
    const p = classifyMatchInjuries(
      [
        { name: "K. Hogh", type: "Missing Fixture", pos: "Attacker", number: 9, fixtureDate: "2026-07-26T15:00:00+00:00" },
        { name: "U. Saltnes", type: "Missing Fixture", pos: "Midfielder", number: 14, fixtureDate: "2026-07-31T19:00:00+00:00" },
        { name: "D. Bassi", type: "Missing Fixture", pos: "Midfielder", number: 18, fixtureDate: "2026-07-22T17:00:00+00:00" },
      ],
      "Bodo/Glimt",
      kick,
    );
    assert.equal(p.mass, false);
    assert.equal(p.key, false);
    assert.equal(p.gk, false);
    assert.match(p.text, /Brak zgłoszonych kontuzji/);
  });

  it("Bodø 4.09: CB/pomoc Missing + 3. GK + questionable napastnik — NIE S3, nie cap 60%", () => {
    const p = classifyMatchInjuries(
      [
        { name: "H. Aleesami", type: "Missing Fixture", pos: "Defender", number: 5, fixtureDate: kick },
        { name: "H. Evjen", type: "Missing Fixture", pos: "Midfielder", number: 26, fixtureDate: kick },
        { name: "J. Gundersen", type: "Missing Fixture", pos: "Defender", number: 6, fixtureDate: kick },
        { name: "M. Riisnaes", type: "Missing Fixture", pos: "Midfielder", number: 23, fixtureDate: kick },
        { name: "I. Sjong", type: "Missing Fixture", pos: "Goalkeeper", number: 45, fixtureDate: kick },
        { name: "A. Mikkelsen", type: "Questionable", pos: "Attacker", number: 94, fixtureDate: kick },
      ],
      "Bodo/Glimt",
      kick,
      12,
    );
    assert.equal(p.gk, false, "Sjong #45 nie jest pierwszym GK");
    assert.equal(p.key, false, "Evjen pomocnik + Mikkelsen questionable — nie key attacker");
    assert.equal(p.mass, false, "4 Missing CB/pomoc to nie 3+ kluczowych");
    assert.match(p.text, /Aleesami/);
    assert.match(p.text, /Evjen/);
    assert.doesNotMatch(p.text, /Hogh/);
  });

  it("3 Missing napastników = mass S3", () => {
    const p = classifyMatchInjuries(
      [
        { name: "A", type: "Missing Fixture", pos: "Attacker", number: 9, fixtureDate: kick },
        { name: "B", type: "Missing Fixture", pos: "Forward", number: 10, fixtureDate: kick },
        { name: "C", type: "Missing Fixture", pos: "Winger", number: 11, fixtureDate: kick },
      ],
      "Club",
      kick,
    );
    assert.equal(p.key, true);
    assert.equal(p.mass, true);
  });

  it("jeden Missing napastnik = key, nie mass", () => {
    const p = classifyMatchInjuries(
      [{ name: "Jota", type: "Missing Fixture", pos: "Attacker", number: 7, fixtureDate: kick }],
      "Stoke",
      kick,
    );
    assert.equal(p.key, true);
    assert.equal(p.mass, false);
    assert.equal(p.gk, false);
  });

  it("Barca: młodzież Missing Fixture (#28/#29) + De Jong pomoc — nie S3", () => {
    const p = classifyMatchInjuries(
      [
        { name: "R. Bardghji", type: "Missing Fixture", pos: "Attacker", number: 28, fixtureDate: kick },
        { name: "J. Bisiwu", type: "Missing Fixture", pos: "Attacker", number: 29, fixtureDate: kick },
        { name: "F. de Jong", type: "Missing Fixture", pos: "Midfielder", number: 21, fixtureDate: kick },
      ],
      "Barcelona",
      kick,
    );
    assert.equal(p.key, false, "Bardghji/Bisiwu nr≥24 nie są starterami");
    assert.equal(p.mass, false);
    assert.equal(p.gk, false);
  });

  it("lookup nazwiska z ogonkiem", () => {
    const squad = new Map([[foldPlayerName("M. Riisnæs"), { pos: "Midfielder", number: 23 }]]);
    const hit = lookupSquad("M. Riisnaes", squad);
    assert.equal(hit?.pos, "Midfielder");
  });
});
