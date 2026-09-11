import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWniosek,
  isWniosekDue,
  MATCH_LENGTH_MS,
  WNIOSEK_AFTER_FT_MS,
  normScore,
  scoreSide,
  parseKickoffFromNotes,
  resolveKickoff,
  coerceKickoff,
  toWarsawDatetimeLocal,
} from "./wniosek.ts";

const emptyEv = { red: false, og: false, late90: false, squad: false, details: [] };

function warsawClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(new Date(iso));
}

describe("wniosek po meczu", () => {
  it("normalizuje wynik i stronę", () => {
    assert.equal(normScore("2-1"), "2:1");
    assert.equal(scoreSide("2:1"), "home");
    assert.equal(scoreSide("0:2"), "away");
    assert.equal(scoreSide("1:1"), "draw");
  });

  it("due = koniec meczu (105 min) + 1 h", () => {
    const kick = Date.parse("2026-09-04T16:00:00.000Z");
    const iso = new Date(kick).toISOString();
    assert.equal(isWniosekDue(iso, kick + MATCH_LENGTH_MS + WNIOSEK_AFTER_FT_MS - 1), false);
    assert.equal(isWniosekDue(iso, kick + MATCH_LENGTH_MS + WNIOSEK_AFTER_FT_MS), true);
  });

  it("Dziś / Jutro z notatek Superbet → kickoff Warszawa", () => {
    const scanAt = new Date("2026-09-04T08:12:10.578Z");
    const dzis = parseKickoffFromNotes("Ze screena (bukmacher): Dziś 19:00. Superprzewaga.", scanAt);
    assert.ok(dzis);
    const warsaw = warsawClock(dzis);
    assert.match(warsaw, /04\/09/);
    assert.match(warsaw, /19:00/);
    const jutro = parseKickoffFromNotes("Jutro, 00:00", scanAt);
    assert.ok(jutro);
    const jw = warsawClock(jutro);
    assert.match(jw, /05/);
    assert.match(jw, /00:00/);
    assert.equal(resolveKickoff("", "Dziś 19:00", scanAt.toISOString()), dzis);
    assert.equal(isWniosekDue(dzis, Date.parse(dzis) + MATCH_LENGTH_MS + WNIOSEK_AFTER_FT_MS - 1), false);
  });

  it("Dziś z przecinkiem i Jutro 02:30", () => {
    const scanAt = new Date("2026-09-04T08:35:21.535Z");
    const dzis = parseKickoffFromNotes("Ze screena (bukmacher): Dziś, 21:00. Superprzewaga.", scanAt);
    assert.ok(dzis);
    assert.match(warsawClock(dzis), /21:00/);
    assert.match(warsawClock(dzis), /04\/09/);
    const late = parseKickoffFromNotes("Jutro, 02:30; Podwójna szansa 1X 1.23", scanAt);
    assert.ok(late);
    assert.match(warsawClock(late), /02:30/);
    assert.match(warsawClock(late), /05/);
  });

  it("coerceKickoff: naive ISO i samo HH:mm = Warszawa, nie UTC", () => {
    const scanAt = new Date("2026-09-04T10:00:00.000Z");
    const naive = coerceKickoff("2026-09-04T19:00", "", scanAt);
    assert.ok(naive);
    assert.match(warsawClock(naive), /19:00/);
    assert.match(warsawClock(naive), /04\/09/);
    const clock = coerceKickoff("20:45", "", scanAt);
    assert.match(warsawClock(clock), /20:45/);
    const fromWord = coerceKickoff("Dziś 17:15", "", scanAt);
    assert.match(warsawClock(fromWord), /17:15/);
    const fromNotes = coerceKickoff("", "Ze screena (bukmacher): Jutro, 20:00.", scanAt);
    assert.match(warsawClock(fromNotes), /20:00/);
    assert.match(warsawClock(fromNotes), /05/);
    assert.equal(toWarsawDatetimeLocal(naive), "2026-09-04T19:00");
    assert.equal(toWarsawDatetimeLocal("Dziś 19:00"), toWarsawDatetimeLocal(parseKickoffFromNotes("Dziś 19:00", scanAt)));
  });

  it("HIT EPL2 w TOP3", () => {
    const w = buildWniosek({
      epl: [{ score: "2:1" }, { score: "1:1" }, { score: "2:0" }],
      favorite: "home",
      decision: "MIXED ONLY",
      conf: 72,
      ft: "1:1",
      events: emptyEv,
    });
    assert.equal(w.verdict, "HIT");
    assert.equal(w.hitSlot, "EPL2");
    assert.match(w.text, /HIT EPL2/);
  });

  it("MISS przebiegu przy czerwonej", () => {
    const w = buildWniosek({
      epl: [{ score: "2:1" }, { score: "2:0" }, { score: "1:0" }],
      favorite: "home",
      decision: "GREEN LIGHT",
      conf: 81,
      ft: "1:2",
      events: { ...emptyEv, red: true, details: ["czerwona 12' GK"] },
    });
    assert.equal(w.verdict, "MISS_PRZEBIEGU");
    assert.match(w.text, /czerwona/);
    assert.equal(w.directionOk, false);
  });

  it("MISS programu bez zdarzeń — zły exact, kierunek TAK", () => {
    const w = buildWniosek({
      epl: [{ score: "2:1" }, { score: "2:0" }, { score: "1:0" }],
      favorite: "home",
      decision: "WATCH",
      conf: 64,
      ft: "3:1",
      events: emptyEv,
    });
    assert.equal(w.verdict, "MISS_PROGRAMU");
    assert.equal(w.directionOk, true);
    assert.match(w.text, /kierunek TAK/i);
  });

  it("protection nie jest HIT TOP3", () => {
    const w = buildWniosek({
      epl: [{ score: "2:1" }, { score: "2:0" }, { score: "1:0" }],
      protection: [{ score: "2:2" }],
      favorite: "home",
      decision: "WATCH",
      conf: 61,
      ft: "2:2",
      events: emptyEv,
    });
    assert.equal(w.verdict, "MISS_PROGRAMU");
    assert.equal(w.hitSlot, "PROTECTION");
  });

  it("gol 90+ + miss = przebieg, nie program", () => {
    const w = buildWniosek({
      epl: [{ score: "1:0" }, { score: "2:0" }, { score: "2:1" }],
      favorite: "home",
      decision: "GREEN LIGHT",
      conf: 78,
      ft: "1:1",
      events: { ...emptyEv, late90: true, details: ["gol 90+ 95'"] },
    });
    assert.equal(w.verdict, "MISS_PRZEBIEGU");
    assert.match(w.text, /90\+/);
  });
});
