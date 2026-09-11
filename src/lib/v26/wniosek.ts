import type { Decision, ExactCandidate, FavoriteSide, MatchWniosek, WniosekEvents, WniosekVerdict } from "./types";

/** 90 min + 15 min doliczonego — szacunek końca meczu. */
export const MATCH_LENGTH_MS = 105 * 60 * 1000;
/** Analiza FT godzinę po końcu, nie w 91'. */
export const WNIOSEK_AFTER_FT_MS = 60 * 60 * 1000;

export function normScore(raw: string | undefined | null): string {
  if (!raw) return "";
  const m = String(raw)
    .trim()
    .replace(/[–—−]/g, "-")
    .replace(/-/g, ":")
    .match(/^(\d+)\s*:\s*(\d+)$/);
  return m ? `${Number(m[1])}:${Number(m[2])}` : "";
}

export function scoreSide(score: string): "home" | "away" | "draw" | null {
  const s = normScore(score);
  if (!s) return null;
  const [h, a] = s.split(":").map(Number);
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

function warsawYmd(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function foldText(notes: string): string {
  return notes
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function isoFromWarsawClock(year: number, month: number, day: number, hour: number, min: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const off of ["+02:00", "+01:00"]) {
    const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${off}`;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(t));
    const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
    if (get("year") === year && get("month") === month && get("day") === day && get("hour") === hour && get("minute") === min) {
      return new Date(t).toISOString();
    }
  }
  return "";
}

function clockFromParts(y: number, m: number, d: number, hour: number, min: number): string {
  if (hour > 23 || min > 59 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return isoFromWarsawClock(y, m, d, hour, min);
}

/** Superbet: „Dziś 19:00”, „Jutro, 00:00”, „04.09 20:45” — relatywnie do daty skanu, strefa Warszawa. */
export function parseKickoffFromNotes(notes: string, now = new Date()): string {
  if (!notes) return "";
  const t = foldText(notes);
  const { y, m, d } = warsawYmd(now);

  const rel = t.match(/\b(?:dzis(?:iaj)?|today|jutro|tomorrow)\b[^0-9]{0,28}(\d{1,2})[:.](\d{2})/);
  if (rel) {
    const hour = Number(rel[1]);
    const min = Number(rel[2]);
    const jutro = /\b(jutro|tomorrow)\b/.test(t);
    const utc = Date.UTC(y, m - 1, d + (jutro ? 1 : 0));
    const day = new Date(utc);
    return clockFromParts(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, min);
  }

  const isoDate = t.match(/\b(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2})[:.](\d{2})/);
  if (isoDate) {
    return clockFromParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), Number(isoDate[4]), Number(isoDate[5]));
  }

  const cal = t.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?[^0-9]{0,8}(\d{1,2})[:.](\d{2})\b/);
  if (cal) {
    const day = Number(cal[1]);
    const month = Number(cal[2]);
    let year = y;
    if (cal[3]) year = cal[3].length === 2 ? 2000 + Number(cal[3]) : Number(cal[3]);
    return clockFromParts(year, month, day, Number(cal[4]), Number(cal[5]));
  }

  return "";
}

/**
 * Godzina z kuponu / formularza.
 * Naive „YYYY-MM-DDTHH:mm” i samo „19:00” = zegar Europe/Warsaw, nie UTC serwera.
 */
export function coerceKickoff(raw?: string, notes?: string, now = new Date()): string {
  const s = String(raw || "").trim();
  if (s) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && Number.isFinite(Date.parse(s))) {
      return new Date(s).toISOString();
    }
    const naive = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (naive) {
      return clockFromParts(Number(naive[1]), Number(naive[2]), Number(naive[3]), Number(naive[4]), Number(naive[5]));
    }
    const clock = s.match(/^(\d{1,2})[:.](\d{2})$/);
    if (clock) {
      const { y, m, d } = warsawYmd(now);
      return clockFromParts(y, m, d, Number(clock[1]), Number(clock[2]));
    }
    const fromField = parseKickoffFromNotes(s, now);
    if (fromField) return fromField;
    if (Number.isFinite(Date.parse(s))) return new Date(s).toISOString();
  }
  return parseKickoffFromNotes(notes || "", now);
}

/** datetime-local w polu formularza — zawsze zegar Warszawy. */
export function toWarsawDatetimeLocal(raw: string): string {
  if (!raw?.trim()) return "";
  const iso = coerceKickoff(raw, raw);
  const t = Date.parse(iso || raw);
  if (!Number.isFinite(t)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function resolveKickoff(kickoff?: string, notes?: string, createdAt?: string): string {
  const now = createdAt && Number.isFinite(Date.parse(createdAt)) ? new Date(createdAt) : new Date();
  if (kickoff && Number.isFinite(Date.parse(kickoff))) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(kickoff.trim())) return new Date(kickoff).toISOString();
    const naive = kickoff.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
    if (naive) return coerceKickoff(kickoff, "", now);
    return kickoff;
  }
  return parseKickoffFromNotes(notes || "", now);
}

export function wniosekDueAt(kickoffIso: string): number | null {
  const t = Date.parse(kickoffIso);
  if (!Number.isFinite(t)) return null;
  return t + MATCH_LENGTH_MS + WNIOSEK_AFTER_FT_MS;
}

export function matchEndAt(kickoffIso: string): number | null {
  const t = Date.parse(kickoffIso);
  if (!Number.isFinite(t)) return null;
  return t + MATCH_LENGTH_MS;
}

export function isWniosekDue(kickoffIso: string, now = Date.now()): boolean {
  const due = wniosekDueAt(kickoffIso);
  return due != null && now >= due;
}

export function fmtWhen(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function verdictLabel(v: WniosekVerdict): string {
  if (v === "HIT") return "HIT";
  if (v === "MISS_PRZEBIEGU") return "MISS przebiegu";
  if (v === "MISS_PROGRAMU") return "MISS programu";
  return "Czekam na FT";
}

export function verdictTone(v: WniosekVerdict): "ok" | "warn" | "danger" | "default" {
  if (v === "HIT") return "ok";
  if (v === "MISS_PRZEBIEGU") return "warn";
  if (v === "MISS_PROGRAMU") return "danger";
  return "default";
}

function unusual(events: WniosekEvents): string[] {
  const bits: string[] = [];
  if (events.red) bits.push("czerwona kartka");
  if (events.og) bits.push("samobój");
  if (events.late90) bits.push("gol 90+");
  if (events.squad) bits.push("braki w składzie");
  return bits;
}

export function buildWniosek(input: {
  epl: Array<Pick<ExactCandidate, "score"> | { score: string }>;
  protection?: Array<{ score: string }>;
  favorite: FavoriteSide;
  decision: Decision | string;
  conf: number;
  ft: string;
  events: WniosekEvents;
  analyzedAt?: string;
  dueAt?: string;
  sources?: string[];
  markets?: MatchWniosek["markets"];
}): MatchWniosek {
  const ft = normScore(input.ft);
  const top3 = input.epl.slice(0, 3).map((x) => normScore(x.score)).filter(Boolean);
  const epl1 = top3[0] || "";
  const prot = (input.protection || []).map((x) => normScore(x.score)).filter(Boolean);
  const ftSide = scoreSide(ft);
  const fav = input.favorite;
  const directionOk =
    !ftSide || fav === "none" ? true : (fav === "home" && ftSide === "home") || (fav === "away" && ftSide === "away");

  let hitSlot: MatchWniosek["hitSlot"] = null;
  const idx = top3.indexOf(ft);
  if (idx === 0) hitSlot = "EPL1";
  else if (idx === 1) hitSlot = "EPL2";
  else if (idx === 2) hitSlot = "EPL3";
  else if (prot.includes(ft)) hitSlot = "PROTECTION";

  const hit = hitSlot === "EPL1" || hitSlot === "EPL2" || hitSlot === "EPL3";
  const flags = unusual(input.events);
  const noExec = /NO EXECUTION/i.test(String(input.decision));
  const prefix = noExec ? "NO EXECUTION — rozliczenie EPL, nie kuponu. " : "";

  let verdict: WniosekVerdict;
  let text: string;

  if (!ft) {
    verdict = "OCZEKUJE";
    text = "Brak wyniku FT w źródle. Sprawdzę ponownie.";
  } else if (hit) {
    verdict = "HIT";
    const extra = flags.length ? ` Mimo: ${flags.join(", ")}.` : "";
    text = `${prefix}HIT ${hitSlot}. FT ${ft} w TOP3 (${top3.join(" / ")}). Kierunek ${directionOk ? "TAK" : "NIE"}.${extra}`;
  } else if (flags.length) {
    verdict = "MISS_PRZEBIEGU";
    const dir = directionOk ? "Kierunek TAK." : `Kierunek NIE (CORE ${fav}, FT ${ftSide}).`;
    text = `${prefix}MISS przebiegu. FT ${ft} poza TOP3 (${top3.join(" / ") || "brak"}). ${dir} Przyczyna w meczu: ${flags.join(", ")}.`;
    if (hitSlot === "PROTECTION") text += ` Protection ${ft} złapał ogon — nie liczy się jako HIT TOP3.`;
  } else {
    verdict = "MISS_PROGRAMU";
    const bits: string[] = [];
    if (!directionOk) bits.push(`zły kierunek (CORE ${fav}, FT ${ftSide})`);
    else bits.push("kierunek TAK, exact poza TOP3");
    if (ft === "0:0" && !top3.includes("0:0")) bits.push("0:0 nie było na tablicy");
    if (input.conf >= 80) bits.push(`Conf ${input.conf.toFixed(1)}% nie uratował exactu`);
    if (hitSlot === "PROTECTION") bits.push(`protection ${ft} — nie TOP3`);
    text = `${prefix}MISS programu. FT ${ft} vs TOP3 ${top3.join(" / ") || "—"}. ${bits.join(". ")}.`;
  }

  return {
    verdict,
    ft: ft || "—",
    eplTop3: top3,
    epl1,
    hitSlot,
    directionOk,
    events: input.events,
    text,
    sources: input.sources || [],
    analyzedAt: input.analyzedAt || new Date().toISOString(),
    dueAt: input.dueAt || "",
    markets: input.markets,
  };
}
