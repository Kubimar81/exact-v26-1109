import type { MatchInput, PhasePayload } from "./types";
import { resolveLeague } from "./leagues";
import { inSetPieceBounds, sparseBoxLeague, statsClubHit } from "./set-piece-fallback";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FSIGN_FALLBACK = "SW9D1eZo";
const BASE = "https://www.flashscore.com";
const FEED = "https://2.flashscore.ninja/2/x/feed";

function avgSide(xs: number[]): number {
  if (xs.length < 2) return 0;
  return Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100;
}

/** Ligi bez boxu w API-Football i bez FotMob — Flashscore ma Top stats (SOT + rożne). */
export function flashscoreLeaguePath(league: string, home?: string, away?: string): string | null {
  const names = [league];
  if (home && away) names.push(resolveLeague(home, away, league));
  for (const l of names) {
    const n = l
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    if (/calcutt|kolkata|\bcfl\b/.test(n)) return "/football/india/calcutta-premier-division/";
    if (/cymru|\bwalia\b|\bwales\b/.test(n)) return "/football/wales/cymru-premier/";
    if (/uganda/.test(n)) return "/football/uganda/premier-league/";
    if (/izrael|\bisrael\b|ligat/.test(n)) return "/football/israel/winner-league/";
    if (/bosn|hercegowin|herzegovin|premijer|wwin/.test(n)) return "/football/bosnia-and-herzegovina/wwin-liga-bih/";
    if (/saudi/.test(n) && /division|first/.test(n)) return "/football/saudi-arabia/division-1/";
    if (/(kazach|kazakh)/.test(n) && /first|pervaya/.test(n)) return "/football/kazakhstan/first-division/";
    if (/(kazach|kazakh)/.test(n)) return "/football/kazakhstan/premier-league/";
    if (/parva|efbet|bu[lł]garia/.test(n)) return "/football/bulgaria/parva-liga/";
    if (/azerbejd|azerbaij|premyer/.test(n)) return "/football/azerbaijan/premier-league/";
    if (/uzbek/.test(n)) return "/football/uzbekistan/super-league/";
    if (/urugw|uruguay/.test(n)) return "/football/uruguay/liga-auf-uruguaya/";
    if (/ykkonen|ykkos/.test(n)) return "/football/finland/ykkosliiga/";
    if (/\bfnl\b/.test(n) || ((/czech|czechy|czechia/.test(n)) && /2\.?\s*(liga|league)/.test(n))) {
      return "/football/czech-republic/fnl/";
    }
    if (/challenge league/.test(n)) return "/football/switzerland/challenge-league/";
    if (/\bi liga\b|fortuna 1 liga/.test(n) && !/rumun|romania/.test(n)) return "/football/poland/division-1/";
    if (/v[- ]?league|wietnam|\bvietnam\b/.test(n)) return "/football/vietnam/v-league-1/";
    if (/thai league|tajland|\bthailand\b/.test(n)) return "/football/thailand/thai-league/";
    if (/singapur|\bsingapore\b/.test(n)) return "/football/singapore/premier-league/";
    if (/meistriliiga|premium liiga|\bestoni/.test(n)) return "/football/estonia/meistriliiga/";
    if (/chile.*primera b|primera b.*chile|chile.*ascenso/.test(n)) return "/football/chile/liga-de-ascenso/";
    if (/(colombia|kolumb).*primera b|primera b.*(colombia|kolumb)|torneo betplay/.test(n)) return "/football/colombia/primera-b/";
  }
  return null;
}

export type FsEvent = {
  id: string;
  home: string;
  away: string;
  finished: boolean;
};

export function parseFlashscoreEvents(html: string): FsEvent[] {
  const out: FsEvent[] = [];
  const seen = new Set<string>();
  const chunks = html.split(/¬~AA÷|~AA÷/);
  for (let i = 1; i < chunks.length; i++) {
    const ch = chunks[i];
    const id = (ch.split("¬")[0] || "").trim();
    if (!/^[A-Za-z0-9]{8}$/.test(id) || seen.has(id)) continue;
    const get = (code: string) => {
      const m = ch.match(new RegExp(`(?:^|¬)${code}÷([^¬~]*)`));
      return m ? m[1] : "";
    };
    const home = get("AE") || get("FH");
    const away = get("AF") || get("FK");
    if (!home || !away) continue;
    seen.add(id);
    out.push({
      id,
      home,
      away,
      finished: get("AB") === "3",
    });
  }
  return out;
}

export function parseFlashscoreMatchStats(raw: string): {
  sotH: number;
  sotA: number;
  corH: number;
  corA: number;
  yelH: number;
  yelA: number;
  redH: number;
  redA: number;
  hasSot: boolean;
  hasCor: boolean;
  hasCards: boolean;
} | null {
  const m = raw.match(/SE÷Match¬(.*?)(?:¬~SE÷|$)/s);
  const block = m ? m[1] : "";
  if (!block) return null;
  const map = new Map<string, [string, string]>();
  for (const part of block.split("¬~")) {
    const lab = part.match(/SG÷([^¬]*)/);
    const h = part.match(/SH÷([^¬]*)/);
    const a = part.match(/SI÷([^¬]*)/);
    if (!lab || !h || !a) continue;
    const key = lab[1].trim().toLowerCase();
    if (!map.has(key)) map.set(key, [h[1], a[1]]);
  }
  const num = (v: string) => {
    const n = Number(String(v).replace("%", "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const pair = (keys: string[]) => {
    for (const k of keys) {
      const p = map.get(k);
      if (p) return { ok: true as const, h: num(p[0]), a: num(p[1]) };
    }
    return { ok: false as const, h: 0, a: 0 };
  };
  const sot = pair(["shots on target", "shots on goal"]);
  const cor = pair(["corner kicks", "corners"]);
  const yel = pair(["yellow cards", "yellow card"]);
  const red = pair(["red cards", "red card"]);
  if (!sot.ok && !cor.ok && !yel.ok && !red.ok) return null;
  return {
    sotH: sot.h,
    sotA: sot.a,
    corH: cor.h,
    corA: cor.a,
    yelH: yel.h,
    yelA: yel.a,
    redH: red.h,
    redA: red.a,
    hasSot: sot.ok,
    hasCor: cor.ok,
    hasCards: yel.ok || red.ok,
  };
}

function fsBound(kind: "corners" | "shotsOnTarget" | "cards", n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  if (kind === "shotsOnTarget") return n >= 1 && n <= 10;
  return inSetPieceBounds(kind, n);
}

async function fsGet(url: string, extra: Record<string, string> = {}): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 14_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*", ...extra },
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

function extractFsign(html: string): string {
  const m = html.match(/"feed_sign"\s*:\s*"([^"]+)"/);
  return m?.[1] || FSIGN_FALLBACK;
}

function teamEvents(all: FsEvent[], wanted: string): FsEvent[] {
  return all.filter((e) => e.finished && (statsClubHit(e.home, wanted) || statsClubHit(e.away, wanted)));
}

/**
 * SOT + rożne z Flashscore (min. 2 mecze). CFL / ligi bez FotMob.
 * Nie rusza goli, formy, λ. Kartki tylko gdy są w Top stats.
 */
export async function fetchFlashscoreSetPieces(
  input: MatchInput,
  base: PhasePayload,
): Promise<{ facts: Record<string, unknown>; filled: string[] } | null> {
  if (!sparseBoxLeague(input.league, input.home, input.away)) return null;
  const path = flashscoreLeaguePath(input.league, input.home, input.away);
  if (!path) return null;
  const homeNeed = !(base.home.shotsOnTarget > 0) || !(base.home.corners > 0);
  const awayNeed = !(base.away.shotsOnTarget > 0) || !(base.away.corners > 0);
  const cardsNeed = !(base.home.cards > 0) || !(base.away.cards > 0);
  if (!homeNeed && !awayNeed && !cardsNeed) return null;

  const [liveHtml, resultsHtml] = await Promise.all([
    fsGet(`${BASE}${path}`),
    fsGet(`${BASE}${path}results/`),
  ]);
  const html = [resultsHtml, liveHtml].filter((x): x is string => Boolean(x)).join("\n");
  if (!html) return null;
  const fsign = extractFsign(resultsHtml || "") || extractFsign(liveHtml || "") || FSIGN_FALLBACK;
  const events = parseFlashscoreEvents(html);
  if (!events.filter((e) => e.finished).length) return null;

  async function sideAvg(wantedList: string[]): Promise<{ sot: number; cor: number; cards: number }> {
    let rows: FsEvent[] = [];
    let hitName = wantedList[0] || "";
    for (const wanted of wantedList) {
      if (!wanted) continue;
      const found = teamEvents(events, wanted);
      if (found.length >= 2) {
        rows = found.slice(0, 8);
        hitName = wanted;
        break;
      }
    }
    if (rows.length < 2) return { sot: 0, cor: 0, cards: 0 };
    const packs = await Promise.all(
      rows.map((r) => fsGet(`${FEED}/df_st_1_${r.id}`, { "X-Fsign": fsign })),
    );
    const sots: number[] = [];
    const cors: number[] = [];
    const cards: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const box = packs[i] ? parseFlashscoreMatchStats(packs[i] as string) : null;
      if (!box) continue;
      const home = statsClubHit(rows[i].home, hitName);
      if (box.hasSot) sots.push(home ? box.sotH : box.sotA);
      if (box.hasCor) cors.push(home ? box.corH : box.corA);
      if (box.hasCards) cards.push((home ? box.yelH : box.yelA) + (home ? box.redH : box.redA));
    }
    return { sot: avgSide(sots), cor: avgSide(cors), cards: avgSide(cards) };
  }

  const homeNames = [...new Set([input.home, base.home?.name].filter((s): s is string => Boolean(s)))];
  const awayNames = [...new Set([input.away, base.away?.name].filter((s): s is string => Boolean(s)))];
  const [hAvg, aAvg] = await Promise.all([
    homeNeed || cardsNeed ? sideAvg(homeNames) : Promise.resolve({ sot: 0, cor: 0, cards: 0 }),
    awayNeed || cardsNeed ? sideAvg(awayNames) : Promise.resolve({ sot: 0, cor: 0, cards: 0 }),
  ]);

  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  const filled: string[] = [];
  if (!(base.home.corners > 0) && fsBound("corners", hAvg.cor)) home.corners = hAvg.cor;
  if (!(base.away.corners > 0) && fsBound("corners", aAvg.cor)) away.corners = aAvg.cor;
  if (!(base.home.shotsOnTarget > 0) && fsBound("shotsOnTarget", hAvg.sot)) home.shotsOnTarget = hAvg.sot;
  if (!(base.away.shotsOnTarget > 0) && fsBound("shotsOnTarget", aAvg.sot)) away.shotsOnTarget = aAvg.sot;
  if (!(base.home.cards > 0) && fsBound("cards", hAvg.cards)) home.cards = hAvg.cards;
  if (!(base.away.cards > 0) && fsBound("cards", aAvg.cards)) away.cards = aAvg.cards;
  if (home.corners || away.corners) filled.push("corners");
  if (home.shotsOnTarget || away.shotsOnTarget) filled.push("shotsOnTarget");
  if (home.cards || away.cards) filled.push("cards");
  if (!filled.length) return null;
  return {
    facts: {
      sources: [`${BASE}${path}`],
      home,
      away,
    },
    filled,
  };
}
