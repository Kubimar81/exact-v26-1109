import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  SCAN_CUT,
  SCAN_DAY,
  SCAN_EIGHT,
  SCAN_META,
  SCAN_WATCH,
  type ScanBand,
  type ScanPick,
} from "@/lib/v26/scan-today";

function bandBadge(band: ScanBand) {
  if (band === "sitko") return <Badge variant="ok">sitko</Badge>;
  if (band === "soft") return <Badge variant="warn">soft</Badge>;
  return <Badge variant="danger">short</Badge>;
}

function Row({ m }: { m: ScanPick }) {
  const favIsHome = m.side === "H";
  return (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2 font-mono text-xs tabular-nums text-subtle">{m.n}</td>
      <td className="py-1.5 pr-3 font-mono text-xs tabular-nums text-fg">{m.ko}</td>
      <td className="py-1.5 pr-3">
        <span className="font-display text-sm leading-tight text-fg md:text-base">
          {m.home} <span className="text-subtle">–</span> {m.away}
        </span>
        <span className="ml-2 text-xs text-muted">{m.league}</span>
      </td>
      <td className="hidden py-1.5 pr-3 font-mono text-xs tabular-nums text-muted sm:table-cell">
        <span className={favIsHome ? "text-fg" : ""}>{m.oddsH}</span>
        <span className="text-subtle"> / </span>
        {m.oddsD}
        <span className="text-subtle"> / </span>
        <span className={!favIsHome ? "text-fg" : ""}>{m.oddsA}</span>
      </td>
      <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-sm tabular-nums text-fg">
        {m.fav} {m.side}
      </td>
      <td className="py-1.5 pr-3">{bandBadge(m.band)}</td>
      <td className="hidden py-1.5 text-xs text-muted lg:table-cell">{m.note}</td>
    </tr>
  );
}

export function TodayScanBoard() {
  return (
    <div id="skan-dzis">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Skan {SCAN_DAY} · Warstwa 1 · Warsaw · Bet365
          </p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Lista 09.09.2026 · bez 1B</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="ok">sitko 1.40–1.75</Badge>
          <Badge variant="warn">soft 1.70–2.10</Badge>
          <Badge>Conf po K12</Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {SCAN_META.fixtures09} meczów 09.09 + {SCAN_META.fixtures10} 10.09 · dzień Warsaw {SCAN_META.warsawDay} ·
        puchary −{SCAN_META.cupsOut} · ligi {SCAN_META.leagueish} · 1X2 {SCAN_META.oddsChecked} · sitko{" "}
        {SCAN_META.sitko} · soft {SCAN_META.soft}. Krok 1b wycofany. Input, nie kupon.
      </p>

      <Card className="mt-4 overflow-x-auto p-3 md:p-4">
        <table className="w-full min-w-[36rem] text-left">
          <thead className="text-[11px] uppercase tracking-wider text-subtle">
            <tr>
              <th className="pb-1.5 pr-2">#</th>
              <th className="pb-1.5 pr-3">KO</th>
              <th className="pb-1.5 pr-3">Mecz</th>
              <th className="hidden pb-1.5 pr-3 sm:table-cell">1X2</th>
              <th className="pb-1.5 pr-3">Fav</th>
              <th className="pb-1.5 pr-3">Pasmo</th>
              <th className="hidden pb-1.5 lg:table-cell">Kształt</th>
            </tr>
          </thead>
          <tbody>
            {SCAN_EIGHT.map((m) => (
              <Row key={m.n} m={m} />
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-muted">Nocka 9/10 · jeszcze nie grały</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SCAN_WATCH.map((m) => (
          <span
            key={m.n}
            className="inline-flex items-center gap-2 rounded-sm border border-border bg-elevated px-2.5 py-1.5 text-xs"
            title={m.note}
          >
            <span className="font-mono tabular-nums text-subtle">{m.ko}</span>
            <span className="text-fg">
              {m.home}–{m.away}
            </span>
            <span className="font-mono tabular-nums text-fg">
              {m.fav}
              {m.side}
            </span>
            {bandBadge(m.band)}
          </span>
        ))}
      </div>

      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-muted">
        Archiwum · błędna korekta 1B / wide / puchar
      </p>
      <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
        {SCAN_CUT.map((c) => (
          <li key={`${c.ko}-${c.match}`} className="flex gap-2">
            <span className="font-mono tabular-nums text-subtle">{c.ko}</span>
            <span className="text-fg">{c.match}</span>
            <span className="text-subtle">· {c.why}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Krok 1b z rana wycofany. Leftover 1B (Daejeon, Entebbe, Nasaf, Jablonec, Al-Raed) w Archiwum z adnotacją.
        Zostaje selekcja 08.09: Gwangju, Pyramids, Landskrona, Fateh, Defensores, Fortaleza. Silnik HOLD. Conf po
        K12.
      </p>
    </div>
  );
}
