/**
 * Obserwacja — notes przed każdą zmianą silnika.
 * Źródło UI: /obserwacja. Kopia w data/obserwacja/ (backup).
 * Nie nadaje bonusów. Nie patchuje EPL. Czytać przed Tabela 23 / K18.
 */

export type ObserwacjaStatus = "HOLD" | "NOTES" | "PATCH";

export type ObserwacjaCaseKind = "HIT" | "MISS_PROGRAMU" | "MISS_PRZEBIEGU" | "OCZEKUJE";

export type ObserwacjaCase = {
  match: string;
  kind: ObserwacjaCaseKind;
  ft: string;
  top3: string;
  conf: string;
  why: string;
  veto: string;
};

export type ObserwacjaNote = {
  id: string;
  date: string;
  title: string;
  status: ObserwacjaStatus;
  summary: string;
  rules: string[];
  cases: ObserwacjaCase[];
  hitsToProtect: string[];
  tabela23: string[];
};

export const OBSERWACJA: ObserwacjaNote[] = [
  {
    id: "2026-09-09-lista-08",
    date: "09.09.2026",
    title: "Lista pulpitu 08.09 — HIT / MISS. Karty zeszły do Archiwum.",
    status: "NOTES",
    summary:
      "Wczorajsza lista z pulpitu (dzień 08.09, bez nocki 7/8). 16 unikalnych meczów, 15 rozliczonych: 9 HIT, 4 MISS programu, 2 MISS przebiegu. Mizoram bez FT (OCZEKUJE). Duplikaty (Larne ×3, Qadsiah ×2, Mizoram ×2) z kartami. Silnik na całej liście: NO EXECUTION. Karty z pulpitu przeniesione do Archiwum; tu zostaje lista dnia. Na pulpicie 09.09 wieczór: lista 08.09 (Gwangju, Pyramids, Landskrona, Fateh, Defensores, Fortaleza). Leftover 1B w Archiwum.",
    rules: [
      "Lista dnia ≠ kupon. HIT modelu (EPL w TOP3) nie znaczy, że grało się dwójkę.",
      "MISS przebiegu (Narva OG, NEC 92') nie łatamy silnikiem.",
      "MISS programu (Ettifaq 0:0, Qadsiah 3:2, Saints 3:1, Bolton 2:3) — audyt w notatce HOLD obok.",
      "Karty K18 leżą w Archiwum. Tu tylko roster HIT/MISS, żeby nie wracały na pulpit.",
    ],
    cases: [
      {
        match: "Incheon – Bucheon",
        kind: "HIT",
        ft: "2:1",
        top3: "1:0 / 2:1 / 1:2",
        conf: "HIT EPL2 · Soft 1.92",
        why: "FT 2:1 = EPL2. Kierunek TAK.",
        veto: "Nie ruszać. Soft volume, nie DNA 3.",
      },
      {
        match: "Lahti – Mariehamn",
        kind: "HIT",
        ft: "2:1",
        top3: "2:1 / 2:0 / 1:0",
        conf: "HIT EPL1 · sitko 1.54",
        why: "FT 2:1 = CORE. Kierunek TAK.",
        veto: "Nie ruszać. Wzór kuponu 1:0/2:1.",
      },
      {
        match: "Ilves – Jaro",
        kind: "HIT",
        ft: "2:0",
        top3: "2:1 / 1:0 / 2:0",
        conf: "HIT EPL3 · sitko 1.60",
        why: "FT 2:0 = EPL3. Kierunek TAK.",
        veto: "Nie ruszać. 2:0 zostaje na tablicy — 3:1 zakaz Soft.",
      },
      {
        match: "Kalju – Nõmme United",
        kind: "HIT",
        ft: "1:2",
        top3: "2:1 / 1:0 / 1:2",
        conf: "HIT EPL3 · short 1.44",
        why: "FT 1:2 = EPL3. Kierunek NIE (CORE home).",
        veto: "Nie ruszać. HIT tablicy, nie kupon (short).",
      },
      {
        match: "Damac – Al Ula",
        kind: "HIT",
        ft: "0:1",
        top3: "0:1 / 0:2 / 1:1",
        conf: "HIT EPL1 · sitko away",
        why: "FT 0:1 = CORE. Kierunek TAK. Wzór Kalmar/Beitar.",
        veto: "Nie ruszać. 0:1 na sitko away zostaje.",
      },
      {
        match: "Gnistan – KuPS",
        kind: "HIT",
        ft: "1:1",
        top3: "0:1 / 1:2 / 1:1",
        conf: "HIT EPL3",
        why: "FT 1:1 = EPL3. Slot remisu 08.09 złapał.",
        veto: "Nie ruszać. 1:1 na EPL3, 0:0 tylko ochrona.",
      },
      {
        match: "Zamalek – Abo Qair Semads",
        kind: "HIT",
        ft: "2:0",
        top3: "1:0 / 2:1 / 2:0",
        conf: "HIT EPL3 · short 1.39",
        why: "FT 2:0 = EPL3. Kierunek TAK.",
        veto: "Nie ruszać. Input, nie kupon (short). Łatka 3:1 zabiłaby ten 2:0.",
      },
      {
        match: "Ittihad – Fayha",
        kind: "HIT",
        ft: "2:1",
        top3: "2:1 / 1:0 / 2:0",
        conf: "HIT EPL1 · short 1.37",
        why: "FT 2:1 = CORE. Kierunek TAK.",
        veto: "Nie ruszać. Input, nie kupon (short).",
      },
      {
        match: "Larne – Bangor",
        kind: "HIT",
        ft: "1:0",
        top3: "2:1 / 1:0 / 2:0",
        conf: "HIT EPL2 · short 1.14",
        why: "FT 1:0 = EPL2. Kierunek TAK.",
        veto: "Nie ruszać. 1:0 zostaje. Duplikaty kart w Archiwum.",
      },
      {
        match: "Ettifaq – Faisaly",
        kind: "MISS_PROGRAMU",
        ft: "0:0",
        top3: "1:0 / 2:1 / 2:0",
        conf: "58.1% · Soft 1.95",
        why: "0:0 nie było na tablicy. nilNilTop3 wymaga obu BTTS <50.",
        veto: "Audyt HOLD 09.09. Nie łatamy.",
      },
      {
        match: "Qadsiah – Ahli",
        kind: "MISS_PROGRAMU",
        ft: "3:2",
        top3: "1:0 / 2:0 / 1:1",
        conf: "55.2% · Soft 2.07",
        why: "3:2 = chaos. Soft kasuje 3:1. Dominator od 88.",
        veto: "Audyt HOLD 09.09. Nie łatamy. DNA 2 od 09.09 na ósemce.",
      },
      {
        match: "Southampton – Swansea",
        kind: "MISS_PROGRAMU",
        ft: "3:1",
        top3: "1:0 / 2:1 / 1:2",
        conf: "62.9% · Soft 1.85",
        why: "3:1 zakaz Soft. xG 1.19–1.15 — finisz, nie dominacja.",
        veto: "Audyt HOLD 09.09. Nie łatamy. DNA 3 od 09.09 na ósemce.",
      },
      {
        match: "Bolton – West Ham",
        kind: "MISS_PROGRAMU",
        ft: "2:3",
        top3: "1:2 / 1:1 / 0:1",
        conf: "64.8% · sitko away 1.58",
        why: "2:3 chaos (fav 3, UD 2). 0:1 było CORE — wzór kuponu, nie 2:3.",
        veto: "Audyt HOLD 09.09. Nie łatamy. DNA 4 od 09.09 na ósemce.",
      },
      {
        match: "Narva Trans – Flora",
        kind: "MISS_PRZEBIEGU",
        ft: "2:2",
        top3: "1:2 / 1:1 / 0:1 · ochrona 2:2",
        conf: "63.8% · Flora 1.57",
        why: "Samobój Pihela 15'. Bez OG ścieżka 1:2 = CORE. Protection 2:2 złapał ogon.",
        veto: "Nie łatamy silnikiem zdarzeń meczu.",
      },
      {
        match: "NEC – Excelsior",
        kind: "MISS_PRZEBIEGU",
        ft: "2:2",
        top3: "2:1 / 1:0 / 1:2 · ochrona 2:2",
        conf: "46.7% · NEC 1.60",
        why: "Do 91' było 1:2 = EPL3 HIT. Lebreton 92' zabrał exact.",
        veto: "Gol 90+ = przebieg. Nie podnosimy 2:2 do TOP3.",
      },
      {
        match: "Mizoram – Lawtngtlai",
        kind: "OCZEKUJE",
        ft: "—",
        top3: "brak (mapping)",
        conf: "—",
        why: "Dwie karty OCR (Mis / Mls). API-Football i FotMob nie znalazły FT. Nie rozliczone.",
        veto: "Zostaje OCZEKUJE. Nie patch ligi Mizoram pod EPL abort — to osobny mapping, nie wynik.",
      },
    ],
    hitsToProtect: [
      "9 HIT 08.09: Lahti 2:1 EPL1, Ittihad 2:1 EPL1, Damac 0:1 EPL1, Incheon 2:1 EPL2, Larne 1:0 EPL2, Ilves 2:0 EPL3, Zamalek 2:0 EPL3, Gnistan 1:1 EPL3, Kalju 1:2 EPL3",
      "Kupon osobno: NO EXECUTION na całej liście. Conf < MIXED 70.",
    ],
    tabela23: [
      "Karty 08.09 zeszły z pulpitu do Archiwum 09.09 (operator, nie TTL 24 h).",
      "Na pulpicie 09.09 wieczór: lista 08.09 (Gwangju, Pyramids, Landskrona, Fateh, Defensores, Fortaleza). Leftover 1B w Archiwum z adnotacją.",
    ],
  },
  {
    id: "2026-09-09-dna-selekcja",
    date: "09.09.2026",
    title: "Selekcja Krok 1b — wycofany 09.09 wieczór. Wraca Warstwa 1 z 08.09.",
    status: "NOTES",
    summary:
      "Krok 1b (cztery DNA) wprowadzony 09.09 rano, wycofany 09.09 wieczór ze Standardu selekcji. Sitko 1.40–1.75 i Soft 1.70–2.10 z 08.09 bez zmian. Silnik HOLD. Ósemka 09.09 po 1b: 0 HIT wśród skończonych (Daejeon 3:2, Nasaf 3:0, Al-Raed 3:0, Entebbe 0:1). Wczorajsza lista bez 1b: 9 HIT. Cofnięcie = usuń 1b z /selekcja — zrobione.",
    rules: [
      "DNA 1 martwy vs martwy: home + Soft 1.70–2.10 + CS fav ≤40 + GA home ≥2.0 + GF gościa ≤1.0 (Ettifaq).",
      "DNA 2 H2H chaos volume: home + Soft 1.70–2.10 + ≥4 H2H i ≥3 z sumą ≥5 (Qadsiah). Nie samo last 3:2 — Kalmar away zostaje.",
      "DNA 3 Soft volume CS 0: home + Soft 1.80–2.10 + CS fav ≤10 + GF gościa ≥1.0 (Saints).",
      "DNA 4 away sitko gospodarz strzela: away + 1.40–1.75 + GF home ≥0.8 + BTTS fav ≥70 (Bolton). Beitar BTTS 50, Kalmar 20.",
      "Nie filtrujemy Conf z góry. Nie ruszamy silnika. Nie sitkujemy OG / 90+ / czerwonej.",
    ],
    cases: [
      {
        match: "Selekcja — DNA 1–4",
        kind: "MISS_PROGRAMU",
        ft: "—",
        top3: "nie dotyczy",
        conf: "Warstwa 1 · 09.09.2026",
        why: "Cztery kształty, których tablica V26 nie ma. AND-y sprawdzone na archiwum 03–08.09 i Tabeli 23.",
        veto: "Wycofane 09.09 wieczór. Nie sitkować DNA. Warstwa 1 = 08.09.",
      },
    ],
    hitsToProtect: [
      "Kalmar 0:1 last H2H 3:2 ale away — DNA 2 wymaga home",
      "Beitar 0:1 BTTS 50 — DNA 4 wymaga BTTS fav ≥70",
      "Brześć 1:0 GA 1.5 — DNA 1 wymaga GA home ≥2.0",
      "Incheon 2:1 CS 20 — DNA 3 wymaga CS ≤10; H2H 0×≥5",
      "Gent / Náutico / Toulouse / Damac / Larne / Lahti / Ilves / Ittihad / Zamalek / Gnistan / Kalju / Anderlecht / Lech",
    ],
    tabela23: [
      "Sitko kursu zostaje z 08.09. Ten wpis zmienia tylko Warstwę 1 (ósemka).",
      "Craiova / Kalmar / Beitar / Brześć w Kroku 4 Selekcji bez zmian.",
    ],
  },
  {
    id: "2026-09-09-miss-programu",
    date: "09.09.2026",
    title: "MISS programu 08.09 — audyt vs Tabela 23. Silnika nie ruszamy.",
    status: "HOLD",
    summary:
      "Cztery missy programu z dnia 08.09 (bez nocki 7/8) to nie dziury w kodzie. Łatka 0:0 / 3:2 / 3:1 / 2:3 zabiłaby HIT-y z archiwum i sitko 1:0/0:1. MISS przebiegu (Narva OG, NEC 92') zostają MISS przebiegu — protection 2:2 złapał ogon. Wszystkie cztery karty: NO EXECUTION. Kupon ≠ HIT modelu.",
    rules: [
      "Przed każdą zmianą silnika otworzyć /obserwacja i /tabela-23.",
      "Slot remisu 08.09 zostaje: CORE 1:0/0:1, 1:1 na EPL3, 0:0 tylko ochrona.",
      "Soft Band 1.70–2.10: CORE 1:0, 3:1 zakaz, 3:0 max EPL3.",
      "isChaosExact = remis albo 3:2 (faworyt 3, UD 2). Chaos nie wchodzi do TOP3 Controlled Home.",
      "Dominator Expansion od Conf 88. Poniżej: notes, nie patch (Roma, Barca, Neom, Real, Zrinjski, Hilal).",
      "Sitko away 1.40–1.75 trzyma 0:1 na tablicy. 2:3 nie wypycha 0:1.",
      "Dziura 0:0 w TOP3 = notes, nie patch (Sociedad, Londrina, Sloga, Los Andes, Osasuna–Levante).",
      "MISS przebiegu (czerwona / OG / gol 90+) nie łatamy silnikiem.",
    ],
    cases: [
      {
        match: "Ettifaq – Faisaly",
        kind: "MISS_PROGRAMU",
        ft: "0:0",
        top3: "1:0 / 2:1 / 2:0",
        conf: "58.1% · Soft 1.95 · HV NIE · UGO TAK",
        why: "nilNilTop3 wymaga obu BTTS <50. Ettifaq 40 / Faisaly 60 — 0:0 nie weszło nawet na TOP4. Soft + martwy UD (GF 0.8, xG 0.11, 0 dużych okazji). Remis Safety od Conf 80 albo HV+away — tu 58% home.",
        veto: "Gdyby 0:0 weszło do TOP3 przy CORE 1:0, slot remisu 08.09 zrzuciłby je na ochronę i wstawił 1:1 — FT 0:0 dalej MISS. Wyłączenie slotu zabija Kalmar/Beitar/Brześć. Brøndby: «0:0 nie wypycha TOP3». Gent, Náutico, Osasuna–Getafe, Toulouse, Lugano, Anderlecht, Damac, Larne.",
      },
      {
        match: "Qadsiah – Ahli",
        kind: "MISS_PROGRAMU",
        ft: "3:2",
        top3: "1:0 / 2:0 / 1:1 · ochrona 0:0",
        conf: "55.2% · Soft 2.07 · HV NIE · UGO TAK",
        why: "3:2 = isChaosExact. Soft kasuje 3:1. Dominator od 88. 0:0 było w TOP3, slot remisu zrzucił na ochronę → 1:1. sitko B (H2H BTTS) nie weszło: Ahli BTTS sezonu 20% mimo H2H 5/5 i ostatniego 3:2 w tej hali. Nawet sitko B dałoby 2:1/2:0/1:2 — dalej MISS 3:2.",
        veto: "Católica 3:2 chaos zablokowany świadomie. Fulham 2:3 chaos. Norrköping filtr bez 2:3. Liepāja 3:2 zablokowany OK. Peñarol Higher Exact tylko przy BQG+Dominator, nie Soft 2.07 Conf 55.",
      },
      {
        match: "Southampton – Swansea",
        kind: "MISS_PROGRAMU",
        ft: "3:1",
        top3: "1:0 / 2:1 / 1:2",
        conf: "62.9% · Soft 1.85 · HV NIE · UGO TAK",
        why: "Log Soft Band: «3:1 zakaz». xG 1.19–1.15 — finisz, nie dominacja. Conf 62.9 < 88. Swansea CS 80% trzymało 1:2 jako EPL3, nie 3:0 faworyta (sitko C1 liczy CS faworyta, nie gościa).",
        veto: "Aral Nukus MISS: Soft za gruba 2:0/2:1/3:0 vs FT 1:0. Auda 1:0 HIT EPL2. Östers 1:0 MISS bo tablica 2:0/3:1. Gent/Náutico/Toulouse 1:0 HIT. Roma 4:0, Barca 5:2, Neom 3:0, Real 4:1 — Conf<88 Dominator nie pali. 08.09 Zamalek 2:0 i Ilves 2:0 spadłyby, gdy 3:1 zrzuci 2:0.",
      },
      {
        match: "Bolton – West Ham",
        kind: "MISS_PROGRAMU",
        ft: "2:3",
        top3: "1:2 / 1:1 / 0:1",
        conf: "64.8% · sitko away 1.58 · HV NIE · UGO TAK",
        why: "2:3 = chaos (faworyt 3, UD 2). Controlled Away — blockChaosTop3 nie blokuje (tylko Controlled Home), ale Higher Exact nie pali pod 64.8%. Bez karnego 27' jest 1:3 — też poza TOP3. Volume, nie brak 2:3.",
        veto: "0:1 na tej tablicy = wzór kuponu. Kalmar/Beitar/Araz/Toulouse/Villa/Damac. Fulham 2:3 zostawione jako MISS. Waterford 2:1 HIT — filtr chaosu zostaje. 2:3 w EPL3 zrzuca 0:1 albo 1:1.",
      },
      {
        match: "Narva Trans – Flora",
        kind: "MISS_PRZEBIEGU",
        ft: "2:2",
        top3: "1:2 / 1:1 / 0:1 · ochrona 2:2",
        conf: "63.8% · Flora 1.57",
        why: "Samobój Pihela 15'. Bez OG ścieżka 1:0→1:1→1:2 = CORE. Protection 2:2 złapał ogon.",
        veto: "Nie łatamy silnikiem zdarzeń meczu. HV + BTTS 65% już dały 2:2 na ochronie.",
      },
      {
        match: "NEC – Excelsior",
        kind: "MISS_PRZEBIEGU",
        ft: "2:2",
        top3: "2:1 / 1:0 / 1:2 · ochrona 2:2",
        conf: "46.7% · NEC 1.60",
        why: "Do 91' wynik 1:2 = EPL3 HIT. Lebreton 92' zabrał exact. xG 1.36–1.81 gościa. 8 zmian XI.",
        veto: "Gol 90+ = przebieg. Nie podnosimy 2:2 do TOP3 — to ochrona HV/chaos, nie CORE.",
      },
    ],
    hitsToProtect: [
      "08.09: Lahti 2:1, Ilves 2:0, Ittihad 2:1, Damac 0:1, Incheon 2:1, Zamalek 2:0, Larne 1:0, Gnistan 1:1, Kalju 1:2",
      "03.09: Gent 1:0, Náutico 1:0, Toulouse 0:1, Anderlecht 1:0, Lugano 1:0, Basel 1:2, Lech 2:1",
      "01.09: Araz 0:1, Villa 0:1, Osasuna–Getafe 1:0, Hajduk 2:0, Arda 2:0, Flint 1:2, Mirassol 1:1, Gimnasia 1:1",
      "02.09: Entebbe 2:1, Helsingborg 1:1, Najma 1:1",
      "24.08: Norrköping 2:1 (filtr chaosu bez 2:3), Málaga 1:1, Brøndby 3:1 (0:0 nie wypycha TOP3)",
      "25.08: Auda 1:0 VALUE, Åsane 1:2, Moss 2:2, Ettifaq–Nassr 2:3 (czerwona, fill)",
    ],
    tabela23: [
      "REF: Pakhtakor/Shamrock Remis Safety — MISS, nie obniżać progu Conf 80",
      "REF: Djurgården 0:0 — Draw Resistance HV+away, nie home Soft 58%",
      "REF: Aral Nukus Soft Band za gruba vs 1:0",
      "REF: Peñarol Higher Exact — BQG/Dominator, nie Soft 2.07",
      "REF: Craiova Dominator Expansion od 88",
      "REF: Braga Minimal Exact 0:1 — sitko trzyma 0:1",
      "AUG24: Católica 3:2 chaos zablokowany świadomie; Fulham 2:3 chaos; Osasuna–Levante 0:0 TOP4",
      "AUG27: Real 4:1 / Barca 2:0 — Dominator nie pali pod 88 / MIXED ONLY",
      "SEP01: Sociedad–Celta, Londrina, Sloga, Los Andes — 0:0 hole = notes, nie patch",
      "SEP03: Neom 3:0 volume, Győr 0:3 volume — Conf<70 nie otwiera Dominatora",
    ],
  },
];
