import type { MatchInput } from "./types";
import { STEPS } from "./types";

export function systemPrompt(phase: 1 | 2) {
  const steps = STEPS.filter((s) => s.phase === phase)
    .map((s) => `K${s.k}`)
    .join(",");
  return `EXACT V26-Liga. Tylko ligi. ZERO DOMYSŁÓW (brak STATYSTYKI = 0 i NIEAKTYWNA; kurs 0 z szablonu = BRAK, weź kurs z formularza).
EPL% = ranking siły (CORE 85–92), nie klasyczne p%. Confidence = Kryteria v2.1 suma 0–105 (31.08.2026).
HV TAK (Reguła 18, OR): GF+GA jednej drużyny≥3.80 | BTTS≥65% | liga na liście HV (Chile, Islandia, UZ, Irlandia, Rumunia, Paragwaj + Botola/Grecja/Turcja/Egipt/Tunezja/USL/Arg.B). Allsvenskan, Ekstraklasa i Calcutta Premier Division: NIE auto-HV (gołe „Premier Division” NIE jest tokenem HV).
UGO TAK ≥2/4: CS fav Weak/Medium; kurs 1.40–1.85; fav stracił gola ≥50%/8–10; HV lub UD ofensywny. UGO NIE obniża Confidence (kat. Sample).
CS Strong: CS%≥50/8–10 ORAZ (venue≥60 | 0–1 gol/5). Medium 30–49. Weak <30.
Early season ≤3 mecze (Forma max 14, xG max 12, Conf max 82%). TOP3 Gate. Protection ≠ TOP3.
Confidence v2.1: Forma/20, xG/15, H2H/10 (brak H2H = 5, nie 0), Home-Away Split/15, QOI+Motivation/10 (brak tabeli = 5; luka ≥8 → min 8/10), Flow/10 (z testu 25.3 / coin-flip, nie z CS%), Market/10 (miara A: model 1X2 − implied 1X2; NIE EPL%−implied exact; brak kursów = 4), Squad/10, Sample+Variance/5 (n≥6 i nie-HV=5; n 4–5 lub HV=3; n=3→1; n≤2→0). HV nie obcina 0–105 o −9. Direction Gate NIE nie capuje % do 82 (schodzi w Flow 0–2; decyzja WATCH zostaje).
Pasma: ≥88 Premium, 85–87 Strong, 70–84 MIXED ONLY (zakaz GREEN-Dominator i 4:0/5:1 w TOP3), <70 WATCH/NO EXECUTION. Próg <76 wycofany.
Źródła: tylko URL z nazwą klubu ORAZ ligi. ZAKAZ homonimów (Manchester United, USL United, Rwanda Police, Police Tero, Bayern).
Faza: ${phase === 1 ? "K0–K11 TYLKO, nie zamykaj EPL" : "K12–K18 EPL+Conf+kupony"}. Kroki: ${steps}.
JSON ZWIĘZŁY (bez markdown, bez esejów). Kroki: 1 zdanie summary + numbers. Forma max 8.
{
 "sources":["https://"],
 "match":{"league":"","kickoff":"","homePos":0,"awayPos":0,"ptsHome":0,"ptsAway":0,"motivation":""},
 "odds":{"home":null,"draw":null,"away":null,"exacts":{}},
 "favorite":"home",
 "profileDraft":"Controlled Home Favorite",
 "home":{"name":"","tablePos":0,"points":0,"played":0,"form":[{"date":"","opponent":"","ha":"H","scoreFor":0,"scoreAgainst":0,"quality":"SREDNI"}],"csPctOverall":0,"csPctHome":0,"csPctAway":0,"bttsPct":0,"over25Pct":0,"gfAvg":0,"gaAvg":0,"gfHome":0,"gaHome":0,"gfAway":0,"gaAway":0,"xg":0,"xga":0,"possession":0,"corners":0,"shotsOnTarget":0,"cards":0,"goalsAfter60Pct":0,"finishingLabel":"Neutral"},
 "away":{"...jak home"},
 "h2h":[{"date":"","competition":"","home":"","away":"","score":""}],
 "h2hAvgGoals":0,"injuries":"","weather":"","coach":"",
 "steps":[{"k":0,"name":"","summary":"1 zdanie + liczby","numbers":{"gfH":0},"audit":{"pct":80,"good":"","bad":"","impact":""}}],
 "gatesRaw":{"csFavLast10":0,"csFavLast5Venue":0,"goalsConcededFavLast5Venue":0,"bttsRelevant":0,"avgGoalsRelevant":0,"favConcededInLast10Pct":0,"underdogOffQuality":false,"matchesPlayedFav":0,"lateGoalUnderdogPct":0,"leagueGapScore":0,"xgFavVsThisTier":0,"udCsPct":0,"opponentGfVenue":0,"opponentBttsPct":0},
 "candidates":[{"score":"2:1","epfParts":[2,1.5,1,1.2,0.6],"eplParts":[20,18,10,12,6],"reasons":["krótko"]}],
 "confidenceParts":{"forma":0,"xg":0,"h2h":0,"homeAway":0,"qoi":0,"flow":0,"market":0,"squad":0,"sample":5},
 "market":{"movement":"","kehnyg":{},"consensus":""},
 "gustawK4":"","gustawK12":"","gustawK17":"","statsNotes":""
}
Faza 1: home/away/h2h/gatesRaw/steps K0-K11. Faza 2: candidates≥6 + confidenceParts + K12-K18.
epfParts=[fav 0-3,ud 0-2,cs 0-2,flow 0-2,odp 0-1] eplParts=[profil 0-30,flow 0-25,market 0-15,audyt 0-20,ryz 0-10].`;
}

export function userPrompt(input: MatchInput, phase: 1 | 2, prior?: string, facts?: string) {
  const exacts = input.exactOdds
    ? Object.entries(input.exactOdds)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "brak";
  return `MECZE LIGOWE V26 — ${phase === 1 ? "FAZA 1 (K0–K11)" : "FAZA 2 (K12–K18)"}
Gospodarz: ${input.home}
Goście: ${input.away}
Liga: ${input.league}
Data/godzina: ${input.kickoff || "nie podano"}
Kursy 1X2: ${input.oddsHome ?? "?"} / ${input.oddsDraw ?? "?"} / ${input.oddsAway ?? "?"}
Kursy exact: ${exacts}
Notatki: ${input.notes || "brak"}

Nie zgaduj liczb. Jeśli brak STATYSTYKI, wpisz 0 i status NIEAKTYWNA.
Kursy 1X2: gdy scout nie ma kursu, SKOPIUJ kurs z formularza (nie wpisuj 0).
Pisz KRÓTKO: kroki = 1 zdanie. Bez powtórzeń faktów. JSON < 2500 tokenów.
${prior ? `\nDANE Z FAZY 1 (kontynuuj, nie sprzeczaj się bez powodu):\n${prior.slice(0, 8000)}` : ""}
${facts
    ? `\nDANE Z INTERNETU (jedyna baza liczb — ZERO DOMYSŁÓW; brak = 0 / NIEAKTYWNA):\n${facts.slice(0, 8000)}\nNie wyszukuj. Policz V26 na tych liczbach.`
    : `\nBrak danych z sieci. Kursy z formularza. Bramki bez liczb = NIEAKTYWNA.`}
Zwróć wyłącznie JSON.`;
}

export function factsPrompt(input: MatchInput) {
  return `Pre-match ${input.home} vs ${input.away}, ${input.league}. Kursy 1=${input.oddsHome ?? "?"} X=${input.oddsDraw ?? "?"} 2=${input.oddsAway ?? "?"}.
Szukaj 3 razy:
1) tabela: pozycja, punkty, played
2) H2H min 5 z wynikiem 1:1
3) site:flashscore.pl ORAZ site:sofascore.com — WSZYSTKIE wyniki ligowe AKTUALNEGO sezonu obu drużyn (zwykle 3–6 meczów, nie 8).
Forma = obiekty scoreFor/scoreAgainst + comp LIGA. ZERO WDL. Nieznane=0.
JSON:
{"sources":["https://"],"league":"","odds":{"home":0,"draw":0,"away":0},"h2h":[{"date":"","home":"","away":"","score":"1:1"}],"h2hAvgGoals":0,"home":{"name":"","tablePos":0,"points":0,"played":0,"form":[{"date":"YYYY-MM-DD","opponent":"","ha":"H","scoreFor":1,"scoreAgainst":0,"quality":"SREDNI","comp":"LIGA"}],"csPctOverall":0,"bttsPct":0,"over25Pct":0,"gfAvg":0,"gaAvg":0},"away":{"...jak home"},"injuries":""}`;
}

export function formPrompt(input: MatchInput) {
  return `WYNIKI AKTUALNEGO SEZONU — ${input.league} 2026/27.
${input.home} oraz ${input.away}.
Szukaj 4 razy, po jednym URL:
1) site:flashscore.pl ${input.home} wyniki ${input.league}
2) site:flashscore.pl ${input.away} wyniki ${input.league}
3) site:sofascore.com ${input.home} results ${input.league}
4) site:fotmob.com ${input.home} ${input.away} ekstraplasa results
Weź KAŻDY mecz ligowy/pucharowy tego sezonu (2, 4, 6 — ile jest). Nie wymagaj 8. Nie poprzedni sezon.
Brak ligi+pucharu → sparingi, comp=SPARING.
ZAKAZ W/L/D. JSON:
{"home":{"name":"${input.home}","playedSeason":0,"form":[{"date":"YYYY-MM-DD","opponent":"","ha":"H","scoreFor":2,"scoreAgainst":0,"quality":"SREDNI","comp":"LIGA"}]},"away":{"name":"${input.away}","playedSeason":0,"form":[{"date":"YYYY-MM-DD","opponent":"","ha":"A","scoreFor":1,"scoreAgainst":1,"quality":"SREDNI","comp":"LIGA"}]}}`;
}

export function detailsPrompt(input: MatchInput) {
  return `xG, SOT, rożne, kartki, kontuzje, gole po 60', 2. połowa, pogoda, trener. Nie zgaduj.
Brak liczby = null (NIGDY 0 przy paywallu / braku na stronie). Brak tekstu = "".
Mecz: ${input.home} vs ${input.away}, TYLKO liga ${input.league}${input.kickoff ? `, ${input.kickoff}` : ""}.
ZAKAZ innych klubów o tej samej nazwie (Manchester United, USL, Rwanda Police, Police Tero).
Szukaj 4 razy (strony KLUBU w tej lidze, nie H2H z innego kraju):
1) site:footystats.org ${input.home} ${input.league} shots on target corners cards xG
2) site:footystats.org ${input.away} ${input.league} shots on target corners cards xG
3) site:totalcorner.com ${input.league} ${input.home} corners
4) site:fotmob.com OR site:sofascore.com ${input.home} vs ${input.away} ${input.league} injured
xG/xGA i SOT/rożne/kartki = średnia NA MECZ. SOT = tylko celne (nie kolumna Shots z TotalCorner).
injuries jedna linia. Źródła TYLKO: Sofascore Lineups + Missing players, Transfermarkt Injuries & suspensions, Flashscore Missing players.
XI 11+11 i pusta lista Missing → squadVerified=true oraz injuries="kadra komplet".
Brak XI / brak listy → squadVerified=false, NIE zgaduj kompletu.
Napastnik/kapitan/10 faworyta out → keyOutFav=true. Bramkarz faworyta out → gkOutFav=true.
≥3 starterów faworyta out → massOutFav=true. Kluczowy underdoga out → keyOutUd=true.
goalsAfter60Pct = % goli 61–90 (Sofascore minuty). goalsSecondHalfPct = % 2. połowy.
JSON:
{"sources":["https://"],"injuries":"","squadVerified":false,"keyOutFav":false,"gkOutFav":false,"massOutFav":false,"keyOutUd":false,"coach":"","weather":"","home":{"name":"${input.home}","xg":null,"xga":null,"corners":null,"shotsOnTarget":null,"cards":null,"goalsAfter60Pct":null,"goalsSecondHalfPct":null},"away":{"name":"${input.away}","xg":null,"xga":null,"corners":null,"shotsOnTarget":null,"cards":null,"goalsAfter60Pct":null,"goalsSecondHalfPct":null}}`;
}

export function gapsPrompt(input: MatchInput, gaps: string[]) {
  return `Uzupełnij BRAKUJĄCE dane pre-match. Nie zgaduj. Nieznana liczba = null (nie 0). Tekst = adnotacja źródłowa.
Mecz: ${input.home} vs ${input.away}, ${input.league}.
Szukaj max 4 razy: TotalCorner (rożne), FootyStats (SOT/kartki — tylko gdy liczba jest na stronie), FotMob, Sofascore, Flashscore.
ZAKAZ: podstawiania total shots jako SOT; ZAKAZ 0 przy paywallu.
BRAKI:
${gaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}
Zwróć JSON TYLKO z polami do uzupełnienia:
{"sources":["https://"],"home":{"xg":null,"corners":null,"shotsOnTarget":null,"cards":null},"away":{"xg":null,"corners":null,"shotsOnTarget":null,"cards":null},"injuries":"","squadVerified":false,"keyOutFav":false,"gkOutFav":false,"massOutFav":false,"keyOutUd":false,"weather":"","coach":""}`;
}
