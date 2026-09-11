import type { MatchInput, PhasePayload, TeamBlock } from "./types";
import { resolveLeague } from "./leagues";

export type SetPieceKind = "corners" | "shotsOnTarget" | "cards";

const BOUNDS: Record<SetPieceKind, { min: number; max: number }> = {
  corners: { min: 1.5, max: 14 },
  shotsOnTarget: { min: 1, max: 6.5 },
  cards: { min: 0.4, max: 6.5 },
};

const DISC = [
  "kolkata",
  "calcutta",
  "customs",
  "mohammedan",
  "mohun",
  "east",
  "rainbow",
  "peerless",
  "measurer",
  "kidderpore",
  "wari",
  "suruchi",
  "police",
  "mizoram",
  "lawngtlai",
  "lawtngtlai",
  "chanmari",
  "dinthar",
  "levski",
  "cska",
  "1948",
  "slavia",
  "septemvri",
  "ludogorets",
  "kalju",
];

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Węższy match niż clubNameMatches — Police AC ≠ Calcutta Police. */
export function statsClubHit(found: string, wanted: string): boolean {
  const a = fold(found);
  const b = fold(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (compactA.length >= 5 && compactB.length >= 5) {
    if (compactA === compactB || compactA.includes(compactB) || compactB.includes(compactA)) {
      for (const d of DISC) {
        if (a.includes(d) !== b.includes(d)) return false;
      }
      return true;
    }
    if (compactA.length === compactB.length) {
      let dlt = 0;
      for (let i = 0; i < compactA.length; i++) if (compactA[i] !== compactB[i]) dlt++;
      if (dlt === 1) return true;
    }
  }
  if (a.includes(b) || b.includes(a)) {
    for (const d of DISC) {
      if (a.includes(d) !== b.includes(d)) return false;
    }
    return Math.min(a.length, b.length) >= 4;
  }
  const tokens = (s: string) => s.split(" ").filter((t) => t.length >= 3 && !["the", "club", "sc", "ac", "fc", "sofia", "deportes", "deporte", "independiente", "universidad"].includes(t));
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const hit = ta.filter((t) => tb.includes(t));
  if (!hit.length) return false;
  for (const d of DISC) {
    if (a.includes(d) !== b.includes(d)) return false;
  }
  return hit.length >= 1;
}

export function inSetPieceBounds(kind: SetPieceKind, n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  const b = BOUNDS[kind];
  return n >= b.min && n <= b.max;
}

/** Ligi bez boxu w API-Football — SOT/rożne tylko z FotMob/Flashscore. */
export function sparseBoxLeague(league: string, home?: string, away?: string): boolean {
  const names = [league];
  if (home && away) names.push(resolveLeague(home, away, league));
  return names.some((l) => {
    const n = fold(l);
    if (/\bi liga\b/.test(n) && !/rumun|romania/.test(n)) return true;
    if (/v[- ]?league|wietnam|\bvietnam\b/.test(n)) return true;
    if (/thai league|tajland|\bthailand\b/.test(n)) return true;
    if (/singapur|\bsingapore\b/.test(n)) return true;
    return /superettan|obos|(1 division.*(norway|norweg))|((norway|norweg).*1 division)|primera nacional|calcutt|kolkata|mizoram|lawngtlai|lawtngtlai|kazachstan|kazakhstan|virsliga|cymru|\bwalia\b|\bwales\b|uganda|izrael|\bisrael\b|ligat|bosn|hercegowin|herzegovin|premijer|wwin|(saudi.*(division|first))|parva|efbet|(bu[lł]garia)|azerbejd|azerbaij|premyer|uzbek|urugw|uruguay|meistriliiga|premium liiga|\bestoni|(chile.*primera b|primera b.*chile|chile.*ascenso)|(colombia.*primera b|primera b.*colombia|kolumb.*primera b|torneo betplay)|ykkonen|ykkos|\bfnl\b|challenge league/.test(n);
  });
}

function fotmobLeagueQuery(league: string): string {
  const n = fold(league);
  if (/superettan/.test(n)) return "Superettan";
  if (/obos|1 division norway|norweg/.test(n) && /1 division|obos/.test(n)) return "OBOS-ligaen";
  if (/primera nacional/.test(n) || (/(argentyn|argentina)/.test(n) && /nacional/.test(n))) return "Primera Nacional";
  if (/(argentyn|argentina)/.test(n)) return "Liga Profesional";
  if (/calcutt|kolkata|\bcfl\b/.test(n)) return "Calcutta Premier Division";
  if (/mizoram|lawngtlai|lawtngtlai/.test(n)) return "Mizoram Premier League";
  if (/parva|efbet|bu[lł]garia/.test(n)) return "First Professional League";
  if (/uzbek/.test(n)) return "Uzbekistan Super League";
  if (/urugw|uruguay/.test(n)) return "Liga AUF Uruguaya";
  if (/ykkonen|ykkos/.test(n)) return "Ykkösliiga";
  if (/\bfnl\b/.test(n)) return "FNL";
  if (/challenge league/.test(n)) return "Challenge League";
  if (/\bi liga\b|fortuna 1 liga/.test(n) && !/rumun|romania/.test(n)) return "I Liga";
  if (/v[- ]?league|wietnam|\bvietnam\b/.test(n)) return "V-League";
  if (/thai league|tajland|\bthailand\b/.test(n)) return "Thai League 1";
  if (/singapur|\bsingapore\b/.test(n)) return "Singapore Premier League";
  if (/chile.*primera b|primera b.*chile|chile.*ascenso/.test(n)) return "Chile Primera B";
  if (/(colombia|kolumb).*primera b|primera b.*(colombia|kolumb)|torneo betplay/.test(n)) return "Colombia Primera B";
  if (/meistriliiga|premium liiga|\bestoni/.test(n)) return "Meistriliiga";
  return league;
}

export function missingSetPieces(p: PhasePayload): SetPieceKind[] {
  const out: SetPieceKind[] = [];
  if (!(p.home.corners > 0) || !(p.away.corners > 0)) out.push("corners");
  if (!(p.home.shotsOnTarget > 0) || !(p.away.shotsOnTarget > 0)) out.push("shotsOnTarget");
  if (!(p.home.cards > 0) || !(p.away.cards > 0)) out.push("cards");
  return out;
}

/** Kartki w ligach bez boxu często nie ma w żadnym źródle — nie pal 80 s scouta na zgadywanie. */
export function shouldSkipSetPieceScout(p: PhasePayload): boolean {
  const n = fold(`${p.match?.league || ""} ${p.home?.name || ""} ${p.away?.name || ""}`);
  if (/mizoram|lawngtlai|lawtngtlai/.test(n)) return true;
  const miss = missingSetPieces(p);
  if (!miss.length) return true;
  return miss.every((k) => k === "cards");
}

/**
 * Rożne ze screena bukmachera: „Śr. w sezonie: NSS 2.0* - WAR 5.1*”.
 * Tylko gdy Flashscore/FotMob nic nie dały. Kolejność: gospodarz, potem gość.
 */
export function parseBookieCorners(notes: string): { home: number; away: number } | null {
  if (!notes) return null;
  const m = notes.match(
    /śr\.?\s*(?:w\s+sezonie)?\s*:[^\d]{0,48}?(\d+(?:[.,]\d+))\s*\*?\s*[-–]\s*[^\d]{0,24}?(\d+(?:[.,]\d+))/i,
  );
  if (!m) return null;
  const home = Number(m[1].replace(",", "."));
  const away = Number(m[2].replace(",", "."));
  if (!inSetPieceBounds("corners", home) || !inSetPieceBounds("corners", away)) return null;
  return { home, away };
}

/** Zero nie kasuje SOT/rożnych/kartek z drugiego źródła (dysk vs store). */
export function overlayNumericStats(keep: TeamBlock, extra?: TeamBlock | null): TeamBlock {
  if (!extra) return keep;
  const nz = (a: number, b: number) => (a > 0 ? a : b > 0 ? b : a);
  return {
    ...keep,
    corners: nz(keep.corners, extra.corners),
    shotsOnTarget: nz(keep.shotsOnTarget, extra.shotsOnTarget),
    cards: nz(keep.cards, extra.cards),
    xg: nz(keep.xg, extra.xg),
    xga: nz(keep.xga, extra.xga),
    possession: nz(keep.possession, extra.possession),
  };
}

/** Która strona ma kreskę — scout uzupełnia TYLKO tę stronę. */
export function missingSetPieceNote(p: PhasePayload): string {
  const bits: string[] = [];
  const row = (kind: SetPieceKind, label: string) => {
    const h = !(p.home[kind] > 0);
    const a = !(p.away[kind] > 0);
    if (h && a) bits.push(`${label}: obie`);
    else if (h) bits.push(`${label}: tylko ${p.home.name}`);
    else if (a) bits.push(`${label}: tylko ${p.away.name}`);
  };
  row("corners", "rożne");
  row("shotsOnTarget", "SOT");
  row("cards", "kartki");
  return bits.join("; ");
}

export type CornerRow = { home: string; away: string; cornersH: number; cornersA: number };

export function cornerAverages(rows: CornerRow[], homeName: string, awayName: string): { home: number; away: number } {
  const acc = (wanted: string) => {
    const xs: number[] = [];
    for (const r of rows) {
      if (statsClubHit(r.home, wanted)) xs.push(r.cornersH);
      else if (statsClubHit(r.away, wanted)) xs.push(r.cornersA);
    }
    if (xs.length < 2) return 0;
    return Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100;
  };
  return { home: acc(homeName), away: acc(awayName) };
}

function numMaybe(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickSide(
  current: TeamBlock,
  blob: Record<string, unknown> | undefined,
  kind: SetPieceKind,
): number | undefined {
  if (current[kind] > 0) return undefined;
  const n = numMaybe(blob?.[kind]);
  if (!inSetPieceBounds(kind, n)) return undefined;
  return n;
}

/**
 * Nakładka TYLKO na puste SOT/rożne/kartki. Nie rusza formy, kursów, xG, HV.
 * SOT nie przyjmuje „total shots”.
 */
export function overlaySetPieces(
  base: PhasePayload,
  extra: unknown,
  missing: SetPieceKind[],
): { facts: Record<string, unknown>; filled: SetPieceKind[] } {
  const y = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
  const homeBlob = y.home && typeof y.home === "object" ? (y.home as Record<string, unknown>) : undefined;
  const awayBlob = y.away && typeof y.away === "object" ? (y.away as Record<string, unknown>) : undefined;
  const home: Record<string, number> = {};
  const away: Record<string, number> = {};
  const filled: SetPieceKind[] = [];
  const miss = new Set(missing);

  if (miss.has("corners") && Array.isArray(y.matches)) {
    const rows: CornerRow[] = [];
    for (const raw of y.matches) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      const ch = numMaybe(m.cornersH ?? m.homeCorners);
      const ca = numMaybe(m.cornersA ?? m.awayCorners);
      if (!m.home || !m.away || ch < 0 || ca < 0) continue;
      rows.push({ home: String(m.home), away: String(m.away), cornersH: ch, cornersA: ca });
    }
    const avg = cornerAverages(rows, base.home.name, base.away.name);
    if (inSetPieceBounds("corners", avg.home) && !(base.home.corners > 0)) home.corners = avg.home;
    if (inSetPieceBounds("corners", avg.away) && !(base.away.corners > 0)) away.corners = avg.away;
    if (home.corners || away.corners) filled.push("corners");
  }

  if (miss.has("shotsOnTarget") && Array.isArray(y.matches)) {
    const sots: CornerRow[] = [];
    for (const raw of y.matches) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      const sh = numMaybe(m.sotH ?? m.shotsOnTargetH ?? m.homeSot);
      const sa = numMaybe(m.sotA ?? m.shotsOnTargetA ?? m.awaySot);
      if (!m.home || !m.away) continue;
      if (sh <= 0 && sa <= 0) continue;
      sots.push({ home: String(m.home), away: String(m.away), cornersH: sh, cornersA: sa });
    }
    const avg = cornerAverages(sots, base.home.name, base.away.name);
    if (inSetPieceBounds("shotsOnTarget", avg.home) && !(base.home.shotsOnTarget > 0)) home.shotsOnTarget = avg.home;
    if (inSetPieceBounds("shotsOnTarget", avg.away) && !(base.away.shotsOnTarget > 0)) away.shotsOnTarget = avg.away;
    if (home.shotsOnTarget || away.shotsOnTarget) filled.push("shotsOnTarget");
  }

  for (const kind of ["corners", "shotsOnTarget", "cards"] as SetPieceKind[]) {
    if (!miss.has(kind)) continue;
    if (kind === "corners" && (home.corners || away.corners)) continue;
    if (kind === "shotsOnTarget" && (home.shotsOnTarget || away.shotsOnTarget)) continue;
    const h = pickSide(base.home, homeBlob, kind);
    const a = pickSide(base.away, awayBlob, kind);
    if (h != null) home[kind] = h;
    if (a != null) away[kind] = a;
    if (h != null || a != null) filled.push(kind);
  }
  const sources = Array.isArray(y.sources)
    ? y.sources.filter((s): s is string => typeof s === "string" && /^https?:\/\//.test(s)).slice(0, 8)
    : [];
  return {
    facts: {
      sources,
      home,
      away,
    },
    filled,
  };
}

export function setPiecePrompt(input: MatchInput, missing: SetPieceKind[], gapNote = ""): string {
  const need = missing
    .map((k) => (k === "corners" ? "rożne/mecz" : k === "shotsOnTarget" ? "SOT/mecz (celne)" : "kartki/mecz"))
    .join(", ");
  const ligaQ = fotmobLeagueQuery(input.league);
  const sparse = sparseBoxLeague(input.league, input.home, input.away)
    ? `API-Football NIE MA boxu dla ${ligaQ}. MUSISZ wziąć SOT i rożne z min. 2 meczów FotMob/Flashscore/Sofascore (strony meczów, nie zgadywanie).`
    : "";
  return `Uzupełnij TYLKO brakujące średnie na mecz: ${need}.
Mecz: ${input.home} vs ${input.away}, liga ${input.league} (szukaj: ${ligaQ}).
Luka: ${gapNote || need}.
Strony które JUŻ mają liczbę — NIE ruszaj (zostaw null).
ZERO zgadywania. Paywall / brak liczby na stronie → null. NIGDY nie wpisuj 0 jako wypełniacza.
${sparse}

Szukaj max 4 razy, w tej kolejności:
1) site:fotmob.com ${input.home} ${ligaQ} "shots on target" corners
2) site:fotmob.com ${input.away} ${ligaQ} "shots on target" corners
3) site:sofascore.com ${input.home} ${input.away} ${ligaQ} statistics
4) site:totalcorner.com ${ligaQ} ${input.home} corners

Reguły twarde:
- Średnia z min. 2 meczów tej ligi. 1 mecz → null.
- SOT = wyłącznie "shots on target" / "shots on goal" / "celne". ZAKAZ kolumny Shots / Total shots (TotalCorner Shots ≠ SOT).
- Rożne: FotMob / Sofascore / TotalCorner / OddAlerts.
- Kartki: uzupełniaj TYLKO gdy kreska. Jeśli API już ma kartki — null.
- Nie ruszaj formy, kursów, goli, xG, BTTS, HV, EPL, λ.

JSON:
{"sources":["https://www.fotmob.com/"],"matches":[{"home":"${input.home}","away":"Opponent","cornersH":5,"cornersA":4,"sotH":3,"sotA":2}],"home":{"name":"${input.home}","corners":null,"shotsOnTarget":null,"cards":null},"away":{"name":"${input.away}","corners":null,"shotsOnTarget":null,"cards":null}}
Średnią z matches[] policzy silnik gdy ≥2 mecze na klub. Nie podstawiaj Shots jako SOT.`;
}
