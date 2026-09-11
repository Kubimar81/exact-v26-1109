const KEY = process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY || "8d78583ab9c0e5b89796738b65932746";
const BASE = "https://v3.football.api-sports.io";

async function af(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { "x-apisports-key": KEY } });
  const json = await res.json();
  return { status: res.status, errors: json.errors, results: json.results, n: Array.isArray(json.response) ? json.response.length : 0, sample: json.response };
}

const pairs = [
  { name: "Malmo-AIK", home: 375, away: 377 },
  { name: "Kalmar-Djurg", home: 374, away: 364 },
  { name: "Brest-BATE", home: 386, away: 388 },
  { name: "Midtjylland", home: 397, away: 398 },
];

for (const p of pairs) {
  const next = await af("/fixtures", { team: p.home, next: 5 });
  const fx = (next.sample || []).find((f: { teams?: { away?: { id?: number }; home?: { id?: number } } }) =>
    f.teams?.away?.id === p.away || f.teams?.home?.id === p.away,
  ) || (next.sample || [])[0];
  const fid = fx?.fixture?.id;
  console.log("\n==", p.name, "fx", fid, fx?.fixture?.date, fx?.teams?.home?.name, fx?.teams?.away?.name, "status", fx?.fixture?.status, "err", next.errors);
  if (!fid) continue;
  const lu = await af("/fixtures/lineups", { fixture: fid });
  console.log("lineups n", lu.n, "err", lu.errors, "keys", (lu.sample || []).map((r: Record<string, unknown>) => ({
    team: (r.team as { name?: string })?.name,
    start: Array.isArray(r.startXI) ? r.startXI.length : -1,
    start0: r.startXI?.[0] ? Object.keys(r.startXI[0]) : null,
    player0: r.startXI?.[0]?.player ? Object.keys(r.startXI[0].player) : null,
    extra: Object.keys(r).filter((k) => !["team", "startXI", "substitutes", "coach", "formation"].includes(k)),
  })));
  if (lu.n && lu.sample[0]?.startXI?.[0]) {
    console.log("first player", JSON.stringify(lu.sample[0].startXI[0]).slice(0, 300));
  }
}
