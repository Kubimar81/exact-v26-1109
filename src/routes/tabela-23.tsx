import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AutoWnioski } from "@/components/analysis/auto-wnioski";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/tabela-23")({ component: Table23 });

type Row = { match: string; profile: string; model: string; result: string; hit: boolean; note: string };

const REF: Row[] = [
  { match: "Viking", profile: "UGO mixed", model: "2:1 EPL3", result: "2:1", hit: true, note: "UGO świadomie wysoko — HIT" },
  { match: "Ordabasy", profile: "UGO mixed", model: "3:1 EPL3", result: "3:1", hit: true, note: "Higher mixed spełnia UGO" },
  { match: "Waterford", profile: "UGO mixed", model: "2:1 EPL3", result: "2:1", hit: true, note: "Ochrona underdoga" },
  { match: "Hammarby", profile: "Dominator", model: "4:0 EPL3", result: "4:0", hit: true, note: "Volume w TOP3" },
  { match: "Pakhtakor", profile: "Brak remisu", model: "bez 1:1", result: "1:1", hit: false, note: "Remis Safety — MISS" },
  { match: "Shamrock", profile: "HV / remis", model: "bez 1:1", result: "1:1", hit: false, note: "Remis Safety" },
  { match: "Cavalry", profile: "Elite Conf 89.5%", model: "kierunek", result: "1:1", hit: false, note: "Elite Conf nie chroni kierunku" },
  { match: "Flora", profile: "Kierunek", model: "home", result: "1:2", hit: false, note: "Pełny MISS kierunku" },
  { match: "Elfsborg", profile: "Conf 88.6%", model: "home", result: "3:1 gość", hit: false, note: "Test kierunku obowiązkowy" },
  { match: "Djurgården", profile: "Allsvenskan Conf 76%", model: "bez 0:0", result: "0:0", hit: false, note: "Draw Resistance przy HV + away fav" },
  { match: "Craiova", profile: "Dominator", model: "brak 4:0", result: "4:0", hit: false, note: "Dominator Expansion obowiązkowy" },
  { match: "Sogdiyona", profile: "Strong CS vs high GF", model: "CS CORE", result: "1:5", hit: false, note: "25.12 Strong CS źle nadany" },
  { match: "Braga", profile: "BQG", model: "0:2 / 0:3", result: "0:1", hit: false, note: "Minimal Exact Protection" },
  { match: "Aral Nukus", profile: "Soft Band", model: "2:0/2:1/3:0", result: "1:0", hit: false, note: "Soft Band 1.70–2.10" },
  { match: "Peñarol", profile: "Quality gap", model: "2:0/2:1/1:0", result: "5:1", hit: false, note: "Higher Exact Mandatory" },
];

/** Weryfikacja 25–26.08.2026 — ligowe z Superbet vs FT. */
const AUG25: Row[] = [
  {
    match: "Odd BK – Kongsvinger",
    profile: "Away 2.27 · Δ 0.35",
    model: "1:2 / 2:3 / 1:3",
    result: "0:1",
    hit: false,
    note: "Kierunek TAK. Exact MISS. xG 1.39–0.85 / SOT 2–1 — gospodarz miał przewagę, FT 0:1. CORE 2+ za wysoki.",
  },
  {
    match: "Moss – Sogndal",
    profile: "Home 2.15 · Conf 64.8%",
    model: "2:1 / 2:2 / 1:2",
    result: "2:2",
    hit: true,
    note: "HIT EPL2. SOT 7–3, strzały 12–9. VALUE 2:2 złapał remis mimo SOT home.",
  },
  {
    match: "Åsane – Lyn FK",
    profile: "Soft Band away · CORE 0:2",
    model: "0:2 / 1:2 / 2:2",
    result: "1:2",
    hit: true,
    note: "HIT EPL2. HT 0:2. SOT 3–4. Soft Band CORE czysty, FT mixed 1:2 — VALUE.",
  },
  {
    match: "Real Madryt – Real Sociedad",
    profile: "1.27 Superprzewaga · Conf 71.4%",
    model: "3:1 / 2:1 / 1:0",
    result: "4:1",
    hit: false,
    note: "Kierunek TAK. Exact MISS. xG 3.14–0.57 / SOT 11–3. UGO na 1.27 i Dominator dopiero od Conf 88 — 4:1 poza TOP3.",
  },
  {
    match: "Al Ettifaq – Al Nassr",
    profile: "Away 1.25 · czerwona 12'",
    model: "1:2 / 0:2 / 2:3",
    result: "2:3",
    hit: true,
    note: "HIT EPL3. Bento czerwona ~12', HT 2:0, FT 2:3. xG 0.72–2.00 / SOT 5–9. Chaos, fill 2:3 złapał.",
  },
  {
    match: "Valencia – Betis",
    profile: "Coin-flip 2.77/2.60 · Conf 46.7%",
    model: "2:1 / 1:1 / 0:1",
    result: "0:1",
    hit: true,
    note: "HIT EPL3. No execution OK. λ 0.58 → CORE 2:1 błędny. xG 1.15–0.70 / SOT 3–3. Pablo García 83'.",
  },
  {
    match: "Örebro – Varberg",
    profile: "Away 2.32 · Playable 77.1%",
    model: "1:2 / 1:1 / 2:1",
    result: "2:1",
    hit: true,
    note: "HIT EPL3, CORE zły kierunek. xG 2.36–1.32 / strzały 18–15. Playable na Δ 0.48 — za wysoko.",
  },
  {
    match: "Östers – Sundsvall",
    profile: "Soft Band 1.74 · Playable 81.9%",
    model: "2:0 / 2:1 / 3:1",
    result: "1:0",
    hit: false,
    note: "MISS. Jawla czerwona 23' (Östers). xG 0.90–1.76 / SOT 3–6. 1:0 poza TOP3 — Soft Band brał 2:0 z EPF.",
  },
  {
    match: "Auda – Liepaja",
    profile: "Soft Band 1.97 · Conf 64.8%",
    model: "2:0 / 1:0 / 1:2",
    result: "1:0",
    hit: true,
    note: "HIT EPL2. xG 0.66–0.65 / SOT 1–1. Ekou 2. żółta 88'. CORE 2:0 za gruby — 1:0 było VALUE.",
  },
];

/** Weryfikacja 27.08.2026 — LaLiga Superbet vs FT. */
const AUG27: Row[] = [
  {
    match: "Celta Vigo – Osasuna",
    profile: "Soft Band 2.00 · Conf 53%",
    model: "1:0 / 2:0 / 1:1",
    result: "1:2",
    hit: false,
    note: "Kierunek MISS. Exact MISS. Alonso czerwona 51' VAR. xG 0.14–2.60 / SOT 2–5. λ 0.66 — Soft Band wepchnął 1:0/2:0 wbrew Central 1:1. No execution OK. Bramka B: λ<1.0 bez 2:0.",
  },
  {
    match: "Barcelona – Athletic Bilbao",
    profile: "1.24 Superprzewaga · Conf 69.5%",
    model: "4:1 / 1:0 / 3:1",
    result: "2:0",
    hit: false,
    note: "Kierunek TAK. Exact MISS. xG 3.91–0.25 / SOT 10–0. CORE 4:1 UGO+Higher, λ 5.00 — HV z GF+GA zdjął sufit. Bramka A: czysty CORE + 2:0 w TOP3 + λ 2.10.",
  },
];

/** Weryfikacja 24.08.2026 — EPL z analiz vs FT. Silnika nie ruszamy tą tabelą. */
const AUG24: Row[] = [
  {
    match: "Norrköping – Falkenberg",
    profile: "Superettan · Controlled home",
    model: "2:1 / 3:1 / 2:0",
    result: "2:1",
    hit: true,
    note: "HIT #1. Kierunek TAK. Filtr chaosu (bez 2:3) zostaje.",
  },
  {
    match: "Málaga – Deportivo",
    profile: "Slight Home · λ 0.15",
    model: "2:1 / 1:1 / 0:1",
    result: "1:1",
    hit: true,
    note: "HIT #2. Kurs 2.35 — nie coin-flip. λ bez podłogi.",
  },
  {
    match: "Brøndby – Silkeborg",
    profile: "UGO mixed · 1.42",
    model: "2:1 / 1:1 / 3:1",
    result: "3:1",
    hit: true,
    note: "HIT #3 fill. CORE 2:1 UGO zostaje. 0:0 nie wypycha TOP3.",
  },
  {
    match: "Fulham – Chelsea",
    profile: "Away fav 1.92 · Soft Band",
    model: "0:1 / 1:2 / 0:2",
    result: "2:3",
    hit: false,
    note: "Kierunek TAK (Chelsea). Exact MISS — 2:3 chaos; blokada tylko Controlled home.",
  },
  {
    match: "Bologna – Lazio",
    profile: "Slight Home 2.32 · fałszywy mixed",
    model: "2:1 / 1:1 / 3:1",
    result: "0:1",
    hit: false,
    note: "MISS kierunku i exact. Kurs 2.32 ≠ UGO 1.35–1.85. λ 1.20 vs CORE 2:1.",
  },
  {
    match: "Roma – Fiorentina",
    profile: "Soft Band 1.74 · Conf 71%",
    model: "2:0 / 1:0 / 2:1",
    result: "4:0",
    hit: false,
    note: "Kierunek TAK. Volume MISS. Dominator 88%/1.55 nie pali. 3:0 fill przy UGO off.",
  },
  {
    match: "Osasuna – Levante",
    profile: "Soft Band 1.85 · Conf 74%",
    model: "1:0 / 2:1 / 1:1",
    result: "0:0",
    hit: false,
    note: "Kierunek z SOT home, FT 0:0. Remis Safety 80 za późno — 0:0 w TOP4.",
  },
  {
    match: "Isloch – Dinamo Mińsk",
    profile: "λ 2.75 · Central 3:3",
    model: "3:3 / 2:3 / 0:3",
    result: "1:0",
    hit: false,
    note: "MISS kierunku i exact. Białoruś nie HV. Sufit λ 2.10.",
  },
  {
    match: "Malmö FF – Djurgården",
    profile: "Coin-flip 2.60 / 2.47",
    model: "— (brak EPL na screenie)",
    result: "0:3",
    hit: false,
    note: "Δ 0.13. Faworyt none. SOT 5–5. Nie lockować jednej strony.",
  },
  {
    match: "Libertad – San Lorenzo",
    profile: "Paraguay HV · 1.37",
    model: "— (brak EPL na screenie)",
    result: "1:0",
    hit: false,
    note: "Kierunek home TAK. HV ustępuje kursowi ≤1.40 — clean 1:0 może być CORE.",
  },
];

/** Audyt 03.09.2026 — 15 meczów z kart K18 vs FT. Standard v2.1 zamrożony. */
const SEP03: Row[] = [
  {
    match: "Akademia Ontustyk – Aktobe II",
    profile: "1.24 · Conf 44.8% · NO EXEC",
    model: "2:0 / 2:1 / 3:1",
    result: "2:1",
    hit: true,
    note: "HIT EPL2 VALUE. CORE 2:0 clean za czysty przy kursie 1.24.",
  },
  {
    match: "Al Fayha – Al Kholood",
    profile: "Protection 2:2 · no exec",
    model: "kierunek 2 · EPL4 2:2",
    result: "2:2",
    hit: false,
    note: "MISS TOP3 / HIT EPL4 protection. CORE kierunek pudło. Gol 88’.",
  },
  {
    match: "Raków – Górnik",
    profile: "Coin-flip 2.60/2.70",
    model: "1:1 / 1:2 / 2:1",
    result: "1:2",
    hit: true,
    note: "HIT EPL3 BAL. Coin-flip CORE 1:1 OK. Czerwona 90+4’ po wyniku.",
  },
  {
    match: "Neom SC – Al Khaleej",
    profile: "Conf 47.6% · 0 SOT gości",
    model: "2:0 BAL",
    result: "3:0",
    hit: false,
    note: "MISS volume, kierunek TAK. 3 gole w 8 min. Dominator nie otwarty pod Conf<70.",
  },
  {
    match: "Mjällby – Djurgården",
    profile: "Conf 60%",
    model: "1:2 CORE / 0:1 VALUE",
    result: "0:2",
    hit: false,
    note: "MISS exact, kierunek TAK. CORE 1:2 o gola za wysoko. H2H 4:0 z 31.08.",
  },
  {
    match: "Hapoel – Beitar",
    profile: "Conf 31.4% · czerwona 48’",
    model: "VALUE żyło do kartki",
    result: "3:0",
    hit: false,
    note: "MISS event+volume. Gadrani czerwona 48’ przy 1:0. Jedyny czysty event-MISS nocy. Reguła D zostaje.",
  },
  {
    match: "Győr – Ferencváros",
    profile: "Conf 41.9%",
    model: "0:1 CORE",
    result: "0:3",
    hit: false,
    note: "MISS volume, kierunek TAK. CORE 0:1 do 70’. Burst 70–72’. Karny 90+1’ niecelny.",
  },
  {
    match: "Anderlecht – Kortrijk",
    profile: "Strong Home 1.44 · Conf 53.3%",
    model: "2:1 CORE / 1:0 BAL",
    result: "1:0",
    hit: true,
    note: "HIT EPL3 BAL Minimal. Volume niższy niż CORE 2:1.",
  },
  {
    match: "Gent – Leuven",
    profile: "Soft Band · Conf 53.3%",
    model: "1:0 CORE",
    result: "1:0",
    hit: true,
    note: "HIT EPL1 CORE. Central Exact 2:1 nie wszedł — priorytet 1:0 OK.",
  },
  {
    match: "Basel – Sion",
    profile: "Conf 62.9% · Cissé 62’",
    model: "1:2 CORE",
    result: "1:2",
    hit: true,
    note: "HIT EPL1 Central Exact. Czerwona po HT 1:0 przyspieszyła już typowany 1:2. Najczystszy HIT.",
  },
  {
    match: "Lugano – Servette",
    profile: "Playable MIXED ONLY 70.5%",
    model: "1:0 VALUE",
    result: "1:0",
    hit: true,
    note: "HIT EPL2 Minimal. Jedyny Playable nocy. Gol 90+4’.",
  },
  {
    match: "Lech – Jagiellonia",
    profile: "UGO · Conf 45.7%",
    model: "2:1 VALUE",
    result: "2:1",
    hit: true,
    note: "HIT EPL2 UGO. Gumny 87’ VAR. W audycie 02.09 był „przyszłość”.",
  },
  {
    match: "Toulouse – Lille",
    profile: "Soft Band · Conf 48.6%",
    model: "0:1 CORE",
    result: "0:1",
    hit: true,
    note: "HIT EPL1 Soft Band. Ueda 73’ sub. Early season n=2.",
  },
  {
    match: "Real Sociedad – Celta",
    profile: "Conf 43.8% · Direction NIE",
    model: "VALUE 1:1",
    result: "0:0",
    hit: false,
    note: "MISS. 0:0 hole. Karny 77’ niepodyktowany. Wzorzec Sloga/Londrina 01.09. Notes, nie patch.",
  },
  {
    match: "Náutico PE – Botafogo SP",
    profile: "Soft Band · Conf 53.3%",
    model: "1:0 CORE",
    result: "1:0",
    hit: true,
    note: "HIT EPL1. Kickoff 04.09 01:00 BRT. Wzorzec jak Gent.",
  },
];

/** Audyt 02.09.2026 — 13 meczów 01.09 + Londrina. 13/13 NO EXECUTION. */
const SEP02: Row[] = [
  {
    match: "NEC FC – Lugazi",
    profile: "Uganda GW2 · Conf 41.9%",
    model: "2:1 EPL1",
    result: "3:1",
    hit: false,
    note: "MISS volume, kierunek TAK. 3:1 ogon poza TOP3. Brak czerwonej.",
  },
  {
    match: "Entebbe UPPC – UPDF",
    profile: "Conf 45.7%",
    model: "2:1 CORE",
    result: "2:1",
    hit: true,
    note: "HIT EPL1 mixed CORE. Czerwona UPDF 75’ PO 2:1.",
  },
  {
    match: "Sloga Doboj – Čelik",
    profile: "Coin-flip 2.25/2.90 · Conf 31.4%",
    model: "1:1 EPL3",
    result: "0:0",
    hit: false,
    note: "MISS. 0:0 poza TOP3. NO EXECUTION.",
  },
  {
    match: "Helsingborg – Örebro",
    profile: "Conf 49.5%",
    model: "1:1 EPL3",
    result: "1:1",
    hit: true,
    note: "HIT remisu fill. Yasin 77’, Johansson 90+2’. 2:2 EPL4 nietrafione.",
  },
  {
    match: "Wolfsberger – LASK",
    profile: "Conf 61.9% · czerwona 2’",
    model: "1:2 / 0:2",
    result: "1:3",
    hit: false,
    note: "MISS event. Behounek czerwona 2’. xG 0.27–2.54. Jedyny czysty event-MISS tury.",
  },
  {
    match: "Al Najma – Al Jabalain",
    profile: "Soft Band · Conf 46.7%",
    model: "1:1 EPL3",
    result: "1:1",
    hit: true,
    note: "HIT remisu fill. Brak czerwonej.",
  },
  {
    match: "Al Hilal – Al Ahli",
    profile: "Conf 58.1%",
    model: "3:1 EPL2",
    result: "3:0",
    hit: false,
    note: "MISS volume, kierunek TAK. Demiral 2. żółta HT po 2:0. CS OK.",
  },
  {
    match: "Zürich – Young Boys",
    profile: "Conf 64.8% · sufit tury",
    model: "1:2 EPL1",
    result: "2:4",
    hit: false,
    note: "MISS volume, kierunek TAK. Fassnacht hat-trick. 2:2 EPL4 nietrafione.",
  },
  {
    match: "West Ham – Wolves",
    profile: "Soft Band · Conf 31.4%",
    model: "1:0 / 2:1",
    result: "4:2",
    hit: false,
    note: "MISS volume, kierunek TAK. Absencje Souček/Thomas. 4+ ogon poza bandą.",
  },
  {
    match: "Zrinjski – BSK",
    profile: "1.19 Superprzewaga · Conf 63.8%",
    model: "2:1 / 2:0",
    result: "3:1",
    hit: false,
    note: "MISS volume, kierunek TAK. HT 0:0. Brak czerwonej.",
  },
  {
    match: "Preston – Bristol City",
    profile: "Conf 44.8%",
    model: "1:2 EPL1",
    result: "1:3",
    hit: false,
    note: "MISS volume, kierunek TAK. Preston 0-0-4 przed meczem.",
  },
  {
    match: "Stoke – Norwich",
    profile: "Soft Band away · Conf 51.4%",
    model: "0:1 CORE",
    result: "1:0",
    hit: false,
    note: "MISS kierunku. Thomas out. xG 0.24–1.30. Stoke wygrał po deflected Galbraith.",
  },
  {
    match: "Londrina – Juventude",
    profile: "Série B · Conf 50.5%",
    model: "1:1 CORE",
    result: "0:0",
    hit: false,
    note: "MISS. 0:0 dziura. Gol Juv anulowany (spalony). Kickoff 02.09 00:30 CEST.",
  },
];

/** Audyt 01.09.2026 — 21 meczów 29–31.08 ze screenów V26. */
const SEP01: Row[] = [
  {
    match: "Lyon – Le Havre",
    profile: "Soft Band · Conf 61.9%",
    model: "bez 1:1",
    result: "1:1",
    hit: false,
    note: "MISS. Remis Safety nieaktywne.",
  },
  {
    match: "Sevilla – Atlético",
    profile: "WATCH · Conf 58.1%",
    model: "1:2 / 0:1",
    result: "1:3",
    hit: false,
    note: "MISS volume, kierunek away TAK. WATCH OK.",
  },
  {
    match: "Mirassol – Palmeiras",
    profile: "Conf 54.3%",
    model: "1:1 EPL2 Remis Safety",
    result: "1:1",
    hit: true,
    note: "HIT. Patch 1:1 przed EPF fill potwierdzony. Czerwona 97’ po FT.",
  },
  {
    match: "Colo Colo – Audax",
    profile: "Conf 81.9% + UGO",
    model: "3:1",
    result: "5:1",
    hit: false,
    note: "MISS volume, kierunek TAK. 5:1 ogon. NIE RUSZAĆ higher31.",
  },
  {
    match: "Los Andes – Acassuso",
    profile: "NO EXEC · Conf 44.8%",
    model: "1:1",
    result: "0:0",
    hit: false,
    note: "MISS. 0:0 poza TOP3.",
  },
  {
    match: "Gimnasia Jujuy – Agropecuario",
    profile: "Soft Band · Conf 52.4%",
    model: "1:1 EPL3",
    result: "1:1",
    hit: true,
    note: "HIT remisu. Soft Band + 1:1 w TOP3.",
  },
  {
    match: "Católica – O'Higgins",
    profile: "Soft Band",
    model: "chaos 3:2 zablokowany",
    result: "3:2",
    hit: false,
    note: "MISS, kierunek TAK. 3:2 chaos zablokowany świadomie.",
  },
  {
    match: "La Calera – La Serena",
    profile: "NO EXEC · Conf 34.3%",
    model: "home karta",
    result: "0:1",
    hit: false,
    note: "MISS kierunku.",
  },
  {
    match: "Flint – Nomads",
    profile: "PLAYABLE · Conf 77.1%",
    model: "1:2 CORE",
    result: "1:2",
    hit: true,
    note: "HIT EPL1. Cymru override OK. Nie ruszać.",
  },
  {
    match: "Briton Ferry – Barry",
    profile: "Conf 66.7%",
    model: "TOP3 bez 1:4",
    result: "1:4",
    hit: false,
    note: "MISS. 1:4 ogon poza TOP3. 2:2 nie pomogło.",
  },
  {
    match: "Yelimay – Kairat",
    profile: "Conf 61.9%",
    model: "0:1 CORE",
    result: "0:2",
    hit: false,
    note: "MISS exact, kierunek TAK. Czerwona Kairat 75’ po wyniku.",
  },
  {
    match: "Araz – Sabah",
    profile: "Conf 46.7%",
    model: "0:1 EPL2 Minimal",
    result: "0:1",
    hit: true,
    note: "HIT Minimal. No execution kuponu. Nie ruszać 0:1.",
  },
  {
    match: "Sumqayıt – Qarabağ",
    profile: "Conf 61.0% · Borges 31’",
    model: "0:1 wypchnięte",
    result: "0:1",
    hit: false,
    note: "MISS exact, kierunek TAK. Fav czerwona 31’. Minimal bez twardego slotu.",
  },
  {
    match: "Liepāja – Riga",
    profile: "Conf 56.2%",
    model: "3:3 zcięte",
    result: "3:2",
    hit: false,
    note: "MISS. Underdog win. Chaos 3:2/3:3 zablokowany OK.",
  },
  {
    match: "Copenhagen – Sønderjyske",
    profile: "Conf 47.6%",
    model: "3:1 Central Exact zcięte",
    result: "3:1",
    hit: false,
    note: "MISS (HIT→MISS patchu fill). Czerwona 70’ PO 3:1. Jedyny twardy minus patchu. Notes, nie patch dziś.",
  },
  {
    match: "Sirius – Malmö",
    profile: "home fav karta",
    model: "home",
    result: "0:1",
    hit: false,
    note: "MISS kierunku. FT away.",
  },
  {
    match: "Hajduk – Lokomotiva",
    profile: "Conf 50.5%",
    model: "2:0 EPL3",
    result: "2:0",
    hit: true,
    note: "HIT czysty 2:0. Czerwona Loko 78’ po wyniku.",
  },
  {
    match: "Arda – Botev Vratsa",
    profile: "Conf 65.7%",
    model: "2:0 EPL3",
    result: "2:0",
    hit: true,
    note: "HIT. Identyczna drabinka jak Hajduk.",
  },
  {
    match: "Osasuna – Getafe",
    profile: "Conf 54.3%",
    model: "1:0 EPL2",
    result: "1:0",
    hit: true,
    note: "HIT Minimal/czysty 1:0.",
  },
  {
    match: "Barcelona – Rayo",
    profile: "Conf 61.9%",
    model: "3:1 CORE",
    result: "5:2",
    hit: false,
    note: "MISS volume, kierunek TAK. 5:2 ogon. Conf<88 — Dominator nie pali.",
  },
  {
    match: "Villa – Arsenal",
    profile: "Conf 53–61%",
    model: "0:1 EPL2 Minimal",
    result: "0:1",
    hit: true,
    note: "HIT. v29 1:2/0:1/0:2. Wariant 1:3 = regresja HV=NIE. Brak czerwonej.",
  },
];

function Block({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  const hits = rows.filter((r) => r.hit).length;
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p>
        </div>
        <span className="text-xs text-subtle">
          {hits} HIT / {rows.length - hits} MISS · {rows.length}
        </span>
      </div>
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.match} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display text-lg">{r.match}</div>
                <div className="text-xs text-muted">
                  {r.profile} · model {r.model} · FT {r.result}
                </div>
              </div>
              <Badge variant={r.hit ? "ok" : "danger"}>{r.hit ? "HIT" : "MISS"}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted">{r.note}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Table23() {
  const hits03 = SEP03.filter((r) => r.hit).length;
  const hits02 = SEP02.filter((r) => r.hit).length;
  const hits01 = SEP01.filter((r) => r.hit).length;
  const hits24 = AUG24.filter((r) => r.hit).length;
  const hits25 = AUG25.filter((r) => r.hit).length;
  const hits27 = AUG27.filter((r) => r.hit).length;
  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Historical Validation Layer</p>
      <h1 className="mt-2 font-display text-4xl">Tabela 23</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Podgląd z pliku Tabela23_03.09.2026_UZUPELNONA. Nie nadaje bonusów do silnika — tylko EPL vs FT.
        Standard v2.1 zamrożony. Przed łatką silnika:{" "}
        <Link to="/obserwacja" className="text-fg underline-offset-2 hover:underline">
          Obserwacja
        </Link>
        .
      </p>
      <p className="mt-2 text-sm text-muted">
        03.09: {hits03}/{SEP03.length} HIT TOP3 (60%). 02.09: {hits02}/{SEP02.length}. 01.09: {hits01}/{SEP01.length}.
        27.08: {hits27}/{AUG27.length}. 25–26.08: {hits25}/{AUG25.length}. 24.08: {hits24}/{AUG24.length}.
      </p>

      <Block
        title="03.09.2026 — karty K18"
        hint="15 meczów (kickoff CEST + Náutico 04.09 01:00 BRT). HIT TOP3 9/15. Kierunek CORE 13/15. 14/15 No execution. CORE exact: Basel, Náutico, Gent, Toulouse. Fayha 2:2 = protection, nie TOP3."
        rows={SEP03}
      />
      <Block
        title="02.09.2026 — 01.09 + Londrina"
        hint="13 meczów. HIT TOP3 3/13. Kierunek 10/13. Wszystkie Conf<70% = NO EXECUTION. HIT: Entebbe 2:1, Helsingborg 1:1, Najma 1:1."
        rows={SEP02}
      />
      <Block
        title="01.09.2026 — 29–31.08"
        hint="21 meczów ze screenów. HIT TOP3 8/21. Kierunek 14/21. HIT: Mirassol, Gimnasia, Flint, Araz, Hajduk, Arda, Osasuna, Villa. Copenhagen 3:1 = HIT→MISS patchu fill — notes, nie patch."
        rows={SEP01}
      />
      <Block
        title="27.08.2026 — LaLiga"
        hint="Celta i Barcelona vs FT. HIT = exact w TOP3. CORE exact 0/2. Bramki A i B z 28.08 są w silniku."
        rows={AUG27}
      />
      <Block
        title="25–26.08.2026 — weryfikacja ligowa"
        hint="9 meczów z screenów Superbet + EXACT. HIT = exact w TOP3. CORE exact 0/9."
        rows={AUG25}
      />
      <Block
        title="24.08.2026 — weryfikacja EPL"
        hint="Screeny Superbet + EXACT vs wynik FT. Trzy HIT zostają wzorcem (Norrköping 2:1, Málaga 1:1, Brøndby 3:1)."
        rows={AUG24}
      />
      <Block
        title="Referencja V26 (17–23.07 / 05.08)"
        hint="Oryginalna próbka standardu. Tych wierszy nie nadpisujemy."
        rows={REF}
      />
      <AutoWnioski />
    </AppShell>
  );
}
