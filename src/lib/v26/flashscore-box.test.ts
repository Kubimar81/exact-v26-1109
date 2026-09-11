import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flashscoreLeaguePath,
  parseFlashscoreEvents,
  parseFlashscoreMatchStats,
} from "./flashscore-box.ts";

describe("Flashscore box — Calcutta Premier Division", () => {
  it("liga → ścieżka Flashscore, Superettan zostaje na FotMob", () => {
    assert.equal(flashscoreLeaguePath("Calcutta Premier Division"), "/football/india/calcutta-premier-division/");
    assert.equal(flashscoreLeaguePath("Indie - Calcutta Premier Division"), "/football/india/calcutta-premier-division/");
    assert.equal(flashscoreLeaguePath("India CFL"), "/football/india/calcutta-premier-division/");
    assert.equal(flashscoreLeaguePath("Superettan"), null);
    assert.equal(flashscoreLeaguePath("1. Division Norway"), null);
    assert.equal(flashscoreLeaguePath("Premier League"), null);
    assert.equal(flashscoreLeaguePath("Cymru Premier"), "/football/wales/cymru-premier/");
    assert.equal(flashscoreLeaguePath("Walia - Premier League"), "/football/wales/cymru-premier/");
    assert.equal(flashscoreLeaguePath("Uganda Premier League"), "/football/uganda/premier-league/");
    assert.equal(flashscoreLeaguePath("Premier League", "NEC FC", "Lugazi FC"), "/football/uganda/premier-league/");
    assert.equal(flashscoreLeaguePath("Ligat Ha'Al"), "/football/israel/winner-league/");
    assert.equal(flashscoreLeaguePath("Premier League", "Hapoel Beer Sheva", "Hapoel Haifa"), "/football/israel/winner-league/");
    assert.equal(flashscoreLeaguePath("Premijer Liga"), "/football/bosnia-and-herzegovina/wwin-liga-bih/");
    assert.equal(flashscoreLeaguePath("Bośnia i Hercegowina - Premier Liga"), "/football/bosnia-and-herzegovina/wwin-liga-bih/");
    assert.equal(flashscoreLeaguePath("Saudi First Division"), "/football/saudi-arabia/division-1/");
    assert.equal(flashscoreLeaguePath("Saudi Pro League", "Al Najma", "Al Jabalain"), "/football/saudi-arabia/division-1/");
    assert.equal(flashscoreLeaguePath("Championship"), null);
    assert.equal(flashscoreLeaguePath("Uzbekistan Super League"), "/football/uzbekistan/super-league/");
    assert.equal(flashscoreLeaguePath("Uzbekistan - Super League"), "/football/uzbekistan/super-league/");
    assert.equal(flashscoreLeaguePath("Uruguay Primera División"), "/football/uruguay/liga-auf-uruguaya/");
    assert.equal(flashscoreLeaguePath("Urugwaj - Primera Division"), "/football/uruguay/liga-auf-uruguaya/");
    assert.equal(flashscoreLeaguePath("Süper Lig", "Danubio", "CA Penarol"), "/football/uruguay/liga-auf-uruguaya/");
    assert.equal(flashscoreLeaguePath("Meistriliiga"), "/football/estonia/meistriliiga/");
    assert.equal(flashscoreLeaguePath("Estonia - Meistriliiga"), "/football/estonia/meistriliiga/");
    assert.equal(flashscoreLeaguePath("Premium Liiga"), "/football/estonia/meistriliiga/");
    assert.equal(flashscoreLeaguePath("Mizoram Premier League"), null);
    assert.equal(flashscoreLeaguePath("Premier League", "Mizoram", "Mis FC Lawtngtlai"), null);
    assert.equal(flashscoreLeaguePath("Premier League"), null);
    assert.equal(flashscoreLeaguePath("Chile Primera B"), "/football/chile/liga-de-ascenso/");
    assert.equal(flashscoreLeaguePath("Chile - Primera B"), "/football/chile/liga-de-ascenso/");
    assert.equal(flashscoreLeaguePath("Chile Primera División"), null);
    assert.equal(
      flashscoreLeaguePath("Chile Primera Division", "Deportes Antofagasta", "Cobreloa Calama"),
      "/football/chile/liga-de-ascenso/",
    );
    assert.equal(flashscoreLeaguePath("Colombia Primera B"), "/football/colombia/primera-b/");
    assert.equal(flashscoreLeaguePath("Kolumbia - Primera B"), "/football/colombia/primera-b/");
    assert.equal(flashscoreLeaguePath("Colombia Primera A"), null);
    assert.equal(
      flashscoreLeaguePath("Colombia Primera A", "Patriotas Boyaca", "Barranquilla FC"),
      "/football/colombia/primera-b/",
    );
    assert.equal(flashscoreLeaguePath("Ykkönen"), "/football/finland/ykkosliiga/");
    assert.equal(flashscoreLeaguePath("Finlandia - Ykkösliiga"), "/football/finland/ykkosliiga/");
    assert.equal(flashscoreLeaguePath("Czech FNL"), "/football/czech-republic/fnl/");
    assert.equal(flashscoreLeaguePath("Czechy - FNL"), "/football/czech-republic/fnl/");
    assert.equal(flashscoreLeaguePath("Swiss Challenge League"), "/football/switzerland/challenge-league/");
    assert.equal(flashscoreLeaguePath("Szwajcaria - Challenge League"), "/football/switzerland/challenge-league/");
    assert.equal(flashscoreLeaguePath("Veikkausliiga"), null);
    assert.equal(flashscoreLeaguePath("Swiss Super League"), null);
    assert.equal(flashscoreLeaguePath("Czech First League"), null);
    assert.equal(flashscoreLeaguePath("I Liga"), "/football/poland/division-1/");
    assert.equal(flashscoreLeaguePath("I Liga", "Polonia Warszawa", "Polonia Bytom"), "/football/poland/division-1/");
    assert.equal(flashscoreLeaguePath("Ekstraklasa", "Polonia Warszawa", "Polonia Bytom"), "/football/poland/division-1/");
    assert.equal(flashscoreLeaguePath("V-League"), "/football/vietnam/v-league-1/");
    assert.equal(flashscoreLeaguePath("Wietnam - V-League 1"), "/football/vietnam/v-league-1/");
    assert.equal(flashscoreLeaguePath("Thai League 1"), "/football/thailand/thai-league/");
    assert.equal(flashscoreLeaguePath("Tajlandia - Thai League 1"), "/football/thailand/thai-league/");
    assert.equal(flashscoreLeaguePath("Singapore Premier League"), "/football/singapore/premier-league/");
    assert.equal(flashscoreLeaguePath("Premier League"), null);
  });

  it("SOT i rożne z SE÷Match, nie z 2. połowy", () => {
    const raw =
      "SE÷Match¬~SF÷Top stats¬~SD÷12¬SG÷Ball possession¬SH÷43%¬SI÷57%¬~SD÷34¬SG÷Total shots¬SH÷7¬SI÷9¬~SD÷13¬SG÷Shots on target¬SH÷3¬SI÷3¬~SD÷16¬SG÷Corner kicks¬SH÷1¬SI÷4¬~SF÷Shots¬~SD÷34¬SG÷Total shots¬SH÷7¬SI÷9¬~SE÷1st Half¬~SF÷Top stats¬~SD÷13¬SG÷Shots on target¬SH÷0¬SI÷2¬~SD÷16¬SG÷Corner kicks¬SH÷0¬SI÷3¬~SE÷2nd Half¬~SF÷Top stats¬~SD÷13¬SG÷Shots on target¬SH÷3¬SI÷1¬~SD÷16¬SG÷Corner kicks¬SH÷1¬SI÷1¬~A1÷¬~";
    const box = parseFlashscoreMatchStats(raw);
    assert.ok(box);
    assert.equal(box?.sotH, 3);
    assert.equal(box?.sotA, 3);
    assert.equal(box?.corH, 1);
    assert.equal(box?.corA, 4);
    assert.equal(box?.hasSot, true);
    assert.equal(box?.hasCor, true);
    assert.equal(box?.hasCards, false);
  });

  it("eventy FT z feedu, bez duplikatów, bez NS", () => {
    const html =
      "junk¬~AA÷OlkbAuWO¬AD÷1¬AB÷3¬AE÷Suruchi Sangha¬AF÷Kalighat SL¬PX÷8UkL83D5¬PY÷jgJfhrTO¬~AA÷OlkbAuWO¬AB÷3¬AE÷Suruchi Sangha¬AF÷Kalighat SL¬~AA÷EXYzgCre¬AB÷1¬AE÷Suruchi Sangha¬AF÷Wari¬~AA÷CEoNTlQ0¬AB÷3¬AE÷Police AC¬AF÷Wari¬~AA÷badid¬AB÷3¬AE÷X¬AF÷Y";
    const rows = parseFlashscoreEvents(html);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].id, "OlkbAuWO");
    assert.equal(rows[0].finished, true);
    assert.equal(rows[1].id, "EXYzgCre");
    assert.equal(rows[1].finished, false);
    assert.equal(rows[2].home, "Police AC");
    assert.equal(rows[2].away, "Wari");
  });
});
