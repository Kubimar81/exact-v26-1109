import { clubNameMatches, resolveLeague } from "./leagues";
import { classifyOppQuality } from "./set-piece-class";
import { sparseBoxLeague } from "./set-piece-fallback";
import type { FormMatch, MatchInput, OpponentQuality } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const AWAY_END_MPL = "https://theawayend.co/mizoram-premier-league/";

const MONTH: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripTags(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8242;|&#8217;|&prime;|'/gi, "'")
    .replace(/&/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw: string): string {
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return "";
  const mm = MONTH[m[1].toLowerCase()];
  if (!mm) return "";
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
}

export type WebTableRow = { pos: number; team: string; played: number; points: number; gf: number; ga: number };
export type WebResult = {
  date: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  homeMins: number[];
  awayMins: number[];
};

function cellRows(html: string): string[][] {
  const out: string[][] = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]));
    if (cells.some((c) => c)) out.push(cells);
  }
  return out;
}

function tables(html: string): string[] {
  return html.match(/<table[\s\S]*?<\/table>/gi) || [];
}

function parseMinutes(raw: string): number[] {
  return [...raw.matchAll(/(\d{1,3})\s*(?:'|′)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1 && n <= 120);
}

export function parseAwayEndTable(html: string): WebTableRow[] {
  for (const table of tables(html)) {
    const rows = cellRows(table);
    if (!rows.length) continue;
    const head = rows[0].map((c) => c.toLowerCase()).join(" ");
    if (!(/\bpos\b/.test(head) && /\bteam\b/.test(head) && /\bpts\b/.test(head))) continue;
    const out: WebTableRow[] = [];
    for (const cells of rows.slice(1)) {
      if (cells.length < 8) continue;
      const pos = Number(cells[0]);
      const played = Number(cells[2]);
      const points = Number(cells[6]);
      const gf = Number(cells[7]);
      const ga = Number(cells[8]);
      const team = cells[1];
      if (!(pos > 0) || !team) continue;
      if (!Number.isFinite(played) || !Number.isFinite(points)) continue;
      out.push({
        pos,
        team,
        played,
        points,
        gf: Number.isFinite(gf) ? gf : 0,
        ga: Number.isFinite(ga) ? ga : 0,
      });
    }
    if (out.length >= 4) return out;
  }
  return [];
}

export function parseAwayEndResults(html: string): WebResult[] {
  const out: WebResult[] = [];
  for (const table of tables(html)) {
    const rows = cellRows(table);
    if (!rows.length) continue;
    const head = rows[0].map((c) => c.toLowerCase()).join(" ");
    if (!(/\bdate\b/.test(head) && /\bhome\b/.test(head) && /\bresult\b/.test(head))) continue;
    for (const cells of rows.slice(1)) {
      if (cells.length < 5) continue;
      const date = parseDate(cells[0]);
      const score = cells[3].match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!date || !score) continue;
      const home = cells[2];
      const away = cells[4];
      if (!home || !away) continue;
      out.push({
        date,
        home,
        away,
        hg: Number(score[1]),
        ag: Number(score[2]),
        homeMins: parseMinutes(cells[5] || ""),
        awayMins: parseMinutes(cells[6] || ""),
      });
    }
    if (out.length) return out;
  }
  return out;
}

/** OCR Mizoram / Mis FC Lawtngtlai vs nazwy The Away End. Tylko kontekst MPL. */
export function mplClubHit(found: string, wanted: string): boolean {
  if (clubNameMatches(found, wanted)) return true;
  const a = fold(found);
  const b = fold(wanted);
  if (!a || !b) return false;
  if (/\bmizoram\b/.test(a) && /\bmizoram\b/.test(b)) return true;
  const mls = (s: string) => /\bmls\b/.test(s) || /\bmis\b/.test(s) || /lawngtlai|lawtngtlai/.test(s);
  return mls(a) && mls(b);
}

function latePct(mins: number[]): number {
  if (!mins.length) return 0;
  return Math.round((100 * mins.filter((n) => n >= 61).length) / mins.length);
}

function secondHalfPct(mins: number[]): number {
  if (!mins.length) return 0;
  return Math.round((100 * mins.filter((n) => n > 45).length) / mins.length);
}

function teamFacts(
  name: string,
  wanted: string,
  table: WebTableRow[],
  results: WebResult[],
): Record<string, unknown> | null {
  const row = table.find((t) => mplClubHit(t.team, wanted) || mplClubHit(t.team, name));
  const tableN = table.length;
  const form: FormMatch[] = [];
  const scoredMins: number[] = [];
  for (const m of results) {
    const asHome = mplClubHit(m.home, wanted) || mplClubHit(m.home, name);
    const asAway = mplClubHit(m.away, wanted) || mplClubHit(m.away, name);
    if (asHome === asAway) continue;
    const oppName = asHome ? m.away : m.home;
    const oppRow = table.find((t) => mplClubHit(t.team, oppName));
    const quality: OpponentQuality = classifyOppQuality(oppRow?.pos || 0, tableN);
    form.push({
      date: m.date,
      opponent: oppName.replace(/,\s*Lawngtlai/i, "").trim(),
      ha: asHome ? "H" : "A",
      scoreFor: asHome ? m.hg : m.ag,
      scoreAgainst: asHome ? m.ag : m.hg,
      quality,
      comp: "LIGA",
      oppPos: oppRow?.pos,
    });
    scoredMins.push(...(asHome ? m.homeMins : m.awayMins));
  }
  form.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!form.length && !row) return null;
  return {
    name: row?.team || name,
    tablePos: row?.pos || 0,
    points: row?.points || 0,
    played: row?.played || form.length,
    form: form.slice(0, 10),
    goalsAfter60Pct: latePct(scoredMins),
    goalsSecondHalfPct: secondHalfPct(scoredMins),
  };
}

export function factsFromAwayEnd(
  html: string,
  input: { home: string; away: string; league: string },
): { facts: Record<string, unknown>; formN: number } | null {
  const table = parseAwayEndTable(html);
  const results = parseAwayEndResults(html);
  const home = teamFacts(input.home, input.home, table, results);
  const away = teamFacts(input.away, input.away, table, results);
  if (!home || !away) return null;
  const formN =
    (Array.isArray(home.form) ? home.form.length : 0) + (Array.isArray(away.form) ? away.form.length : 0);
  if (formN < 2) return null;
  return {
    formN,
    facts: {
      sources: [AWAY_END_MPL],
      league: "Mizoram Premier League",
      home,
      away,
      h2h: [],
      injuries: "Kadry/kontuzje: brak publikacji XI i listy absencji (MPL poza AF/FotMob/Flashscore).",
    },
  };
}

function mplHint(league: string, home: string, away: string): boolean {
  const n = `${league} ${home} ${away}`.toLowerCase();
  if (/\bmizoram\b|lawngtlai|lawtngtlai/.test(n)) return true;
  return /mizoram/.test(fold(resolveLeague(home, away, league)));
}

/** Ligi poza AF/Flashscore/FotMob — forma z publicznej tabeli, bez scouta Grok. */
export async function fetchOffCatalogForm(input: MatchInput): Promise<{
  facts: string;
  citations: string[];
} | null> {
  if (!sparseBoxLeague(input.league, input.home, input.away) && !mplHint(input.league, input.home, input.away)) {
    return null;
  }
  if (!mplHint(input.league, input.home, input.away)) return null;
  const res = await fetch(AWAY_END_MPL, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text();
  const packed = factsFromAwayEnd(html, input);
  if (!packed) return null;
  return { facts: JSON.stringify(packed.facts), citations: [AWAY_END_MPL] };
}
