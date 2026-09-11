import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { confirmLineupsT60, afTeamIdsFromSources } from "../src/lib/v26/api-football.ts";
import { fetchFotmobLineups } from "../src/lib/v26/fotmob-box.ts";
import type { SavedAnalysis } from "../src/lib/v26/types.ts";

const dir = join(process.cwd(), "data/analyses");
const now = Date.now();
const cards: SavedAnalysis[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const a = JSON.parse(readFileSync(join(dir, f), "utf8")) as SavedAnalysis;
  const t = Date.parse(a.input?.kickoff || "");
  if (!Number.isFinite(t)) continue;
  const mins = (t - now) / 60000;
  if (mins < -25 || mins > 150) continue;
  cards.push(a);
}
cards.sort((a, b) => Date.parse(a.input.kickoff) - Date.parse(b.input.kickoff));
console.log("NOW", new Date().toISOString());
console.log(
  "window",
  cards.map((c) => `${c.input.home} ${Math.round((Date.parse(c.input.kickoff) - now) / 60000)}m ${c.status}`).join(" | "),
);

for (const a of cards) {
  const src = (a.phase1?.sources || a.phase2?.sources || []) as string[];
  const ids = afTeamIdsFromSources(src);
  console.log("\n==", a.input.home, "vs", a.input.away, a.status, "ids", ids, "liga", a.input.league);
  const inj = a.phase1?.injuries || "";
  console.log("alreadyXI", /XI potwierdzone/i.test(inj), "sv", a.phase1?.squadVerified);
  try {
    const fm = await fetchFotmobLineups({ home: a.input.home, away: a.input.away, league: a.input.league });
    console.log(
      "fotmob",
      fm ? { kind: fm.kind, h: fm.home.length, a: fm.away.length, h0: fm.home[0]?.name, a0: fm.away[0]?.name } : null,
    );
  } catch (e) {
    console.log("fotmob ERR", e instanceof Error ? e.message : e);
  }
  try {
    const res = await confirmLineupsT60({
      home: a.input.home,
      away: a.input.away,
      league: a.input.league,
      kickoff: a.input.kickoff,
      oddsHome: a.input.oddsHome,
      oddsAway: a.input.oddsAway,
      favorite: a.phase1?.favorite,
      sources: src,
    });
    console.log("xiReady", res.overlay.xiReady);
    console.log("err", res.error);
    console.log("note", (res.overlay.note || "").slice(0, 240));
    console.log("inj", (res.overlay.injuries || "").slice(0, 280));
  } catch (e) {
    console.log("T60 ERR", e instanceof Error ? e.message : e);
  }
}
