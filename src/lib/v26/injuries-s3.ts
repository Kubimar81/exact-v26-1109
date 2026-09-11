/** S3: absencje na TEN mecz, nie katalog sezonu. Nie rusza wzoru Conf 0–105. */

export type InjuryEvent = {
  name: string;
  reason?: string;
  type?: string;
  pos?: string;
  number?: number;
  fixtureDate?: string;
};

export type InjuryPack = {
  text: string;
  count: number;
  gk: boolean;
  key: boolean;
  mass: boolean;
  fetched: boolean;
};

const KEY_POS = /attack|forward|striker|napast|winger|skrzydl|captain|centre.?forward|center.?forward/;
const GK_POS = /goalkeeper|keeper|bramkarz|(^|\b)gk(\b|$)/;

export function foldPlayerName(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function lookupSquad(
  name: string,
  squad: Map<string, { pos: string; number: number }>,
): { pos: string; number: number } | undefined {
  const f = foldPlayerName(name);
  const hit = squad.get(f);
  if (hit) return hit;
  const last = f.split(" ").pop() || "";
  if (last.length < 4) return undefined;
  for (const [k, v] of squad) {
    const kl = k.split(" ").pop() || "";
    if (kl === last) return v;
  }
  return undefined;
}

function inKickoffWindow(fixtureDate: string | undefined, kickoff: string | undefined, now: number): boolean {
  const t = fixtureDate ? Date.parse(fixtureDate) : NaN;
  if (!Number.isFinite(t)) return false;
  const k = kickoff ? Date.parse(kickoff) : NaN;
  if (Number.isFinite(k)) return Math.abs(t - k) <= 36 * 3600_000;
  return t >= now - 10 * 86400000 && t <= now + 2 * 86400000;
}

function isBackupGk(ev: InjuryEvent, starterGkNumber?: number): boolean {
  const blob = `${ev.pos || ""} ${ev.type || ""} ${ev.name || ""}`.toLowerCase();
  if (!GK_POS.test(blob)) return false;
  if (starterGkNumber && ev.number && ev.number > starterGkNumber) return true;
  if (ev.number && ev.number >= 30) return true;
  return false;
}

/** Nr ≥24 / młodzież na liście Missing to nie starter — nie S3. */
function isFringe(ev: InjuryEvent): boolean {
  if (ev.number && ev.number >= 24) return true;
  return false;
}

/** S3 cap tylko przy GK1 / napastniku / 3+ kluczowych na TEN mecz. CB/pomoc z listy Missing nie ścinają Conf. */
export function classifyMatchInjuries(
  events: InjuryEvent[],
  teamName: string,
  kickoff?: string,
  starterGkNumber?: number,
  now = Date.now(),
): InjuryPack {
  const picked: InjuryEvent[] = [];
  const seen = new Set<string>();
  const sorted = [...events].sort((a, b) => Date.parse(b.fixtureDate || "") - Date.parse(a.fixtureDate || ""));
  for (const ev of sorted) {
    const name = (ev.name || "").trim();
    if (!name) continue;
    const id = foldPlayerName(name);
    if (!id || seen.has(id)) continue;
    if (!inKickoffWindow(ev.fixtureDate, kickoff, now)) continue;
    seen.add(id);
    picked.push(ev);
  }
  if (!picked.length) {
    return {
      text: `Brak zgłoszonych kontuzji ${teamName} na ten mecz (API-Football).`,
      count: 0,
      gk: false,
      key: false,
      mass: false,
      fetched: true,
    };
  }
  let gk = false;
  let keyP = false;
  let impact = 0;
  const bits: string[] = [];
  for (const ev of picked) {
    const typ = `${ev.type || ""} ${ev.reason || ""}`.toLowerCase();
    const pos = (ev.pos || "").toLowerCase();
    const blob = `${ev.name} ${typ} ${pos}`;
    const questionable = /questionable|doubt|watpli/.test(typ);
    const missing = /missing/.test(typ) || (!questionable && !/questionable/.test(typ));
    const label = ev.reason || ev.type || "";
    bits.push(label ? `${ev.name} (${label})` : ev.name);
    const isGk = GK_POS.test(blob);
    const isKey = KEY_POS.test(blob);
    const fringe = isFringe(ev);
    if (isGk && !isBackupGk(ev, starterGkNumber) && !questionable) gk = true;
    if (isKey && !questionable && !fringe) keyP = true;
    if (missing && !questionable && !isBackupGk(ev, starterGkNumber) && !fringe && (isKey || isGk)) impact++;
  }
  return {
    text: `${teamName}: ${bits.join("; ")}.`,
    count: picked.length,
    gk,
    key: keyP,
    mass: impact >= 3,
    fetched: true,
  };
}
