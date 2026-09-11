const res = await fetch("https://www.fotmob.com/api/data/matchDetails?matchId=5107592", {
  headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
});
const details = await res.json();
const lu = details?.content?.lineup;
console.log("lineup keys", Object.keys(lu || {}));
console.log("lineupType", lu?.lineupType, "source", lu?.source);
for (const side of ["homeTeam", "awayTeam"]) {
  const t = lu?.[side];
  console.log("\n", side, t && typeof t === "object" ? Object.keys(t) : t);
  if (!t) continue;
  console.log(" name", t.name, "id", t.id);
  const players = t.players || t.lineup || t.starters;
  console.log(" players type", Array.isArray(players), Array.isArray(players) ? players.length : typeof players);
  console.log(" sample", JSON.stringify(players)?.slice(0, 800));
}
console.log("\nfilters", lu?.availableFilters);

const brest = await fetch("https://www.fotmob.com/api/data/matchDetails?matchId=5215512", {
  headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
});
const bd = await brest.json();
const blu = bd?.content?.lineup;
console.log("\nBREST lineupType", blu?.lineupType, "source", blu?.source, "keys", Object.keys(blu || {}));
console.log("brest home players", JSON.stringify(blu?.homeTeam)?.slice(0, 400));
