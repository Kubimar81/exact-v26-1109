export type CSLean = "Strong" | "Medium" | "Weak";
export type Decision = "GREEN LIGHT" | "MIXED ONLY" | "WATCH" | "WAIT" | "NO EXECUTION";
export type FavoriteSide = "home" | "away" | "none";
export type ExactRole = "CORE" | "VALUE" | "BALANCED" | "CHAOS" | "Rezerwa" | "Protection";
export type OpponentQuality = "TOP" | "SREDNI" | "SLABY";
export type AnalysisStatus =
  | "draft"
  | "running-p1"
  | "awaiting-k11"
  | "running-p2"
  | "complete"
  | "error";

export type MatchProfile =
  | "Controlled Home Favorite"
  | "Strong Home Favorite"
  | "Slight Home Edge"
  | "Balanced"
  | "Away Favorite"
  | "Controlled Away Favorite"
  | "High Dominator"
  | "Balanced BTTS"
  | "Away Threat"
  | "Open"
  | "Chaotic";

export interface PrevSeasonSplit {
  playedHome: number;
  playedAway: number;
  gfHome: number;
  gaHome: number;
  gfAway: number;
  gaAway: number;
  xgHome?: number;
  xgaHome?: number;
  xgAway?: number;
  xgaAway?: number;
}

export interface PrevSeasonFlags {
  coachChanged: boolean;
  promoted: boolean;
  relegated: boolean;
  squadRebuild: boolean;
  newSigningsAttackDefense: number;
}

export interface PrevSeasonClub {
  id: string;
  name: string;
  league: string;
  coachChanged: boolean;
  promoted: boolean;
  relegated: boolean;
  squadRebuild: boolean;
  newSigningsAttackDefense: number;
  prev: PrevSeasonSplit;
  sources: string[];
}

export interface MatchInput {
  home: string;
  away: string;
  league: string;
  kickoff: string;
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  exactOdds?: Record<string, number>;
  notes?: string;
  squadVerified?: boolean;
  squadNote?: string;
  keyOutFav?: boolean;
  gkOutFav?: boolean;
  massOutFav?: boolean;
  keyOutUd?: boolean;
}

export interface FormMatch {
  date: string;
  opponent: string;
  ha: "H" | "A";
  scoreFor: number;
  scoreAgainst: number;
  quality: OpponentQuality;
  comp?: "LIGA" | "PUCHAR" | "SPARING";
  corners?: number;
  cards?: number;
  sot?: number;
  oppPos?: number;
  gf1h?: number;
  ga1h?: number;
  gf2h?: number;
  ga2h?: number;
}

export interface TeamBlock {
  name: string;
  tablePos: number;
  points: number;
  played: number;
  form: FormMatch[];
  csPctOverall: number;
  csPctHome: number;
  csPctAway: number;
  bttsPct: number;
  over25Pct: number;
  gfAvg: number;
  gaAvg: number;
  gfHome: number;
  gaHome: number;
  gfAway: number;
  gaAway: number;
  xg: number;
  xga: number;
  possession: number;
  corners: number;
  shotsOnTarget: number;
  cards: number;
  goalsAfter60Pct: number;
  goalsSecondHalfPct: number;
  finishingLabel: "Elite Finisher" | "Neutral" | "Underperforming";
  prevSeason?: PrevSeasonSplit;
  prevFlags?: PrevSeasonFlags;
  prevSource?: string;
}

export interface H2HMatch {
  date: string;
  competition: string;
  home: string;
  away: string;
  score: string;
}

export interface StepPoint {
  n: number;
  title: string;
  home: string;
  away: string;
  conclusion: string;
}

export interface StepAudit {
  pct: number;
  good: string;
  bad: string;
  impact: string;
}

export interface StepResult {
  k: number;
  name: string;
  points: StepPoint[];
  sources: string[];
  numbers: Record<string, number | string>;
  summary: string;
  audit: StepAudit;
}

export interface EpfParts {
  favGoals: number;
  udGoals: number;
  csRisk: number;
  flowFit: number;
  odpornosc: number;
  total: number;
}

export interface EplParts {
  profil: number;
  flow: number;
  market: number;
  audyt: number;
  ryzyko: number;
  raw: number;
  pct: number;
}

export interface ExactCandidate {
  score: string;
  epf: EpfParts;
  epl: EplParts;
  role: ExactRole;
  reasons: string[];
  functions: Array<"CORE/CENTRAL" | "OVERRIDE" | "PROTECTION/VOLUME">;
  satisfies: string[];
}

export interface ConfidenceBreakdown {
  forma: number;
  xg: number;
  h2h: number;
  homeAway: number;
  qoi: number;
  flow: number;
  market: number;
  squad: number;
  sample: number;
  sum: number;
  pct: number;
  band: "Premium" | "Strong" | "Playable MIXED ONLY" | "No execution";
  notes: string[];
}

export interface GateRecord {
  active: boolean;
  status: "AKTYWNA" | "NIEAKTYWNA";
  data: string;
  reason: string;
}

export interface Gates {
  highVariance: GateRecord;
  ugo: GateRecord & { met: number; details: string[] };
  csFav: CSLean;
  csFavData: string;
  homeDirection: { met: number; approved: boolean; details: string[] };
  earlySeason: { matches: number; capPct?: number; note: string };
  bigQualityGap: GateRecord;
  remisSafety: GateRecord;
  dominatorExpansion: GateRecord;
  extremeDominator: GateRecord;
  softBand: GateRecord;
  lowKursDominator: GateRecord;
  chaosReserve: GateRecord;
  mixedExactPriority: GateRecord;
  minimalExact: GateRecord;
  marketCleanExact: GateRecord;
  strongCsCoreAllowed: boolean;
}

export interface StatsPanel {
  goalsHome: number;
  goalsAway: number;
  cornersHome: number;
  cornersAway: number;
  sotHome: number;
  sotAway: number;
  cardsHome: number;
  cardsAway: number;
  bttsHomePct: number;
  bttsAwayPct: number;
  bttsProjectedPct: number;
  over25ProjectedPct: number;
  direction: string;
  directionProb: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
}

export interface Coupon {
  id: number;
  exacts: string[];
  thesis: string;
  weight: string;
}

export interface EngineOutput {
  profile: MatchProfile;
  favorite: FavoriteSide;
  direction: string;
  gates: Gates;
  centralExact: string;
  centralEpf: number;
  centralWhy: string;
  compression: {
    conflict: boolean;
    applied: boolean;
    before: string[];
    after: string[];
    multiRuleExact: string;
    log: string[];
  };
  epl: ExactCandidate[];
  protection: ExactCandidate[];
  confidence: ConfidenceBreakdown;
  coupons: Coupon[];
  decision: Decision;
  processErrors: string[];
  consistencyOk: boolean;
  gustaw: { k4: string; k12: string; k17: string };
  stats: StatsPanel;
  checklistK12: Record<string, boolean>;
  checklistK15: Record<string, boolean>;
  markets?: {
    surest: Array<{
      id: string;
      market: string;
      pick: string;
      pct: number;
      why: string;
      fairOdds: number;
      impliedPct?: number;
      edge?: number;
      source?: "forma" | "kurs" | "statystyki";
    }>;
    value: Array<{
      id: string;
      market: string;
      pick: string;
      pct: number;
      why: string;
      fairOdds: number;
      impliedPct?: number;
      edge?: number;
      source?: "forma" | "kurs" | "statystyki";
    }>;
    track?: Array<{
      id: string;
      market: string;
      pick: string;
      pct: number;
      why: string;
      fairOdds: number;
      impliedPct?: number;
      edge?: number;
      source?: "forma" | "kurs" | "statystyki";
    }>;
  };
}

export interface PhasePayload {
  sources: string[];
  match: {
    league: string;
    kickoff: string;
    homePos: number;
    awayPos: number;
    ptsHome: number;
    ptsAway: number;
    motivation: string;
  };
  odds: {
    home?: number;
    draw?: number;
    away?: number;
    exacts: Record<string, number>;
  };
  favorite: FavoriteSide;
  profileDraft: MatchProfile;
  home: TeamBlock;
  away: TeamBlock;
  h2h: H2HMatch[];
  h2hAvgGoals: number;
  injuries: string;
  squadVerified?: boolean;
  keyOutFav?: boolean;
  gkOutFav?: boolean;
  massOutFav?: boolean;
  keyOutUd?: boolean;
  weather: string;
  coach: string;
  steps: StepResult[];
  gatesRaw: {
    csFavLast10: number;
    csFavLast5Venue: number;
    goalsConcededFavLast5Venue: number;
    bttsRelevant: number;
    avgGoalsRelevant: number;
    favConcededInLast10Pct: number;
    underdogOffQuality: boolean;
    matchesPlayedFav: number;
    lateGoalUnderdogPct: number;
    leagueGapScore: number;
    xgFavVsThisTier: number;
    udCsPct: number;
    opponentGfVenue: number;
    opponentBttsPct: number;
  };
  candidates?: Array<{
    score: string;
    epfParts: [number, number, number, number, number];
    eplParts: [number, number, number, number, number];
    reasons: string[];
  }>;
  confidenceParts?: {
    forma?: number;
    xg?: number;
    h2h?: number;
    homeAway?: number;
    qoi?: number;
    flow?: number;
    market?: number;
    squad?: number;
    sample?: number;
    /** legacy Kryteria v2 — mapowane na v2.1 */
    atakObrona?: number;
    override?: number;
    leagueGap?: number;
  };
  market?: {
    movement: string;
    kehnyg: Record<string, number>;
    consensus: string;
  };
  gustawK4?: string;
  gustawK12?: string;
  gustawK17?: string;
  statsNotes?: string;
}

export type WniosekVerdict = "HIT" | "MISS_PROGRAMU" | "MISS_PRZEBIEGU" | "OCZEKUJE";
export type WniosekHitSlot = "EPL1" | "EPL2" | "EPL3" | "PROTECTION" | null;

export interface WniosekEvents {
  red: boolean;
  og: boolean;
  late90: boolean;
  squad: boolean;
  details: string[];
}

export interface WniosekMarket {
  id: string;
  market: string;
  pick: string;
  pct: number;
  actual: string;
  hit: boolean | null;
}

export interface MatchWniosek {
  verdict: WniosekVerdict;
  ft: string;
  eplTop3: string[];
  epl1: string;
  hitSlot: WniosekHitSlot;
  directionOk: boolean;
  events: WniosekEvents;
  text: string;
  sources: string[];
  analyzedAt: string;
  dueAt: string;
  /** BTTS / gole / rożne / kartki vs FT. Silnik tego nie liczy. */
  markets?: WniosekMarket[];
}

export interface SavedAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: MatchInput;
  status: AnalysisStatus;
  phase1?: PhasePayload;
  phase2?: PhasePayload;
  engine?: EngineOutput;
  citations: string[];
  error?: string;
  k11Note?: string;
  demo?: boolean;
  /** ISO — dociągnięto xG/SOT/timing/kadrę po zapisie (stare analizy). */
  enrichedAt?: string;
  /** Automatyczny wniosek po meczu (godzina po FT). Silnik tego nie liczy. */
  wniosek?: MatchWniosek;
}

export const STEPS: { k: number; name: string; phase: 1 | 2 }[] = [
  { k: 0, name: "Analiza poprzednich wyników", phase: 1 },
  { k: 1, name: "Zrozumienie meczu i dane bazowe", phase: 1 },
  { k: 2, name: "Forma + Home/Away", phase: 1 },
  { k: 3, name: "H2H + trendy bezpośrednie", phase: 1 },
  { k: 4, name: "Profil bramkowy (Match Total)", phase: 1 },
  { k: 5, name: "Kontekst zewnętrzny i kadrowy", phase: 1 },
  { k: 6, name: "Offensive & Defensive Strength", phase: 1 },
  { k: 7, name: "Quality of Opposition Index", phase: 1 },
  { k: 8, name: "Prawdopodobieństwo i Value", phase: 1 },
  { k: 9, name: "Flowmatch + Exact Conversion", phase: 1 },
  { k: 10, name: "Goal Timing Audit", phase: 1 },
  { k: 11, name: "Goal Timing Profile", phase: 1 },
  { k: 12, name: "Exact Profil Fit + EPL Ranking", phase: 2 },
  { k: 13, name: "Override Engine", phase: 2 },
  { k: 14, name: "Market Alignment", phase: 2 },
  { k: 15, name: "Final Validation & Execution", phase: 2 },
  { k: 16, name: "Scenario Weight Engine", phase: 2 },
  { k: 17, name: "Selekcja kuponu + zamknięcie", phase: 2 },
  { k: 18, name: "Rozwój modelu + Audyt V24", phase: 2 },
];
