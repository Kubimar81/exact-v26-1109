import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xiFromFotmobSide } from "./fotmob-box.ts";

describe("FotMob XI parser", () => {
  it("bierze starterów bez positionId (Malmö 10+10 bug)", () => {
    const side = {
      players: [
        { name: "GK One", positionId: 0 },
        { name: "Def Two", position: "D" },
        { name: "Mid Three" },
        { name: "Fwd Four", usualPlayingPositionId: 3 },
        { name: "Five" },
        { name: "Six" },
        { name: "Seven" },
        { name: "Eight" },
        { name: "Nine" },
        { name: "Ten" },
        { name: "Eleven" },
      ],
    };
    const xi = xiFromFotmobSide(side);
    assert.equal(xi.length, 11);
    assert.equal(xi[0].name, "GK One");
    assert.equal(xi[0].pos, "G");
    assert.equal(xi[3].pos, "F");
  });

  it("nie wciąga nazwy klubu z kontenera homeTeam", () => {
    const side = {
      name: "Malmö FF",
      players: [
        { name: "Ali", positionId: 0 },
        { name: "Ben", positionId: 1 },
        { name: "Cam", positionId: 3 },
      ],
    };
    const xi = xiFromFotmobSide(side);
    assert.deepEqual(xi.map((p) => p.name), ["Ali", "Ben", "Cam"]);
  });
});
