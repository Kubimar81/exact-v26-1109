import { Card } from "@/components/ui/card";
import type { PhasePayload, TeamBlock } from "@/lib/v26/types";

function TeamCol({ t, label }: { t: TeamBlock; label: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <h3 className="font-display text-xl">{t.name}</h3>
      <p className="mt-1 font-mono text-sm tabular-nums text-muted">
        {t.tablePos || "—"} poz. · {t.points} pkt · {t.played} meczów
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {[
          ["Gole", `${t.gfAvg} – ${t.gaAvg}`],
          ["CS", `${t.csPctOverall}%`],
          ["BTTS", `${t.bttsPct}%`],
          ["O2.5", `${t.over25Pct}%`],
          ["xG / xGA", `${t.xg || "—"} / ${t.xga || "—"}`],
          ["Rożne", t.corners || "—"],
          ["Celne", t.shotsOnTarget || "—"],
          ["Kartki", t.cards || "—"],
          ["Gole po 60'", t.goalsAfter60Pct ? `${t.goalsAfter60Pct}%` : "—"],
          ["2. połowa", t.goalsSecondHalfPct ? `${t.goalsSecondHalfPct}%` : "—"],
          ...(t.prevSeason
            ? [["25.19", `${t.prevSource?.startsWith("LIVE") ? "LIVE" : t.prevSource || "dump"} H ${t.prevSeason.gfHome} A ${t.prevSeason.gfAway}`] as [string, string]]
            : [["25.19", "BRAK prev"] as [string, string]]),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wider text-subtle">{k}</dt>
            <dd className="font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] uppercase tracking-wider text-subtle">Forma</p>
      <ul className="mt-2 space-y-1 font-mono text-xs tabular-nums">
        {t.form.length ? (
          t.form.map((m, i) => (
            <li key={`${t.name}-${i}`}>
              {m.date || "—"} {m.ha} {m.scoreFor}:{m.scoreAgainst}
              {m.opponent ? ` vs ${m.opponent}` : ""} {m.comp ? `[${m.comp}]` : ""}
            </li>
          ))
        ) : (
          <li className="text-muted">brak</li>
        )}
      </ul>
    </div>
  );
}

export function DataSheet({ payload }: { payload: PhasePayload }) {
  const nH = payload.home.form.length;
  const nA = payload.away.form.length;
  const spars = [...payload.home.form, ...payload.away.form].some((m) => m.comp === "SPARING");
  const short = nH + nA > 0 && (nH < 8 || nA < 8);
  return (
    <Card className="mb-6 p-5">
      <p className="text-[11px] uppercase tracking-wider text-muted">Dane bazowe K0–K11</p>
      {spars ? (
        <p className="mt-2 text-sm text-warn">
          WYJĄTEK: pierwszy mecz sezonu — w bazie są sparingi przedsezonowe (oznaczone SPARING), nie liga/puchar.
        </p>
      ) : short ? (
        <p className="mt-2 text-sm text-warn">
          Zastrzeżenie: w tym sezonie tylko {nH} / {nA} meczów ligowych/pucharowych (nie pełne 8). Warunek formy spełniony.
        </p>
      ) : null}
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <TeamCol t={payload.home} label="Gospodarz" />
        <TeamCol t={payload.away} label="Goście" />
      </div>
      <p className="mt-6 text-[11px] uppercase tracking-wider text-subtle">H2H</p>
      <ul className="mt-2 space-y-1 font-mono text-xs tabular-nums">
        {payload.h2h.length ? (
          payload.h2h.map((m, i) => (
            <li key={i}>
              {m.date || "—"} {m.home} {m.score} {m.away}
            </li>
          ))
        ) : (
          <li className="text-muted">brak H2H w źródłach</li>
        )}
      </ul>
    </Card>
  );
}
