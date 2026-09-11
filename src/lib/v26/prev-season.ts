import type { FormMatch, PrevSeasonClub, PrevSeasonFlags, PrevSeasonSplit, TeamBlock } from "./types";
import dump from "./prev-season.json";

export type PrevSeasonFile = {
  season: string;
  updated: string;
  clubs: PrevSeasonClub[];
};

export const PREV_SEASON_DUMP = dump as PrevSeasonFile;

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Lookup z dumpa. Brak wiersza → null (25.19 się nie zgaduje). */
export function lookupPrevClub(name: string, league?: string): PrevSeasonClub | null {
  const n = fold(name);
  if (!n) return null;
  const clubs = PREV_SEASON_DUMP.clubs ?? [];
  const hits = clubs.filter((c) => fold(c.name) === n || fold(c.id) === n || n.includes(fold(c.id)));
  if (!hits.length) return null;
  if (league) {
    const lg = fold(league);
    const inLg = hits.filter((c) => !c.league || fold(c.league) === lg);
    if (inLg.length === 1) return inLg[0];
  }
  return hits.length === 1 ? hits[0] : null;
}

export function flagsFromClub(c: PrevSeasonClub): PrevSeasonFlags {
  return {
    coachChanged: !!c.coachChanged,
    promoted: !!c.promoted,
    relegated: !!c.relegated,
    squadRebuild: !!c.squadRebuild,
    newSigningsAttackDefense: c.newSigningsAttackDefense || 0,
  };
}

export function prevOff(flags?: PrevSeasonFlags | null): boolean {
  if (!flags) return true;
  return !!(flags.coachChanged || flags.promoted || flags.relegated || flags.squadRebuild);
}

export function prevGrey(flags?: PrevSeasonFlags | null): boolean {
  if (!flags || prevOff(flags)) return false;
  const n = flags.newSigningsAttackDefense;
  return n >= 3 && n <= 5;
}

/** Mecze TEGO sezonu w venue, tylko LIGA (nie puchar/sparing). */
export function venueNThisSeason(form: FormMatch[] | undefined, ha: "H" | "A"): number {
  return (form ?? []).filter((m) => m.ha === ha && m.comp !== "PUCHAR" && m.comp !== "SPARING").length;
}

export function blendWeight(n: number): number {
  if (n <= 0) return 0;
  if (n <= 6) return 0.4;
  if (n <= 8) return 0.7;
  return 1;
}

export function withPrevSeason(team: TeamBlock, league?: string): TeamBlock {
  if (team.prevSeason) return team;
  const club = lookupPrevClub(team.name, league);
  if (!club) return team;
  return { ...team, prevSeason: club.prev, prevFlags: flagsFromClub(club) };
}

export function attachPrevSeason(home: TeamBlock, away: TeamBlock, league?: string): { home: TeamBlock; away: TeamBlock } {
  return { home: withPrevSeason(home, league), away: withPrevSeason(away, league) };
}
