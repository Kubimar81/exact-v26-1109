/**
 * API-Football (api-sports.io) — stabilne źródło formy / tabeli / H2H pod V26 K0.
 * Klucz: process.env.API_FOOTBALL_KEY (nie pakować do ZIP/RAR).
 */

import { applyCityExonyms, resolveLeague, leagueHintFromClubs, clubYearConflict } from "./leagues";
import { fetchFotmobH2h, fetchFotmobLineups, fetchFotmobFt, mergeH2h } from "./fotmob-box";
import { sparseBoxLeague } from "./set-piece-fallback";
import { classifyOppQuality } from "./set-piece-class";
import { clipEarlyOutlierGoals } from "./exact-epf";
import { buildT60Overlay, type T60Overlay } from "./normalize";
import type { FavoriteSide } from "./types";
import { classifyMatchInjuries, foldPlayerName, lookupSquad, type InjuryEvent } from "./injuries-s3";

export type AfFactsResult = {
  facts: string;
  citations: string[];
  error?: string;
};

type AfTeam = { id: number; name: string; country?: string; code?: string };
type AfFixture = {
  fixture: { id: number; date: string; status?: { short?: string } };
  league: { id: number; name: string; season: number };
  teams: { home: AfTeam; away: AfTeam };
  goals: { home: number | null; away: number | null };
  score?: { halftime?: { home: number | null; away: number | null } };
};

const BASE = "https://v3.football.api-sports.io";

/** Klucz użytkownika (Pro api-sports) — env ma pierwszeństwo; fallback tylko serwerowy. */
const AF_KEY_FALLBACK = "8d78583ab9c0e5b89796738b65932746";

function resolveAfKey(): string | undefined {
  const keys = [
    process.env.API_FOOTBALL_KEY,
    process.env.APIFOOTBALL_KEY,
    process.env.API_SPORTS_KEY,
    AF_KEY_FALLBACK,
  ];
  for (const k of keys) {
    if (typeof k === "string" && k.trim().length >= 16) return k.trim();
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function afGet<T>(path: string, params: Record<string, string | number>, key: string): Promise<T[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const url = `${BASE}${path}?${qs.toString()}`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "x-apisports-key": key },
        signal: (() => {
          const c = new AbortController();
          setTimeout(() => c.abort(), 25_000);
          return c.signal;
        })(),
      });
      if (res.status === 429) {
        lastErr = "HTTP 429";
        await sleep(450 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`API-Football HTTP ${res.status}${t ? `: ${t.slice(0, 100)}` : ""}`);
      }
      const json = (await res.json()) as { response?: T[] | T; errors?: unknown };
      if (json.errors && typeof json.errors === "object" && Object.keys(json.errors as object).length) {
        throw new Error(`API-Football: ${JSON.stringify(json.errors).slice(0, 120)}`);
      }
      if (Array.isArray(json.response)) return json.response;
      if (json.response && typeof json.response === "object") return [json.response as T];
      return [];
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 2) await sleep(350 * (attempt + 1));
    }
  }
  throw new Error(lastErr || "API-Football: brak odpowiedzi");
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WEAK_CLUB_TOKENS = new Set([
  "novi",
  "city",
  "united",
  "sporting",
  "atletico",
  "athletic",
  "real",
  "club",
  "montevideo",
  "uruguay",
  "serbia",
  "sad",
  "beograd",
  "tashkent",
  "sofia",
  "deportes",
  "deporte",
  "independiente",
  "universidad",
]);

function nameScore(a: string, b: string): number {
  const na = clubCore(a);
  const nb = clubCore(b);
  if (!na || !nb) return 0;
  if (yearMismatch(a, b)) return 0;
  if (na === nb) return 100;
  const compactA = na.replace(/\s+/g, "");
  const compactB = nb.replace(/\s+/g, "");
  const initials = (s: string) => {
    const toks = s.split(" ").filter(Boolean);
    return toks.length >= 2 ? toks.map((t) => t[0]).join("") : "";
  };
  if (compactB.length >= 2 && compactB.length <= 4 && initials(na) === compactB) return 94;
  if (compactA.length >= 2 && compactA.length <= 4 && initials(nb) === compactA) return 94;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const ta = new Set(na.split(" ").filter((t) => t && !WEAK_CLUB_TOKENS.has(t)));
  const tb = new Set(nb.split(" ").filter((t) => t && !WEAK_CLUB_TOKENS.has(t)));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  if (!hit) return 0;
  return Math.round((200 * hit) / (ta.size + tb.size));
}

const CLUB_NOISE =
  /\b(fc|sc|ac|afc|cf|if|ff|fk|fa|bk|sk|as|ss|us|cd|rcd|r|ii|iii|club|the|de|al|el|baku|sofia|deportes|deporte|independiente|universidad|reserves?|res|u1[5-9]|u2[0-3]|olympique)\b/g;

function yearMismatch(a: string, b: string): boolean {
  return clubYearConflict(a, b);
}

function clubCore(name: string): string {
  return applyCityExonyms(norm(name).replace(CLUB_NOISE, " ").replace(/\s+/g, " ").trim());
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function foldArab(s: string): string {
  return s
    .replace(/iyyah/g, "ia")
    .replace(/iyah/g, "ia")
    .replace(/iyya/g, "ia")
    .replace(/aih/g, "ia")
    .replace(/iah/g, "ia")
    .replace(/iy/g, "i")
    .replace(/ai/g, "i")
    .replace(/ey/g, "i")
    .replace(/q/g, "g")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/dh/g, "d");
}

function stemClub(t: string): string {
  if (t.length >= 5 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/** Dopasowanie do składu ligi: (R)/rezerwy + 1–2 literówki OCR, bez homonimów z innej ligi. */
export function rosterNameScore(found: string, wanted: string): number {
  if (yearMismatch(found, wanted)) return 0;
  const alias = TEAM_ALIASES[norm(wanted)];
  const direct = Math.max(nameScore(found, wanted), alias ? nameScore(found, alias) : 0);
  if (direct >= 45) return direct;
  const ca = clubCore(found);
  const cb = clubCore(wanted);
  const compactA = ca.replace(/\s+/g, "");
  const compactB = cb.replace(/\s+/g, "");
  const az = (s: string) => s.replace(/q/g, "g");
  if (compactA.length >= 5 && compactB.length >= 5) {
    if (compactA === compactB || az(compactA) === az(compactB)) return 92;
    if (compactA.includes(compactB) || compactB.includes(compactA)) return 78;
    const dCompact = levenshtein(compactA, compactB);
    const capCompact = Math.max(compactA.length, compactB.length);
    if (dCompact > 0 && dCompact <= 2 && dCompact / capCompact <= 0.28) return 74;
  }
  const fa = foldArab(compactA);
  const fb = foldArab(compactB);
  if (fa.length >= 4 && fb.length >= 4) {
    if (fa === fb) return 90;
    if (Math.min(fa.length, fb.length) >= 5 && (fa.includes(fb) || fb.includes(fa))) return 82;
    const dArab = levenshtein(fa, fb);
    if (dArab === 1 && Math.max(fa.length, fb.length) >= 5) return 76;
  }
  const tokensA = ca.split(" ").filter((t) => t && !WEAK_CLUB_TOKENS.has(t));
  const tokensB = cb.split(" ").filter((t) => t && !WEAK_CLUB_TOKENS.has(t));
  for (const x of tokensA) {
    for (const y of tokensB) {
      if (x.length < 4 || y.length < 4) continue;
      const sx = stemClub(x);
      const sy = stemClub(y);
      if (sx.length >= 4 && sx === sy) return 86;
    }
  }
  const la = tokensA.sort((x, y) => y.length - x.length)[0] || "";
  const lb = tokensB.sort((x, y) => y.length - x.length)[0] || "";
  if (la.length >= 6 && lb.length >= 6) {
    const d = levenshtein(la, lb);
    const cap = Math.max(la.length, lb.length);
    if (d > 0 && d <= 2 && d / cap <= 0.25) return 72;
  }
  return direct;
}

function seniorityPenalty(name: string, wanted = ""): number {
  const youth = /\b(U1[5-9]|U2[0-3]|U18|U19|U21|Women|Jong|II|III|Talang|TFF|Dam)\b/i;
  if (youth.test(name) && !(wanted && youth.test(wanted))) return 45;
  if (/\b1948\b/.test(name) !== /\b1948\b/.test(wanted)) return 50;
  return 0;
}

function countryBoost(country: string | undefined, leagueHint?: string): number {
  if (!country || !leagueHint) return 0;
  const c = country.toLowerCase();
  const h = leagueHint.toLowerCase();
  const pairs: [RegExp, RegExp][] = [
    [/nether|holland/i, /eredivisie|eerste|holland|nether|holand/i],
    [/poland/i, /ekstraklasa|i liga|poland|polsk/i],
    [/sweden/i, /allsven|superettan|sweden|szwec/i],
    [/romania/i, /liga i|liga 1|superliga|romania|rumun/i],
    [/denmark/i, /superliga|1\.?\s*division|denmark|dania/i],
    [/kazakhstan/i, /kazakhstan|kazachstan/i],
    [/latvia/i, /latvia|virsliga|lotwa/i],
    [/saudi/i, /saudi|saudyjsk|arabia saud/i],
    [/argentina/i, /argentina|argentyn|primera nacional/i],
    [/norway/i, /eliteserien|norway|norweg/i],
    [/england/i, /premier league|championship|england|angli/i],
    [/spain/i, /laliga|la liga|segunda|spain|hiszpan/i],
    [/germany/i, /bundesliga|germany|niemc/i],
    [/italy/i, /serie [abc]|italy|wloch/i],
    [/france/i, /ligue 1|france|franc/i],
    [/portugal/i, /portugal|liga portugal/i],
    [/belgium/i, /jupiler|pro league|belgium|belg/i],
    [/turkey/i, /super lig|süper|turkey|turcj|tff/i],
    [/greece/i, /greece|grecj|super league greece/i],
    [/austria/i, /bundesliga|austria/i],
    [/switzerland/i, /swiss|switzerland|szwajc|challenge/i],
    [/czech/i, /first league|fortuna liga|czech|fnl/i],
    [/scotland/i, /premiership|championship|scotland|szkoc/i],
    [/finland/i, /veikkaus|ykkonen|ykkos|finland|finlan/i],
    [/india/i, /calcutta|kolkata|i-league|isl|india|indie|mizoram/i],
    [/chile/i, /chile/i],
    [/colombia/i, /colombia|columbia|kolumbi|primera b|betplay/i],
    [/azerbaijan/i, /azerbaijan|azerbejd|premyer/i],
    [/wales/i, /cymru|wales|walia/i],
    [/bulgaria/i, /bulgaria|parva|efbet|bu[lł]garia/i],
    [/croatia/i, /croatia|chorwacj|\bhnl\b/i],
    [/bosnia/i, /bosnia|bosn|herceg|premijer/i],
    [/uganda/i, /uganda/i],
    [/israel/i, /israel|izrael|ligat/i],
    [/egypt/i, /egypt|egipt|egyptian/i],
    [/northern.?ireland/i, /nifl|premiership|northern|irland/i],
    [/uzbekistan/i, /uzbek|super league/i],
    [/uruguay/i, /urugw|uruguay/i],
    [/serbia/i, /serb|super liga/i],
    [/vietnam/i, /wietnam|vietnam|v[- ]?league/i],
    [/thailand/i, /tajland|thailand|thai league/i],
    [/singapore/i, /singapur|singapore/i],
  ];
  for (const [countryRe, leagueRe] of pairs) {
    if (countryRe.test(c) && leagueRe.test(h)) return 12;
  }
  return 0;
}

const TEAM_ALIASES: Record<string, string> = {
  "feyenoord rotterdam": "Feyenoord",
  "psv eindhoven": "PSV",
  "az alkmaar": "AZ",
  "afc ajax": "Ajax",
  "ajax amsterdam": "Ajax",
  "fc twente": "Twente",
  "fc utrecht": "Utrecht",
  "sc heerenveen": "Heerenveen",
  "heracles almelo": "Heracles",
  "fortuna sittard": "Fortuna Sittard",
  "nec nijmegen": "NEC Nijmegen",
  "pec zwolle": "Zwolle",
  "rkc waalwijk": "Waalwijk",
  "sc cambuur": "Cambuur",
  "nac breda": "NAC Breda",
  "fc volendam": "Volendam",
  "excelsior rotterdam": "Excelsior",
  "go ahead eagles": "GO Ahead Eagles",
  "voluntari": "FC Voluntari",
  "fc voluntari": "FC Voluntari",
  "universitatea craiova": "Universitatea Craiova",
  "cs universitatea craiova": "Universitatea Craiova",
  "u craiova": "Universitatea Craiova",
  "hammarby if": "Hammarby FF",
  "hammarby ff": "Hammarby FF",
  hammarby: "Hammarby FF",
  "orgryte if": "Orgryte IS",
  "orgryte is": "Orgryte IS",
  orgryte: "Orgryte IS",
  "gais": "Gais",
  "ifk norrkoping": "Norrkoping",
  "norrkoping": "Norrkoping",
  "falkenbergs ff": "Falkenbergs FF",
  "falkenberg": "Falkenbergs FF",
  "inter milan": "Inter",
  "internazionale": "Inter",
  "ac milan": "Milan",
  "atletico madrid": "Atletico Madrid",
  "atletico de madrid": "Atletico Madrid",
  "paris saint germain": "Paris Saint Germain",
  psg: "Paris Saint Germain",
  "paris sg": "Paris Saint Germain",
  "paris saint germain fc": "Paris Saint Germain",
  "hapoel beer sheva": "Hapoel Beer Sheva",
  huachipato: "Huachipato",
  "cd huachipato": "Huachipato",
  "huachipato fc": "Huachipato",
  "colo colo": "Colo Colo",
  "colo-colo": "Colo Colo",
  colocolo: "Colo Colo",
  "csd colo colo": "Colo Colo",
  "hapoel beersheva": "Hapoel Beer Sheva",
  "hapoel be er sheva": "Hapoel Beer Sheva",
  "hapoel haifa": "Hapoel Haifa",
  "maccabi haifa": "Maccabi Haifa",
  "maccabi tel aviv": "Maccabi Tel Aviv",
  "beitar jerusalem": "Beitar Jerusalem",
  "bnei sakhnin": "Bnei Sakhnin",
  sakhnin: "Bnei Sakhnin",
  "dynamo brest": "FC Dinamo Brest",
  "dinamo brest": "FC Dinamo Brest",
  "fc dinamo brest": "FC Dinamo Brest",
  "bate borysow": "BATE",
  "bate borisov": "BATE",
  "bate borysów": "BATE",
  bate: "BATE",
  "man utd": "Manchester United",
  "man city": "Manchester City",
  "tottenham hotspur": "Tottenham",
  "west ham united": "West Ham",
  "wolverhampton wanderers": "Wolves",
  "united sc": "United",
  "police ac": "Police",
  "police athletic": "Police",
  "calcutta police": "Calcutta Police",
  "mizoram": "Mizoram Police",
  "mizoram police": "Mizoram Police",
  "mizoram police fc": "Mizoram Police",
  "mis fc lawtngtlai": "MLS FC Lawngtlai",
  "mls fc lawtngtlai": "MLS FC Lawngtlai",
  "mls fc lawngtlai": "MLS FC Lawngtlai",
  "lawtngtlai": "MLS FC Lawngtlai",
  "lawngtlai": "MLS FC Lawngtlai",
  zamalek: "Zamalek SC",
  "zamalek sc": "Zamalek SC",
  "abo qair semads": "Abu Qir Semad",
  "abo qair semad": "Abu Qir Semad",
  "abu qair semads": "Abu Qir Semad",
  "abu qair semad": "Abu Qir Semad",
  "abu qir semad": "Abu Qir Semad",
  "abou qair semad": "Abu Qir Semad",
  "abo qair": "Abu Qir Semad",
  "abu qair": "Abu Qir Semad",
  "abu qir": "Abu Qir Semad",
  "kyzylzhar": "Kyzyl-Zhar",
  "aalborg bk": "Aalborg",
  "hb koge": "HB Koge",
  "mohammedan sc": "Mohammedan",
  "mohammedan sc r": "Mohammedan",
  "mohammedan sc (r)": "Mohammedan",
  "mohammedan reserves": "Mohammedan",
  "al taawoun": "Al Taawon",
  "al tawoun": "Al Taawon",
  "taawoun": "Al Taawon",
  "olympique marsylia": "Marseille",
  "marsylia": "Marseille",
  "om marsylia": "Marseille",
  "olympique marseille": "Marseille",
  "as monaco": "Monaco",
  "sumgayit": "Sumqayit",
  "sumgait": "Sumqayit",
  "sumqayit": "Sumqayit",
  "sumqayit fk": "Sumqayit",
  "qarabag": "Qarabag",
  "karabakh": "Qarabag",
  "araz nakhchivan": "Araz-Naxcivan",
  "araz naxcivan": "Araz-Naxcivan",
  "nakhchivan": "Araz-Naxcivan",
  "sabah baku": "Sabah FA",
  "sabah fa": "Sabah FA",
  "sabah": "Sabah FA",
  "connahs quay nomads": "GAP Connah S Quay FC",
  "connah s quay nomads": "GAP Connah S Quay FC",
  "connahs quay": "GAP Connah S Quay FC",
  "connah s quay": "GAP Connah S Quay FC",
  "flint town united": "Flint Town United",
  "flint town": "Flint Town United",
  "arda kardzhali": "Arda Kardzhali",
  "arda": "Arda Kardzhali",
  "botev vratsa": "Botev Vratsa",
  "hajduk split": "HNK Hajduk Split",
  "hajduk": "HNK Hajduk Split",
  "lokomotiva zagreb": "NK Lokomotiva Zagreb",
  "lokomotiva": "NK Lokomotiva Zagreb",
  "wolverhampton": "Wolves",
  "queens park rangers": "QPR",
  "queen s park rangers": "QPR",
  "qpr": "Queens Park Rangers",
  "al jabalain": "Al Jabalain",
  "jabalain": "Al Jabalain",
  "al najma": "Al Najma",
  "zrinjski mostar": "Zrinjski",
  "bsk banja luka": "BSK Banja Luka",
  "nec fc": "NEC",
  "lugazi fc": "Lugazi",
  "al draih": "Al Diriyah",
  "draih": "Al Diriyah",
  "al drah": "Al Diriyah",
  "drah": "Al Diriyah",
  "al diriyah": "Al Diriyah",
  "diriyah": "Al Diriyah",
  "al diriah": "Al Diriyah",
  "diriah": "Al Diriyah",
  "al direyah": "Al Diriyah",
  antofagasta: "Deportes Antofagasta",
  "deportes antofagasta": "Deportes Antofagasta",
  "al qadsiah": "Al-Qadisiyah FC",
  "qadsiah": "Al-Qadisiyah FC",
  "al qadisiyah": "Al-Qadisiyah FC",
  "qadisiyah": "Al-Qadisiyah FC",
  larne: "Larne",
  "larne fc": "Larne",
  "bangor fc": "Bangor",
  "cska 1948 sofia": "CSKA 1948",
  "cska 1948": "CSKA 1948",
  "cska1948": "CSKA 1948",
  hearts: "Heart Of Midlothian",
  "heart of midlothian": "Heart Of Midlothian",
  "hearts fc": "Heart Of Midlothian",
  pakhtakor: "Pakhtakor",
  "pakhtakor tashkent": "Pakhtakor",
  andijan: "Andijan",
  andijon: "Andijan",
  torque: "Atletico Torque",
  "montevideo city torque": "Atletico Torque",
  "city torque": "Atletico Torque",
  "cerro largo": "Cerro Largo",
  danubio: "Danubio",
  penarol: "Penarol",
  "ca penarol": "Penarol",
  "novi pazar": "Novi Pazar",
  "zeleznicar pancevo": "Zeleznicar Pancevo",
  pancevo: "Zeleznicar Pancevo",
  "hibs": "Hibernian",
  "hibernian": "Hibernian",
  "bursaspor": "Bursaspor",
  "istanbulspor": "İstanbulspor",
  "istanbul spor": "İstanbulspor",
  wil: "FC Wil 1900",
  "fc wil": "FC Wil 1900",
  "fc wil 1900": "FC Wil 1900",
  "lausanne ouchy": "Stade Lausanne-Ouchy",
  "stade lausanne ouchy": "Stade Lausanne-Ouchy",
  "dukla praga": "Dukla Praha",
  "dinamo bukareszt": "Dinamo Bucuresti",
  taborsko: "Silon Taborsko",
  "silon taborsko": "Silon Taborsko",
  vlasim: "Vlasim",
  "fc vlasim": "Vlasim",
  "sk kladno": "Kladno",
  "fc jazz": "Jazz",
  jazz: "Jazz",
  "kpv kokkola": "KPV",
  kpv: "KPV",
  "ninh binh": "Ninh Binh",
  ninhbinh: "Ninh Binh",
  "dong a thanh hoa": "Thanh Hoa",
  "thanh hoa": "Thanh Hoa",
  thanhhoa: "Thanh Hoa",
  "lamphun warrior": "Lamphun Warrior",
  lamphun: "Lamphun Warrior",
  "port fc": "Port FC",
  portfc: "Port FC",
  "tampines rovers": "Tampines Rovers",
  tampines: "Tampines Rovers",
  "balestier khalsa": "Balestier Khalsa",
  balestier: "Balestier Khalsa",
  "polonia warszawa": "Polonia Warszawa",
  "polonia bytom": "Polonia Bytom",
};

function isWeakSearchQuery(q: string): boolean {
  if (TEAM_ALIASES[norm(q)]) return false;
  const toks = norm(q)
    .replace(/\b(fc|sc|cd|ac|afc|cf|de|el|al)\b/g, " ")
    .split(" ")
    .filter(Boolean);
  if (!toks.length) return true;
  return toks.every((t) => WEAK_CLUB_TOKENS.has(t) || t.length < 4);
}

function distinctiveTokens(name: string): string[] {
  return clubCore(name)
    .split(" ")
    .filter((t) => t.length >= 4 && !WEAK_CLUB_TOKENS.has(t));
}

function hasDistinctiveHit(found: string, wanted: string): boolean {
  const want = distinctiveTokens(wanted);
  if (!want.length) return true;
  const got = distinctiveTokens(found);
  return want.some((w) => got.some((g) => g === w || (Math.min(g.length, w.length) >= 5 && (g.includes(w) || w.includes(g)))));
}

function searchQueries(name: string): string[] {
  const cleaned = name
    .replace(/\b(IF|FF|FC|CF|SC|AFC|BK|SK|AC|AS|SS|US|CD|RCD)\b/gi, " ")
    .replace(/[.,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  const out: string[] = [];
  const add = (s: string) => {
    const q = s.trim().slice(0, 40);
    if (q.length >= 3 && !isWeakSearchQuery(q) && !out.some((x) => x.toLowerCase() === q.toLowerCase())) out.push(q);
  };
  const alias = TEAM_ALIASES[norm(name)] || TEAM_ALIASES[norm(cleaned)];
  if (alias) add(alias);
  add(name);
  add(cleaned);
  if (!/^(fc|sc|afc|bk)\s/i.test(cleaned)) add(`FC ${cleaned}`);
  if (tokens.length >= 2) add(tokens.slice(0, -1).join(" "));
  if (tokens.length >= 2) add(tokens.slice(1).join(" "));
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
  const CITY_Q = /^(sofia|plovdiv|varna|moscow|madrid|london|paris|porto|lisbon|warsaw|warszawa)$/i;
  if (longest && !CITY_Q.test(longest)) add(longest);
  return out;
}

type AfTeamHit = AfTeam & { city?: string };

function pickBestTeam(
  rows: { team?: AfTeam; venue?: { city?: string } }[],
  name: string,
  leagueHint?: string,
): { hit: AfTeamHit; score: number } | null {
  let best: AfTeamHit | null = null;
  let bestScore = -1;
  for (const r of rows) {
    const t = r.team;
    if (!t?.id || !t.name) continue;
    let s = rosterNameScore(t.name, name);
    const alias = TEAM_ALIASES[norm(name)];
    if (alias) s = Math.max(s, rosterNameScore(t.name, alias));
    s -= seniorityPenalty(t.name, name);
    s += countryBoost(t.country, leagueHint);
    if (s > bestScore) {
      bestScore = s;
      best = { ...t, city: r.venue?.city };
    }
  }
  if (!best) return null;
  return { hit: best, score: bestScore };
}

async function findTeamId(name: string, key: string, leagueHint?: string): Promise<AfTeamHit | null> {
  let best: AfTeamHit | null = null;
  let bestScore = -1;
  const seen = new Set<number>();
  for (const q of searchQueries(name)) {
    const rows = await afGet<{ team: AfTeam; venue?: { city?: string } }>("/teams", { search: q }, key).catch(
      () => [] as { team: AfTeam; venue?: { city?: string } }[],
    );
    const picked = pickBestTeam(
      rows.filter((r) => r.team?.id && !seen.has(r.team.id)),
      name,
      leagueHint,
    );
    for (const r of rows) if (r.team?.id) seen.add(r.team.id);
    if (picked && picked.score > bestScore) {
      best = picked.hit;
      bestScore = picked.score;
    }
    if (bestScore >= 80 && best && hasDistinctiveHit(best.name, name)) break;
  }
  if (!best || bestScore < 40) return null;
  return best;
}

async function findOpponentVia(
  found: AfTeamHit,
  missingName: string,
  key: string,
  leagueHint?: string,
): Promise<AfTeamHit | null> {
  const past = await lastFixtures(found.id, key, 15).catch(() => [] as AfFixture[]);
  const upcoming = await afGet<AfFixture>("/fixtures", { team: found.id, next: 20 }, key).catch(() => [] as AfFixture[]);
  const fixtures = [...upcoming, ...past];
  const rows: { team?: AfTeam; venue?: { city?: string } }[] = [];
  const seen = new Set<number>([found.id]);
  for (const f of fixtures) {
    for (const t of [f.teams.home, f.teams.away]) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      rows.push({ team: t });
    }
  }
  const league = inferLeague(fixtures, leagueHint);
  if (league) {
    const roster = await leagueRoster(league.leagueId, league.season, key);
    for (const r of roster) {
      if (r.team?.id && !seen.has(r.team.id)) {
        seen.add(r.team.id);
        rows.push(r);
      }
    }
  }
  const picked = pickBestTeam(rows, missingName, leagueHint);
  if (!picked || picked.score < 40) return null;
  return picked.hit;
}

function isFriendly(f: AfFixture): boolean {
  if (f.league?.id === 667) return true;
  return /friend|vriendsch|club friendly|sparing/i.test(f.league?.name || "");
}

function isContinentalOrCup(f: AfFixture): boolean {
  const n = f.league?.name || "";
  if (/uefa|champions league|europa league|conference league|world cup|nations league|copa libertadores|sudamericana/i.test(n)) {
    return true;
  }
  if (/cupa |beker|pokal|coppa italia|fa cup|league cup|super cup|supercup|coupe de|kings cup|svenska cupen/i.test(n)) {
    return true;
  }
  return false;
}

function rewriteLeagueHint(hint: string): string {
  let s = hint
    .replace(/piłka nożna|football|soccer/gi, " ")
    .replace(/holandia|netherlands|holland/gi, "eredivisie")
    .replace(/rumunia|romania/gi, "liga i")
    .replace(/chorwacja/gi, "croatia")
    .replace(/bułgaria|bulgaria/gi, "bulgaria")
    .replace(/\bcolumbia\b/gi, "colombia")
    .replace(/kolumbia/gi, "colombia");
  if (/superettan/i.test(s)) s = s.replace(/szwecja|sweden/gi, " ");
  else s = s.replace(/szwecja|sweden/gi, "allsvenskan");
  return s.replace(/\s+/g, " ").trim();
}

function bookieSearchQueries(hint: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = rewriteLeagueHint(s).replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !out.includes(t)) out.push(t);
  };
  add(hint);
  const parts = hint.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    add(parts.slice(1).join(" "));
    add(parts[0]);
  }
  return out;
}

function leagueHintHit(leagueName: string, hint?: string): boolean {
  if (!hint) return false;
  const a = norm(leagueName);
  const b = norm(rewriteLeagueHint(hint));
  if (!a || !b) return false;
  if (/superettan/.test(b)) return /superettan/.test(a);
  if (/allsven/.test(b)) return /allsven/.test(a) && !/superettan/.test(a);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return nameScore(leagueName, hint) >= 55;
}

function inferLeague(fixtures: AfFixture[], hint?: string): { leagueId: number; season: number } | null {
  const official = fixtures.filter((f) => !isFriendly(f));
  const pool = official.length ? official : fixtures;
  const hinted = hint ? pool.filter((f) => leagueHintHit(f.league?.name || "", hint)) : [];
  const domestic = pool.filter((f) => !isContinentalOrCup(f));
  const ranked = hinted.length ? hinted : domestic.length ? domestic : pool;
  const latest = ranked[0];
  if (latest?.league?.id && latest.league.season) {
    return { leagueId: latest.league.id, season: latest.league.season };
  }
  const counts = new Map<string, { leagueId: number; season: number; n: number }>();
  for (const f of ranked) {
    const leagueId = f.league?.id;
    const season = f.league?.season;
    if (!leagueId || !season) continue;
    const k = `${leagueId}:${season}`;
    const cur = counts.get(k) || { leagueId, season, n: 0 };
    cur.n++;
    counts.set(k, cur);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best ?? null;
}

type AfLeagueRow = {
  league?: { id?: number; name?: string; type?: string };
  country?: { name?: string };
  seasons?: { year?: number; current?: boolean }[];
};

/** Katalog lig Superbet/Flashscore → API-Football id. Roster ligi bije /teams?search=. */
const LEAGUE_CATALOG: { test: RegExp; id: number }[] = [
  { test: /uzbek/, id: 369 },
  { test: /urugw|uruguay/, id: 268 },
  { test: /serb/, id: 286 },
  { test: /calcutta|kolkata|\bcfl\b/, id: 1020 },
  { test: /kazachstan.*first|kazakhstan.*first|first.*(liga|league|division).*(kazach|kazakh)/, id: 388 },
  { test: /kazachstan|kazakhstan/, id: 389 },
  { test: /azerbejd|azerbaij|premyer\s*liq/, id: 419 },
  { test: /cymru|\bwalia\b|\bwales\b/, id: 110 },
  { test: /bu[lł]garia|\bbulgaria\b|\bparva\b|\befbet/, id: 172 },
  { test: /chorwacj|\bcroatia\b|\bhnl\b/, id: 210 },
  { test: /uganda/, id: 585 },
  { test: /izrael|\bisrael\b|ligat\s*ha/, id: 383 },
  { test: /bosn|hercegowin|herzegovin|premijer/, id: 315 },
  { test: /virsliga|[lł]otwa|\blatvia\b/, id: 365 },
  { test: /saudi.*(division|first)|first division.*saudi/, id: 308 },
  { test: /saudyjsk|\bsaudi\b|arabia saud/, id: 307 },
  { test: /(argentyn|argentina).*(nacional)|primera nacional/, id: 129 },
  { test: /(argentyn|argentina)|liga profesional/, id: 128 },
  { test: /superettan/, id: 114 },
  { test: /2\.?\s*bundesliga/, id: 79 },
  { test: /austrian bundesliga|\baustria\b/, id: 218 },
  { test: /(turcj|turkey|turkiye|t[uü]rkiye).*(1\.?\s*lig)|tff\s*1/, id: 204 },
  { test: /s[uü]per[- ]?lig(?!a)/, id: 203 },
  { test: /turcja|turkey|turkiye|t[uü]rkiye/, id: 203 },
  { test: /\bnifl\b|northern ireland/, id: 408 },
  { test: /(szkoc|scotland).*championship|championship.*(szkoc|scotland)/, id: 180 },
  { test: /szkoc|scotland|premiership/, id: 179 },
  { test: /eredivisie|holandia|netherlands|holland/, id: 88 },
  { test: /eerste divisie|keuken kampioen/, id: 89 },
  { test: /allsven|szwecja|sweden/, id: 113 },
  { test: /liga i|liga 1|superliga rumun|romania|rumunia/, id: 283 },
  { test: /(polska|poland|ekstraklasa).*(i\s*liga|1\.?\s*liga)|(^|\s)i liga(\s|$)|fortuna 1 liga/, id: 107 },
  { test: /ekstraklasa|poland|polska/, id: 106 },
  { test: /egipt|\begypt\b|\begyptian\b/, id: 233 },
  { test: /wietnam|\bvietnam\b|v[- ]?league/, id: 340 },
  { test: /tajland|\bthailand\b|thai league/, id: 296 },
  { test: /singapur|\bsingapore\b/, id: 368 },
  { test: /premier league|\bepl\b/, id: 39 },
  { test: /championship/, id: 40 },
  { test: /laliga\s*2|la liga 2|segunda division/, id: 141 },
  { test: /laliga|la liga/, id: 140 },
  { test: /serie b/, id: 136 },
  { test: /brasileir|brazil|brazyl/, id: 71 },
  { test: /serie a/, id: 135 },
  { test: /bundesliga/, id: 78 },
  { test: /ligue 2/, id: 62 },
  { test: /ligue 1/, id: 61 },
  { test: /liga portugal|primeira liga/, id: 94 },
  { test: /super league greece|grecja|greece/, id: 197 },
  { test: /(norweg|norway).*(1\.?\s*division)|obos[- ]?liga/, id: 104 },
  { test: /eliteserien|norway|norweg/, id: 103 },
  { test: /(dania|denmark).*(1\.?\s*division)|1\.?\s*division.*(dania|denmark)/, id: 120 },
  { test: /superliga denmark|dania|denmark/, id: 119 },
  { test: /belgian|jupiler|belgium|belg/, id: 144 },
  { test: /challenge league/, id: 208 },
  { test: /swiss super|switzerland|szwajc/, id: 207 },
  { test: /\bfnl\b|chl[- ]?fnl/, id: 346 },
  { test: /czech|czechia|czechy|fortuna liga/, id: 345 },
  { test: /ykkonen|ykkosliiga|ykkos/, id: 245 },
  { test: /veikkaus/, id: 244 },
  { test: /finland/, id: 244 },
  { test: /\bmls\b/, id: 253 },
  { test: /botola|maroko|morocco/, id: 200 },
  { test: /liga mx|mexico/, id: 262 },
  { test: /j1|japan/, id: 98 },
  { test: /k league|korea/, id: 292 },
  { test: /saudi/, id: 307 },
  { test: /meistriliiga|estonia|estoni/, id: 329 },
  { test: /league of ireland|irlandia|ireland/, id: 357 },
  { test: /besta deild|iceland|islandia/, id: 164 },
  { test: /chile.*primera b|primera b.*chile/, id: 266 },
  { test: /(colombi|columbia|kolumbi).*(primera b|torneo betplay)|(primera b|torneo betplay).*(colombi|columbia|kolumbi)/, id: 240 },
  { test: /colombi|columbia|\bkolumbi/, id: 239 },
  { test: /chile/, id: 265 },
];

/** Gdy skład ligi z kuponu nie ma obu klubów — tylko ligi-sąsiedzi tego samego kraju / homonim nazwy. */
export const SIBLING_LEAGUES: Record<number, number[]> = {
  78: [218, 79],
  79: [78],
  218: [78],
  119: [120],
  120: [119],
  135: [71, 136],
  136: [135],
  71: [72],
  72: [71],
  140: [141],
  141: [140],
  265: [266],
  266: [265],
  239: [240],
  240: [239],
  307: [308],
  308: [307],
  203: [204],
  204: [203],
  179: [180, 183],
  180: [179],
  183: [179],
  207: [208],
  208: [207],
  345: [346],
  346: [345],
  244: [245],
  245: [244],
  388: [389],
  389: [388],
  106: [107],
  107: [106],
  128: [129],
  129: [128],
  268: [269],
  269: [268],
  286: [287],
  287: [286],
  408: [407],
  407: [408],
};

const ID_TO_LEAGUE: Record<number, string> = {
  71: "Brasileirão Série A",
  72: "Brasileirão Série B",
  78: "Bundesliga",
  79: "2. Bundesliga",
  135: "Serie A",
  136: "Serie B",
  218: "Austrian Bundesliga",
  119: "Superliga Denmark",
  120: "1. Division Denmark",
  140: "LaLiga",
  141: "Segunda División",
  265: "Chile Primera División",
  266: "Chile Primera B",
  239: "Colombia Primera A",
  240: "Colombia Primera B",
  419: "Azerbaijan Premier League",
  110: "Cymru Premier",
  172: "Parva Liga",
  210: "HNL",
  307: "Saudi Pro League",
  308: "Saudi First Division",
  203: "Süper Lig",
  204: "TFF 1. Lig",
  179: "Scottish Premiership",
  408: "NIFL Premiership",
  407: "NIFL Championship",
  315: "Premijer Liga",
  585: "Uganda Premier League",
  383: "Ligat Ha'Al",
  116: "Belarus Premier League",
  388: "Kazakhstan First League",
  389: "Kazakhstan Premier League",
  106: "Ekstraklasa",
  107: "I Liga",
  369: "Uzbekistan Super League",
  268: "Uruguay Primera División",
  269: "Uruguay Segunda División",
  286: "Serbia Super Liga",
  287: "Serbia Prva Liga",
  128: "Liga Profesional Argentina",
  129: "Primera Nacional",
  207: "Swiss Super League",
  208: "Swiss Challenge League",
  345: "Czech First League",
  346: "Czech FNL",
  244: "Veikkausliiga",
  245: "Ykkönen",
  180: "Scottish Championship",
  340: "V-League",
  296: "Thai League 1",
  368: "Singapore Premier League",
};

export function leagueIdFromHint(hint?: string): number | null {
  if (!hint) return null;
  const n = norm(hint);
  if (!n || n === "inna liga") return null;
  if (/superettan/.test(n)) return 114;
  if (/uzbek/.test(n)) return 369;
  if (/urugw|uruguay/.test(n)) return 268;
  if (/serb/.test(n)) return 286;
  if (/challenge league/.test(n)) return 208;
  if (/\bfnl\b|chl[- ]?fnl/.test(n)) return 346;
  if (/ykkonen|ykkosliiga|ykkos/.test(n)) return 245;
  if (/veikkaus/.test(n)) return 244;
  if (/calcutt|kolkata/.test(n)) return 1020;
  // Mizoram Premier League: brak id w API-Football. MUSI być przed katalogiem /premier league/ → 39.
  if (/\bmizoram\b|lawngtlai|lawtngtlai/.test(n)) return null;
  // Egipt Premier League: „Egipt - Premier League” / Egyptian… MUSI być przed /premier league/ → 39.
  if (/\begipt\b|\begypt\b|\begyptian\b/.test(n)) return 233;
  if (/wietnam|\bvietnam\b|v[- ]?league/.test(n)) return 340;
  if (/tajland|\bthailand\b|thai league/.test(n)) return 296;
  if (/singapur|\bsingapore\b/.test(n)) return 368;
  if (/\bi liga\b|fortuna 1 liga/.test(n) && !/rumun|romania/.test(n)) return 107;
  if (/\bnifl\b|northern ireland|irlandia polnoc|polnocn\w* irland/.test(n)) return 408;
  if (/(kazachstan|kazakhstan).*(first|1\s*(liga|league|division)|pervaya)|first.*(kazach|kazakh)/.test(n)) return 388;
  if (/kazachstan|kazakhstan/.test(n)) return 389;
  if (/azerbejd|azerbaij|premyer\s*liq/.test(n)) return 419;
  if (/cymru|\bwalia\b|\bwales\b/.test(n)) return 110;
  if (/bu[lł]garia|\bbulgaria\b|\bparva\b|\befbet/.test(n)) return 172;
  if (/chorwacj|\bcroatia\b|\bhnl\b/.test(n)) return 210;
  if (/uganda/.test(n)) return 585;
  if (/izrael|\bisrael\b|ligat\s*ha/.test(n)) return 383;
  if (/bialorus|\bbelarus\b|vysshaya|vysheyshaya/.test(`${n} ${hint}`.toLowerCase().replace(/ł/g, "l"))) return 116;
  if (/bosn|hercegowin|herzegovin|premijer/.test(n)) return 315;
  if (/virsliga|lotwa|\blatvia\b/.test(`${n} ${hint}`.toLowerCase().replace(/ł/g, "l"))) return 365;
  if (/(saudyjsk|\bsaudi\b|arabia saud)/.test(`${n} ${hint}`.toLowerCase()) && /division|first/.test(n)) return 308;
  if (/saudyjsk|\bsaudi\b|arabia saud/.test(`${n} ${hint}`.toLowerCase())) return 307;
  if (/(turcj|turkey|turkiye|t[uü]rkiye)/.test(n) && /1\.?\s*lig/.test(n) && !/super|s[uü]per/.test(n)) return 204;
  if (/tff\s*1/.test(n)) return 204;
  if (/szkoc|scotland/.test(n) && /championship/.test(n)) return 180;
  if (/szkoc|scotland/.test(n)) return 179;
  if (/\bpremiership\b/.test(n) && !/north|irland|ireland|\bnifl\b/.test(n)) return 179;
  if (/(argentyn|argentina)/.test(`${n} ${hint}`.toLowerCase()) && /nacional/.test(`${n} ${hint}`.toLowerCase())) return 129;
  if (/(argentyn|argentina)/.test(`${n} ${hint}`.toLowerCase())) return 128;
  if (/(norweg|norway)/.test(`${n} ${hint}`.toLowerCase()) && /1\.?\s*division/.test(`${n} ${hint}`.toLowerCase())) return 104;
  if (/obos[- ]?liga/.test(`${n} ${hint}`.toLowerCase())) return 104;
  if (/2\.?\s*bundesliga/.test(n)) return 79;
  if (/(austri|oster)/.test(n)) return 218;
  if (/(dania|denmark)/.test(n) && /1\.?\s*division/.test(n)) return 120;
  if (/(rumun|romania)/.test(n)) return 283;
  if (/(dania|denmark)/.test(n) && /superliga/.test(n)) return 119;
  if (/\bcolombi|\bcolumbia\b|\bkolumbi/.test(n) && /primera b|torneo betplay/.test(n)) return 240;
  if (/\bcolombi|\bcolumbia\b|\bkolumbi/.test(n)) return 239;
  if (/chile/.test(n) && /primera b/.test(n)) return 266;
  if (/chile/.test(n)) return 265;
  if (/brasileir|brazil|brazyl/.test(n)) return 71;
  if (/laliga\s*2|la liga 2/.test(n)) return 141;
  for (const row of LEAGUE_CATALOG) {
    if (row.test.test(n)) return row.id;
  }
  return null;
}

function seasonYear(seasons?: { year?: number; current?: boolean }[]): number {
  const list = seasons ?? [];
  const nowY = new Date().getFullYear();
  const current = list.find((s) => s.current);
  if (current?.year && current.year <= nowY) return current.year;
  const years = list.map((s) => s.year).filter((y): y is number => typeof y === "number" && y <= nowY).sort((a, b) => b - a);
  if (years[0]) return years[0];
  const now = new Date();
  return now.getMonth() >= 6 ? nowY : nowY - 1;
}

async function seasonFor(leagueId: number, key: string): Promise<number> {
  const rows = await afGet<AfLeagueRow>("/leagues", { id: leagueId }, key).catch(() => [] as AfLeagueRow[]);
  return seasonYear(rows[0]?.seasons);
}

async function findLeagueBySearch(hint: string, key: string): Promise<{ leagueId: number; season: number } | null> {
  const queries = bookieSearchQueries(hint);
  if (!queries.length) return null;
  let best: AfLeagueRow | null = null;
  let bestScore = -1;
  for (const q of queries) {
    const rows = await afGet<AfLeagueRow>("/leagues", { search: q.slice(0, 48) }, key).catch(() => [] as AfLeagueRow[]);
    for (const r of rows) {
      const name = r.league?.name || "";
      if (/women|u19|u21|friendly|club friendly/i.test(name)) continue;
      let s = nameScore(name, hint);
      for (const q2 of queries) s = Math.max(s, nameScore(name, q2));
      s += countryBoost(r.country?.name, hint);
      if (/^league$/i.test(r.league?.type || "")) s += 8;
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }
  }
  const id = best?.league?.id;
  if (!id || bestScore < 40) return null;
  return { leagueId: id, season: seasonYear(best?.seasons) };
}

async function leagueRoster(
  leagueId: number,
  season: number,
  key: string,
): Promise<{ team?: AfTeam; venue?: { city?: string } }[]> {
  try {
    return await afGet<{ team?: AfTeam; venue?: { city?: string } }>(
      "/teams",
      { league: leagueId, season },
      key,
    );
  } catch (e) {
    if (isAfRateLimit(e)) throw e;
    return [];
  }
}

function isAfRateLimit(e: unknown): boolean {
  return /rateLimit|429|Too many requests/i.test(e instanceof Error ? e.message : String(e));
}

/** Para z kolejki: /teams sezonu bywa niepełny (Chile 2026), fixture z daty ma oba kluby. */
export function pickTeamsFromFixtures(
  rows: AfFixture[],
  home: string,
  away: string,
): { home: AfTeamHit; away: AfTeamHit; leagueId: number; season: number } | null {
  let best: { home: AfTeamHit; away: AfTeamHit; leagueId: number; season: number; score: number } | null = null;
  for (const f of rows) {
    const hn = f.teams?.home?.name;
    const an = f.teams?.away?.name;
    if (!hn || !an || !f.teams.home?.id || !f.teams.away?.id) continue;
    const direct = rosterNameScore(hn, home) + rosterNameScore(an, away);
    const swapped = rosterNameScore(hn, away) + rosterNameScore(an, home);
    const leagueId = f.league?.id || 0;
    const season = f.league?.season || 0;
    if (direct >= 90 && (!best || direct > best.score)) {
      best = { home: f.teams.home, away: f.teams.away, leagueId, season, score: direct };
    }
    if (swapped >= 90 && swapped > direct && (!best || swapped > best.score)) {
      best = { home: f.teams.away, away: f.teams.home, leagueId, season, score: swapped };
    }
  }
  if (!best) return null;
  return { home: best.home, away: best.away, leagueId: best.leagueId, season: best.season };
}

async function teamsFromKickoffFixtures(
  leagueId: number,
  season: number,
  kickoff: string,
  home: string,
  away: string,
  key: string,
): Promise<{ home: AfTeamHit; away: AfTeamHit; leagueId: number; season: number } | null> {
  const ms = Date.parse(kickoff || "") || Date.now();
  const dates = [0, -1, 1].map((off) => new Date(ms + off * 86_400_000).toISOString().slice(0, 10));
  const seen = new Set<number>();
  const rows: AfFixture[] = [];
  for (const date of dates) {
    const pack = await afGet<AfFixture>("/fixtures", { league: leagueId, season, date }, key).catch((e) => {
      if (isAfRateLimit(e)) throw e;
      return [] as AfFixture[];
    });
    for (const f of pack) {
      const id = f.fixture?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(f);
    }
  }
  return pickTeamsFromFixtures(rows, home, away);
}

async function enrichTeamCity(team: AfTeamHit, key: string): Promise<AfTeamHit> {
  if (team.city) return team;
  const rows = await afGet<{ team: AfTeam; venue?: { city?: string } }>("/teams", { id: team.id }, key).catch(
    () => [] as { team: AfTeam; venue?: { city?: string } }[],
  );
  const city = rows[0]?.venue?.city;
  return city ? { ...team, city } : team;
}

export function formFixturePool(leagueFix: AfFixture[], allFix: AfFixture[]): AfFixture[] {
  if (leagueFix.length) return leagueFix;
  const cups = allFix.filter((f) => !isFriendly(f));
  if (cups.length) return cups;
  return allFix;
}

async function timingFromEvents(
  teamId: number,
  fixtures: AfFixture[],
  key: string,
): Promise<{
  after60: number;
  secondHalf: number;
  perId: Record<number, { gf1h: number; ga1h: number; gf2h: number; ga2h: number }>;
}> {
  const ids = fixtures.slice(0, 10).map((f) => f.fixture.id).filter(Boolean);
  const empty = { after60: 0, secondHalf: 0, perId: {} as Record<number, { gf1h: number; ga1h: number; gf2h: number; ga2h: number }> };
  if (!ids.length) return empty;
  const packs = await Promise.all(
    ids.map((id) =>
      afGet<{ type?: string; time?: { elapsed?: number; extra?: number }; team?: { id?: number }; detail?: string }>(
        "/fixtures/events",
        { fixture: id },
        key,
      ).catch(() => []),
    ),
  );
  let goals = 0;
  let after60 = 0;
  let secondHalf = 0;
  const perId: Record<number, { gf1h: number; ga1h: number; gf2h: number; ga2h: number }> = {};
  for (let i = 0; i < packs.length; i++) {
    const fid = ids[i];
    const row = { gf1h: 0, ga1h: 0, gf2h: 0, ga2h: 0 };
    for (const e of packs[i]) {
      if ((e.type || "") !== "Goal") continue;
      if (/missed penalty/i.test(e.detail || "")) continue;
      const min = (e.time?.elapsed || 0) + (e.time?.extra || 0);
      const scored = e.team?.id === teamId;
      if (min >= 46) {
        if (scored) row.gf2h++;
        else row.ga2h++;
      } else {
        if (scored) row.gf1h++;
        else row.ga1h++;
      }
      if (scored) {
        goals++;
        if (min >= 46) secondHalf++;
        if (min >= 61) after60++;
      }
    }
    perId[fid] = row;
  }
  if (!goals) return { after60: 0, secondHalf: 0, perId };
  return {
    after60: Math.round((100 * after60) / goals),
    secondHalf: Math.round((100 * secondHalf) / goals),
    perId,
  };
}

async function lastFixtures(teamId: number, key: string, n = 10): Promise<AfFixture[]> {
  const rows = await afGet<AfFixture>(
    "/fixtures",
    { team: teamId, last: Math.max(n, 20) },
    key,
  );
  const played = rows.filter((f) => {
    if (f.goals?.home == null || f.goals?.away == null) return false;
    const st = String(f.fixture?.status?.short || "").toUpperCase();
    return !st || st === "FT" || st === "AET" || st === "PEN";
  });
  const official = played.filter((f) => !isFriendly(f));
  const pool = official.length ? official : played;
  return pool.slice(0, n);
}

async function lastLeagueFixtures(
  teamId: number,
  leagueId: number,
  season: number,
  key: string,
  n = 10,
): Promise<AfFixture[]> {
  const rows = await afGet<AfFixture>(
    "/fixtures",
    { team: teamId, league: leagueId, season },
    key,
  ).catch(() => [] as AfFixture[]);
  const played = rows.filter((f) => {
    if (f.goals?.home == null || f.goals?.away == null) return false;
    const st = String(f.fixture?.status?.short || "").toUpperCase();
    return !st || st === "FT" || st === "AET" || st === "PEN";
  });
  return [...played].sort((a, b) => (b.fixture?.date || "").localeCompare(a.fixture?.date || "")).slice(0, n);
}

const standingsMemo = new Map<string, Promise<{ rank: number; points: number; played: number; teamId: number }[]>>();

async function standingsTable(
  leagueId: number,
  season: number,
  key: string,
): Promise<{ rank: number; points: number; played: number; teamId: number }[]> {
  const ck = `${leagueId}:${season}:${key.slice(0, 6)}`;
  const hit = standingsMemo.get(ck);
  if (hit) return hit;
  const pending = (async () => {
    const rows = await afGet<{
      league: {
        standings: { rank: number; points: number; all: { played: number }; team: { id: number } }[][];
      };
    }>("/standings", { league: leagueId, season }, key).catch(() => []);
    const out: { rank: number; points: number; played: number; teamId: number }[] = [];
    for (const block of rows) {
      const groups = block.league?.standings ?? [];
      for (const group of groups) {
        for (const row of group) {
          if (row.team?.id) {
            out.push({ rank: row.rank, points: row.points, played: row.all?.played ?? 0, teamId: row.team.id });
          }
        }
      }
    }
    return out;
  })();
  standingsMemo.set(ck, pending);
  return pending;
}

async function standingsFor(
  leagueId: number,
  season: number,
  teamId: number,
  key: string,
): Promise<{ rank: number; points: number; played: number } | null> {
  const table = await standingsTable(leagueId, season, key);
  const row = table.find((r) => r.teamId === teamId);
  return row && row.rank > 0 ? row : null;
}

/** Tabela tam, gdzie klub naprawdę jest — nie 0/0 bo kupon ma ligę z zeszłego sezonu. */
async function resolveStanding(
  teamId: number,
  hinted: { leagueId: number; season: number } | null,
  fixtures: AfFixture[],
  key: string,
): Promise<{
  standing: { rank: number; points: number; played: number } | null;
  league: { leagueId: number; season: number } | null;
}> {
  const tries: { leagueId: number; season: number }[] = [];
  const add = (x: { leagueId: number; season: number } | null | undefined) => {
    if (!x?.leagueId || !x.season || x.season < 2000) return;
    if (tries.some((t) => t.leagueId === x.leagueId && t.season === x.season)) return;
    tries.push(x);
  };
  add(hinted);
  add(inferLeague(fixtures));
  if (hinted) {
    for (const sib of SIBLING_LEAGUES[hinted.leagueId] || []) {
      const sy = await seasonFor(sib, key).catch(() => hinted.season);
      add({ leagueId: sib, season: sy });
    }
    add({ leagueId: hinted.leagueId, season: hinted.season - 1 });
    for (const sib of SIBLING_LEAGUES[hinted.leagueId] || []) {
      add({ leagueId: sib, season: hinted.season - 1 });
    }
  }
  for (const t of tries) {
    const row = await standingsFor(t.leagueId, t.season, teamId, key);
    if (row) return { standing: row, league: t };
  }
  return { standing: null, league: hinted };
}

async function h2hFixtures(homeId: number, awayId: number, key: string, n = 10): Promise<AfFixture[]> {
  const rows = await afGet<AfFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}` }, key).catch(
    () => [],
  );
  const played = rows.filter((f) => f.goals?.home != null && f.goals?.away != null);
  const official = played.filter((f) => !isFriendly(f));
  const pool = official.length ? official : played;
  return [...pool].sort((a, b) => (b.fixture?.date || "").localeCompare(a.fixture?.date || "")).slice(0, n);
}

function h2hFromFixtures(homeId: number, awayId: number, fixtures: AfFixture[]) {
  const out: AfFixture[] = [];
  const seen = new Set<string>();
  for (const f of fixtures) {
    const hid = f.teams?.home?.id;
    const aid = f.teams?.away?.id;
    if (!hid || !aid) continue;
    if (!([hid, aid].includes(homeId) && [hid, aid].includes(awayId))) continue;
    if (f.goals?.home == null || f.goals?.away == null) continue;
    const k = `${(f.fixture?.date || "").slice(0, 10)}|${hid}|${aid}|${f.goals.home}:${f.goals.away}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function formFromFixtures(
  teamId: number,
  fixtures: AfFixture[],
  skipDate?: string,
  ctx?: {
    ranks?: Map<number, number>;
    tableN?: number;
    box?: Record<number, { corners?: number; cards?: number; sot?: number; gf1h?: number; ga1h?: number; gf2h?: number; ga2h?: number }>;
  },
) {
  const form = [];
  const tableN = ctx?.tableN || 16;
  for (const f of fixtures.slice(0, 10)) {
    const isHome = f.teams.home.id === teamId;
    const sf = isHome ? (f.goals.home as number) : (f.goals.away as number);
    const sa = isHome ? (f.goals.away as number) : (f.goals.home as number);
    const opp = isHome ? f.teams.away.name : f.teams.home.name;
    const oppId = isHome ? f.teams.away.id : f.teams.home.id;
    const dt = (f.fixture.date || "").slice(0, 10);
    if (skipDate && dt === skipDate.slice(0, 10)) continue;
    const oppPos = ctx?.ranks?.get(oppId) || 0;
    const box = f.fixture.id ? ctx?.box?.[f.fixture.id] : undefined;
    let gf1h = box?.gf1h;
    let ga1h = box?.ga1h;
    let gf2h = box?.gf2h;
    let ga2h = box?.ga2h;
    const halfSum = (gf1h || 0) + (ga1h || 0) + (gf2h || 0) + (ga2h || 0);
    const htH = f.score?.halftime?.home;
    const htA = f.score?.halftime?.away;
    if (halfSum === 0 && sf + sa > 0 && htH != null && htA != null) {
      gf1h = isHome ? htH : htA;
      ga1h = isHome ? htA : htH;
      gf2h = Math.max(0, sf - gf1h);
      ga2h = Math.max(0, sa - ga1h);
    }
    form.push({
      date: dt,
      opponent: opp,
      ha: (isHome ? "H" : "A") as "H" | "A",
      scoreFor: sf,
      scoreAgainst: sa,
      quality: classifyOppQuality(oppPos, tableN),
      comp: isFriendly(f) ? ("SPARING" as const) : isContinentalOrCup(f) ? ("PUCHAR" as const) : ("LIGA" as const),
      corners: box?.corners,
      cards: box?.cards,
      sot: box?.sot,
      oppPos: oppPos || undefined,
      gf1h,
      ga1h,
      gf2h,
      ga2h,
    });
  }
  return form;
}

type MinuteBucket = { total?: number | string; percentage?: string };
type TeamStats = {
  team?: { name?: string };
  fixtures?: { played?: { total?: number; home?: number; away?: number } };
  goals?: {
    for?: {
      minute?: Record<string, MinuteBucket>;
      average?: { total?: string | number; home?: string | number; away?: string | number };
      total?: { total?: number; home?: number; away?: number };
    };
    against?: {
      minute?: Record<string, MinuteBucket>;
      average?: { total?: string | number; home?: string | number; away?: string | number };
      total?: { total?: number; home?: number; away?: number };
    };
  };
  cards?: {
    yellow?: Record<string, MinuteBucket>;
    red?: Record<string, MinuteBucket>;
  };
};
type FixtureStatBlock = {
  team: { id: number };
  statistics: { type: string; value: number | string | null }[];
};
type ExtraBlock = {
  xg: number;
  xga: number;
  corners: number;
  shotsOnTarget: number;
  cards: number;
  possession: number;
  goalsAfter60Pct: number;
  goalsSecondHalfPct: number;
};

function minutePct(bucket?: MinuteBucket): number {
  if (!bucket) return 0;
  if (bucket.percentage != null && String(bucket.percentage).trim() !== "") {
    const n = Number(String(bucket.percentage).replace("%", "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function timingFromMinutes(minute?: Record<string, MinuteBucket>): { after60: number; secondHalf: number } {
  if (!minute) return { after60: 0, secondHalf: 0 };
  let totalGoals = 0;
  let after60Goals = 0;
  let shGoals = 0;
  for (const [k, b] of Object.entries(minute)) {
    const g = Number(b?.total);
    if (!Number.isFinite(g) || g <= 0) continue;
    totalGoals += g;
    const lo = parseInt(k, 10);
    if (Number.isFinite(lo) && lo >= 46) shGoals += g;
    if (Number.isFinite(lo) && lo >= 61) after60Goals += g;
  }
  if (totalGoals > 0) {
    return {
      after60: Math.round((100 * after60Goals) / totalGoals),
      secondHalf: Math.round((100 * shGoals) / totalGoals),
    };
  }
  const p = (k: string) => minutePct(minute[k]);
  const after60 = Math.round(p("61-75") + p("76-90") + p("91-105"));
  const secondHalf = Math.round(p("46-60") + p("61-75") + p("76-90") + p("91-105"));
  return {
    after60: Math.max(0, Math.min(100, after60)),
    secondHalf: Math.max(0, Math.min(100, secondHalf)),
  };
}

function cardTotal(cards?: TeamStats["cards"], played = 0): number {
  if (!cards) return 0;
  const sum = (side?: Record<string, MinuteBucket>) =>
    side ? Object.values(side).reduce((a, b) => a + (Number(b.total) || 0), 0) : 0;
  const n = sum(cards.yellow) + sum(cards.red);
  if (!played || !n) return n ? Math.round(n * 10) / 10 : 0;
  return Math.round((n / played) * 100) / 100;
}

function statNum(stats: FixtureStatBlock["statistics"], type: string): number {
  const row = stats.find((s) => s.type.toLowerCase() === type.toLowerCase());
  if (row?.value == null) return 0;
  if (typeof row.value === "number") return row.value;
  const n = parseFloat(String(row.value).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function statMaybe(stats: FixtureStatBlock["statistics"], types: string[]): number | null {
  for (const type of types) {
    const row = stats.find((s) => (s.type || "").toLowerCase() === type.toLowerCase());
    if (!row || row.value == null || row.value === "") continue;
    if (typeof row.value === "number" && Number.isFinite(row.value)) return row.value;
    const n = parseFloat(String(row.value).replace("%", "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function fixtureAverages(
  teamId: number,
  fixtures: AfFixture[],
  key: string,
): Promise<{
  sot: number;
  corners: number;
  cards: number;
  possession: number;
  xg: number;
  xga: number;
  perId: Record<number, { corners?: number; cards?: number }>;
}> {
  const ids = [...new Set(fixtures.slice(0, 10).map((f) => f.fixture.id).filter(Boolean))];
  const empty = { sot: 0, corners: 0, cards: 0, possession: 0, xg: 0, xga: 0, perId: {} as Record<number, { corners?: number; cards?: number; sot?: number }> };
  if (!ids.length) return empty;
  const packs = await Promise.all(
    ids.map((id) =>
      afGet<FixtureStatBlock>("/fixtures/statistics", { fixture: id }, key).catch(() => [] as FixtureStatBlock[]),
    ),
  );
  let nSot = 0;
  let nCor = 0;
  let nCards = 0;
  let nPoss = 0;
  let sot = 0;
  let corners = 0;
  let cards = 0;
  let poss = 0;
  let xg = 0;
  let xga = 0;
  let nXg = 0;
  const perId: Record<number, { corners?: number; cards?: number; sot?: number }> = {};
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i];
    const fid = ids[i];
    const block = pack.find((p) => p.team?.id === teamId);
    const opp = pack.find((p) => p.team?.id && p.team.id !== teamId);
    if (!block?.statistics?.length) continue;
    const sSot = statMaybe(block.statistics, ["Shots on Goal", "Shots on Target", "ShotonGoal", "Shots On Target"]);
    const sCor = statMaybe(block.statistics, ["Corner Kicks", "Corners"]);
    const yel = statMaybe(block.statistics, ["Yellow Cards", "Yellow Card"]);
    const red = statMaybe(block.statistics, ["Red Cards", "Red Card"]);
    const sPoss = statMaybe(block.statistics, ["Ball Possession", "Possession"]);
    if (sSot != null) {
      sot += sSot;
      nSot++;
    }
    if (sCor != null) {
      corners += sCor;
      nCor++;
    }
    if (yel != null || red != null) {
      cards += (yel ?? 0) + (red ?? 0);
      nCards++;
    }
    if (sPoss != null) {
      poss += sPoss;
      nPoss++;
    }
    if (sCor != null || yel != null || red != null || sSot != null) {
      perId[fid] = {
        corners: sCor ?? undefined,
        cards: yel != null || red != null ? (yel ?? 0) + (red ?? 0) : undefined,
        sot: sSot ?? undefined,
      };
    }
    const x = xgFromStats(block.statistics);
    const xa = opp ? xgFromStats(opp.statistics) : 0;
    if (x > 0 || xa > 0) {
      xg += x;
      xga += xa;
      nXg++;
    }
  }
  const avg = (v: number, d: number) => (d ? Math.round((v / d) * 100) / 100 : 0);
  return {
    sot: avg(sot, nSot),
    corners: avg(corners, nCor),
    cards: avg(cards, nCards),
    possession: avg(poss, nPoss),
    xg: avg(xg, nXg),
    xga: avg(xga, nXg),
    perId,
  };
}

async function teamSeasonStats(teamId: number, leagueId: number, season: number, key: string): Promise<TeamStats | null> {
  const rows = await afGet<TeamStats>("/teams/statistics", { team: teamId, league: leagueId, season }, key).catch(
    () => [],
  );
  return rows[0] ?? null;
}

function xgFromStats(stats: FixtureStatBlock["statistics"]): number {
  const row = stats.find((s) => {
    const t = (s.type || "").toLowerCase().replace(/_/g, " ").trim();
    return t === "expected goals" || t === "xg" || t === "expected_goals";
  });
  if (row?.value == null) return 0;
  if (typeof row.value === "number") return row.value;
  const n = parseFloat(String(row.value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const WMO: Record<number, string> = {
  0: "bezchmurnie",
  1: "głównie pogodnie",
  2: "częściowe zachmurzenie",
  3: "pochmurno",
  45: "mgła",
  48: "mgła osadzająca",
  51: "mżawka",
  61: "deszcz",
  63: "deszcz umiarkowany",
  65: "silny deszcz",
  71: "śnieg",
  73: "śnieg umiarkowany",
  75: "silny śnieg",
  80: "przelotny deszcz",
  81: "silne przelotne deszcze",
  95: "burza",
  96: "burza z gradem",
};

async function fetchRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response | null> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      last = res;
      if (res.status === 429) {
        await sleep(600 * (i + 1));
        continue;
      }
      return res;
    } catch {
      await sleep(350 * (i + 1));
    }
  }
  return last;
}

async function geocodeCity(city: string): Promise<{ latitude: number; longitude: number; name?: string } | null> {
  const om = await fetchRetry(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
  );
  if (om?.ok) {
    const geo = (await om.json()) as { results?: { latitude: number; longitude: number; name?: string }[] };
    const hit = geo.results?.[0];
    if (hit?.latitude != null && hit?.longitude != null) return hit;
  }
  const nom = await fetchRetry(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`,
    { headers: { "User-Agent": "exact-v26/1.0 (league analysis)" } },
  );
  if (nom?.ok) {
    const rows = (await nom.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const hit = rows[0];
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude, name: hit?.display_name };
    }
  }
  return null;
}

const MET_SYMBOL: Record<string, string> = {
  clearsky: "bezchmurnie",
  fair: "głównie pogodnie",
  partlycloudy: "częściowe zachmurzenie",
  cloudy: "pochmurno",
  fog: "mgła",
  lightrain: "mżawka",
  rain: "deszcz",
  heavyrain: "silny deszcz",
  rainsnowers: "przelotny deszcz",
  rainshowers: "przelotny deszcz",
  snow: "śnieg",
  thunderstorm: "burza",
};

function metDesc(symbol?: string): string {
  if (!symbol) return "warunki z met.no";
  const base = symbol.replace(/_day|_night|_polartwilight/g, "");
  return MET_SYMBOL[base] || base.replace(/_/g, " ");
}

async function weatherFromMetNo(lat: number, lon: number, city: string, date: string): Promise<string> {
  const res = await fetchRetry(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
    { headers: { "User-Agent": "exact-v26/1.0 https://x.ai" } },
  );
  if (!res?.ok) return "";
  const json = (await res.json()) as {
    properties?: {
      timeseries?: Array<{
        time?: string;
        data?: {
          instant?: { details?: { air_temperature?: number; wind_speed?: number } };
          next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
          next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
        };
      }>;
    };
  };
  const series = json.properties?.timeseries ?? [];
  if (!series.length) return "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const pick =
    (day ? series.find((s) => (s.time || "").startsWith(day) && /T1[456]/.test(s.time || "")) : null) ||
    (day ? series.find((s) => (s.time || "").startsWith(day)) : null) ||
    series[0];
  const temp = pick?.data?.instant?.details?.air_temperature;
  const windMs = pick?.data?.instant?.details?.wind_speed;
  const rain =
    pick?.data?.next_6_hours?.details?.precipitation_amount ??
    pick?.data?.next_1_hours?.details?.precipitation_amount ??
    0;
  const symbol = pick?.data?.next_6_hours?.summary?.symbol_code || pick?.data?.next_1_hours?.summary?.symbol_code;
  if (temp == null) return "";
  const windKmh = Math.round((windMs ?? 0) * 3.6);
  return `${city}: ${metDesc(symbol)}, ${Math.round(temp)}°C, opad ${rain} mm, wiatr ${windKmh} km/h (met.no${day ? `, ${day}` : ""}).`;
}

async function weatherLine(city?: string, kickoff?: string): Promise<string> {
  if (!city) return "";
  try {
    const hit = await geocodeCity(city);
    if (!hit) return `${city}: brak geokodowania stadionu — bez korekty goli.`;
    const date = (kickoff || "").slice(0, 10);
    const useDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const wxUrl = useDate
      ? `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&start_date=${date}&end_date=${date}&timezone=auto`
      : `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;
    const wxRes = await fetchRetry(wxUrl, {}, 1);
    if (wxRes?.ok) {
      const wx = (await wxRes.json()) as {
        current?: { temperature_2m?: number; precipitation?: number; wind_speed_10m?: number; weather_code?: number };
        daily?: {
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_sum?: number[];
          wind_speed_10m_max?: number[];
          weather_code?: number[];
        };
      };
      if (wx.daily?.temperature_2m_max?.length) {
        const code = wx.daily.weather_code?.[0] ?? 0;
        const tmax = wx.daily.temperature_2m_max[0];
        const tmin = wx.daily.temperature_2m_min?.[0];
        const rain = wx.daily.precipitation_sum?.[0] ?? 0;
        const wind = wx.daily.wind_speed_10m_max?.[0] ?? 0;
        const desc = WMO[code] || `kod pogody ${code}`;
        return `${city}: ${desc}, ${Math.round(tmin ?? tmax)}–${Math.round(tmax)}°C, opad ${rain} mm, wiatr ${Math.round(wind)} km/h (Open-Meteo${useDate ? `, ${date}` : ""}).`;
      }
      if (wx.current) {
        const code = wx.current.weather_code ?? 0;
        const desc = WMO[code] || `kod pogody ${code}`;
        return `${city}: ${desc}, ${Math.round(wx.current.temperature_2m ?? 0)}°C, opad ${wx.current.precipitation ?? 0} mm, wiatr ${Math.round(wx.current.wind_speed_10m ?? 0)} km/h (Open-Meteo).`;
      }
    }
    const met = await weatherFromMetNo(hit.latitude, hit.longitude, city, date);
    if (met) return met;
    const code = wxRes?.status ? `HTTP ${wxRes.status}` : "timeout";
    return `${city}: brak odczytu Open-Meteo (${code}) — bez korekty goli.`;
  } catch {
    return `${city}: brak odczytu Open-Meteo — bez korekty goli.`;
  }
}

async function injuriesLine(teamId: number, name: string, season: number, key: string, kickoff?: string): Promise<string> {
  const pack = await injuriesPack(teamId, name, season, key, kickoff);
  return pack.text;
}

type SquadSide = { text: string; count: number; gk: boolean; key: boolean; mass: boolean; fetched: boolean };

async function squadRoster(teamId: number, key: string): Promise<Map<string, { pos: string; number: number }>> {
  const map = new Map<string, { pos: string; number: number }>();
  const rows = await afGet<{ players?: { name?: string; position?: string; number?: number }[] }>("/players/squads", { team: teamId }, key).catch(() => []);
  for (const row of rows) {
    for (const p of row.players || []) {
      const n = foldPlayerName(p.name || "");
      if (n) map.set(n, { pos: String(p.position || ""), number: Number(p.number) || 0 });
    }
  }
  return map;
}

async function injuriesPack(teamId: number, name: string, season: number, key: string, kickoff?: string): Promise<SquadSide> {
  try {
    const rows = await afGet<{
      player?: { name?: string; pos?: string; type?: string; number?: number };
      reason?: string;
      fixture?: { date?: string };
    }>("/injuries", { team: teamId, season }, key);
    const roster = await squadRoster(teamId, key);
    let starterGk: number | undefined;
    for (const v of roster.values()) {
      if (!/goalkeeper|keeper|bramkarz/i.test(v.pos) || !v.number) continue;
      if (starterGk == null || v.number < starterGk) starterGk = v.number;
    }
    const events: InjuryEvent[] = [];
    for (const r of rows) {
      const player = r.player?.name?.trim();
      if (!player) continue;
      const sq = lookupSquad(player, roster);
      events.push({
        name: player,
        reason: r.reason || "",
        type: r.player?.type || "",
        pos: sq?.pos || r.player?.pos || "",
        number: sq?.number || r.player?.number || 0,
        fixtureDate: r.fixture?.date || "",
      });
    }
    return classifyMatchInjuries(events, name, kickoff, starterGk);
  } catch {
    return { text: "", count: 0, gk: false, key: false, mass: false, fetched: false };
  }
}

async function coachName(teamId: number, key: string): Promise<string> {
  const rows = await afGet<{
    name?: string;
    firstname?: string;
    lastname?: string;
    career?: { start?: string; end?: string | null; team?: { id?: number } }[];
  }>("/coachs", { team: teamId }, key).catch(() => []);
  const label = (c?: (typeof rows)[0]) =>
    (c?.name || [c?.firstname, c?.lastname].filter(Boolean).join(" ")).trim();
  const open = rows.find((c) => (c.career || []).some((x) => x.team?.id === teamId && !x.end));
  return label(open) || label(rows[0]) || "";
}

function teamBlock(
  name: string,
  teamId: number,
  fixtures: AfFixture[],
  standing: { rank: number; points: number; played: number } | null,
  extra?: Partial<ExtraBlock>,
  skipDate?: string,
  formCtx?: {
    ranks?: Map<number, number>;
    tableN?: number;
    box?: Record<number, { corners?: number; cards?: number; sot?: number; gf1h?: number; ga1h?: number; gf2h?: number; ga2h?: number }>;
  },
) {
  const form = formFromFixtures(teamId, fixtures, skipDate, formCtx);
  const n = form.length;
  const clip = (g: number) => clipEarlyOutlierGoals(g, n);
  const avg = (sel: (m: (typeof form)[0]) => number) =>
    n ? Math.round((form.reduce((a, m) => a + sel(m), 0) / n) * 100) / 100 : 0;
  const pct = (pred: (m: (typeof form)[0]) => boolean) =>
    n ? Math.round((100 * form.filter(pred).length) / n) : 0;
  const homeM = form.filter((m) => m.ha === "H");
  const awayM = form.filter((m) => m.ha === "A");
  return {
    name,
    tablePos: standing?.rank ?? 0,
    points: standing?.points ?? 0,
    played: standing?.played || n,
    form,
    gfAvg: avg((m) => clip(m.scoreFor)),
    gaAvg: avg((m) => clip(m.scoreAgainst)),
    gfHome: homeM.length ? Math.round((homeM.reduce((s, m) => s + clip(m.scoreFor), 0) / homeM.length) * 100) / 100 : 0,
    gaHome: homeM.length ? Math.round((homeM.reduce((s, m) => s + clip(m.scoreAgainst), 0) / homeM.length) * 100) / 100 : 0,
    gfAway: awayM.length ? Math.round((awayM.reduce((s, m) => s + clip(m.scoreFor), 0) / awayM.length) * 100) / 100 : 0,
    gaAway: awayM.length ? Math.round((awayM.reduce((s, m) => s + clip(m.scoreAgainst), 0) / awayM.length) * 100) / 100 : 0,
    csPctOverall: pct((m) => m.scoreAgainst === 0),
    csPctHome: homeM.length ? Math.round((100 * homeM.filter((m) => m.scoreAgainst === 0).length) / homeM.length) : 0,
    csPctAway: awayM.length ? Math.round((100 * awayM.filter((m) => m.scoreAgainst === 0).length) / awayM.length) : 0,
    bttsPct: pct((m) => m.scoreFor > 0 && m.scoreAgainst > 0),
    over25Pct: pct((m) => m.scoreFor + m.scoreAgainst >= 3),
    xg: extra?.xg ?? 0,
    xga: extra?.xga ?? 0,
    corners: extra?.corners ?? 0,
    shotsOnTarget: extra?.shotsOnTarget ?? 0,
    cards: extra?.cards ?? 0,
    possession: extra?.possession ?? 0,
    goalsAfter60Pct: extra?.goalsAfter60Pct ?? 0,
    goalsSecondHalfPct: extra?.goalsSecondHalfPct ?? 0,
  };
}

export type AfPrevVenueSums = {
  playedHome: number;
  playedAway: number;
  gfHomeSum: number;
  gaHomeSum: number;
  gfAwaySum: number;
  gaAwaySum: number;
  url: string;
};

/** Zeszły sezon H/A z API-Football (sumy, nie średnie). Brak 4 liczb → null. */
export async function fetchAfLastSeasonVenue(name: string, league: string): Promise<AfPrevVenueSums | null> {
  const key = resolveAfKey();
  if (!key) return null;
  const leagueId = leagueIdFromHint(league);
  if (!leagueId) return null;
  const cur = await seasonFor(leagueId, key);
  const prev = cur - 1;
  if (!(prev > 1990)) return null;
  const roster = await leagueRoster(leagueId, prev, key);
  const picked = pickBestTeam(roster, name, league);
  if (!picked || picked.score < 45) return null;
  const st = await teamSeasonStats(picked.hit.id, leagueId, prev, key);
  if (!st) return null;
  const ph = Number(st.fixtures?.played?.home) || 0;
  const pa = Number(st.fixtures?.played?.away) || 0;
  const gfh = Number(st.goals?.for?.total?.home) || 0;
  const gah = Number(st.goals?.against?.total?.home) || 0;
  const gfa = Number(st.goals?.for?.total?.away) || 0;
  const gaa = Number(st.goals?.against?.total?.away) || 0;
  if (!(ph > 0 && pa > 0)) return null;
  return {
    playedHome: ph,
    playedAway: pa,
    gfHomeSum: gfh,
    gaHomeSum: gah,
    gfAwaySum: gfa,
    gaAwaySum: gaa,
    url: `api-football teams/statistics team ${picked.hit.id} league ${leagueId} season ${prev}`,
  };
}

/**
 * Zbiera formę + H2H + pozycje + timing/SOT/rożne/kartki/kadrę z API-Football.
 * Kolejka: drugi mecz czeka, zamiast dostać 429 i zostać bez aktualizacji.
 */
let afTail: Promise<void> = Promise.resolve();

function withAfLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = afTail.then(fn, fn);
  afTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function gatherFromApiFootball(input: {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
}): Promise<AfFactsResult> {
  return withAfLock(() => gatherFromApiFootballUnlocked(input));
}

async function gatherFromApiFootballUnlocked(input: {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
}): Promise<AfFactsResult> {
  const key = resolveAfKey();
  if (!key) {
    return { facts: "", citations: [], error: "Brak API_FOOTBALL_KEY — ustaw klucz api-sports.io w .env" };
  }

  try {
    let league = resolveLeague(input.home, input.away, input.league);
    const leagueSpecified = Boolean(league && !/^inna liga$/i.test(league.trim()));
    let hintedId = leagueIdFromHint(league);
    if (!hintedId) {
      const clubLg = leagueHintFromClubs(input.home, input.away);
      const clubId = clubLg ? leagueIdFromHint(clubLg) : null;
      if (clubId) {
        hintedId = clubId;
        league = clubLg || league;
      }
    }
    let hintedLeague: { leagueId: number; season: number } | null = null;
    if (hintedId) {
      const season = await seasonFor(hintedId, key);
      hintedLeague = { leagueId: hintedId, season };
    } else if (leagueSpecified && sparseBoxLeague(league, input.home, input.away)) {
      // Liga zmapowana (MPL itd.), brak katalogu AF — scout zbiera formę. Nie abort „nie znaleziono ligi”.
      return { facts: "", citations: [] };
    } else if (leagueSpecified && league) {
      hintedLeague = await findLeagueBySearch(league, key);
    }

    let homeTeam: AfTeamHit | null = null;
    let awayTeam: AfTeamHit | null = null;
    let rosterHits = 0;

    if (hintedLeague) {
      let roster = await leagueRoster(hintedLeague.leagueId, hintedLeague.season, key);
      if (hintedLeague.season > 2000) {
        const prev = hintedLeague.season - 1;
        const prevRoster = await leagueRoster(hintedLeague.leagueId, prev, key);
        if (!roster.length && prevRoster.length) {
          roster = prevRoster;
          hintedLeague = { leagueId: hintedLeague.leagueId, season: prev };
        } else if (prevRoster.length) {
          const seen = new Set(roster.map((r) => r.team?.id).filter(Boolean));
          for (const row of prevRoster) {
            const id = row.team?.id;
            if (id && !seen.has(id)) roster.push(row);
          }
        }
      }
      const hPick = pickBestTeam(roster, input.home, league);
      const aPick = pickBestTeam(roster, input.away, league);
      if (hPick && aPick && hPick.hit.id === aPick.hit.id) {
        if (hPick.score >= aPick.score) {
          if (hPick.score >= 45) {
            homeTeam = hPick.hit;
            rosterHits++;
          }
        } else if (aPick.score >= 45) {
          awayTeam = aPick.hit;
          rosterHits++;
        }
      } else {
        if (hPick && hPick.score >= 45) {
          homeTeam = hPick.hit;
          rosterHits++;
        }
        if (aPick && aPick.score >= 45) {
          awayTeam = aPick.hit;
          rosterHits++;
        }
      }
    }

    if (hintedLeague && (!homeTeam || !awayTeam)) {
      for (const sib of SIBLING_LEAGUES[hintedLeague.leagueId] || []) {
        const sibSeason = await seasonFor(sib, key);
        let sibRoster = await leagueRoster(sib, sibSeason, key);
        let usedSeason = sibSeason;
        if (!sibRoster.length && sibSeason > 2000) {
          sibRoster = await leagueRoster(sib, sibSeason - 1, key);
          if (sibRoster.length) usedSeason = sibSeason - 1;
        } else if (sibSeason > 2000) {
          const prevSib = await leagueRoster(sib, sibSeason - 1, key);
          if (prevSib.length) {
            const seen = new Set(sibRoster.map((r) => r.team?.id).filter(Boolean));
            for (const row of prevSib) {
              const id = row.team?.id;
              if (id && !seen.has(id)) sibRoster.push(row);
            }
          }
        }
        const hPick = pickBestTeam(sibRoster, input.home, league);
        const aPick = pickBestTeam(sibRoster, input.away, league);
        const h = hPick && hPick.score >= 45 ? hPick.hit : null;
        const a = aPick && aPick.score >= 45 ? aPick.hit : null;
        if (h && !homeTeam) homeTeam = h;
        if (a && !awayTeam) awayTeam = a;
        if (h && a) {
          homeTeam = h;
          awayTeam = a;
          hintedLeague = { leagueId: sib, season: usedSeason };
          rosterHits = 2;
          if (ID_TO_LEAGUE[sib]) league = ID_TO_LEAGUE[sib];
          break;
        }
      }
    }

    // Kupon/OCR wskazał złą ligę (Swiss 207, Chile 265, Süper Lig 203) — kluby znają właściwą.
    if (!homeTeam || !awayTeam) {
      const clubLg = leagueHintFromClubs(input.home, input.away);
      const clubId = clubLg ? leagueIdFromHint(clubLg) : null;
      if (clubId && clubId !== hintedLeague?.leagueId) {
        const clubSeason = await seasonFor(clubId, key);
        let clubRoster = await leagueRoster(clubId, clubSeason, key);
        let usedSeason = clubSeason;
        if (clubSeason > 2000) {
          const prevRoster = await leagueRoster(clubId, clubSeason - 1, key);
          if (!clubRoster.length && prevRoster.length) {
            clubRoster = prevRoster;
            usedSeason = clubSeason - 1;
          } else if (prevRoster.length) {
            const seen = new Set(clubRoster.map((r) => r.team?.id).filter(Boolean));
            for (const row of prevRoster) {
              const id = row.team?.id;
              if (id && !seen.has(id)) clubRoster.push(row);
            }
          }
        }
        const hPick = pickBestTeam(clubRoster, input.home, clubLg || league);
        const aPick = pickBestTeam(clubRoster, input.away, clubLg || league);
        const h = hPick && hPick.score >= 45 ? hPick.hit : null;
        const a = aPick && aPick.score >= 45 ? aPick.hit : null;
        if (h && a) {
          homeTeam = h;
          awayTeam = a;
          hintedLeague = { leagueId: clubId, season: usedSeason };
          rosterHits = 2;
          league = ID_TO_LEAGUE[clubId] || clubLg || league;
        } else {
          if (h && !homeTeam) homeTeam = h;
          if (a && !awayTeam) awayTeam = a;
          if (h || a) {
            hintedLeague = { leagueId: clubId, season: usedSeason };
            rosterHits = (homeTeam ? 1 : 0) + (awayTeam ? 1 : 0);
            league = ID_TO_LEAGUE[clubId] || clubLg || league;
          }
        }
      }
    }

    // Kolejka z daty: skład /teams bywa bez klubu (Huachipato Chile 2026), fixture ma oba.
    if ((!homeTeam || !awayTeam) && hintedLeague) {
      const fromFx = await teamsFromKickoffFixtures(
        hintedLeague.leagueId,
        hintedLeague.season,
        input.kickoff || "",
        input.home,
        input.away,
        key,
      );
      if (fromFx) {
        if (!homeTeam) homeTeam = fromFx.home;
        if (!awayTeam) awayTeam = fromFx.away;
        if (fromFx.leagueId) hintedLeague = { leagueId: fromFx.leagueId, season: fromFx.season || hintedLeague.season };
        rosterHits = (homeTeam ? 1 : 0) + (awayTeam ? 1 : 0);
      }
    }

    // Liga znana → TYLKO skład tej ligi (żadnych homonimów USL/Rwanda/Man Utd).
    if (leagueSpecified) {
      if (!hintedLeague) {
        return {
          facts: "",
          citations: [],
          error: `API-Football: nie znaleziono ligi „${league}”. Wybierz ligę z listy albo doprecyzuj nazwę — nie szukam klubów globalnie.`,
        };
      }
      if (homeTeam && !awayTeam) {
        awayTeam = await findOpponentVia(homeTeam, input.away, key, league);
      }
      if (awayTeam && !homeTeam) {
        homeTeam = await findOpponentVia(awayTeam, input.home, key, league);
      }
      if (!homeTeam || !awayTeam) {
        const sameCountry = async (name: string) => {
          const t = await findTeamId(name, key, league);
          if (!t || countryBoost(t.country, league) <= 0) return null;
          return t;
        };
        if (!homeTeam) homeTeam = await sameCountry(input.home);
        if (!awayTeam) awayTeam = await sameCountry(input.away);
      }
      if (!homeTeam || !awayTeam) {
        return {
          facts: "",
          citations: [],
          error: `API-Football: ${!homeTeam ? input.home : input.away} nie jest w składzie ligi ${league} (id ${hintedLeague.leagueId} sezon ${hintedLeague.season}). Nie szukam homonimów z innych krajów.`,
        };
      }
    } else {
      if (!homeTeam) homeTeam = await findTeamId(input.home, key, league);
      if (!awayTeam) awayTeam = await findTeamId(input.away, key, league);
      if (homeTeam && !awayTeam) {
        awayTeam = await findOpponentVia(homeTeam, input.away, key, league);
      }
      if (awayTeam && !homeTeam) {
        homeTeam = await findOpponentVia(awayTeam, input.home, key, league);
      }
      if (!homeTeam || !awayTeam) {
        return {
          facts: "",
          citations: [],
          error: `API-Football: nie znaleziono drużyn (${input.home}=${homeTeam?.id ?? "?"} / ${input.away}=${awayTeam?.id ?? "?"})`,
        };
      }
    }

    if (homeTeam.id === awayTeam.id) {
      return {
        facts: "",
        citations: [],
        error: `API-Football: ${input.home} i ${input.away} zlały się w ten sam klub (id ${homeTeam.id}). To homonim — poprawiam matching, nie liczę meczu.`,
      };
    }

    [homeTeam, awayTeam] = await Promise.all([enrichTeamCity(homeTeam, key), enrichTeamCity(awayTeam, key)]);

    const [homeFix, awayFix, h2h] = await Promise.all([
      lastFixtures(homeTeam.id, key, 15),
      lastFixtures(awayTeam.id, key, 15),
      h2hFixtures(homeTeam.id, awayTeam.id, key, 10),
    ]);
    const h2hMerged = [...h2h, ...h2hFromFixtures(homeTeam.id, awayTeam.id, [...homeFix, ...awayFix])];

    let homeStand = null;
    let awayStand = null;
    const hintedForTable = rosterHits >= 1 && hintedLeague ? hintedLeague : null;
    const [homeResolved, awayResolved] = await Promise.all([
      resolveStanding(homeTeam.id, hintedForTable || inferLeague(homeFix, league), homeFix, key),
      resolveStanding(awayTeam.id, hintedForTable || inferLeague(awayFix, league), awayFix, key),
    ]);
    const homeLeague = homeResolved.league;
    const awayLeague = awayResolved.league;
    homeStand = homeResolved.standing;
    awayStand = awayResolved.standing;
    const season = homeLeague?.season || awayLeague?.season || new Date().getFullYear();

    const wave1 = await Promise.allSettled([
      homeLeague ? teamSeasonStats(homeTeam.id, homeLeague.leagueId, homeLeague.season, key) : Promise.resolve(null),
      awayLeague ? teamSeasonStats(awayTeam.id, awayLeague.leagueId, awayLeague.season, key) : Promise.resolve(null),
      injuriesPack(homeTeam.id, homeTeam.name, homeLeague?.season || season, key, input.kickoff),
      injuriesPack(awayTeam.id, awayTeam.name, awayLeague?.season || season, key, input.kickoff),
      coachName(homeTeam.id, key),
      coachName(awayTeam.id, key),
      weatherLine(homeTeam.city, input.kickoff),
    ]);

    const val1 = <T,>(i: number, fallback: T): T =>
      wave1[i].status === "fulfilled" ? (wave1[i] as PromiseFulfilledResult<T>).value : fallback;

    const homeTs = val1<TeamStats | null>(0, null);
    const awayTs = val1<TeamStats | null>(1, null);
    const emptySide: SquadSide = { text: "", count: 0, gk: false, key: false, mass: false, fetched: false };
    const packH = val1<SquadSide>(2, emptySide);
    const packA = val1<SquadSide>(3, emptySide);
    const injH = packH.text || `Brak zgłoszonych kontuzji ${homeTeam.name} (API-Football, sezon ${season}).`;
    const injA = packA.text || `Brak zgłoszonych kontuzji ${awayTeam.name} (API-Football, sezon ${season}).`;
    const coachH = val1(4, "");
    const coachA = val1(5, "");
    const weather = val1(6, homeTeam.city ? `${homeTeam.city}: brak odczytu Open-Meteo — bez korekty goli.` : "");

    const emptyAvg = { sot: 0, corners: 0, cards: 0, possession: 0, xg: 0, xga: 0, perId: {} as Record<number, { corners?: number; cards?: number }> };
    const [homeLeagueFix, awayLeagueFix] = await Promise.all([
      homeLeague
        ? lastLeagueFixtures(homeTeam.id, homeLeague.leagueId, homeLeague.season, key, 10)
        : Promise.resolve(homeFix),
      awayLeague
        ? lastLeagueFixtures(awayTeam.id, awayLeague.leagueId, awayLeague.season, key, 10)
        : Promise.resolve(awayFix),
    ]);
    const wave2 = await Promise.allSettled([
      fixtureAverages(homeTeam.id, homeLeagueFix.length ? homeLeagueFix : homeFix, key),
      fixtureAverages(awayTeam.id, awayLeagueFix.length ? awayLeagueFix : awayFix, key),
    ]);
    const val2 = <T,>(i: number, fallback: T): T =>
      wave2[i].status === "fulfilled" ? (wave2[i] as PromiseFulfilledResult<T>).value : fallback;
    let homeAvg = val2(0, emptyAvg);
    let awayAvg = val2(1, emptyAvg);
    // Premyer Liqa / ligi bez boxu — SOT/xG z ostatnich oficjalnych (puchary UEFA tego sezonu).
    const needHomeBox = !homeAvg.sot && homeFix.length > 0;
    const needAwayBox = !awayAvg.sot && awayFix.length > 0;
    if (needHomeBox || needAwayBox) {
      const retry = await Promise.allSettled([
        needHomeBox ? fixtureAverages(homeTeam.id, homeFix, key) : Promise.resolve(homeAvg),
        needAwayBox ? fixtureAverages(awayTeam.id, awayFix, key) : Promise.resolve(awayAvg),
      ]);
      const take = <T,>(i: number, fallback: T): T =>
        retry[i].status === "fulfilled" ? (retry[i] as PromiseFulfilledResult<T>).value : fallback;
      if (needHomeBox) {
        const extra = take(0, emptyAvg);
        if (extra.sot || extra.corners) homeAvg = extra;
      }
      if (needAwayBox) {
        const extra = take(1, emptyAvg);
        if (extra.sot || extra.corners) awayAvg = extra;
      }
    }

    if (sparseBoxLeague(league, input.home, input.away)) {
      if (!Object.keys(homeAvg.perId || {}).length) {
        homeAvg = { ...homeAvg, sot: 0, corners: 0 };
      }
      if (!Object.keys(awayAvg.perId || {}).length) {
        awayAvg = { ...awayAvg, sot: 0, corners: 0 };
      }
    }

    let homeTime = timingFromMinutes(homeTs?.goals?.for?.minute);
    let awayTime = timingFromMinutes(awayTs?.goals?.for?.minute);
    const homeFormFix = formFixturePool(homeLeagueFix, homeFix);
    const awayFormFix = formFixturePool(awayLeagueFix, awayFix);
    const [homeHalf, awayHalf] = await Promise.all([
      timingFromEvents(homeTeam.id, homeFormFix, key),
      timingFromEvents(awayTeam.id, awayFormFix, key),
    ]);
    if (!homeTime.after60 && !homeTime.secondHalf) {
      homeTime = { after60: homeHalf.after60, secondHalf: homeHalf.secondHalf };
    }
    if (!awayTime.after60 && !awayTime.secondHalf) {
      awayTime = { after60: awayHalf.after60, secondHalf: awayHalf.secondHalf };
    }
    const mergeBox = (
      stats: Record<number, { corners?: number; cards?: number; sot?: number }>,
      halves: Record<number, { gf1h: number; ga1h: number; gf2h: number; ga2h: number }>,
    ) => {
      const ids = new Set([...Object.keys(stats), ...Object.keys(halves)].map(Number));
      const out: Record<number, { corners?: number; cards?: number; sot?: number; gf1h?: number; ga1h?: number; gf2h?: number; ga2h?: number }> = {};
      for (const id of ids) out[id] = { ...stats[id], ...halves[id] };
      return out;
    };
    const homePlayed = homeTs?.fixtures?.played?.total || homeFix.length;
    const awayPlayed = awayTs?.fixtures?.played?.total || awayFix.length;

    const [homeTable, awayTable] = await Promise.all([
      homeLeague ? standingsTable(homeLeague.leagueId, homeLeague.season, key) : Promise.resolve([]),
      awayLeague ? standingsTable(awayLeague.leagueId, awayLeague.season, key) : Promise.resolve([]),
    ]);
    const homeRanks = new Map(homeTable.map((r) => [r.teamId, r.rank]));
    const awayRanks = new Map(awayTable.map((r) => [r.teamId, r.rank]));

    const home = teamBlock(homeTeam.name, homeTeam.id, homeFormFix, homeStand, {
      xg: homeAvg.xg,
      xga: homeAvg.xga,
      corners: homeAvg.corners,
      shotsOnTarget: homeAvg.sot,
      cards: homeAvg.cards || cardTotal(homeTs?.cards, homePlayed),
      possession: homeAvg.possession,
      goalsAfter60Pct: homeTime.after60,
      goalsSecondHalfPct: homeTime.secondHalf,
    }, input.kickoff, {
      ranks: homeRanks,
      tableN: homeTable.length || 16,
      box: mergeBox(homeAvg.perId, homeHalf.perId),
    });
    const away = teamBlock(awayTeam.name, awayTeam.id, awayFormFix, awayStand, {
      xg: awayAvg.xg,
      xga: awayAvg.xga,
      corners: awayAvg.corners,
      shotsOnTarget: awayAvg.sot,
      cards: awayAvg.cards || cardTotal(awayTs?.cards, awayPlayed),
      possession: awayAvg.possession,
      goalsAfter60Pct: awayTime.after60,
      goalsSecondHalfPct: awayTime.secondHalf,
    }, input.kickoff, {
      ranks: awayRanks,
      tableN: awayTable.length || 16,
      box: mergeBox(awayAvg.perId, awayHalf.perId),
    });

    const h2hMapped = h2hMerged.slice(0, 10).map((f) => ({
      date: (f.fixture.date || "").slice(0, 10),
      home: f.teams.home.name,
      away: f.teams.away.name,
      score: `${f.goals.home}:${f.goals.away}`,
      competition: f.league?.name || "",
    }));
    let h2hFinal = h2hMapped;
    if (h2hMapped.length < 6) {
      try {
        const extra = await fetchFotmobH2h({
          home: input.home,
          away: input.away,
          league: league || "",
          kickoff: input.kickoff || "",
        });
        if (extra.length) h2hFinal = mergeH2h(h2hMapped, extra);
      } catch {
        /* H2H z FotMob nie blokuje Fazy 1 */
      }
    }

    const facts = {
      source: "api-football",
      match: {
        league: league || homeFix[0]?.league?.name || "",
        kickoff: input.kickoff || "",
        homePos: home.tablePos,
        awayPos: away.tablePos,
        ptsHome: home.points,
        ptsAway: away.points,
      },
      home,
      away,
      h2h: h2hFinal,
      injuries: `${injH} ${injA}`.trim(),
      squadFetched: !!(packH.fetched || packA.fetched),
      squadVerified: !!(packH.fetched || packA.fetched),
      outHome: { gk: packH.gk, key: packH.key, mass: packH.mass, count: packH.count },
      outAway: { gk: packA.gk, key: packA.key, mass: packA.mass, count: packA.count },
      coach:
        [coachH && `${homeTeam.name}: ${coachH}`, coachA && `${awayTeam.name}: ${coachA}`].filter(Boolean).join(" · ") ||
        `Trenerzy: API-Football nie podało aktualnego nazwiska — bez korekty kadry (sezon ${season}).`,
      weather: weather || (homeTeam.city ? `${homeTeam.city}: brak odczytu Open-Meteo — bez korekty goli.` : "Pogoda: brak miasta stadionu w źródle — bez korekty goli."),
      sources: [
        "https://www.api-football.com",
        `api-football team ${homeTeam.id}/${awayTeam.id}`,
        homeLeague ? `api-football league ${homeLeague.leagueId} season ${homeLeague.season}` : "",
        awayLeague && awayLeague.leagueId !== homeLeague?.leagueId
          ? `api-football league ${awayLeague.leagueId} season ${awayLeague.season}`
          : "",
        weather ? "https://open-meteo.com" : "",
        /met\.no/.test(weather) ? "https://api.met.no" : "",
      ].filter(Boolean),
    };

    const formN = home.form.length + away.form.length;
    if (formN < 2) {
      return {
        facts: JSON.stringify(facts),
        citations: ["https://www.api-football.com"],
        error: `API-Football: za mało meczów w formie (formN=${formN})`,
      };
    }

    return {
      facts: JSON.stringify(facts),
      citations: [
        "https://www.api-football.com",
        "https://www.api-football.com/documentation-v3",
        ...(weather ? ["https://open-meteo.com"] : []),
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isAfRateLimit(e) || /rateLimit|429|Too many requests/i.test(msg)) {
      return {
        facts: "",
        citations: [],
        error: "API-Football: dzienny limit zapytań. Poczekaj chwilę i naciśnij Spróbuj ponownie ten mecz — to nie brak klubu w lidze.",
      };
    }
    return { facts: "", citations: [], error: msg };
  }
}

type LineupRow = {
  team?: { id?: number; name?: string };
  startXI?: { player?: { name?: string; pos?: string } }[];
  startXi?: { player?: { name?: string; pos?: string } }[];
};

function parseXi(row: LineupRow | undefined): { name: string; pos: string }[] {
  const out: { name: string; pos: string }[] = [];
  const pack = row?.startXI || row?.startXi || [];
  for (const s of pack) {
    const name = (s.player?.name || "").trim();
    if (!name) continue;
    out.push({ name, pos: String(s.player?.pos || "") });
  }
  return out;
}

async function findFixturePair(
  homeId: number,
  awayId: number,
  kickoff: string,
  key: string,
): Promise<AfFixture | null> {
  const kickoffMs = Date.parse(kickoff || "") || Date.now();
  const within = (fx: AfFixture | null) => {
    if (!fx) return null;
    const t = Date.parse(fx.fixture?.date || "");
    if (Number.isFinite(t) && Math.abs(t - kickoffMs) > 42 * 3600_000) return null;
    return fx;
  };
  const last = await afGet<AfFixture>("/fixtures", { team: homeId, last: 20 }, key).catch(() => [] as AfFixture[]);
  const fromLast = within(pickClosestFixture(last, kickoffMs, awayId));
  if (fromLast) return fromLast;
  const next = await afGet<AfFixture>("/fixtures", { team: homeId, next: 8 }, key).catch(() => [] as AfFixture[]);
  const fromNext = within(pickClosestFixture(next, kickoffMs, awayId));
  if (fromNext) return fromNext;
  const h2h = await afGet<AfFixture>("/fixtures/headtohead", { h2h: `${homeId}-${awayId}` }, key).catch(() => [] as AfFixture[]);
  return within(pickClosestFixture(h2h, kickoffMs, awayId));
}

async function fixtureForKickoff(
  homeId: number,
  awayId: number,
  kickoff: string,
  key: string,
): Promise<AfFixture | null> {
  return findFixturePair(homeId, awayId, kickoff, key);
}

export function afTeamIdsFromSources(sources?: string[]): { homeId: number; awayId: number } | null {
  for (const s of sources || []) {
    const m = String(s).match(/api-football team (\d+)\/(\d+)/);
    if (m) return { homeId: Number(m[1]), awayId: Number(m[2]) };
  }
  return null;
}

/** T−60: lineups + absencje. Nie rusza formy/H2H/Fill. */
export async function confirmLineupsT60(input: {
  home: string;
  away: string;
  league: string;
  kickoff?: string;
  oddsHome?: number;
  oddsAway?: number;
  favorite?: FavoriteSide;
  sources?: string[];
}): Promise<{ overlay: T60Overlay; citations: string[]; error?: string }> {
  const empty = buildT60Overlay({
    favorite: input.favorite || "home",
    homeName: input.home,
    awayName: input.away,
    homeXi: [],
    awayXi: [],
    outHome: { names: [], gk: false, key: false, mass: false },
    outAway: { names: [], gk: false, key: false, mass: false },
  });
  const key = resolveAfKey();
  if (!key) return { overlay: empty, citations: [], error: "Brak API_FOOTBALL_KEY" };
  try {
    const known = afTeamIdsFromSources(input.sources);
    let homeTeam: AfTeamHit | null = known ? { id: known.homeId, name: input.home } : null;
    let awayTeam: AfTeamHit | null = known ? { id: known.awayId, name: input.away } : null;
    if (!homeTeam || !awayTeam) {
      const hintedId = leagueIdFromHint(input.league);
      if (hintedId) {
        const season = await seasonFor(hintedId, key);
        let roster = await leagueRoster(hintedId, season, key);
        if (season > 2000) {
          const prev = await leagueRoster(hintedId, season - 1, key);
          const seen = new Set(roster.map((r) => r.team?.id).filter(Boolean));
          for (const row of prev) {
            const id = row.team?.id;
            if (id && !seen.has(id)) roster.push(row);
          }
        }
        const hPick = pickBestTeam(roster, input.home, input.league);
        const aPick = pickBestTeam(roster, input.away, input.league);
        if (hPick && hPick.score >= 45) homeTeam = hPick.hit;
        if (aPick && aPick.score >= 45) awayTeam = aPick.hit;
      }
    }
    if (!homeTeam) homeTeam = await findTeamId(input.home, key, input.league);
    if (!awayTeam) awayTeam = await findTeamId(input.away, key, input.league);
    if (!homeTeam || !awayTeam) {
      return { overlay: empty, citations: [], error: "Nie znaleziono drużyn pod lineups." };
    }
    let fx = await fixtureForKickoff(homeTeam.id, awayTeam.id, input.kickoff || "", key);
    if (!fx?.fixture?.id) {
      const hintedId = leagueIdFromHint(input.league);
      if (hintedId) {
        const season = await seasonFor(hintedId, key);
        const dates = [0, -1, 1].map((off) => {
          const ms = Date.parse(input.kickoff || "") || Date.now();
          return new Date(ms + off * 86_400_000).toISOString().slice(0, 10);
        });
        for (const date of dates) {
          const pack = await afGet<AfFixture>("/fixtures", { league: hintedId, season, date }, key).catch((e) => {
            if (isAfRateLimit(e)) throw e;
            return [] as AfFixture[];
          });
          const hit = pickTeamsFromFixtures(pack, input.home, input.away);
          if (hit) {
            const row = pack.find(
              (f) =>
                (f.teams?.home?.id === hit.home.id && f.teams?.away?.id === hit.away.id) ||
                (f.teams?.home?.id === hit.away.id && f.teams?.away?.id === hit.home.id),
            );
            if (row?.fixture?.id) {
              fx = row;
              homeTeam = hit.home;
              awayTeam = hit.away;
              break;
            }
          }
        }
      }
    }
    if (!fx?.fixture?.id) {
      return { overlay: empty, citations: ["https://www.api-football.com"], error: "Brak fixture na T−60." };
    }
    const season = fx.league?.season || new Date().getFullYear();
    const [lineups, packH, packA] = await Promise.all([
      afGet<LineupRow>("/fixtures/lineups", { fixture: fx.fixture.id }, key).catch((e) => {
        if (isAfRateLimit(e)) throw e;
        return [] as LineupRow[];
      }),
      injuriesPack(homeTeam.id, homeTeam.name, season, key, input.kickoff),
      injuriesPack(awayTeam.id, awayTeam.name, season, key, input.kickoff),
    ]);
    const homeRow = lineups.find((r) => r.team?.id === homeTeam.id) || lineups[0];
    const awayRow = lineups.find((r) => r.team?.id === awayTeam.id) || lineups[1];
    let homeXi = parseXi(homeRow);
    let awayXi = parseXi(awayRow);
    const citations = ["https://www.api-football.com", `api-football fixtures/lineups ${fx.fixture.id}`];
    let fotmobKind = "";
    if (homeXi.length < 11 || awayXi.length < 11) {
      const fm = await fetchFotmobLineups({ home: input.home, away: input.away, league: input.league }).catch(() => null);
      fotmobKind = fm?.kind || "";
      const fmOk =
        fm &&
        fm.kind !== "last" &&
        fm.home.length >= 8 &&
        fm.away.length >= 8 &&
        fm.home.length + fm.away.length >= 19;
      if (fmOk) {
        if (homeXi.length < 8) homeXi = fm.home;
        if (awayXi.length < 8) awayXi = fm.away;
        citations.push("https://www.fotmob.com");
      }
    }
    let favorite: FavoriteSide = input.favorite || "home";
    if (typeof input.oddsHome === "number" && typeof input.oddsAway === "number") {
      if (input.oddsAway + 0.02 < input.oddsHome) favorite = "away";
      else if (input.oddsHome + 0.02 < input.oddsAway) favorite = "home";
    }
    const namesFrom = (text: string, team: string) => {
      const chunk = text.split(team)[1] || text;
      return chunk
        .replace(/\(API-Football[^)]*\)/g, "")
        .split(/;/)
        .map((s) => s.replace(/\(.*?\)/g, "").replace(/^[^:]*:\s*/, "").trim())
        .filter((s) => s.length > 2 && !/brak zg/i.test(s));
    };
    const overlay = buildT60Overlay({
      favorite,
      homeName: homeTeam.name,
      awayName: awayTeam.name,
      homeXi,
      awayXi,
      outHome: { names: namesFrom(packH.text, homeTeam.name), gk: packH.gk, key: packH.key, mass: packH.mass },
      outAway: { names: namesFrom(packA.text, awayTeam.name), gk: packA.gk, key: packA.key, mass: packA.mass },
    });
    return {
      overlay,
      citations,
      error: overlay.xiReady
        ? undefined
        : fotmobKind === "last"
          ? "Oficjalne XI jeszcze nie wyszły. FotMob pokazuje ostatni skład, nie dzisiejszy — nie potwierdzam zgadywanki."
          : "XI jeszcze nieopublikowane w API-Football/FotMob.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isAfRateLimit(e) || /rateLimit|429|Too many requests/i.test(msg)) {
      return {
        overlay: empty,
        citations: [],
        error: "API-Football: dzienny limit zapytań. Poczekaj i naciśnij Potwierdź XI · T−60.",
      };
    }
    return { overlay: empty, citations: [], error: msg };
  }
}

export function hasApiFootballKey(): boolean {
  return Boolean(resolveAfKey());
}

type AfEvent = {
  time?: { elapsed?: number; extra?: number };
  team?: { id?: number; name?: string };
  type?: string;
  detail?: string;
  player?: { name?: string };
};

function dayStamp(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function pickClosestFixture(rows: AfFixture[], kickoffMs: number, awayId?: number): AfFixture | null {
  const pool = awayId ? rows.filter((f) => f.teams?.away?.id === awayId || f.teams?.home?.id === awayId) : rows;
  if (!pool.length) return null;
  let best = pool[0];
  let bestDelta = Infinity;
  for (const f of pool) {
    const t = Date.parse(f.fixture?.date || "");
    const d = Number.isFinite(t) ? Math.abs(t - kickoffMs) : 9e15;
    if (d < bestDelta) {
      best = f;
      bestDelta = d;
    }
  }
  return best;
}

export type FtSnapshot = {
  ft: string;
  status: string;
  fixtureId: number;
  kickoff?: string;
  events: { red: boolean; og: boolean; late90: boolean; squad: boolean; details: string[] };
  sources: string[];
  box?: { corners: number | null; yellow: number | null; red: number | null; sot: number | null };
  ht?: string;
};

export async function fetchMatchFt(input: {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
}): Promise<FtSnapshot | { error: string }> {
  const fmP = fetchFotmobFt(input).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const afP = fetchMatchFtApi(input).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const fm = await fmP;
  const fotmobFt = !("error" in fm) && fm.ft && /^(FT|AET|PEN|AWD|WO)$/.test(fm.status);
  if (fotmobFt) {
    const af = await Promise.race([
      afP,
      new Promise<{ error: string }>((r) => setTimeout(() => r({ error: "AF wolne — biorę FotMob" }), 4000)),
    ]);
    if (!("error" in af)) return af;
    return { ...fm, sources: [...fm.sources, `AF fallback: ${af.error}`] };
  }
  const af = await afP;
  if (!("error" in af)) return af;
  if (!("error" in fm)) return { ...fm, sources: [...fm.sources, `AF fallback: ${af.error}`] };
  return { error: `${af.error} · ${fm.error}` };
}

async function fetchMatchFtApi(input: {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
}): Promise<FtSnapshot | { error: string }> {
  const key = resolveAfKey();
  if (!key) return { error: "Brak klucza API-Football." };
  const home = await findTeamId(input.home, key, input.league);
  const away = await findTeamId(input.away, key, input.league);
  if (!home || !away) return { error: "Nie znaleziono klubów pod FT." };

  const fx = await findFixturePair(home.id, away.id, input.kickoff || "", key);
  if (!fx) return { error: "Brak meczu w API-Football na tę datę." };

  const short = (fx.fixture.status?.short || "").toUpperCase();
  const hg = fx.goals?.home;
  const ag = fx.goals?.away;
  const ft = hg == null || ag == null ? "" : `${hg}:${ag}`;
  const sources = [`api-football fixtures ${fx.fixture.id}`];
  const kickoffIso = fx.fixture.date || "";

  if (!/^(FT|AET|PEN|AWD|WO)$/.test(short)) {
    return {
      ft,
      status: short || "NS",
      fixtureId: fx.fixture.id,
      kickoff: kickoffIso,
      events: { red: false, og: false, late90: false, squad: false, details: [] },
      sources,
    };
  }

  const ev = await afGet<AfEvent>("/fixtures/events", { fixture: fx.fixture.id }, key).catch(() => [] as AfEvent[]);
  sources.push(`api-football fixtures/events ${fx.fixture.id}`);
  const details: string[] = [];
  let red = false;
  let og = false;
  let late90 = false;
  for (const e of ev) {
    const min = (e.time?.elapsed || 0) + (e.time?.extra || 0);
    const who = e.player?.name || "NN";
    const side = e.team?.name || "";
    const type = e.type || "";
    const detail = e.detail || "";
    if (type === "Card" && /red|second yellow/i.test(detail)) {
      red = true;
      details.push(`czerwona ${min}' ${who} (${side})`);
    }
    if (type === "Goal" && /own/i.test(detail)) {
      og = true;
      details.push(`samobój ${min}' ${who} (${side})`);
    }
    if (type === "Goal" && !/missed penalty/i.test(detail) && (e.time?.elapsed || 0) >= 90) {
      late90 = true;
      details.push(`gol 90+ ${min}' ${who} (${side})`);
    }
  }

  const htH = fx.score?.halftime?.home;
  const htA = fx.score?.halftime?.away;
  let ht = htH == null || htA == null ? "" : `${htH}:${htA}`;
  if (!ht) {
    let h1 = 0;
    let a1 = 0;
    for (const e of ev) {
      if ((e.type || "") !== "Goal" || /missed penalty/i.test(e.detail || "")) continue;
      const min = (e.time?.elapsed || 0) + (e.time?.extra || 0);
      if (min >= 46) continue;
      if (e.team?.id === home.id) h1++;
      else if (e.team?.id === away.id) a1++;
    }
    if (h1 + a1 > 0) ht = `${h1}:${a1}`;
  }

  return {
    ft,
    status: short,
    fixtureId: fx.fixture.id,
    kickoff: kickoffIso,
    events: { red, og, late90, squad: false, details },
    sources,
    box: await fetchFtBox(fx.fixture.id, key, sources),
    ht,
  };
}

type AfStatRow = {
  team?: { id?: number; name?: string };
  statistics?: Array<{ type?: string; value?: number | string | null }>;
};

function boxStatNum(rows: AfStatRow[], type: string): number | null {
  let sum = 0;
  let hit = false;
  const want = type.toLowerCase();
  for (const row of rows) {
    for (const s of row.statistics || []) {
      if (String(s.type || "").toLowerCase() !== want) continue;
      const n = typeof s.value === "number" ? s.value : Number(s.value);
      if (!Number.isFinite(n)) continue;
      sum += n;
      hit = true;
    }
  }
  return hit ? sum : null;
}

async function fetchFtBox(fixtureId: number, key: string, sources: string[]): Promise<FtSnapshot["box"]> {
  try {
    const rows = await afGet<AfStatRow>("/fixtures/statistics", { fixture: fixtureId }, key);
    sources.push(`api-football fixtures/statistics ${fixtureId}`);
    if (!rows.length) return { corners: null, yellow: null, red: null, sot: null };
    return {
      corners: boxStatNum(rows, "Corner Kicks"),
      yellow: boxStatNum(rows, "Yellow Cards"),
      red: boxStatNum(rows, "Red Cards"),
      sot: boxStatNum(rows, "Shots on Goal") ?? boxStatNum(rows, "Shots on Target"),
    };
  } catch {
    return { corners: null, yellow: null, red: null, sot: null };
  }
}
