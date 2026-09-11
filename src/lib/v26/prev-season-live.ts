import { fetchAfLastSeasonVenue } from "./api-football";
import { statsClubHit } from "./set-piece-fallback";
import { attachPrevSeason } from "./prev-season";
import type { PrevSeasonFlags, PrevSeasonSplit, TeamBlock } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FS = "https://www.flashscore.com";

export type VenueSums = {
  playedHome: number;
  playedAway: number;
  gfHomeSum: number;
  gaHomeSum: number;
  gfAwaySum: number;
  gaAwaySum: number;
  xgHome?: number;
  xgaHome?: number;
  xgAway?: number;
  xgaAway?: number;
  source: string;
  url: string;
};

const LIVE_FLAGS: PrevSeasonFlags = {
  coachChanged: false,
  promoted: false,
  relegated: false,
  squadRebuild: false,
  newSigningsAttackDefense: 0,
};

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function nnum(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sumy H/A → średnie na mecz. Brak 4 liczb (playedH, playedA, gfH, gfA) → null. */
export function toSplit(raw: VenueSums | null | undefined): PrevSeasonSplit | null {
  if (!raw) return null;
  const ph = raw.playedHome;
  const pa = raw.playedAway;
  if (!(ph > 0 && pa > 0)) return null;
  if (!(raw.gfHomeSum >= 0) || !(raw.gfAwaySum >= 0)) return null;
  return {
    playedHome: ph,
    playedAway: pa,
    gfHome: round2(raw.gfHomeSum / ph),
    gaHome: round2((raw.gaHomeSum || 0) / ph),
    gfAway: round2(raw.gfAwaySum / pa),
    gaAway: round2((raw.gaAwaySum || 0) / pa),
    xgHome: raw.xgHome,
    xgaHome: raw.xgaHome,
    xgAway: raw.xgAway,
    xgaAway: raw.xgaAway,
  };
}

async function grab(url: string, extra: Record<string, string> = {}, ms = 12_000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*", ...extra },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function clubHit(found: string, wanted: string): boolean {
  if (statsClubHit(found, wanted)) return true;
  const a = fold(found).replace(/\s+/g, "");
  const b = fold(wanted).replace(/\s+/g, "");
  return a.length >= 5 && b.length >= 5 && (a === b || a.includes(b) || b.includes(a));
}

/** FBref squad Home/Away: MP + GF + GA. */
export function parseFBrefHomeAway(html: string): Omit<VenueSums, "source" | "url"> | null {
  const blob = html.replace(/\s+/g, " ");
  const row = (label: string) => {
    const m = blob.match(new RegExp(`${label}[^<]{0,40}?</th>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>`, "i"));
    if (m) return { mp: nnum(m[1]), gf: nnum(m[2]), ga: nnum(m[3]) };
    const m2 = blob.match(new RegExp(`${label}[^0-9]{0,80}(\\d{1,2})\\s+(\\d{1,3})\\s+(\\d{1,3})`, "i"));
    if (m2) return { mp: nnum(m2[1]), gf: nnum(m2[2]), ga: nnum(m2[3]) };
    return null;
  };
  const home = row("Home");
  const away = row("Away");
  if (!home || !away || !(home.mp > 0 && away.mp > 0)) return null;
  return {
    playedHome: home.mp,
    playedAway: away.mp,
    gfHomeSum: home.gf,
    gaHomeSum: home.ga,
    gfAwaySum: away.gf,
    gaAwaySum: away.ga,
  };
}

async function scrapeFBref(name: string): Promise<VenueSums | null> {
  const q = encodeURIComponent(name);
  const html = await grab(`https://fbref.com/en/search/search.fcgi?search=${q}`, { Referer: "https://fbref.com/" }, 4000);
  if (!html) return null;
  const links = [...html.matchAll(/href="(\/en\/squads\/[a-z0-9]+\/(?:\d{4}-\d{4}\/)?[^"]*Stats)"/gi)].map((m) => m[1]);
  const prev = links.find((u) => /\/20\d{2}-20\d{2}\//.test(u) && !/2026-2027/.test(u)) || links[0];
  if (!prev) return null;
  const page = await grab(`https://fbref.com${prev}`, { Referer: "https://fbref.com/" }, 4000);
  if (!page) return null;
  const parsed = parseFBrefHomeAway(page);
  if (!parsed) return null;
  return { ...parsed, source: "fbref", url: `https://fbref.com${prev}` };
}

type SsTeamStats = {
  statisticsItems?: { name?: string; home?: string; away?: string; value?: string }[];
};

export function parseSofascoreTeamStats(blob: unknown): Omit<VenueSums, "source" | "url"> | null {
  const items =
    blob && typeof blob === "object"
      ? ((blob as SsTeamStats).statisticsItems ??
          (blob as { statistics?: SsTeamStats }).statistics?.statisticsItems ??
          [])
      : [];
  if (!Array.isArray(items) || !items.length) return null;
  const find = (re: RegExp) => items.find((i) => re.test(String(i.name || "")));
  const matches = find(/matches played|games played|^appearances$/i);
  const goals = find(/^goals$/i);
  const conceded = find(/goals conceded|conceded/i);
  const split = (row: { home?: string; away?: string } | undefined) => ({
    h: nnum(row?.home),
    a: nnum(row?.away),
  });
  const mp = split(matches);
  const gf = split(goals);
  const ga = split(conceded);
  if (!(mp.h > 0 && mp.a > 0)) return null;
  return {
    playedHome: mp.h,
    playedAway: mp.a,
    gfHomeSum: gf.h,
    gaHomeSum: ga.h,
    gfAwaySum: gf.a,
    gaAwaySum: ga.a,
  };
}

async function scrapeSofascore(name: string): Promise<VenueSums | null> {
  const raw = await grab(`https://www.sofascore.com/api/v1/search/all?q=${encodeURIComponent(name)}`, {
    Accept: "application/json",
  }, 4000);
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const results = json && typeof json === "object" ? (json as { results?: { type?: string; entity?: { id?: number; name?: string } }[] }).results : [];
  const team = (results || []).find((r) => r.type === "team" && r.entity?.id && clubHit(r.entity.name || "", name));
  const id = team?.entity?.id;
  if (!id) return null;
  const seasonsRaw = await grab(`https://www.sofascore.com/api/v1/team/${id}/team-statistics/seasons`, {
    Accept: "application/json",
  });
  if (!seasonsRaw) return null;
  let seasons: { uniqueTournament?: { id?: number }; seasons?: { id?: number; year?: string }[] }[] = [];
  try {
    const parsed = JSON.parse(seasonsRaw) as { uniqueTournamentSeasons?: typeof seasons };
    seasons = parsed.uniqueTournamentSeasons || [];
  } catch {
    return null;
  }
  const ut = seasons[0];
  const season = (ut?.seasons || [])[1] || (ut?.seasons || [])[0];
  if (!ut?.uniqueTournament?.id || !season?.id) return null;
  const statsRaw = await grab(
    `https://www.sofascore.com/api/v1/team/${id}/unique-tournament/${ut.uniqueTournament.id}/season/${season.id}/statistics/overall`,
    { Accept: "application/json" },
  );
  if (!statsRaw) return null;
  let stats: unknown;
  try {
    stats = JSON.parse(statsRaw);
  } catch {
    return null;
  }
  const parsed = parseSofascoreTeamStats(stats);
  if (!parsed) return null;
  return { ...parsed, source: "sofascore", url: `https://www.sofascore.com/team/${id}` };
}

export function flashscoreLivePath(league: string): string | null {
  const n = fold(league);
  // Mizoram Premier League: brak sluga Flashscore. /premier league/ łapie EPL — nie wolno.
  if (/\bmizoram\b|lawngtlai|lawtngtlai/.test(n)) return null;
  const rows: [RegExp, string][] = [
    [/egipt|\begypt\b|\begyptian\b/, "/football/egypt/premier-league/"],
    [/\bnifl\b|northern ireland|irlandia polnoc/, "/football/northern-ireland/nifl-premiership/"],
    [/cymru|\bwalia\b|\bwales\b/, "/football/wales/cymru-premier/"],
    [/bu[lł]garia|\bbulgaria\b|\bparva\b|\befbet/, "/football/bulgaria/parva-liga/"],
    [/chorwacj|\bcroatia\b|\bhnl\b/, "/football/croatia/hnl/"],
    [/uganda/, "/football/uganda/premier-league/"],
    [/bosn|hercegowin|herzegovin|premijer|wwin/, "/football/bosnia-and-herzegovina/wwin-liga-bih/"],
    [/saudi.*(division|first)|first division.*saudi/, "/football/saudi-arabia/division-1/"],
    [/azerbejd|azerbaij|premyer/, "/football/azerbaijan/premier-league/"],
    [/calcutt|kolkata|\bcfl\b/, "/football/india/calcutta-premier-division/"],
    [/virsliga|[lł]otwa|\blatvia\b/, "/football/latvia/virsliga/"],
    [/ekstraklasa|poland|polska/, "/football/poland/ekstraklasa/"],
    [/kazachstan|kazakhstan/, "/football/kazakhstan/premier-league/"],
    [/superettan/, "/football/sweden/superettan/"],
    [/allsven/, "/football/sweden/allsvenskan/"],
    [/chile/, "/football/chile/primera-division/"],
    [/brasileir|\bbrazil\b|\bbrazyl/, "/football/brazil/serie-a/"],
    [/laliga|la liga/, "/football/spain/laliga/"],
    [/serie a/, "/football/italy/serie-a/"],
    [/bundesliga/, "/football/germany/bundesliga/"],
    [/ligue 1/, "/football/france/ligue-1/"],
    [/eredivisie|holand/, "/football/netherlands/eredivisie/"],
    [/premier league|\bepl\b/, "/football/england/premier-league/"],
  ];
  for (const [re, path] of rows) if (re.test(n)) return path;
  return null;
}

type FsScored = { home: string; away: string; hg: number; ag: number; finished: boolean };

export function parseFlashscoreScored(html: string): FsScored[] {
  const out: FsScored[] = [];
  const chunks = html.split(/¬~AA÷|~AA÷/);
  for (let i = 1; i < chunks.length; i++) {
    const ch = chunks[i];
    const get = (code: string) => {
      const m = ch.match(new RegExp(`(?:^|¬)${code}÷([^¬~]*)`));
      return m ? m[1] : "";
    };
    const home = get("AE") || get("FH");
    const away = get("AF") || get("FK");
    const hg = nnum(get("AG"));
    const ag = nnum(get("AH"));
    if (!home || !away) continue;
    out.push({ home, away, hg, ag, finished: get("AB") === "3" });
  }
  return out;
}

export function sumsFromFlashscore(events: FsScored[], wanted: string): Omit<VenueSums, "source" | "url"> | null {
  let ph = 0;
  let pa = 0;
  let gfh = 0;
  let gah = 0;
  let gfa = 0;
  let gaa = 0;
  for (const e of events) {
    if (!e.finished) continue;
    if (clubHit(e.home, wanted)) {
      ph++;
      gfh += e.hg;
      gah += e.ag;
    } else if (clubHit(e.away, wanted)) {
      pa++;
      gfa += e.ag;
      gaa += e.hg;
    }
  }
  if (!(ph > 0 && pa > 0)) return null;
  return { playedHome: ph, playedAway: pa, gfHomeSum: gfh, gaHomeSum: gah, gfAwaySum: gfa, gaAwaySum: gaa };
}

function datedArchivePaths(archiveHtml: string): string[] {
  const slugs = [...archiveHtml.matchAll(/\/football\/[^"'\\\s]+-\d{4}-\d{4}\//g)].map((m) => m[0]);
  const unique = [...new Set(slugs)];
  return unique
    .map((s) => {
      const m = s.match(/-(\d{4})-(\d{4})\/$/);
      return m ? { s, y: Number(m[1]) } : null;
    })
    .filter((x): x is { s: string; y: number } => Boolean(x))
    .sort((a, b) => b.y - a.y)
    .map((x) => x.s);
}

async function scrapeFlashscore(name: string, league: string): Promise<VenueSums | null> {
  const path = flashscoreLivePath(league);
  if (!path) return null;
  const archive = await grab(`${FS}${path}archive/`);
  if (!archive) return null;
  const dated = datedArchivePaths(archive);
  for (const prev of dated.slice(0, 3)) {
    const results = await grab(`${FS}${prev}results/`);
    if (!results) continue;
    const sums = sumsFromFlashscore(parseFlashscoreScored(results), name);
    if (!sums) continue;
    if (sums.playedHome + sums.playedAway < 8) continue;
    return { ...sums, source: "flashscore", url: `${FS}${prev}results/` };
  }
  return null;
}

/** FBref → Sofascore → Flashscore → API-Football. Brak 4 liczb → null. */
export async function scrapeLastSeasonVenue(name: string, league: string): Promise<VenueSums | null> {
  const job = (async () => {
    const [fb, ss] = await Promise.all([scrapeFBref(name), scrapeSofascore(name)]);
    if (fb && toSplit(fb)) return fb;
    if (ss && toSplit(ss)) return ss;
    const [fs, af] = await Promise.all([scrapeFlashscore(name, league), fetchAfLastSeasonVenue(name, league)]);
    if (fs && toSplit(fs)) return fs;
    if (!af) return null;
    const pack: VenueSums = { ...af, source: "api-football" };
    return toSplit(pack) ? pack : null;
  })();
  return await Promise.race([
    job,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 18_000)),
  ]);
}

export async function attachPrevSeasonLive(
  home: TeamBlock,
  away: TeamBlock,
  league?: string,
): Promise<{ home: TeamBlock; away: TeamBlock; log: string[] }> {
  const log: string[] = [];
  const dumped = attachPrevSeason(home, away, league);
  const glue = async (team: TeamBlock, ha: "H" | "A"): Promise<TeamBlock> => {
    if (team.prevSeason) {
      log.push(`25.19 dump ${team.name} ${ha} H ${team.prevSeason.gfHome} A ${team.prevSeason.gfAway}`);
      return { ...team, prevSource: team.prevSource || "dump" };
    }
    if (!league) {
      log.push(`25.19 BRAK prev ${team.name} (brak ligi)`);
      return team;
    }
    const raw = await scrapeLastSeasonVenue(team.name, league);
    const split = toSplit(raw);
    if (!split || !raw) {
      log.push(`25.19 BRAK prev ${team.name} liga=${league}`);
      return team;
    }
    log.push(`25.19 LIVE ${team.name} ${ha} H ${split.gfHome} A ${split.gfAway} (${raw.source}) ${raw.url}`);
    return { ...team, prevSeason: split, prevFlags: LIVE_FLAGS, prevSource: `LIVE ${raw.source}` };
  };
  const [h, a] = await Promise.all([glue(dumped.home, "H"), glue(dumped.away, "A")]);
  return { home: h, away: a, log };
}
