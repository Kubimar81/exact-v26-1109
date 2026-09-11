import type { H2HMatch, MatchInput, PhasePayload } from "./types";
import { inSetPieceBounds, sparseBoxLeague, statsClubHit } from "./set-piece-fallback";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fotmobBound(kind: "corners" | "shotsOnTarget", n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (kind === "shotsOnTarget") return n >= 1 && n <= 10;
  return inSetPieceBounds("corners", n);
}

/** Superettan 168, OBOS/1. Divisjon 203 — ligi bez boxu w API-Football. */
export function fotmobLeagueId(league: string): number | null {
  const n = fold(league);
  if (/allsven/.test(n)) return 67;
  if (/superettan/.test(n)) return 168;
  if (/obos|(1 division.*(norway|norweg))|((norway|norweg).*1 division)|1 divisjon/.test(n)) return 203;
  if (/cymru|\bwalia\b|\bwales\b/.test(n)) return 116;
  if (/parva|efbet|bu[lł]garia|first professional/.test(n)) return 270;
  if (/uzbek/.test(n)) return 540;
  if (/urugw|uruguay/.test(n)) return 161;
  if (/(dania|denmark)/.test(n) && /superliga/.test(n)) return 46;
  if (/superliga denmark|superligaen/.test(n)) return 46;
  if (/bialorus|\bbelarus\b|vysshaya|vysheyshaya/.test(n)) return 263;
  if (/rumun|romania|liga i/.test(n)) return 158;
  if (/ekstraklasa/.test(n)) return 196;
  if (/ligat|izrael|\bisrael\b/.test(n)) return 63;
  if (/(argentyn|argentina)/.test(n) && /nacional/.test(n)) return 242;
  if (/(argentyn|argentina)|liga profesional/.test(n)) return 112;
  if (/saudyjsk|\bsaudi\b/.test(n)) return 536;
  if (/meistriliiga|premium liiga|\bestoni/.test(n)) return 248;
  if (/chile/.test(n) && /primera b|ascenso/.test(n)) return 9126;
  if (/(colombia|kolumb)/.test(n) && /primera b|betplay/.test(n)) return 9125;
  return null;
}

export function parseTopStats(details: unknown): { sotH: number; sotA: number; corH: number; corA: number } | null {
  const content = details && typeof details === "object" ? (details as { content?: unknown }).content : undefined;
  const stats = content && typeof content === "object" ? (content as { stats?: unknown }).stats : undefined;
  const all =
    stats && typeof stats === "object"
      ? ((stats as { Periods?: { All?: { stats?: unknown } } }).Periods?.All?.stats ?? null)
      : null;
  if (!Array.isArray(all)) return null;
  let sot: [number, number] | null = null;
  let cor: [number, number] | null = null;
  for (const block of all) {
    if (!block || typeof block !== "object") continue;
    const rows = (block as { stats?: unknown }).stats;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const title = String((row as { title?: unknown }).title || "").toLowerCase();
      const pair = (row as { stats?: unknown }).stats;
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const h = Number(pair[0]);
      const a = Number(pair[1]);
      if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
      if (title === "shots on target" || title === "shots on goal") sot = [h, a];
      if (title === "corners" || title === "corner kicks") cor = [h, a];
    }
  }
  if (!sot && !cor) return null;
  return {
    sotH: sot?.[0] ?? 0,
    sotA: sot?.[1] ?? 0,
    corH: cor?.[0] ?? 0,
    corA: cor?.[1] ?? 0,
  };
}

export function avgSide(xs: number[]): number {
  if (xs.length < 2) return 0;
  return Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100;
}

type SuggestTeam = { id: string; name: string; leagueId?: number; leagueName?: string };

function parseSuggestTeams(blob: unknown, wanted: string, leagueId: number | null): SuggestTeam | null {
  const root = blob && typeof blob === "object" ? (blob as Record<string, unknown>) : {};
  const groups = Array.isArray(root.teamSuggest) ? root.teamSuggest : [];
  const hits: SuggestTeam[] = [];
  for (const g of groups) {
    const opts = g && typeof g === "object" ? (g as { options?: unknown }).options : undefined;
    if (!Array.isArray(opts)) continue;
    for (const opt of opts) {
      if (!opt || typeof opt !== "object") continue;
      const text = String((opt as { text?: unknown }).text || "");
      const payload = (opt as { payload?: Record<string, unknown> }).payload || {};
      const id = String(payload.id || "");
      const name = text.split("|")[0] || String(payload.homeName || "");
      if (!id || !name) continue;
      if (/\b(2|ii|u1[5-9]|u2[0-3]|women|w)\b/i.test(name)) continue;
      hits.push({
        id,
        name,
        leagueId: Number(payload.leagueId) || undefined,
        leagueName: payload.leagueName ? String(payload.leagueName) : undefined,
      });
    }
  }
  const scored = hits
    .map((h) => {
      let s = statsClubHit(h.name, wanted) ? 80 : 0;
      if (fold(h.name) === fold(wanted)) s = 100;
      if (leagueId && h.leagueId === leagueId) s += 15;
      if (s < 80) return null;
      return { h, s };
    })
    .filter((x): x is { h: SuggestTeam; s: number } => Boolean(x))
    .sort((a, b) => b.s - a.s);
  return scored[0]?.h ?? null;
}

type FxRow = { id: string; homeId: string; awayId: string; homeName: string; awayName: string; finished: boolean };

function parseFixtures(leagueJson: unknown, teamId: string): FxRow[] {
  const all =
    leagueJson && typeof leagueJson === "object"
      ? ((leagueJson as { fixtures?: { allMatches?: unknown } }).fixtures?.allMatches ?? [])
      : [];
  if (!Array.isArray(all)) return [];
  const out: FxRow[] = [];
  for (const m of all) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const home = rec.home && typeof rec.home === "object" ? (rec.home as Record<string, unknown>) : {};
    const away = rec.away && typeof rec.away === "object" ? (rec.away as Record<string, unknown>) : {};
    const st = rec.status && typeof rec.status === "object" ? (rec.status as Record<string, unknown>) : {};
    const hid = String(home.id || "");
    const aid = String(away.id || "");
    if (hid !== teamId && aid !== teamId) continue;
    if (st.finished !== true) continue;
    out.push({
      id: String(rec.id || ""),
      homeId: hid,
      awayId: aid,
      homeName: String(home.name || ""),
      awayName: String(away.name || ""),
      finished: true,
    });
  }
  return out.slice(-6);
}

async function fotmobGet(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * SOT + rożne z FotMob (min. 2 mecze). Nie rusza goli, formy, kartek, λ.
 */
export async function fetchFotmobSetPieces(
  input: MatchInput,
  base: PhasePayload,
): Promise<{ facts: Record<string, unknown>; filled: string[] } | null> {
  if (!sparseBoxLeague(input.league, input.home, input.away)) return null;
  const lid = fotmobLeagueId(input.league);
  const homeNeed = !(base.home.shotsOnTarget > 0) || !(base.home.corners > 0);
  const awayNeed = !(base.away.shotsOnTarget > 0) || !(base.away.corners > 0);
  if (!homeNeed && !awayNeed) return null;

  const q = async (name: string) => {
    const terms = [name];
    const n = fold(name);
    if (/andijan/.test(n)) terms.push("Andijon");
    if (/torque/.test(n)) terms.push("Atletico Torque", "Montevideo City");
    if (/penarol/.test(n)) terms.push("Penarol");
    let hit: SuggestTeam | null = null;
    for (const term of terms) {
      const blob = await fotmobGet(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(term)}`);
      hit = blob ? parseSuggestTeams(blob, name, lid) : null;
      if (hit) break;
    }
    return hit;
  };
  const [homeT, awayT] = await Promise.all([homeNeed ? q(input.home) : Promise.resolve(null), awayNeed ? q(input.away) : Promise.resolve(null)]);
  const leagueNo = lid || homeT?.leagueId || awayT?.leagueId;
  if (!leagueNo) return null;
  const leagueJson = await fotmobGet(`https://www.fotmob.com/api/data/leagues?id=${leagueNo}`);
  if (!leagueJson) return null;

  async function sideAvg(team: SuggestTeam | null): Promise<{ sot: number; cor: number }> {
    if (!team) return { sot: 0, cor: 0 };
    const rows = parseFixtures(leagueJson, team.id);
    const chunk = rows.slice(-4);
    const sots: number[] = [];
    const cors: number[] = [];
    const details = await Promise.all(chunk.map((r) => fotmobGet(`https://www.fotmob.com/api/data/matchDetails?matchId=${r.id}`)));
    for (let i = 0; i < chunk.length; i++) {
      const box = parseTopStats(details[i]);
      if (!box) continue;
      const home = chunk[i].homeId === team.id;
      const sot = home ? box.sotH : box.sotA;
      const cor = home ? box.corH : box.corA;
      if (sot > 0) sots.push(sot);
      if (cor > 0) cors.push(cor);
    }
    return { sot: avgSide(sots), cor: avgSide(cors) };
  }

  const [hAvg, aAvg] = await Promise.all([sideAvg(homeT), sideAvg(awayT)]);
  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  const filled: string[] = [];
  if (!(base.home.corners > 0) && fotmobBound("corners", hAvg.cor)) home.corners = hAvg.cor;
  if (!(base.away.corners > 0) && fotmobBound("corners", aAvg.cor)) away.corners = aAvg.cor;
  if (!(base.home.shotsOnTarget > 0) && fotmobBound("shotsOnTarget", hAvg.sot)) home.shotsOnTarget = hAvg.sot;
  if (!(base.away.shotsOnTarget > 0) && fotmobBound("shotsOnTarget", aAvg.sot)) away.shotsOnTarget = aAvg.sot;
  if (home.corners || away.corners) filled.push("corners");
  if (home.shotsOnTarget || away.shotsOnTarget) filled.push("shotsOnTarget");
  if (!filled.length) return null;
  return {
    facts: {
      sources: ["https://www.fotmob.com/"],
      home,
      away,
    },
    filled,
  };
}

const SCORE_PAIR = /(\d+)\s*[-:]\s*(\d+)/;

export function parseFotmobH2hMatches(blob: unknown): H2HMatch[] {
  const matches =
    blob && typeof blob === "object"
      ? ((blob as { content?: { h2h?: { matches?: unknown } } }).content?.h2h?.matches ?? [])
      : [];
  if (!Array.isArray(matches)) return [];
  const out: H2HMatch[] = [];
  for (const m of matches) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const st = rec.status && typeof rec.status === "object" ? (rec.status as Record<string, unknown>) : {};
    if (st.finished !== true) continue;
    const sm = String(st.scoreStr || "").match(SCORE_PAIR);
    if (!sm) continue;
    const home = rec.home && typeof rec.home === "object" ? String((rec.home as { name?: string }).name || "") : "";
    const away = rec.away && typeof rec.away === "object" ? String((rec.away as { name?: string }).name || "") : "";
    const lg = rec.league && typeof rec.league === "object" ? String((rec.league as { name?: string }).name || "") : "";
    const time = rec.time && typeof rec.time === "object" ? String((rec.time as { utcTime?: string }).utcTime || "") : "";
    out.push({ date: time.slice(0, 10), competition: lg, home, away, score: `${sm[1]}:${sm[2]}` });
  }
  return out;
}

export function mergeH2h(base: H2HMatch[], extra: H2HMatch[]): H2HMatch[] {
  const key = (m: H2HMatch) => `${m.date}|${m.score}|${fold(m.home)}|${fold(m.away)}`;
  const seen = new Set(base.map(key));
  const out = [...base];
  for (const m of extra) {
    if (!m.date || !m.score) continue;
    const k = key(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10);
}

function h2hFromLeagueFixtures(leagueJson: unknown, homeId: string, awayId: string, competition: string): H2HMatch[] {
  const ids = new Set([homeId, awayId]);
  const all =
    leagueJson && typeof leagueJson === "object"
      ? ((leagueJson as { fixtures?: { allMatches?: unknown } }).fixtures?.allMatches ?? [])
      : [];
  if (!Array.isArray(all)) return [];
  const out: H2HMatch[] = [];
  for (const m of all) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const home = rec.home && typeof rec.home === "object" ? (rec.home as Record<string, unknown>) : {};
    const away = rec.away && typeof rec.away === "object" ? (rec.away as Record<string, unknown>) : {};
    const st = rec.status && typeof rec.status === "object" ? (rec.status as Record<string, unknown>) : {};
    const hid = String(home.id || "");
    const aid = String(away.id || "");
    if (!ids.has(hid) || !ids.has(aid) || hid === aid) continue;
    if (st.finished !== true) continue;
    const sm = String(st.scoreStr || "").match(SCORE_PAIR);
    if (!sm) continue;
    const utc = String(st.utcTime || "");
    if (!utc) continue;
    out.push({
      date: utc.slice(0, 10),
      competition,
      home: String(home.name || ""),
      away: String(away.name || ""),
      score: `${sm[1]}:${sm[2]}`,
    });
  }
  return out;
}

/** H2H z FotMob (karta + sezony ligi). Nie zgaduje. */
export async function fetchFotmobH2h(input: MatchInput): Promise<H2HMatch[]> {
  if (!fotmobLeagueId(input.league)) return [];
  const lid = fotmobLeagueId(input.league);
  const [hs, as] = await Promise.all([
    fotmobGet(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(input.home)}`),
    fotmobGet(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(input.away)}`),
  ]);
  const homeT = hs ? parseSuggestTeams(hs, input.home, lid) : null;
  const awayT = as ? parseSuggestTeams(as, input.away, lid) : null;
  if (!homeT || !awayT) return [];
  const leagueNo = lid || homeT.leagueId || awayT.leagueId;
  if (!leagueNo) return [];
  const current = await fotmobGet(`https://www.fotmob.com/api/data/leagues?id=${leagueNo}`);
  if (!current) return [];
  const name =
    current && typeof current === "object"
      ? String((current as { details?: { name?: string } }).details?.name || input.league)
      : input.league;
  const seasons = Array.isArray((current as { allAvailableSeasons?: unknown }).allAvailableSeasons)
    ? ((current as { allAvailableSeasons: string[] }).allAvailableSeasons as string[])
    : [];
  const extraIds = seasons.slice(1, 5);
  const extraJson = await Promise.all(
    extraIds.map((s) => fotmobGet(`https://www.fotmob.com/api/data/leagues?id=${leagueNo}&season=${encodeURIComponent(s)}`)),
  );
  let out = h2hFromLeagueFixtures(current, homeT.id, awayT.id, name);
  for (const j of extraJson) out = out.concat(h2hFromLeagueFixtures(j, homeT.id, awayT.id, name));

  const ft = out.filter((m) => m.score);
  const matchId = (() => {
    const all =
      current && typeof current === "object"
        ? ((current as { fixtures?: { allMatches?: { id?: string; home?: { id?: string }; away?: { id?: string }; status?: { finished?: boolean } }[] } }).fixtures
            ?.allMatches ?? [])
        : [];
    const ids = new Set([homeT.id, awayT.id]);
    const hit = all.find((m) => ids.has(String(m.home?.id || "")) && ids.has(String(m.away?.id || "")) && m.id);
    return hit?.id;
  })();
  if (matchId) {
    const details = await fotmobGet(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`);
    out = mergeH2h(out, parseFotmobH2hMatches(details));
  }
  return mergeH2h([], out);
}

function fotmobPos(id: unknown, label: string, usual?: unknown): string {
  const u = Number(usual);
  if (u === 0) return "G";
  if (u === 1) return "D";
  if (u === 2) return "M";
  if (u === 3) return "F";
  const n = Number(id);
  if (Number.isFinite(n)) {
    if (n === 0 || n === 11) return "G";
    if (n <= 4 || (n >= 30 && n <= 34)) return "D";
    if (n <= 8 || (n >= 35 && n <= 39)) return "M";
    return "F";
  }
  const s = label.toLowerCase();
  if (/keeper|gk|^g$/.test(s)) return "G";
  if (/def|^d$|cb|lb|rb|wb/.test(s)) return "D";
  if (/mid|^m$|cm|dm|am/.test(s)) return "M";
  if (/att|st|fw|^f$|wing/.test(s)) return "F";
  return "M";
}

export function xiFromFotmobSide(side: unknown): { name: string; pos: string }[] {
  const out: { name: string; pos: string }[] = [];
  const seen = new Set<string>();
  const take = (node: unknown) => {
    if (!node || out.length >= 11) return;
    if (Array.isArray(node)) {
      for (const x of node) take(x);
      return;
    }
    if (typeof node !== "object") return;
    const r = node as Record<string, unknown>;
    if (r.lineup || r.players || r.starters || r.homeTeam || r.awayTeam) {
      if (r.lineup) take(r.lineup);
      if (r.players) take(r.players);
      if (r.starters) take(r.starters);
      if (r.homeTeam) take(r.homeTeam);
      if (r.awayTeam) take(r.awayTeam);
      return;
    }
    const name = String(r.name || r.fullName || r.playerName || "").trim();
    if (name.length < 2 || seen.has(name)) return;
    const pid = r.positionId ?? r.usualPlayingPositionId;
    const lab =
      r.localizedPosition && typeof r.localizedPosition === "object"
        ? String((r.localizedPosition as { label?: string }).label || "")
        : String(r.position || r.role || "");
    seen.add(name);
    out.push({ name, pos: fotmobPos(pid, lab, r.usualPlayingPositionId) });
  };
  take(side);
  return out;
}

function fotmobSearchTerms(name: string): string[] {
  const n = fold(name);
  const terms = [name];
  if (/\baik\b/.test(n)) terms.push("AIK");
  if (/djurg/.test(n)) terms.push("Djurgården");
  if (/nordsj/.test(n)) terms.push("Nordsjælland", "Nordsjaelland");
  if (/midtjyll/.test(n)) terms.push("FC Midtjylland");
  if (/(dinamo|dynamo).*brest|brest.*(dinamo|dynamo)/.test(n)) terms.push("Dynamo Brest", "Dinamo Brest");
  if (/\bbate\b/.test(n)) terms.push("BATE");
  if (/craiova/.test(n)) terms.push("Universitatea Craiova", "CS U Craiova", "U Craiova");
  if (/\bu cluj\b|universitatea cluj/.test(n)) terms.push("U Cluj", "Universitatea Cluj", "FC Universitatea Cluj");
  if (/malmo|malmö/.test(n)) terms.push("Malmö FF", "Malmo FF");
  if (/narva|trans narva/.test(n)) terms.push("Narva Trans", "JK Narva Trans");
  if (/\bkalju\b/.test(n)) terms.push("Nõmme JK Kalju", "Kalju");
  if (/nomme united|nomme utd/.test(n)) terms.push("Nõmme United", "Nomme Utd");
  return [...new Set(terms)];
}

function matchIdFromSuggest(blob: unknown, home: string, away: string): string | null {
  const root = blob && typeof blob === "object" ? (blob as { matchSuggest?: unknown }) : null;
  const groups = Array.isArray(root?.matchSuggest) ? root.matchSuggest : [];
  for (const g of groups) {
    const opts = g && typeof g === "object" ? (g as { options?: unknown }).options : undefined;
    if (!Array.isArray(opts)) continue;
    for (const opt of opts) {
      if (!opt || typeof opt !== "object") continue;
      const p = ((opt as { payload?: Record<string, unknown> }).payload || {}) as Record<string, unknown>;
      const hn = String(p.homeName || "");
      const an = String(p.awayName || "");
      const id = p.id != null ? String(p.id) : "";
      if (!id) continue;
      const pair =
        (statsClubHit(hn, home) && statsClubHit(an, away)) ||
        (statsClubHit(hn, away) && statsClubHit(an, home)) ||
        (fold(hn).includes(fold(home).split(" ")[0] || "___") && fold(an).includes(fold(away).split(" ")[0] || "___"));
      if (pair) return id;
    }
  }
  return null;
}

export type FotmobLineupKind = "official" | "predicted" | "last" | "none";

/** XI z FotMob, gdy API-Football nie oddaje lineups. lastStarting11 = poprzedni mecz, nie bierzemy. */
export async function fetchFotmobLineups(input: {
  home: string;
  away: string;
  league: string;
}): Promise<{ home: { name: string; pos: string }[]; away: { name: string; pos: string }[]; kind: FotmobLineupKind } | null> {
  const lid = fotmobLeagueId(input.league);
  const homeTerms = fotmobSearchTerms(input.home);
  const awayTerms = fotmobSearchTerms(input.away);
  const blobs = await Promise.all(
    [...homeTerms, ...awayTerms].slice(0, 6).map((t) =>
      fotmobGet(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(t)}`),
    ),
  );
  let matchId: string | null = null;
  for (const b of blobs) {
    matchId = matchIdFromSuggest(b, input.home, input.away);
    if (matchId) break;
  }
  if (!matchId) {
    const homeT = blobs.map((b) => (b ? parseSuggestTeams(b, input.home, lid) : null)).find(Boolean) || null;
    const awayT = blobs.map((b) => (b ? parseSuggestTeams(b, input.away, lid) : null)).find(Boolean) || null;
    if (homeT && awayT) {
      const leagueNo = lid || homeT.leagueId || awayT.leagueId;
      if (leagueNo) {
        const leagueJson = await fotmobGet(`https://www.fotmob.com/api/data/leagues?id=${leagueNo}`);
        const all =
          leagueJson && typeof leagueJson === "object"
            ? ((leagueJson as { fixtures?: { allMatches?: { id?: string; home?: { id?: string }; away?: { id?: string } }[] } }).fixtures
                ?.allMatches ?? [])
            : [];
        const ids = new Set([homeT.id, awayT.id]);
        const hit = all.find((m) => ids.has(String(m.home?.id || "")) && ids.has(String(m.away?.id || "")) && m.id);
        matchId = hit?.id ? String(hit.id) : null;
      }
    }
  }
  if (!matchId) return null;
  const details = await fotmobGet(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`);
  const content = details && typeof details === "object" ? (details as { content?: { lineup?: unknown } }).content : undefined;
  const pack = content?.lineup;
  if (!pack || typeof pack !== "object") return null;
  const rec = pack as {
    lineupType?: string;
    source?: string;
    lineup?: unknown[];
    homeTeam?: unknown;
    awayTeam?: unknown;
  };
  const kindRaw = String(rec.lineupType || rec.source || "").toLowerCase();
  let kind: FotmobLineupKind = "official";
  if (/laststarting|last.?start/.test(kindRaw)) kind = "last";
  else if (/predict/.test(kindRaw)) kind = "predicted";
  if (kind === "last") return { home: [], away: [], kind };

  let homeXi: { name: string; pos: string }[] = [];
  let awayXi: { name: string; pos: string }[] = [];
  if (rec.homeTeam || rec.awayTeam) {
    homeXi = xiFromFotmobSide(rec.homeTeam);
    awayXi = xiFromFotmobSide(rec.awayTeam);
  } else if (Array.isArray(rec.lineup) && rec.lineup.length >= 2) {
    homeXi = xiFromFotmobSide(rec.lineup[0]);
    awayXi = xiFromFotmobSide(rec.lineup[1]);
  }
  if (homeXi.length < 8 || awayXi.length < 8 || homeXi.length + awayXi.length < 19) {
    return { home: homeXi, away: awayXi, kind: "none" };
  }
  return { home: homeXi.slice(0, 11), away: awayXi.slice(0, 11), kind };
}

function aliasFolds(s: string): string[] {
  const f = fold(s);
  if (!f) return [];
  const extra = new Set<string>([f]);
  if (/riga fs/.test(f) || f === "rfs") {
    extra.add("rfs");
    extra.add("riga fs");
  }
  extra.add(f.replace(/\b(ba|rs|sc|fc|ff|fk|if|bk|cf|af|cd|de|sa)\b/g, " ").replace(/\s+/g, " ").trim());
  return [...extra].filter(Boolean);
}

export function fotmobClubHit(a: string, b: string): boolean {
  const aa = aliasFolds(a);
  const bb = aliasFolds(b);
  for (const x of aa) {
    for (const y of bb) {
      if (x === y || x.includes(y) || y.includes(x)) return true;
      const wa = x.split(" ").filter((w) => w.length >= 4);
      if (wa.some((w) => y.includes(w))) return true;
    }
  }
  return false;
}

function tokenHit(a: string, b: string): boolean {
  return fotmobClubHit(a, b);
}

function ymdUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function pairFromStats(period: unknown, title: string): { h: number; a: number } | null {
  const stats = period && typeof period === "object" ? (period as { stats?: unknown }).stats : null;
  if (!Array.isArray(stats)) return null;
  const want = title.toLowerCase();
  for (const block of stats) {
    const rows = block && typeof block === "object" ? (block as { stats?: unknown }).stats : null;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const t = String((row as { title?: unknown }).title || "").toLowerCase();
      const pair = (row as { stats?: unknown }).stats;
      if (t !== want || !Array.isArray(pair) || pair.length < 2) continue;
      const h = Number(pair[0]);
      const a = Number(pair[1]);
      if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
      return { h, a };
    }
  }
  return null;
}

/** FT + box z FotMob, gdy API-Football pada (limit / brak ligi). */
export async function fetchFotmobFt(input: {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
}): Promise<{
  ft: string;
  status: string;
  fixtureId: number;
  kickoff?: string;
  events: { red: boolean; og: boolean; late90: boolean; squad: boolean; details: string[] };
  sources: string[];
  box?: { corners: number | null; yellow: number | null; red: number | null; sot: number | null };
  ht?: string;
} | { error: string }> {
  const kick = Date.parse(input.kickoff || "");
  let matchId = "";
  let kickIso = input.kickoff || "";

  const consider = (id: string, hn: string, an: string, md: string) => {
    if (matchId || !id || !hn || !an) return;
    if (!tokenHit(hn, input.home) || !tokenHit(an, input.away)) return;
    const dt = Date.parse(md);
    if (Number.isFinite(kick) && Number.isFinite(dt) && Math.abs(dt - kick) >= 36 * 3600_000) return;
    matchId = id;
    if (md && Number.isFinite(dt)) kickIso = new Date(dt).toISOString();
  };

  const days = Number.isFinite(kick)
    ? [...new Set([ymdUtc(kick - 86400000), ymdUtc(kick), ymdUtc(kick + 86400000)])]
    : [];
  for (const day of days) {
    if (matchId) break;
    const page = await fotmobGet(`https://www.fotmob.com/api/data/matches?date=${day}`);
    const leagues = page && typeof page === "object" ? (page as { leagues?: unknown[] }).leagues : null;
    for (const lg of Array.isArray(leagues) ? leagues : []) {
      const matches = lg && typeof lg === "object" ? (lg as { matches?: unknown[] }).matches : null;
      for (const m0 of Array.isArray(matches) ? matches : []) {
        if (!m0 || typeof m0 !== "object") continue;
        const rec = m0 as {
          id?: number | string;
          time?: string;
          status?: { utcTime?: string };
          home?: { name?: string; longName?: string };
          away?: { name?: string; longName?: string };
        };
        consider(
          String(rec.id || ""),
          rec.home?.longName || rec.home?.name || "",
          rec.away?.longName || rec.away?.name || "",
          rec.status?.utcTime || rec.time || "",
        );
      }
    }
  }

  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 8 || matchId) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const r = node as Record<string, unknown>;
    const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : r;
    consider(
      String(payload.id || r.id || ""),
      String(payload.homeName || r.homeName || ""),
      String(payload.awayName || r.awayName || ""),
      String(payload.matchDate || r.matchDate || payload.utcTime || ""),
    );
    for (const v of Object.values(r)) walk(v, depth + 1);
  };

  if (!matchId) {
    const terms = [...new Set([input.home, input.away, input.home.replace(/\s+\S+$/, ""), input.away.replace(/\s+\S+$/, "")])].filter(
      (t) => t && t.length >= 3,
    );
    for (const term of terms) {
      if (matchId) break;
      const blob = await fotmobGet(`https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(term)}`);
      walk(blob);
    }
  }
  if (!matchId) return { error: "FotMob: nie znaleziono meczu." };
  const md = await fotmobGet(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`);
  if (!md || typeof md !== "object") return { error: "FotMob: brak szczegółów." };
  const header = (md as { header?: Record<string, unknown> }).header || {};
  const status = (header.status && typeof header.status === "object" ? header.status : {}) as Record<string, unknown>;
  const scoreStr = String(status.scoreStr || "");
  const m = scoreStr.match(/(\d+)\s*[-:]\s*(\d+)/);
  const ft = m ? `${Number(m[1])}:${Number(m[2])}` : "";
  const finished = Boolean(status.finished);
  const short = finished ? "FT" : String((status.liveTime as { short?: string } | undefined)?.short || "NS");
  const periods = ((md as { content?: { stats?: { Periods?: Record<string, unknown> } } }).content?.stats?.Periods) || {};
  const all = periods.All;
  const first = periods.FirstHalf;
  const cor = pairFromStats(all, "corners") || pairFromStats(all, "corner kicks");
  const sot = pairFromStats(all, "shots on target") || pairFromStats(all, "shots on goal");
  const yel = pairFromStats(all, "yellow cards");
  const redC = pairFromStats(all, "red cards");
  const evRaw = (md as { content?: { matchFacts?: { events?: { events?: unknown[] } } } }).content?.matchFacts?.events?.events;
  const details: string[] = [];
  let red = false;
  let og = false;
  let late90 = false;
  for (const e of Array.isArray(evRaw) ? evRaw : []) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const type = String(rec.type || "");
    const min = Number(rec.time || 0);
    const name = String((rec.player as { name?: string } | undefined)?.name || rec.nameStr || "");
    if (type === "Card" && String(rec.card || "") === "Red") {
      red = true;
      details.push(`czerwona ${min}' ${name}`);
    }
    if (type === "Goal" && /own/i.test(String(rec.goalDescription || rec.desc || ""))) {
      og = true;
      details.push(`samobój ${min}' ${name}`);
    }
    if (type === "Goal" && min >= 90) {
      late90 = true;
      details.push(`gol 90+ ${min}' ${name}`);
    }
  }
  const htPair = pairFromStats(first, "goals") ;
  const htScore = (md as { header?: { teams?: { score?: number }[] } }).header?.teams;
  // HT from first-half goals if present in events
  let h1 = 0;
  let a1 = 0;
  let hasHt = false;
  for (const e of Array.isArray(evRaw) ? evRaw : []) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    if (String(rec.type || "") !== "Goal") continue;
    const min = Number(rec.time || 0);
    if (min >= 46) continue;
    hasHt = true;
    if (rec.isHome) h1++;
    else a1++;
  }
  const ht = hasHt ? `${h1}:${a1}` : "";
  void htPair;
  void htScore;
  return {
    ft,
    status: finished ? "FT" : short || "NS",
    fixtureId: Number(matchId) || 0,
    kickoff: kickIso,
    events: { red, og, late90, squad: false, details },
    sources: [`fotmob matchDetails ${matchId}`],
    box: {
      corners: cor ? cor.h + cor.a : null,
      yellow: yel ? yel.h + yel.a : null,
      red: redC ? redC.h + redC.a : null,
      sot: sot ? sot.h + sot.a : null,
    },
    ht,
  };
}

