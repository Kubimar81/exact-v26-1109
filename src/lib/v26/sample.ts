import { runEngine } from "./engine";
import type { PhasePayload, SavedAnalysis, StepResult, TeamBlock } from "./types";

function step(
  k: number,
  name: string,
  points: StepResult["points"],
  summary: string,
  numbers: Record<string, number | string> = {},
  extra?: Partial<StepResult>,
): StepResult {
  return {
    k,
    name,
    points,
    sources: extra?.sources ?? [
      "https://www.flashscore.pl",
      "https://fbref.com",
      "https://www.sofascore.com",
    ],
    numbers,
    summary,
    audit: extra?.audit ?? {
      pct: 100,
      good: "Liczby z formy, tabeli i H2H uzupełnione.",
      bad: "Brak luk w tym kroku.",
      impact: "Krok zamknięty.",
    },
  };
}

const lech: TeamBlock = {
  name: "Lech Poznań",
  tablePos: 2,
  points: 19,
  played: 8,
  form: [
    { date: "2026-08-17", opponent: "Piast", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SREDNI" },
    { date: "2026-08-10", opponent: "Cracovia", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-08-03", opponent: "Pogoń", ha: "H", scoreFor: 3, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-07-27", opponent: "Jagiellonia", ha: "A", scoreFor: 0, scoreAgainst: 2, quality: "TOP" },
    { date: "2026-07-20", opponent: "GKS Katowice", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
    { date: "2026-07-13", opponent: "Widzew", ha: "A", scoreFor: 2, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-05-24", opponent: "Raków", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "TOP" },
    { date: "2026-05-18", opponent: "Stal Mielec", ha: "A", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
  ],
  csPctOverall: 37.5,
  csPctHome: 50,
  csPctAway: 25,
  bttsPct: 50,
  over25Pct: 50,
  gfAvg: 1.63,
  gaAvg: 0.88,
  gfHome: 2.0,
  gaHome: 0.5,
  gfAway: 1.25,
  gaAway: 1.25,
  xg: 1.72,
  xga: 0.96,
  possession: 58,
  corners: 6.1,
  shotsOnTarget: 5.4,
  cards: 1.8,
  goalsAfter60Pct: 38,
  goalsSecondHalfPct: 52,
  finishingLabel: "Neutral",
};

const radomiak: TeamBlock = {
  name: "Radomiak Radom",
  tablePos: 12,
  points: 8,
  played: 8,
  form: [
    { date: "2026-08-16", opponent: "Korona", ha: "A", scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-08-09", opponent: "Puszcza", ha: "H", scoreFor: 2, scoreAgainst: 2, quality: "SLABY" },
    { date: "2026-08-02", opponent: "Legia", ha: "A", scoreFor: 0, scoreAgainst: 3, quality: "TOP" },
    { date: "2026-07-26", opponent: "Zagłębie", ha: "H", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-07-19", opponent: "Górnik", ha: "A", scoreFor: 1, scoreAgainst: 2, quality: "SREDNI" },
    { date: "2026-07-12", opponent: "Motor", ha: "H", scoreFor: 2, scoreAgainst: 0, quality: "SLABY" },
    { date: "2026-05-24", opponent: "Lechia", ha: "A", scoreFor: 1, scoreAgainst: 1, quality: "SREDNI" },
    { date: "2026-05-17", opponent: "Śląsk", ha: "H", scoreFor: 0, scoreAgainst: 1, quality: "SREDNI" },
  ],
  csPctOverall: 12.5,
  csPctHome: 25,
  csPctAway: 0,
  bttsPct: 62.5,
  over25Pct: 50,
  gfAvg: 0.88,
  gaAvg: 1.38,
  gfHome: 1.25,
  gaHome: 1.0,
  gfAway: 0.5,
  gaAway: 1.75,
  xg: 1.02,
  xga: 1.48,
  possession: 44,
  corners: 3.9,
  shotsOnTarget: 3.2,
  cards: 2.3,
  goalsAfter60Pct: 31,
  goalsSecondHalfPct: 48,
  finishingLabel: "Underperforming",
};

const phase1: PhasePayload = {
  sources: [
    "https://www.flashscore.pl/pilka-nozna/polska/ekstraklasa/",
    "https://fbref.com",
    "https://www.sofascore.com",
    "https://www.transfermarkt.pl",
  ],
  match: {
    league: "Ekstraklasa",
    kickoff: "2026-08-24T18:15:00.000Z",
    homePos: 2,
    awayPos: 12,
    ptsHome: 19,
    ptsAway: 8,
    motivation: "Lech goni lidera — 3 pkt obowiązkowe u siebie. Radomiak broni się przed spadkową strefą, ale wyjazd do Poznania historycznie trudny.",
  },
  odds: {
    home: 1.55,
    draw: 4.2,
    away: 5.8,
    exacts: { "2:0": 7.4, "2:1": 8.2, "1:0": 7.8, "3:0": 11.5, "3:1": 12.0, "1:1": 8.5, "0:0": 12.5 },
  },
  favorite: "home",
  profileDraft: "Controlled Home Favorite",
  home: lech,
  away: radomiak,
  h2h: [
    { date: "2026-02-15", competition: "Ekstraklasa", home: "Radomiak", away: "Lech", score: "0:2" },
    { date: "2025-08-16", competition: "Ekstraklasa", home: "Lech", away: "Radomiak", score: "2:0" },
    { date: "2025-03-02", competition: "Ekstraklasa", home: "Radomiak", away: "Lech", score: "1:2" },
    { date: "2024-08-25", competition: "Ekstraklasa", home: "Lech", away: "Radomiak", score: "3:1" },
    { date: "2024-02-18", competition: "Ekstraklasa", home: "Radomiak", away: "Lech", score: "1:1" },
    { date: "2023-08-12", competition: "Ekstraklasa", home: "Lech", away: "Radomiak", score: "2:1" },
  ],
  h2hAvgGoals: 2.67,
  injuries: "Lech: bez długoterminowych braków w pierwszej jedenastce (sprawdzić mikrouraz wahadłowego). Radomiak: skrzydłowy wyjazdowy wątpliwy, środkowy obrońca po kartkach — możliwa rotacja.",
  weather: "Poznań, 19°C, lekki wiatr, boisko dobre. Brak korekty goli za temperaturę.",
  coach: "Lech po 1:0 nadal utrzymuje wysokość pressingu u siebie vs dół tabeli. Radomiak zamyka się w 5-4-1, szuka stałego fragmentu.",
  gatesRaw: {
    csFavLast10: 37.5,
    csFavLast5Venue: 50,
    goalsConcededFavLast5Venue: 2,
    bttsRelevant: 50,
    avgGoalsRelevant: 2.51,
    favConcededInLast10Pct: 62.5,
    underdogOffQuality: false,
    matchesPlayedFav: 8,
    lateGoalUnderdogPct: 18,
    leagueGapScore: 0,
    xgFavVsThisTier: 1.85,
    udCsPct: 0,
    opponentGfVenue: 0.5,
    opponentBttsPct: 62.5,
  },
  steps: [
    step(0, "Analiza poprzednich wyników", [
      { n: 1, title: "Tabela 23 — ten sam klub", home: "Brak zapisu Lecha z bieżącej paczki V26 w pliku użytkownika.", away: "Brak zapisu Radomiaka.", conclusion: "Adnotacja: brak meczu tych drużyn w lokalnej Tabeli 23." },
      { n: 2, title: "Profil podobny", home: "Controlled Home Favorite, kurs 1.50–1.65, CS Medium.", away: "Bottom-half, gf away ≤0.6.", conclusion: "Historycznie mixed 2:1 bije czysty 2:0 gdy CS faworyta <50% (Viking 2:1 HIT; Sogdiyona MISS przy forsowaniu Strong CS)." },
      { n: 3, title: "Kierunek", home: "Home flow potwierdzony tabelą i H2H.", away: "Brak sygnału upsetu.", conclusion: "Matematyka, flow i motywacja wskazują gospodarza." },
    ], "Profil analogiczny do kontrolowanych faworytów domowych z Medium CS — nie forsuj 3:0 jako CORE."),
    step(1, "Zrozumienie meczu i dane bazowe", [
      { n: 1, title: "Liga / pozycje", home: "Ekstraklasa, 2. miejsce, 19 pkt / 8 meczów.", away: "12. miejsce, 8 pkt / 8 meczów.", conclusion: "Δ miejsc = 10, Δ punktów = 11. Quality gap wyraźny, nie ekstremalny (kurs 1.55)." },
      { n: 2, title: "Termin", home: "24.08.2026 20:15 CEST, Bułgarska.", away: "Wyjazd po 7 dniach.", conclusion: "Mecz ligowy, nie rewanż pucharowy. Brak ryzyka conserving." },
      { n: 3, title: "Siła składu", home: "Pełna jedenastka, głębokość ławki wyższa.", away: "Wąski skład, ryzyko 5-4-1.", conclusion: "Przewaga Lecha w ofensywie i głębokości; defensywa gości krucha na wyjeździe." },
    ], "Ligowy Controlled Home Favorite. Direction Gate do weryfikacji w K4.", { deltaMiejsc: 10, deltaPkt: 11, kursH: 1.55 }),
    step(2, "Forma + Home/Away", [
      { n: 1, title: "Ostatnie wyniki", home: "2:0 Piast (H), 1:1 Cracovia (A), 3:1 Pogoń (H), 0:2 Jaga (A), 2:0 Katowice (H).", away: "0:1 Korona (A), 2:2 Puszcza (H), 0:3 Legia (A), 1:1 Zagłębie (H), 1:2 Górnik (A).", conclusion: "Lech 3W-1D-1L w 5, silny home. Radomiak bez wygranej wyjazdowej w próbce." },
      { n: 2, title: "CS / BTTS / O2.5", home: "CS 37.5% ogółem, 50% home. BTTS 50%. O2.5 50%.", away: "CS 12.5% / 0% away. BTTS 62.5%. O2.5 50%.", conclusion: "CS faworyta Medium, nie Strong." },
      { n: 3, title: "xG i tempo", home: "xG 1.72, xGA 0.96, pos. 58%, rożne 6.1, SOT 5.4.", away: "xG 1.02, xGA 1.48, pos. 44%, rożne 3.9, SOT 3.2.", conclusion: "Lech kontroluje, ale nie jest maszynką 3+ vs każdy." },
    ], "Forma gospodarza stabilna u siebie (2:0, 3:1, 2:0). Gość bez CS na wyjeździe.", { lechGfHome: 2.0, radoGfAway: 0.5, lechCsHome: 50 }),
    step(3, "H2H + trendy", [
      { n: 1, title: "Ostatnie 6 H2H", home: "2:0, 2:0, 2:1, 3:1, 1:1, 2:1 (z perspektywy Lecha: 5W 1D).", away: "1 gol lub 0 w 5/6.", conclusion: "Historyczna dominacja Lecha, exacty 2:0 / 2:1 / 3:1." },
      { n: 2, title: "Średnia H2H", home: "2.67 gola / mecz.", away: "Niski wolumen underdoga.", conclusion: "Nie chaos 4:3. Pula 1:0–3:1." },
    ], "H2H potwierdza kierunek i mieszany/czysty niski volume, nie 4:0."),
    step(4, "Profil bramkowy", [
      { n: 1, title: "Charakter", home: "Kontrolowany, pressing 1. tercja u siebie.", away: "Niski blok, kontry i SFG.", conclusion: "Controlled, nie chaotyczny." },
      { n: 2, title: "HV Filter", home: "Avg goli 2.51 < 3.80. BTTS 50% < 65%. Ekstraklasa ≠ HV.", away: "—", conclusion: "Dane do progu: 2.51 / 50% / liga NIE. Status: NIEAKTYWNA." },
      { n: 3, title: "UGO szkic", home: "CS Medium, kurs 1.55, strata gola 62.5% z 8.", away: "gf away 0.50 — jakość ofensywna słaba.", conclusion: "UGO 3/4 (CS, kurs, strata gola). Status: AKTYWNA." },
      { n: 4, title: "Direction Gate", home: "Kurs 1.55 ≤1.65 + gap. CS home 50% ≥35. Flow = gospodarz.", away: "Win away niski, gf away 0.5 ≤1.0.", conclusion: "Home Favorite Direction Gate: 4/4 → profil zatwierdzony." },
    ], "Profil: Controlled Home Favorite + Medium CS + UGO TAK. Pula: 2:1, 2:0, 1:0, 3:1.", { xgRange: "2.4–2.9" }),
    step(5, "Kontekst zewnętrzny i kadrowy", [
      { n: 1, title: "Kadry", home: "Jedenastka bazowa, bez rotacji pucharowej.", away: "Wąski skład, 1 wątpliwość w ataku.", conclusion: "Brak Low Motivation Risk." },
      { n: 2, title: "Pogoda", home: "19°C, suche.", away: "—", conclusion: "Brak korekty −0.4 gola." },
      { n: 3, title: "Obrona / atak", home: "Podstawowy bramkarz, 4 obrońców z jedenastki.", away: "Linia 5, niski pressing.", conclusion: "Czyste konto możliwe, nie Elite." },
    ], "Składy standardowe. Audyt K5: 100%."),
    step(6, "Offensive & Defensive Strength", [
      { n: 1, title: "Finishing", home: "Gole/xG ≈ 0.95 — Neutral.", away: "Gole/xG ≈ 0.86 — Underperforming.", conclusion: "Lech nie overperformuje — nie winduj 4:0." },
      { n: 2, title: "Defensywa vs jakość", home: "Strata 2 goli z TOP (Jaga), 0–1 vs słabsi u siebie.", away: "Straty także vs średnich i słabszych.", conclusion: "CS Lecha Medium, nie obniżamy do Weak." },
      { n: 3, title: "Atak", home: "5/8 z 2+ golami, 1 blank (Jaga).", away: "3 blanky w 8, 0 CS away.", conclusion: "Profil exact: Medium CS + Medium scoring." },
    ], "Exact DNA: 2:0 / 2:1, nie 0:0 i nie 4:0."),
    step(7, "Quality of Opposition Index", [
      { n: 1, title: "Rywal vs próbka", home: "Radomiak = słabi (13 nie, ale 12 ≈ dolna półka).", away: "Lech = TOP ligi.", conclusion: "Faworyt gra vs SLABY — próg strzelania >2.2 nie w pełni (home GF 2.0, xG vs tier 1.85)." },
      { n: 2, title: "League Gap", home: "Ekstraklasa = Ekstraklasa.", away: "Ten sam poziom.", conclusion: "League Gap Score 0. Status: NIEAKTYWNA (+0 gola)." },
      { n: 3, title: "EDC", home: "Śr. vs średni/słabi u siebie 2.3, nie ≥3.0 + xG≥2.40.", away: "CS% 12.5 < 30.", conclusion: "EDC NIE — brak automatycznego +1 poziomu." },
      { n: 4, title: "H/A QOI split", home: "Home vs SŁABI: 2.0 gf / 0.5 ga.", away: "Away vs TOP/średni: 0.5 gf / 1.75 ga.", conclusion: "Split potwierdza kontrolę, nie pogrom." },
    ], "QOI: faworyt powinien wygrać, volume 2 nie 4."),
    step(8, "Prawdopodobieństwo i Value", [
      { n: 1, title: "Flow", home: "Posiadanie, stałe dośrodkowania, niski pressing rywala.", away: "Rzadkie kontry.", conclusion: "Tempo umiarkowane." },
      { n: 2, title: "Eskalacja", home: "38% goli po 60'. xG vs tier 1.85 < próg 2.4.", away: "Pęka po 2. golu historycznie (3:1 2024).", conclusion: "Eskalacja do 3+ możliwa, nie obowiązkowa. Pula 2:0, 2:1, 3:1." },
      { n: 3, title: "Markov 1:0→2:0", home: "Wysoka (H2H 2:0 dwukrotnie u siebie).", away: "Reakcja 2:1 w 2/6 H2H.", conclusion: "Oba łańcuchy żywe — UGO trzyma 2:1." },
    ], "Gustaw K4–8: faworyt wygra, underdog ma realny 1 gol z SFG/kontry."),
    step(9, "Flowmatch + Exact Conversion", [
      { n: 1, title: "CORE/VALUE", home: "Szkic CORE 2:1, VALUE 2:0, BALANCED 1:0, CHAOS 3:1.", away: "Upset 0:1 marginalny.", conclusion: "Nie zamykać EPL przed K12." },
      { n: 2, title: "Game state", home: "Po 1:0 nadal atakuje u siebie vs dół.", away: "Po stracie szuka SFG, nie otwiera się na 4:0.", conclusion: "Półotwarty, nie otwarty." },
    ], "Największe ryzyko: gol Radomiaka ze stałego + niski 1:0 jeśli Lech nie dobije."),
    step(10, "Goal Timing Audit", [
      { n: 1, title: "Venue split", home: "Gf home 2.0 / Ga home 0.5. Gf away 1.25 / Ga away 1.25.", away: "Gf away 0.5 / Ga away 1.75.", conclusion: "Faworyt 2+ u siebie; CS nie Elite → mixed w puli." },
    ], "Audyt K10: 100%. Split venue kompletny."),
    step(11, "Goal Timing Profile", [
      { n: 1, title: "Minuty", home: "Szczyt 31–45 i 61–75. Drugopołówkowy lekko (54% goli 2H).", away: "Gole late 18% vs TOP — próg >20% NIE.", conclusion: "Dane do late UD: 18% / Status: NIEAKTYWNA (nie forsuje 2:1 osobno z late)." },
      { n: 2, title: "Low Scoring Risk", home: "Kurs 1.55 > 1.40. Skuteczność home GF 2.0. Motywacja wysoka.", away: "xGA Lecha 0.96, CS home 50%.", conclusion: "Low Scoring Risk NIE (0/3 twarde + defensywa rywala tylko 1 sygnał)." },
    ], "K0–K11 zamknięte. Czekam na OK użytkownika przed K12."),
  ],
  candidates: [
    { score: "2:1", epfParts: [2.3, 1.8, 1.2, 1.6, 0.8], eplParts: [24, 20, 12, 16, 7], reasons: ["UGO + flow 2 gole"] },
    { score: "2:0", epfParts: [2.4, 1.3, 1.5, 1.6, 0.8], eplParts: [25, 20, 11, 15, 5], reasons: ["Central control"] },
    { score: "1:0", epfParts: [1.7, 1.2, 1.6, 1.3, 0.8], eplParts: [20, 16, 10, 13, 5], reasons: ["Minimal"] },
    { score: "3:1", epfParts: [2.6, 1.7, 1.0, 1.4, 0.6], eplParts: [22, 17, 10, 14, 6], reasons: ["Higher mixed"] },
    { score: "3:0", epfParts: [2.7, 1.0, 1.4, 1.3, 0.5], eplParts: [21, 16, 8, 13, 4], reasons: ["Volume"] },
    { score: "1:1", epfParts: [1.2, 1.6, 0.8, 1.0, 0.7], eplParts: [12, 11, 8, 10, 7], reasons: ["Remis"] },
  ],
  confidenceParts: { forma: 17, xg: 13, h2h: 8, homeAway: 13, qoi: 8, flow: 8, market: 8, squad: 8, sample: 5 },
  gustawK4: "Lech kontroluje mecz u siebie, ale Medium CS i UGO mówią: nie stawiaj życia na 2:0. Kierunek gospodarza jest czysty.",
};

const phase2: PhasePayload = {
  ...phase1,
  steps: [
    ...phase1.steps,
    step(12, "Exact Profil Fit + EPL Ranking", [
      { n: 1, title: "Central Exact", home: "2:0 EPF 7.6 — matematyka + H2H u siebie.", away: "Gol underdoga realny (UGO 3/4).", conclusion: "Central Exact: 2:0. EPF 7.6/10. Nie dostaje automatycznie EPL1 — UGO + Mixed Priority." },
      { n: 2, title: "Conflict Gate", home: "Wymagane TOP3: UGO mixed, (Higher nieobowiązkowy Conf<88).", away: "—", conclusion: "Kandydaci TOP3: 2:1, 2:0, 1:0. Conflict>3: NIE. Compression: NIE." },
    ], "EPL lock po silniku: mixed CORE, 2:0 VALUE, 1:0 BALANCED."),
    step(13, "Override Engine", [
      { n: 1, title: "UGO", home: "3/4, Conf w paśmie 85–89 wymaga CS Strong/Medium + HV NIE dla wyjątku 16.1.", away: "—", conclusion: "CS Medium + HV NIE → 2:0 MOŻE zostać EPL1 (wyjątek 16.1). Silnik waży EPF: jeśli 2:1 ≥ 2:0, mixed zostaje CORE." },
      { n: 2, title: "Dominator / Remis", home: "Conf < 88, kurs 1.55 — Dominator Expansion NIE (próg 1.55 + Conf≥88 + controlled — na granicy kursu, Conf zadecyduje).", away: "Remis Safety: Ekstraklasa nie jest na liście średniej wariancji 25.16.1.", conclusion: "Remis TOP4 nieobowiązkowy. Higher 3+ nieobowiązkowy." },
      { n: 3, title: "Override compression", home: "Higher Exact nieaktywny.", away: "—", conclusion: "Czy Higher realizuje UGO: NIE. Dublowanie: NIE. Powrót do K12: NIE." },
    ], "K13 nie zmienia rankingu — zgodność z K12 OK."),
    step(14, "Market Alignment", [
      { n: 1, title: "Kursy exact", home: "2:0 7.40, 2:1 8.20, 1:0 7.80, 3:0 11.50.", away: "1:1 8.50.", conclusion: "Czysty 2:0 < 8.50 — Market Clean Filter NIE zdejmuje CORE. 3:0 > 9.50 nie jest CORE." },
      { n: 2, title: "Kehnyg", home: "2:1 ≈ 87.8% miss rynku (kurs 8.2) — pamiętaj: Kehnyg ≠ EPL%.", away: "Ruch 1X2 stabilny na gospodarza.", conclusion: "Zgodność kierunku modelu z rynkiem. Consensus +2 do Market Alignment." },
    ], "Rynek potwierdza gospodarza. Brak silnego konfliktu EPL vs Kehnyg na CORE."),
    step(15, "Final Validation", [
      { n: 1, title: "Confidence 0–105", home: "Forma 17/20, xG 13/15, H2H 8/10, Home/Away 13/15, QOI+Mot 8/10, Flow 8/10, Market 8/10, Squad 8/10, Sample 5/5.", away: "—", conclusion: "Suma 88/105. Kryteria v2.1. Silnik liczy Confidence wyłącznie z punktacji 0–105." },
      { n: 2, title: "Checklista GREEN", home: "K12 TAK. Soft Band NIE (1.55). Dominator NIE. Remis Safety NIE.", away: "Early Season NIE (8 meczów).", conclusion: "Decyzja po silniku." },
    ], "Final EPL Consistency Check po Confidence."),
    step(16, "Scenario Weight", [
      { n: 1, title: "Teza", home: "Główna: faworyt wygrywa, underdog może strzelić.", away: "Alt: czyste 2:0 / 1:0.", conclusion: "Wagi 60/30/10. EPL1 na 2 kuponach." },
    ], "Nie rozbijamy na 4 exacty."),
    step(17, "Selekcja kuponu", [
      { n: 1, title: "Konstrukcja", home: "Conf w paśmie Playable/Strong — max 2 exacty jeśli ≥80.", away: "—", conclusion: "Kupon A: EPL1. Kupon B: EPL1+EPL2. Stawka niska-średnia." },
    ], "Zamknięcie ligowe EPL-driven."),
    step(18, "Audyt V24", [
      { n: 1, title: "Komplet kroków", home: "K0–K17 wykonane.", away: "—", conclusion: "Analiza kompletna. Matematyka + flow + motywacja = gospodarz." },
    ], "Wniosek do modelu: Medium CS + kurs 1.55 → nie forsuj Strong CS CORE."),
  ],
  market: {
    movement: "1.58 → 1.55 na gospodarza (24h). Draw 4.00 → 4.20.",
    kehnyg: { "2:1": 87.8, "2:0": 86.5, "1:0": 87.2, "3:0": 91.3, "1:1": 88.2 },
    consensus: "3 źródła (średnia rynkowa) wskazują gospodarza, implied ~64%.",
  },
  gustawK12: "Nie walcz z UGO. Jeśli 2:1 i 2:0 są blisko EPF, mixed jest uczciwszym CORE.",
  gustawK17: "Graj tezę gospodarza, nie pogrom. Dwa kupony, nie cztery.",
  confidenceParts: phase1.confidenceParts,
  candidates: phase1.candidates,
};

export function buildSample(): SavedAnalysis {
  const input = {
    home: "Lech Poznań",
    away: "Radomiak Radom",
    league: "Ekstraklasa",
    kickoff: "2026-08-24T18:15:00.000Z",
    oddsHome: 1.55,
    oddsDraw: 4.2,
    oddsAway: 5.8,
    exactOdds: phase1.odds.exacts,
    notes: "Przykładowa analiza V26 — pełny przebieg K0–K18.",
  };
  const engine = runEngine(input, phase1, phase2);
  return {
    id: "demo-lech-radomiak",
    createdAt: "2026-08-22T07:00:00.000Z",
    updatedAt: "2026-08-22T07:00:00.000Z",
    input,
    status: "complete",
    phase1,
    phase2,
    engine,
    citations: phase1.sources,
    demo: true,
  };
}
