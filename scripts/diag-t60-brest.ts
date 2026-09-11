const KEY = process.env.API_FOOTBALL_KEY || "8d78583ab9c0e5b89796738b65932746";
async function af(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`https://v3.football.api-sports.io${path}?${qs}`, { headers: { "x-apisports-key": KEY } });
  return (await res.json()).response;
}

const lu = await af("/fixtures/lineups", { fixture: 1525969 });
for (const r of lu || []) {
  const xi = (r.startXI || []).map((x: { player?: { name?: string; pos?: string } }) => `${x.player?.pos} ${x.player?.name}`);
  const sub = (r.substitutes || []).slice(0, 6).map((x: { player?: { name?: string; pos?: string } }) => `${x.player?.pos} ${x.player?.name}`);
  console.log(r.team?.name, "XI", xi.length, xi.join(" | "));
  console.log("  SUB", sub.join(" | "));
}

for (const id of ["5107592", "5107596", "5739505", "5215512"]) {
  const d = await fetch("https://www.fotmob.com/api/data/matchDetails?matchId=" + id, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  }).then((r) => r.json());
  const lu2 = d?.content?.lineup;
  console.log("fm", id, "type", lu2?.lineupType, "src", lu2?.source, "homeStarters", lu2?.homeTeam?.starters?.length, lu2?.homeTeam?.name);
}
