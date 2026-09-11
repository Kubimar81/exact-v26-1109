async function get(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (!res.ok) { console.log("fail", url, res.status); return null; }
  return res.json();
}

const details = await get("https://www.fotmob.com/api/data/matchDetails?matchId=5107592");
const content = details?.content || {};
console.log("content keys", Object.keys(content));
const lineup = content.lineup;
console.log("lineup type", typeof lineup, lineup && typeof lineup === "object" ? Object.keys(lineup) : lineup);
if (lineup) {
  const sides = lineup.lineup;
  console.log("sides n", Array.isArray(sides) ? sides.length : sides);
  if (Array.isArray(sides)) {
    for (const s of sides) {
      console.log("side keys", Object.keys(s || {}), "teamId", s.teamId, "players", Array.isArray(s.players), "lineup", Array.isArray(s.lineup));
      const p0 = s.players?.[0] || s.lineup?.[0];
      console.log("p0", JSON.stringify(p0)?.slice(0, 400));
    }
  }
}

for (const term of ["AIK", "Djurgarden IF", "Djurgården", "FC Midtjylland", "Nordsjaelland", "Dinamo Brest", "BATE"]) {
  const j = await get("https://apigw.fotmob.com/searchapi/suggest?term=" + encodeURIComponent(term));
  const teams = (j?.teamSuggest || []).flatMap((g: { options?: { text?: string; payload?: { id?: string; leagueId?: number } }[] }) =>
    (g.options || []).map((o) => `${o.text} lid=${o.payload?.leagueId} id=${o.payload?.id}`),
  );
  const matches = (j?.matchSuggest || []).flatMap((g: { options?: { text?: string; payload?: { id?: string; matchDate?: string } }[] }) =>
    (g.options || []).slice(0, 2).map((o) => `${o.text} ${o.payload?.matchDate} id=${o.payload?.id}`),
  );
  console.log("\nTERM", term, "teams", teams.slice(0, 3), "matches", matches.slice(0, 2));
}
