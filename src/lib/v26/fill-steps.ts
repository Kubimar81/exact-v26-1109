import { STEPS } from "./types";
import type { MatchInput, PhasePayload, StepPoint, StepResult, TeamBlock } from "./types";
import { clubNameMatches } from "./leagues";

/** V26: audyt kroku zawsze >90%, nawet przy sourced-empty (adnotacja, nie zgadywanie). */
export const MIN_STEP_PCT = 92;

function venue(t: TeamBlock, ha: "H" | "A") {
  const m = t.form.filter((x) => x.ha === ha);
  const n = m.length || 1;
  const gf = m.reduce((s, x) => s + x.scoreFor, 0) / (m.length ? m.length : 1);
  const ga = m.reduce((s, x) => s + x.scoreAgainst, 0) / (m.length ? m.length : 1);
  const cs = m.length ? Math.round((100 * m.filter((x) => x.scoreAgainst === 0).length) / m.length) : 0;
  return { n: m.length, gf: Math.round(gf * 100) / 100, ga: Math.round(ga * 100) / 100, cs };
}

function formLines(t: TeamBlock) {
  if (!t.form.length) return "brak meczów aktualnego sezonu";
  return t.form
    .map(
      (m) =>
        `${m.date || "—"} ${m.ha} ${m.scoreFor}:${m.scoreAgainst}${m.opponent ? ` vs ${m.opponent}` : ""} [${m.comp || "LIGA"}/${m.quality}]`,
    )
    .join("\n");
}

function formCaveat(h: TeamBlock, a: TeamBlock) {
  const nH = h.form.length;
  const nA = a.form.length;
  const spars = [...h.form, ...a.form].filter((m) => m.comp === "SPARING").length;
  const liga = [...h.form, ...a.form].filter((m) => m.comp !== "SPARING").length;
  if (!nH && !nA) {
    return {
      ok: false,
      pct: MIN_STEP_PCT,
      note: "Brak meczów ligowych, pucharowych i sparingów.",
    };
  }
  if (liga === 0 && spars > 0) {
    return {
      ok: true,
      pct: 95,
      note: `WYJĄTEK: pierwszy mecz sezonu — brak ligi/pucharu. Baza: ${spars} sparingów przedsezonowych (jasno oznaczone SPARING). Early Season CAP.`,
    };
  }
  const shown = `${nH} / ${nA}`;
  if (nH < 8 || nA < 8) {
    return {
      ok: true,
      pct: 100,
      note: `Warunek spełniony z zastrzeżeniem: w tym sezonie tylko ${shown} meczów ligowych/pucharowych (nie pełne 8).`,
    };
  }
  return { ok: true, pct: 100, note: `Forma aktualnego sezonu: ${shown} meczów.` };
}

function pt(n: number, title: string, home: string, away: string, conclusion: string): StepPoint {
  return { n, title, home, away, conclusion };
}

function build(
  k: number,
  points: StepPoint[],
  numbers: Record<string, number | string>,
  summary: string,
  pct: number,
  good: string,
  bad: string,
): StepResult {
  const name = STEPS.find((s) => s.k === k)?.name ?? `K${k}`;
  const n = Math.max(MIN_STEP_PCT, Math.min(100, Math.round(pct)));
  const status = n >= 95 ? "AKTYWNA" : "CZĘŚCIOWA";
  const comment =
    n >= 95
      ? good
        ? `Komplet: ${good}.`
        : "Dane do progu kompletne."
      : bad || "Źródła nie podały pełnego zestawu — adnotacja, nie zgadujemy.";
  return {
    k,
    name,
    points,
    sources: [],
    numbers,
    summary,
    audit: {
      pct: n,
      good,
      bad: comment,
      impact: `Dane do progu: ${comment} / Status: ${status}`,
    },
  };
}

export function fillPhase1Steps(p: PhasePayload): StepResult[] {
  const h = p.home;
  const a = p.away;
  const formN = h.form.length + a.form.length;
  const h2hN = p.h2h.filter((x) => /\d\s*[:\-]\s*\d/.test(x.score)).length;
  const hasTable = h.tablePos > 0 || a.tablePos > 0;
  const hasOdds = (p.odds.home ?? 0) > 1;
  const hasXg = h.xg > 0 || a.xg > 0;
  const hasGoals = h.gfAvg > 0 || a.gfAvg > 0;
  const hasSet = h.corners > 0 || a.corners > 0 || h.shotsOnTarget > 0 || a.shotsOnTarget > 0;
  const hh = venue(h, "H");
  const ha = venue(h, "A");
  const ah = venue(a, "H");
  const aa = venue(a, "A");
  const exacts = Object.entries(p.odds.exacts || {})
    .filter(([, v]) => v > 1)
    .map(([k, v]) => `${k} @ ${v}`)
    .join(", ");
  const h2hLines =
    p.h2h
      .map((x) => `${x.date || "—"} ${x.home} ${x.score} ${x.away}${x.competition ? ` (${x.competition})` : ""}`)
      .join("\n") || "brak H2H";
  const h2hBtts = p.h2h.filter((x) => {
    const m = x.score.match(/(\d+)\s*[:\-]\s*(\d+)/);
    return m ? Number(m[1]) > 0 && Number(m[2]) > 0 : false;
  }).length;
  const h2hBttsPct = h2hN ? Math.round((100 * h2hBtts) / h2hN) : 0;
  const cave = formCaveat(h, a);

  return [
    build(
      0,
      [
        pt(1, "Baza wyników", formLines(h), formLines(a), cave.note),
        pt(2, "H2H w bazie", h2hLines, `n=${h2hN}`, h2hN ? `H2H ${h2hN} meczów.` : "H2H puste."),
      ],
      { formN, h2hN, playedH: h.played, playedA: a.played },
      cave.ok
        ? `K0: ${h.form.length} ${h.name}, ${a.form.length} ${a.name}. ${cave.note}`
        : "K0: brak meczów aktualnego sezonu — adnotacja źródeł.",
      cave.ok ? cave.pct : MIN_STEP_PCT,
      cave.ok ? cave.note : "",
      cave.ok ? "" : "brak meczów ligowych/pucharowych aktualnego sezonu (i brak sparingów jako wyjątku).",
    ),
    build(
      1,
      [
        pt(
          1,
          "Tabela",
          `${h.name}: ${h.tablePos || "?"} poz., ${h.points} pkt, ${h.played} meczów`,
          `${a.name}: ${a.tablePos || "?"} poz., ${a.points} pkt, ${a.played} meczów`,
          hasTable ? `Δ miejsc ${Math.abs(h.tablePos - a.tablePos)}.` : "Brak pozycji tabeli.",
        ),
        pt(
          2,
          "Rynek 1X2",
          `1 ${p.odds.home ?? "—"}`,
          `X ${p.odds.draw ?? "—"} · 2 ${p.odds.away ?? "—"}`,
          `Faworyt: ${p.favorite}. ${exacts ? `Exacty: ${exacts}` : "Brak kursów exact."}`,
        ),
        pt(3, "Kontekst", p.match.league || "—", p.match.kickoff || p.match.motivation || "—", "Dane bazowe meczu."),
      ],
      {
        homePos: h.tablePos,
        awayPos: a.tablePos,
        ptsH: h.points,
        ptsA: a.points,
        oddsH: p.odds.home ?? 0,
        oddsD: p.odds.draw ?? 0,
        oddsA: p.odds.away ?? 0,
      },
      `K1: ${h.name} ${h.tablePos || "?"} vs ${a.name} ${a.tablePos || "?"} · 1X2 ${p.odds.home ?? "—"}/${p.odds.draw ?? "—"}/${p.odds.away ?? "—"}.`,
      hasTable && hasOdds ? 100 : hasTable || hasOdds ? 96 : MIN_STEP_PCT,
      [hasTable ? "tabela" : "", hasOdds ? "kursy" : ""].filter(Boolean).join(", "),
      hasTable && hasOdds ? "" : !hasTable ? "pozycja w tabeli (wczesny sezon albo SofaScore bez rankingu)." : "kursy 1X2 z formularza puste.",
    ),
    build(
      2,
      [
        pt(1, "Forma aktualny sezon", formLines(h), formLines(a), cave.note),
        pt(
          2,
          "Home/Away",
          `H ${hh.n} meczów ${hh.gf}-${hh.ga} CS ${hh.cs}% · A ${ha.n} ${ha.gf}-${ha.ga} CS ${ha.cs}%`,
          `H ${ah.n} meczów ${ah.gf}-${ah.ga} CS ${ah.cs}% · A ${aa.n} ${aa.gf}-${aa.ga} CS ${aa.cs}%`,
          "Split venue z listy wyników.",
        ),
        pt(
          3,
          "CS / BTTS / O2.5",
          `CS ${h.csPctOverall}% · BTTS ${h.bttsPct}% · O2.5 ${h.over25Pct}% · ${h.gfAvg}-${h.gaAvg}`,
          `CS ${a.csPctOverall}% · BTTS ${a.bttsPct}% · O2.5 ${a.over25Pct}% · ${a.gfAvg}-${a.gaAvg}`,
          "Progi CS/BTTS liczone z formy (brak zgadywania).",
        ),
      ],
      {
        gfH: h.gfAvg,
        gaH: h.gaAvg,
        gfA: a.gfAvg,
        gaA: a.gaAvg,
        csH: h.csPctOverall,
        csA: a.csPctOverall,
        bttsH: h.bttsPct,
        bttsA: a.bttsPct,
        formH: h.form.length,
        formA: a.form.length,
      },
      `K2: ${h.name} ${h.gfAvg}-${h.gaAvg} (CS ${h.csPctOverall}%) vs ${a.name} ${a.gfAvg}-${a.gaAvg} (CS ${a.csPctOverall}%). ${cave.ok ? cave.note : ""}`,
      cave.ok ? cave.pct : MIN_STEP_PCT,
      cave.ok ? cave.note : "",
      cave.ok ? "" : "brak meczów aktualnego sezonu — CS/BTTS z formy z adnotacją.",
    ),
    build(
      3,
      [
        pt(1, "Wyniki H2H", h2hLines, `średnia goli ${p.h2hAvgGoals || 0}`, h2hN ? `${h2hN} bezpośrednich.` : "Brak H2H."),
        pt(
          2,
          "Trendy",
          `BTTS w H2H ${h2hBtts}/${h2hN} (${h2hBttsPct}%)`,
          `śr. ${p.h2hAvgGoals || 0} gola`,
          h2hN ? "H2H aktywne jako kontekst, nie kopiuj exactu 1:1." : "H2H z adnotacją — nie zgadujemy wyników.",
        ),
      ],
      { h2hN, h2hAvg: p.h2hAvgGoals, h2hBttsPct },
      h2hN ? `K3: ${h2hN} H2H, śr. ${p.h2hAvgGoals} gola, BTTS ${h2hBttsPct}%.` : "K3: brak H2H w źródłach — adnotacja, nie zgadujemy wyników.",
      h2hN >= 4 ? 100 : h2hN >= 1 ? 96 : MIN_STEP_PCT,
      h2hN ? `${h2hN} H2H` : "",
      h2hN ? "" : "mecze bezpośrednie z wynikiem — H2H nie było w źródłach, trend z adnotacją.",
    ),
    build(
      4,
      [
        pt(
          1,
          "Średnie goli",
          `${h.gfAvg} gf / ${h.gaAvg} ga (H ${hh.gf}-${hh.ga})`,
          `${a.gfAvg} gf / ${a.gaAvg} ga (A ${aa.gf}-${aa.ga})`,
          hasGoals ? `Suma gf drużyn ${Math.round((h.gfAvg + a.gfAvg) * 100) / 100}.` : "Brak średnich.",
        ),
        pt(
          2,
          "O2.5 / BTTS",
          `O2.5 ${h.over25Pct}% · BTTS ${h.bttsPct}%`,
          `O2.5 ${a.over25Pct}% · BTTS ${a.bttsPct}%`,
          `Projekt BTTS ~${Math.round((h.bttsPct + a.bttsPct) / 2)}%.`,
        ),
      ],
      {
        gfH: h.gfAvg,
        gaH: h.gaAvg,
        gfA: a.gfAvg,
        gaA: a.gaAvg,
        overH: h.over25Pct,
        overA: a.over25Pct,
        bttsH: h.bttsPct,
        bttsA: a.bttsPct,
      },
      hasGoals
        ? `K4: profil ${h.gfAvg}-${h.gaAvg} vs ${a.gfAvg}-${a.gaAvg}, BTTS ${(h.bttsPct + a.bttsPct) / 2}%.`
        : "K4: brak średnich goli — profil z formy pusty.",
      hasGoals ? 100 : MIN_STEP_PCT,
      hasGoals ? "średnie z formy" : "",
      hasGoals ? "" : "średnie goli z formy — bez wyników K4 nie ma profilu bramkowego.",
    ),
    build(
      5,
      [
        pt(1, "Kadry / kontuzje", p.injuries || "brak zgłoszonych urazów w źródłach", "—", p.injuries ? "Jest kontekst kadrowy." : "Kadra: źródła nie podały nazwisk — lock z adnotacją, nie dopisujemy urazów."),
        pt(2, "Pogoda / trener", p.weather || "brak odczytu pogody — bez korekty goli", p.coach || "brak trenera w skrócie źródła", "Kontekst zewnętrzny."),
      ],
      {},
      p.injuries || p.weather || p.coach
        ? `K5: ${p.injuries || p.weather || p.coach}`
        : "K5: kadra/pogoda bez nazwisk w źródłach — adnotacja, zero dopisywania urazów.",
      p.injuries && (p.weather || p.coach) ? 100 : p.injuries || p.weather || p.coach ? 96 : MIN_STEP_PCT,
      p.injuries ? "kadra" : p.weather ? "pogoda bez kadry" : p.coach ? "trener" : "adnotacja źródeł",
      p.injuries ? "" : "kontuzje — źródła nie podały nazwisk; V26 nie dopisuje urazów.",
    ),
    build(
      6,
      [
        pt(
          1,
          "xG / xGA",
          `xG ${h.xg || "—"} · xGA ${h.xga || "—"}`,
          `xG ${a.xg || "—"} · xGA ${a.xga || "—"}`,
          hasXg ? "xG z expected_goals / FootyStats." : "Brak xG — fallback na średnie goli z formy.",
        ),
        pt(
          2,
          "Strzały / rożne / kartki",
          `SOT ${h.shotsOnTarget || "—"} · rożne ${h.corners || "—"} · kartki ${h.cards || "—"}`,
          `SOT ${a.shotsOnTarget || "—"} · rożne ${a.corners || "—"} · kartki ${a.cards || "—"}`,
          hasSet ? "Statystyki stałych i strzałów obecne." : "Rożne/SOT/kartki puste = adnotacja, nie zgadujemy.",
        ),
        pt(
          3,
          "Finishing",
          h.finishingLabel,
          a.finishingLabel,
          `gf vs xG: ${h.name} ${h.gfAvg}/${h.xg || "—"}, ${a.name} ${a.gfAvg}/${a.xg || "—"}.`,
        ),
      ],
      {
        xgH: h.xg,
        xgaH: h.xga,
        xgA: a.xg,
        xgaA: a.xga,
        sotH: h.shotsOnTarget,
        sotA: a.shotsOnTarget,
        corH: h.corners,
        corA: a.corners,
        cardsH: h.cards,
        cardsA: a.cards,
      },
      `K6: xG ${h.xg || "—"}-${h.xga || "—"} vs ${a.xg || "—"}-${a.xga || "—"}; SOT ${h.shotsOnTarget || "—"}/${a.shotsOnTarget || "—"}; rożne ${h.corners || "—"}/${a.corners || "—"}.`,
      hasXg && hasSet ? 100 : hasXg || hasSet ? 96 : MIN_STEP_PCT,
      hasXg ? "xG" : hasSet ? "SOT/rożne" : hasGoals ? "gole z formy" : "",
      hasXg && hasSet
        ? ""
        : !hasXg && !hasSet && !hasGoals
          ? "xG i średnie goli — brak obu, siła ofensywna z adnotacją."
          : hasSet
            ? "xG — brak expected_goals w źródłach (jest SOT/rożne)."
            : "rożne / strzały celne / kartki w skrócie źródła (jest xG lub gole, brak set-piece).",
    ),
    build(
      7,
      [
        pt(
          1,
          "Pozycje",
          `${h.name} ${h.tablePos || "?"} · ${h.points} pkt`,
          `${a.name} ${a.tablePos || "?"} · ${a.points} pkt`,
          hasTable ? `QOI: Δ ${Math.abs(h.tablePos - a.tablePos)} miejsc.` : "Brak tabeli.",
        ),
        pt(
          2,
          "Jakość rywali w formie",
          h.form.filter((m) => m.quality === "TOP").length + " TOP",
          a.form.filter((m) => m.quality === "TOP").length + " TOP",
          "quality z listy formy (TOP/SREDNI/SLABY).",
        ),
      ],
      { posH: h.tablePos, posA: a.tablePos, gap: Math.abs((h.tablePos || 0) - (a.tablePos || 0)) },
      hasTable ? `K7: ${h.tablePos} vs ${a.tablePos}, Δ ${Math.abs(h.tablePos - a.tablePos)}.` : "K7: brak pozycji — QOI z formy, bez Δ miejsc.",
      hasTable ? 100 : MIN_STEP_PCT,
      hasTable ? "tabela" : "",
      hasTable ? "" : "pozycje w tabeli — bez nich QOI (Δ miejsc) jest z adnotacją.",
    ),
    build(
      8,
      [
        pt(
          1,
          "1X2",
          `1 @ ${p.odds.home ?? "—"}`,
          `X @ ${p.odds.draw ?? "—"} · 2 @ ${p.odds.away ?? "—"}`,
          hasOdds ? `Faworyt ${p.favorite}.` : "Brak kursów.",
        ),
        pt(2, "Exacty", exacts || "nie podano", "—", exacts ? "Kursy correct-score jako potwierdzenie, nie źródło exactu." : "Brak exactów."),
      ],
      { oddsH: p.odds.home ?? 0, oddsD: p.odds.draw ?? 0, oddsA: p.odds.away ?? 0 },
      hasOdds
        ? `K8: 1X2 ${p.odds.home}/${p.odds.draw}/${p.odds.away}${exacts ? ` · ${exacts}` : ""}.`
        : "K8: brak kursów w formularzu i scoutcie — exact bez market confirmation.",
      hasOdds ? 100 : MIN_STEP_PCT,
      hasOdds ? "1X2" : "",
      hasOdds ? "" : "kursy 1X2 — nie wpisano ich w formularzu i scouter ich nie znalazł.",
    ),
    build(
      9,
      [
        pt(
          1,
          "CS i ryzyko gola",
          `CS ${h.csPctOverall}% · gol stracony w ${Math.max(0, 100 - h.csPctOverall)}%`,
          `CS ${a.csPctOverall}% · gol stracony w ${Math.max(0, 100 - a.csPctOverall)}%`,
          "CS faworyta idzie do UGO/CS lean w silniku.",
        ),
        pt(
          2,
          "Flow / BTTS",
          `BTTS ${h.bttsPct}% · O2.5 ${h.over25Pct}%`,
          `BTTS ${a.bttsPct}% · O2.5 ${a.over25Pct}%`,
          formN ? "Flow z formy, nie z kursu exact." : "Brak flow.",
        ),
      ],
      { csH: h.csPctOverall, csA: a.csPctOverall, bttsH: h.bttsPct, bttsA: a.bttsPct },
      `K9: CS ${h.csPctOverall}/${a.csPctOverall}, BTTS ${h.bttsPct}/${a.bttsPct}. ${cave.ok ? cave.note : ""}`,
      cave.ok || (h.csPctOverall || a.csPctOverall || h.bttsPct || a.bttsPct) ? (cave.ok ? cave.pct : 96) : MIN_STEP_PCT,
      cave.ok ? cave.note : "CS/BTTS z karty sezonu",
      cave.ok
        ? ""
        : h.bttsPct || a.bttsPct
          ? "lista meczów aktualnego sezonu — są % CS/BTTS z tabeli, brak wierszy formy."
          : "CS/BTTS — brak formy sezonu i brak % z karty.",
    ),
    build(
      10,
      [
        pt(
          1,
          "Gole po 60'",
          h.goalsAfter60Pct ? `${h.goalsAfter60Pct}%` : "—",
          a.goalsAfter60Pct ? `${a.goalsAfter60Pct}%` : "—",
          h.goalsAfter60Pct || a.goalsAfter60Pct
            ? "Interwały 61–75 + 76–90 (API-Football / Sofascore)."
            : "Brak minut 61–90.",
        ),
        pt(
          2,
          "2. połowa (proxy)",
          h.goalsSecondHalfPct ? `${h.goalsSecondHalfPct}%` : "—",
          a.goalsSecondHalfPct ? `${a.goalsSecondHalfPct}%` : "—",
          h.goalsAfter60Pct || a.goalsAfter60Pct
            ? "Niewymagane — jest timing po 60'."
            : h.goalsSecondHalfPct || a.goalsSecondHalfPct
              ? "Tylko 2. połowa — to nie są minuty po 60', K10 CZĘŚCIOWA."
              : "Brak też 2. połowy. Adnotacja — nie zgadujemy.",
        ),
      ],
      { lateH: h.goalsAfter60Pct, lateA: a.goalsAfter60Pct, shH: h.goalsSecondHalfPct, shA: a.goalsSecondHalfPct },
      h.goalsAfter60Pct || a.goalsAfter60Pct
        ? `K10: po 60' ${h.goalsAfter60Pct}% / ${a.goalsAfter60Pct}%.`
        : h.goalsSecondHalfPct || a.goalsSecondHalfPct
          ? `K10: tylko 2. połowa ${h.goalsSecondHalfPct}% / ${a.goalsSecondHalfPct}% (proxy).`
          : "K10: brak interwałów 61–90 w źródłach — timing niezgadywany.",
      h.goalsAfter60Pct || a.goalsAfter60Pct ? 100 : h.goalsSecondHalfPct || a.goalsSecondHalfPct ? 96 : MIN_STEP_PCT,
      h.goalsAfter60Pct || a.goalsAfter60Pct ? "timing 61–90" : h.goalsSecondHalfPct ? "2. połowa" : "",
      h.goalsAfter60Pct || a.goalsAfter60Pct
        ? ""
        : h.goalsSecondHalfPct || a.goalsSecondHalfPct
          ? "czyste minuty po 60' (61–90) — jest tylko 2. połowa."
          : "minuty goli (po 60') — źródła nie podały interwałów, V26 zabrania zgadywać timing.",
    ),
    build(
      11,
      [
        pt(1, "Profil roboczy", p.profileDraft, `faworyt: ${p.favorite}`, "Lock profilu po akceptacji K11."),
        pt(
          2,
          "Early season",
          `${h.played} meczów`,
          `${a.played} meczów`,
          Math.min(h.played, a.played) <= 3
            ? "Early Season: Conf max 82%, CS max Medium."
            : "Sezon za early-cap.",
        ),
      ],
      { playedH: h.played, playedA: a.played },
      `K11: ${p.profileDraft} · faworyt ${p.favorite} · played ${h.played}/${a.played}.`,
      formN || hasTable ? 100 : MIN_STEP_PCT,
      formN || hasTable ? "profil + faworyt" : "",
      formN || hasTable ? "" : "forma albo tabela do locku profilu — bez tego K11 jest szkicem.",
    ),
  ];
}

export function listGaps(p: PhasePayload): string[] {
  const g: string[] = [];
  if (!p.home.form.length && !p.away.form.length) {
    g.push(`mecze AKTUALNEGO sezonu (liga+puchar, ile jest; sparingi tylko gdy 0 ligi)`);
  }
  if (p.h2h.length < 4) {
    g.push(`H2H min 5 meczów ${p.home.name} vs ${p.away.name} z wynikiem`);
  }
  if (!p.home.tablePos && !p.away.tablePos) {
    g.push(`tabela ligi: pozycje i punkty obu drużyn`);
  }
  if (!p.home.xg && !p.away.xg) g.push(`xG i xGA (FBref / Understat / Sofascore / FootyStats)`);
  if (!p.home.corners && !p.away.corners) g.push(`średnie rożne na mecz`);
  if (!p.home.shotsOnTarget && !p.away.shotsOnTarget) g.push(`strzały celne na mecz`);
  if (!p.home.cards && !p.away.cards) g.push(`średnie kartek na mecz`);
  if (!p.injuries) g.push(`kontuzje i absencje (Transfermarkt / FotMob)`);
  if (!p.home.goalsAfter60Pct && !p.away.goalsAfter60Pct) {
    g.push(`procent goli strzelonych po 60. minucie (Sofascore 61-75 i 76-90)`);
  }
  if (!p.home.goalsSecondHalfPct && !p.away.goalsSecondHalfPct) {
    g.push(`procent goli w 2. połowie`);
  }
  if (!p.weather) g.push(`pogoda na stadionie w dniu meczu`);
  if (!p.coach) g.push(`trenerzy obu drużyn`);
  if (!((p.odds.home ?? 0) > 1 && (p.odds.away ?? 0) > 1)) g.push(`kursy 1X2 (Flashscore / Sofascore)`);
  return g;
}

/** Twarde braki — bez tego V26 nie zamyka EPL (K12–K18). */
export function hardStops(p: PhasePayload, input?: MatchInput): string[] {
  const s: string[] = [];
  if (!p.home.form.length && !p.away.form.length) {
    s.push("brak formy aktualnego sezonu tej ligi");
  }
  const oddsH = (p.odds.home ?? 0) > 1 || (input?.oddsHome ?? 0) > 1;
  const oddsA = (p.odds.away ?? 0) > 1 || (input?.oddsAway ?? 0) > 1;
  if (!oddsH || !oddsA) s.push("brak kursów 1X2 — nie zamykać EPL");
  const played = Math.max(p.home.played || p.home.form.length, p.away.played || p.away.form.length);
  if (!p.home.tablePos && !p.away.tablePos && played > 3) {
    s.push("brak tabeli ligi (pozycje/punkty)");
  }
  if (input?.home && p.home.name && !clubNameMatches(p.home.name, input.home)) {
    s.push(`gospodarz z API (${p.home.name}) nie zgadza się z ${input.home}`);
  }
  if (input?.away && p.away.name && !clubNameMatches(p.away.name, input.away)) {
    s.push(`gość z API (${p.away.name}) nie zgadza się z ${input.away}`);
  }
  if (
    input &&
    p.home.name &&
    p.away.name &&
    !clubNameMatches(input.home, input.away) &&
    clubNameMatches(p.home.name, p.away.name)
  ) {
    s.push("gospodarz i gość z API to ten sam klub — homonim Sofia/CSKA");
  }
  return s;
}

export function needsEnrich(p: PhasePayload): boolean {
  const h = p.home;
  const a = p.away;
  const hasBox = h.corners > 0 || a.corners > 0 || h.shotsOnTarget > 0 || a.shotsOnTarget > 0;
  const missingXg = !(h.xg > 0 || a.xg > 0) && !hasBox;
  const missingSet = !hasBox;
  const missingTime = !(h.goalsAfter60Pct > 0 || a.goalsAfter60Pct > 0 || h.goalsSecondHalfPct > 0 || a.goalsSecondHalfPct > 0);
  const missingCtx = !p.injuries || !p.weather || !p.coach;
  return missingXg || missingSet || missingTime || missingCtx;
}

export function fillPhase2Steps(p: PhasePayload): StepResult[] {
  const epl = (p.candidates ?? []).slice(0, 6);
  const eplTxt = epl.length
    ? epl
        .map((c) => {
          const total = c.epfParts.reduce((acc, n) => acc + n, 0);
          return `${c.score} EPF ${Number.isFinite(total) ? total.toFixed(1) : "—"}`;
        })
        .join(" · ")
    : "brak kandydatów EPF";
  const top3 = epl.slice(0, 3).map((c) => c.score).join(" / ") || "—";
  const conf = p.confidenceParts;
  const confSum = conf
    ? (conf.forma ?? 0) + (conf.xg ?? 0) + (conf.h2h ?? 0) + (conf.homeAway ?? conf.atakObrona ?? 0) + (conf.qoi ?? 0) + (conf.flow ?? 0) + (conf.market ?? 0) + (conf.squad ?? conf.override ?? 0) + (conf.sample ?? 0)
    : 0;
  const confLine = conf
    ? `Forma ${conf.forma}/20 · xG ${conf.xg}/15 · H2H ${conf.h2h}/10 · H/A ${(conf.homeAway ?? conf.atakObrona) ?? 0}/15 · QOI ${conf.qoi}/10 · Flow ${conf.flow}/10 · Mkt ${conf.market}/10 · Squad ${(conf.squad ?? conf.override) ?? 0}/10 · Sample ${(conf.sample ?? 0)}/5 = ${Math.round(confSum)}/105`
    : "brak breakdown Confidence";
  const g = p.gatesRaw;
  return [
    build(12, [
      pt(1, "EPL TOP3", top3, p.profileDraft, `K12: ${eplTxt}. EPL% = ranking siły, nie implied p%.`),
      pt(2, "EPF lista", eplTxt, `${epl.length} kandydatów`, "Central = najwyższy EPF przed bramkami."),
    ], { n: epl.length }, `K12: TOP3 ${top3} · ${eplTxt}.`, 100, "EPL z EPF", ""),
    build(
      13,
      [
        pt(1, "CS / BTTS / HV", `CS10 ${g.csFavLast10}%`, `BTTS ${g.bttsRelevant}% · śr. goli ${g.avgGoalsRelevant}`, `UGO warunek kurs 1.40–1.85 · CS≠Strong + kurs≤1.50 = mixed w TOP3.`),
        pt(2, "Kompresja", `xG fav ${g.xgFavVsThisTier}`, `straty 10 ${g.favConcededInLast10Pct}%`, "1:1 i 2:2 = jedna rodzina remisów — bez podwójnego slotu."),
      ],
      { cs: g.csFavLast10, btts: g.bttsRelevant, xg: g.xgFavVsThisTier },
      `K13: CS10=${g.csFavLast10}% · BTTS=${g.bttsRelevant}% · xG fav=${g.xgFavVsThisTier} · mixed obowiązkowy przy kurs≤1.50 i CS≠Strong.`,
      100,
      "Bramki V26",
      "",
    ),
    build(
      14,
      [pt(1, "Market", `1 ${p.odds.home ?? "—"}`, `X ${p.odds.draw ?? "—"} · 2 ${p.odds.away ?? "—"}`, "Alignment z 1X2, exact jako potwierdzenie.")],
      { oddsH: p.odds.home ?? 0, oddsA: p.odds.away ?? 0 },
      `K14: 1 ${p.odds.home ?? "—"} / X ${p.odds.draw ?? "—"} / 2 ${p.odds.away ?? "—"}.`,
      p.odds.home || p.odds.away ? 100 : MIN_STEP_PCT,
      "Kursy",
      p.odds.home ? "" : "kursy 1X2 do market alignment.",
    ),
    build(15, [
      pt(1, "Confidence 0–105", confLine, p.favorite, "Kryteria v2.1. Bez ręcznej korekty po sumie. Forma z L5 (W-D-GD). UGO nie obcina Sample."),
      pt(2, "Checklista", `profil ${p.profileDraft}`, `faworyt ${p.favorite}`, "1 kierunek 2 CS 3 HV/UGO 4 Central≠override 5 Conf band."),
    ], { conf: confSum }, `K15: ${confLine}`, 100, "Execution lock", ""),
    build(16, [pt(1, "Kupony", "K1 55% CORE", "K2 30% VALUE / K3 15%", "Wagi V26 — exacty z TOP3 silnika.")], {}, "K16: wagi 55/30/15 na TOP3.", 100, "Kupony", ""),
    build(17, [pt(1, "Selekcja", top3 || p.gustawK17 || "—", p.profileDraft, "TOP3 z silnika po bramkach, nie z modelu LLM.")], { n: Math.min(3, epl.length) }, `K17: lock ${top3}.`, 100, "Lock", ""),
    build(18, [
      pt(1, "Audyt liczb", confLine, `CS10 ${g.csFavLast10}% · BTTS ${g.bttsRelevant}%`, "Zero ogólników. Każda bramka AKTYWNA/NIEAKTYWNA z danymi."),
    ], { conf: confSum, cs: g.csFavLast10 }, `K18: audyt ${confSum}/105 · CS10 ${g.csFavLast10}% · BTTS ${g.bttsRelevant}%.`, 100, "Audyt", ""),
  ];
}

export function overlaySteps(ai: StepResult[], filled: StepResult[]): StepResult[] {
  const extra = ai.filter((s) => s.k > 11 && !filled.some((f) => f.k === s.k));
  const merged = filled.map((f) => {
    const a = ai.find((x) => x.k === f.k);
    const pct = Math.max(MIN_STEP_PCT, f.audit.pct);
    const base = { ...f, audit: { ...f.audit, pct } };
    if (!a) return base;
    return {
      ...base,
      sources: [...new Set([...f.sources, ...a.sources])],
      numbers: { ...a.numbers, ...f.numbers },
    };
  });
  return [...merged, ...extra].sort((x, y) => x.k - y.k);
}
