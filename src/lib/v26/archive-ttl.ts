import { MATCH_LENGTH_MS, WNIOSEK_AFTER_FT_MS } from "./wniosek";

/** Po HIT/MISS karta zostaje na pulpicie 2 h, potem zimne Archiwum. */
export const ARCHIVE_AFTER_WNIOSEK_MS = 2 * 60 * 60 * 1000;
/** Bez kickoffu i bez wniosku — ostatni hamulec, żeby karta nie wisiała w nieskończoność. */
export const ARCHIVE_UNSETTLED_MS = 24 * 60 * 60 * 1000;
/** @deprecated stary alias 24 h; pulpit liczy od HIT/MISS. */
export const ARCHIVE_TTL_MS = ARCHIVE_UNSETTLED_MS;

const FINAL = new Set(["HIT", "MISS_PROGRAMU", "MISS_PRZEBIEGU"]);

export type ArchiveClock = {
  createdAt: string;
  input?: { kickoff?: string };
  wniosek?: { verdict?: string; analyzedAt?: string } | null;
};

function asClock(a: ArchiveClock | string): ArchiveClock {
  return typeof a === "string" ? { createdAt: a } : a;
}

export function settledAt(a: ArchiveClock | string): number | null {
  const clock = asClock(a);
  const v = clock.wniosek?.verdict;
  if (!v || !FINAL.has(v)) return null;
  const t = Date.parse(clock.wniosek?.analyzedAt || "");
  return Number.isFinite(t) ? t : null;
}

/** Moment, od którego karta schodzi z pulpitu. */
export function archiveDueAt(a: ArchiveClock | string): number {
  const clock = asClock(a);
  const hit = settledAt(clock);
  if (hit != null) return hit + ARCHIVE_AFTER_WNIOSEK_MS;
  const kick = Date.parse(clock.input?.kickoff || "");
  if (Number.isFinite(kick) && kick > 0) {
    return kick + MATCH_LENGTH_MS + WNIOSEK_AFTER_FT_MS + ARCHIVE_AFTER_WNIOSEK_MS;
  }
  const created = Date.parse(clock.createdAt);
  if (!Number.isFinite(created)) return 0;
  return created + ARCHIVE_UNSETTLED_MS;
}

export function isExpired(a: ArchiveClock | string, now = Date.now()): boolean {
  return now >= archiveDueAt(a);
}

export function ttlLeftMs(a: ArchiveClock | string, now = Date.now()): number {
  return Math.max(0, archiveDueAt(a) - now);
}

export function fmtTtl(a: ArchiveClock | string, now = Date.now()): string {
  const left = ttlLeftMs(a, now);
  if (left <= 0) return "do Archiwum";
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  if (h >= 1) return `jeszcze ${h} h`;
  return `jeszcze ${Math.max(1, m)} min`;
}
