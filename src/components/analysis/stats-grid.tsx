import { Card } from "@/components/ui/card";
import { fmtNum, fmtPct } from "@/lib/v26/format";
import type { EngineOutput } from "@/lib/v26/types";

function show(n: number | undefined, kind: "num" | "pct" | "one" = "num") {
  if (n == null || n === 0) return "—";
  return kind === "pct" ? fmtPct(n, 0) : fmtNum(n, kind === "one" ? 1 : 2);
}

export function StatsGrid({ engine }: { engine: EngineOutput }) {
  const s = engine.stats;
  const tiles = [
    { label: "Śr. gole", home: show(s.goalsHome), away: show(s.goalsAway) },
    { label: "Rożne", home: show(s.cornersHome, "one"), away: show(s.cornersAway, "one") },
    { label: "Celne strzały", home: show(s.sotHome, "one"), away: show(s.sotAway, "one") },
    { label: "Kartki", home: show(s.cardsHome, "one"), away: show(s.cardsAway, "one") },
    { label: "BTTS", home: show(s.bttsHomePct, "pct"), away: show(s.bttsAwayPct, "pct") },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label} className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">{t.label}</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xl tabular-nums">{t.home}</div>
              <div className="text-[11px] text-subtle">Gospodarz</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl tabular-nums">{t.away}</div>
              <div className="text-[11px] text-subtle">Gość</div>
            </div>
          </div>
        </Card>
      ))}
      <Card className="p-4 sm:col-span-2 lg:col-span-1">
        <div className="text-[11px] uppercase tracking-wider text-muted">Kierunek meczu</div>
        <div className="mt-2 font-display text-xl leading-tight">{s.direction}</div>
        <div className="mt-1 font-mono text-sm tabular-nums text-accent">
          {s.directionProb ? fmtPct(s.directionProb) : "— (brak kursów)"}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="text-subtle">1</div>
            <div className="font-mono tabular-nums">{s.homeWinProb ? fmtPct(s.homeWinProb, 0) : "—"}</div>
          </div>
          <div>
            <div className="text-subtle">X</div>
            <div className="font-mono tabular-nums">{s.drawProb ? fmtPct(s.drawProb, 0) : "—"}</div>
          </div>
          <div>
            <div className="text-subtle">2</div>
            <div className="font-mono tabular-nums">{s.awayWinProb ? fmtPct(s.awayWinProb, 0) : "—"}</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-subtle">1X2 = implied z kursu, nie z formy</p>
        <div className="mt-3 flex justify-between text-xs text-muted">
          <span>BTTS proj. {s.bttsProjectedPct ? fmtPct(s.bttsProjectedPct, 0) : "—"}</span>
          <span>O2.5 proj. {s.over25ProjectedPct ? fmtPct(s.over25ProjectedPct, 0) : "—"}</span>
        </div>
      </Card>
    </div>
  );
}
