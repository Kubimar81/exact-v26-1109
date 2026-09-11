import type { FormMatch, OpponentQuality } from "./types";

export const SET_PIECE_CAP = 62;

export function classifyOppQuality(rank: number, tableN: number): OpponentQuality {
  if (!(rank > 0) || !(tableN > 0)) return "SREDNI";
  const band = Math.max(3, Math.round(tableN * 0.25));
  if (rank <= band) return "TOP";
  if (rank > tableN - band) return "SLABY";
  return "SREDNI";
}

/** Klasa dzisiejszego rywala z pozycji w tabeli (gdy nie znamy n tabeli). */
export function oppClassFromPos(oppPos: number, ownPos = 0): OpponentQuality {
  if (!(oppPos > 0)) return "SREDNI";
  const n = Math.max(16, oppPos, ownPos);
  return classifyOppQuality(oppPos, n);
}

export type SetPieceKind = "corners" | "cards" | "sot";

export type ClassSetPiece = {
  avg: number;
  n: number;
  cls: OpponentQuality;
  used: "class" | "season" | "none";
};

function bucketRows(form: FormMatch[], kind: SetPieceKind, cls: OpponentQuality, ha?: "H" | "A"): FormMatch[] {
  const numbered = form.filter((m) => typeof m[kind] === "number").slice(0, 10);
  const venueClass = ha ? numbered.filter((m) => m.ha === ha && m.quality === cls) : [];
  if (venueClass.length >= 2) return venueClass;
  const byClass = numbered.filter((m) => m.quality === cls);
  if (byClass.length >= 2) return byClass;
  const byVenue = ha ? numbered.filter((m) => m.ha === ha) : [];
  if (byVenue.length >= 2) return byVenue;
  return [];
}

export function classSetPiece(
  form: FormMatch[],
  cls: OpponentQuality,
  kind: SetPieceKind,
  seasonAvg = 0,
  ha?: "H" | "A",
): ClassSetPiece {
  const numbered = form.filter((m) => typeof m[kind] === "number").slice(0, 10);
  const bucket = bucketRows(form, kind, cls, ha);
  if (bucket.length >= 2) {
    const avg = bucket.reduce((s, m) => s + (m[kind] as number), 0) / bucket.length;
    return { avg: Math.round(avg * 100) / 100, n: bucket.length, cls, used: "class" };
  }
  if (numbered.length >= 2) return { avg: 0, n: 0, cls, used: "none" };
  if (seasonAvg > 0) return { avg: seasonAvg, n: 0, cls, used: "season" };
  return { avg: 0, n: 0, cls, used: "none" };
}

/** Gole / celne = % że SOT wejdzie. */
export function classConversion(
  form: FormMatch[],
  cls: OpponentQuality,
  ha?: "H" | "A",
): { pct: number; n: number } {
  const rows = bucketRows(form, "sot", cls, ha).filter((m) => (m.sot || 0) > 0);
  const sot = rows.reduce((s, m) => s + (m.sot || 0), 0);
  const gf = rows.reduce((s, m) => s + m.scoreFor, 0);
  if (!sot) return { pct: 0, n: 0 };
  return { pct: Math.round((1000 * gf) / sot) / 10, n: rows.length };
}

export function setPieceThin(h: ClassSetPiece, a: ClassSetPiece): boolean {
  if (h.used !== "class" || a.used !== "class") return true;
  return h.n < 4 || a.n < 4;
}

export function capSetPiecePct(pct: number, thin: boolean): number {
  if (!thin) return pct;
  return Math.min(pct, SET_PIECE_CAP);
}

export function combineSetPiece(h: ClassSetPiece, a: ClassSetPiece): number {
  if (h.used === "none" && a.used === "none") return 0;
  if (h.used === "none") return a.avg;
  if (a.used === "none") return h.avg;
  return Math.round((h.avg + a.avg) * 100) / 100;
}
