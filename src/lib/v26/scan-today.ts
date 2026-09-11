/** Lista dnia 09.09.2026 — Warstwa 1 z 08.09. Krok 1b wycofany. Conf po K12. */
export type ScanBand = "sitko" | "soft" | "short";

export type ScanPick = {
  n: number;
  ko: string;
  home: string;
  away: string;
  league: string;
  oddsH: string;
  oddsD: string;
  oddsA: string;
  fav: string;
  side: "H" | "A";
  band: ScanBand;
  note: string;
};

export const SCAN_DAY = "09.09.2026";
export const SCAN_YMD = "2026-09-09";

/** Lejek skanu (API-Football fixtures + Bet365 1X2). Warsaw 06:00→06:00, nocka 9/10 w, 8/9 poza. */
export const SCAN_META = {
  source: "API-Football fixtures 09–10.09 + Bet365 1X2",
  fixtures09: 325,
  fixtures10: 168,
  warsawDay: 340,
  cupsOut: 214,
  leagueish: 105,
  oddsChecked: 83,
  sitko: 18,
  soft: 21,
  short: 10,
  wide: 29,
  dnaCut: 0,
};

/** Selekcja 08.09 — kształt Kalmar/Beitar/Brześć + sitko 1-gol. Bez leftover 1B. */
export const SCAN_EIGHT: ScanPick[] = [
  {
    n: 1,
    ko: "12:30",
    home: "Gwangju",
    away: "Jeju",
    league: "K League 1",
    oddsH: "4.00",
    oddsD: "3.40",
    oddsA: "1.83",
    fav: "1.83",
    side: "A",
    band: "soft",
    note: "FT 0:1 HIT · home 2:5 0:1 1:2 · Kalmar away Soft",
  },
  {
    n: 2,
    ko: "16:00",
    home: "Pyramids",
    away: "El Gouna",
    league: "Egypt Premier League",
    oddsH: "1.40",
    oddsD: "3.90",
    oddsA: "7.00",
    fav: "1.40",
    side: "H",
    band: "sitko",
    note: "FT 1:0 HIT · sitko floor · input, nie kupon",
  },
  {
    n: 3,
    ko: "19:00",
    home: "Landskrona",
    away: "Helsingborg",
    league: "Superettan",
    oddsH: "1.73",
    oddsD: "3.60",
    oddsA: "4.10",
    fav: "1.73",
    side: "H",
    band: "sitko",
    note: "FT 1:2 · last 1:1 1:1 0:1 1:0 · 1-gol",
  },
  {
    n: 4,
    ko: "20:00",
    home: "Al-Fateh",
    away: "Al-Diriyah",
    league: "Saudi Pro League",
    oddsH: "3.60",
    oddsD: "3.70",
    oddsA: "1.83",
    fav: "1.83",
    side: "A",
    band: "soft",
    note: "żywy · Fateh GF home 1.0 · Kalmar away Soft",
  },
  {
    n: 5,
    ko: "20:30",
    home: "Defensores",
    away: "Los Andes",
    league: "Primera Nacional",
    oddsH: "1.80",
    oddsD: "3.00",
    oddsA: "5.25",
    fav: "1.80",
    side: "H",
    band: "soft",
    note: "żywy · Los Andes GF away 0 · Brześć · HV Nacional",
  },
  {
    n: 6,
    ko: "00:30",
    home: "Fortaleza",
    away: "Avaí",
    league: "Brasileirão Série B",
    oddsH: "1.57",
    oddsD: "3.50",
    oddsA: "6.50",
    fav: "1.57",
    side: "H",
    band: "sitko",
    note: "nocka 9/10 · CS 50 · O2.5 10% · last 1:0 1:1 2:0",
  },
];

/** Nocka 9/10 — jeszcze nie grały, Warstwa 1 08.09. */
export const SCAN_WATCH: ScanPick[] = [
  {
    n: 7,
    ko: "01:45",
    home: "Philadelphia",
    away: "Cincinnati",
    league: "MLS",
    oddsH: "1.66",
    oddsD: "4.33",
    oddsA: "4.25",
    fav: "1.66",
    side: "H",
    band: "sitko",
    note: "sitko MLS · O3.5 volume · analiza tak, kupon raczej nie",
  },
  {
    n: 8,
    ko: "02:30",
    home: "Atlético-GO",
    away: "Ceará",
    league: "Brasileirão Série B",
    oddsH: "1.75",
    oddsD: "3.64",
    oddsA: "5.20",
    fav: "1.75",
    side: "H",
    band: "sitko",
    note: "sitko Série B · kształt po K12",
  },
  {
    n: 9,
    ko: "03:00",
    home: "Boyacá Chicó",
    away: "Atlético Nacional",
    league: "Colombia Primera A",
    oddsH: "6.70",
    oddsD: "4.38",
    oddsA: "1.45",
    fav: "1.45",
    side: "A",
    band: "sitko",
    note: "away sitko · Kalmar/Bolton po K12 · HV Kolumbia",
  },
  {
    n: 10,
    ko: "04:30",
    home: "San Diego",
    away: "San Jose",
    league: "MLS",
    oddsH: "1.80",
    oddsD: "4.50",
    oddsA: "4.12",
    fav: "1.80",
    side: "H",
    band: "soft",
    note: "Soft MLS · Conf po K12",
  },
  {
    n: 11,
    ko: "04:30",
    home: "LAFC",
    away: "NY Red Bulls",
    league: "MLS",
    oddsH: "1.42",
    oddsD: "5.52",
    oddsA: "6.93",
    fav: "1.42",
    side: "H",
    band: "sitko",
    note: "sitko floor · jak Pyramids: input, kupon tylko CORE 1:0",
  },
];

export type ScanCut = { ko: string; match: string; why: string };

export const SCAN_CUT: ScanCut[] = [
  { ko: "12:30", match: "Daejeon – Anyang", why: "błędna korekta 1B · leftover sitko volume · FT 3:2" },
  { ko: "15:00", match: "Entebbe UPPC – Lugazi", why: "błędna korekta 1B · cienka liga · FT 0:1" },
  { ko: "17:00", match: "Nasaf – Bunyodkor", why: "błędna korekta 1B · HV · FT 3:0" },
  { ko: "17:00", match: "Jablonec – Baník", why: "błędna korekta 1B · Soft volume · FT 3:0" },
  { ko: "17:50", match: "Al-Raed – Al-Jeel", why: "błędna korekta 1B · Ettifaq-kształt leftover · FT 3:0" },
  { ko: "18:00", match: "Tammeka – Paide", why: "nie z listy 08.09 · Bolton volume · FT 0:2" },
  { ko: "20:45", match: "Norwich – Birmingham", why: "nie z listy 08.09 · Saints volume" },
  { ko: "21:00", match: "St Johnstone – Celtic", why: "nie z listy 08.09 · Bolton H2H 0:5" },
  { ko: "22:30", match: "Yumbo – Quindío", why: "wide 2.37 · brak faworyta · nie 08.09" },
  { ko: "17:45", match: "Barcelona – Feyenoord", why: "UCL · puchar" },
  { ko: "17:45", match: "Stuttgart – Viking", why: "UCL · puchar" },
  { ko: "20:00", match: "Liverpool – Atlético", why: "UCL · puchar" },
  { ko: "20:00", match: "Napoli – Arsenal", why: "UCL · puchar" },
  { ko: "20:00", match: "PSG – Slovan", why: "UCL · puchar" },
  { ko: "20:00", match: "Sporting – Galatasaray", why: "UCL · puchar" },
  { ko: "20:00", match: "Chelsea – Leeds", why: "EFL Cup · puchar" },
  { ko: "00:00", match: "Palmeiras – LDU Quito", why: "Libertadores · puchar" },
  { ko: "20:45", match: "Derby – WBA", why: "wide 2.25" },
  { ko: "21:00", match: "Charlton – QPR", why: "wide 2.25" },
  { ko: "17:00", match: "HJK – Inter Turku", why: "wide 2.50 · coin-flip" },
];
