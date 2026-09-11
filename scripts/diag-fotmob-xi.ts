async function get(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  console.log("GET", url, res.status);
  if (!res.ok) return null;
  return res.json();
}

const hs = await get("https://apigw.fotmob.com/searchapi/suggest?term=" + encodeURIComponent("Malmo FF"));
const as = await get("https://apigw.fotmob.com/searchapi/suggest?term=" + encodeURIComponent("AIK Stockholm"));
const teamsH = hs?.teamSuggest?.[0]?.options || hs?.suggestions || hs?.teams || Object.keys(hs || {});
console.log("home suggest keys", hs && typeof hs === "object" ? Object.keys(hs) : hs);
console.log("home sample", JSON.stringify(hs).slice(0, 600));
console.log("away sample", JSON.stringify(as).slice(0, 400));

const league = await get("https://www.fotmob.com/api/data/leagues?id=67");
console.log("league keys", league && typeof league === "object" ? Object.keys(league) : league);
const fx = league?.fixtures || league?.matches || league?.overview;
console.log("fx keys", fx && typeof fx === "object" ? Object.keys(fx) : typeof fx);
const all = league?.fixtures?.allMatches || league?.matches?.allMatches || [];
console.log("allMatches", Array.isArray(all) ? all.length : all);
if (Array.isArray(all) && all.length) {
  const today = all.filter((m: { status?: { utcTime?: string }; home?: { name?: string } }) => String(m.status?.utcTime || m.utcTime || "").startsWith("2026-09-07"));
  console.log("today n", today.length, today.slice(0, 4).map((m: { id?: string; home?: { name?: string }; away?: { name?: string } }) => `${m.id} ${m.home?.name} ${m.away?.name}`));
  const malmo = all.filter((m: { home?: { name?: string }; away?: { name?: string } }) =>
    /malmo|aik/i.test(`${m.home?.name} ${m.away?.name}`),
  );
  console.log("malmo rows", malmo.slice(0, 5).map((m: { id?: string; home?: { name?: string }; away?: { name?: string }; status?: unknown }) => ({ id: m.id, h: m.home?.name, a: m.away?.name, st: m.status })));
}
