import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtNum, fmtPct, fmtXgPair } from "@/lib/v26/format";
import { summaryRates } from "@/lib/v26/markets";
import type { EngineOutput, PhasePayload } from "@/lib/v26/types";

function pctTone(n: number): "ok" | "accent" | "warn" | "default" {
  if (!(n > 0)) return "default";
  if (n >= 70) return "ok";
  if (n >= 55) return "accent";
  return "warn";
}

function Cell({
  label,
  pick,
  pct,
  hint,
}: {
  label: string;
  pick?: string;
  pct: number;
  hint?: string;
}) {
  return (
    <li className="min-w-0 rounded-md border border-border bg-elevated px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
          {pick ? <div className="mt-0.5 font-display text-lg leading-tight">{pick}</div> : null}
        </div>
        <Badge variant={pctTone(pct)}>{pct > 0 ? fmtPct(pct, 1) : "—"}</Badge>
      </div>
      {hint ? <p className="mt-2 font-mono text-[11px] tabular-nums text-subtle">{hint}</p> : null}
    </li>
  );
}

export function SummaryBoard({
  engine,
  payload,
  home,
  away,
}: {
  engine: EngineOutput;
  payload?: PhasePayload;
  home?: string;
  away?: string;
}) {
  const epl = engine.epl.slice(0, 3);
  const rates = payload ? summaryRates(payload, engine) : null;
  const s = engine.stats;

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => {
          const row = epl[i];
          return (
            <Card key={`epl${i + 1}`} className="min-w-0 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted">EPL {i + 1}</div>
              {row ? (
                <>
                  <div className="mt-1 font-mono text-2xl tabular-nums tracking-tight md:text-3xl">{row.score}</div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                    <span className="truncate text-[11px] text-muted">{row.role}</span>
                    <span className="font-mono text-sm tabular-nums text-accent">{fmtPct(row.epl.pct, 1)}</span>
                  </div>
                </>
              ) : (
                <div className="mt-2 font-mono text-2xl text-subtle">—</div>
              )}
            </Card>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Confidence meczu</div>
              <div className="mt-1 font-mono text-3xl tabular-nums tracking-tight">{fmtPct(engine.confidence.pct, 0)}</div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>{engine.confidence.band}</div>
              <div className="font-mono tabular-nums">{engine.confidence.sum}/105</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">xG · gospodarz – gość</div>
          <div className="mt-1 font-mono text-3xl tabular-nums tracking-tight">
            {fmtXgPair(rates?.xgHome, rates?.xgAway)}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
            <span>xGA {fmtXgPair(rates?.xgaHome, rates?.xgaAway)}</span>
            {home && away ? <span className="truncate">{home} – {away}</span> : null}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">Wskazania procentowe</p>
            <h3 className="font-display text-xl">BTTS · gole · połowy · rożne · kartki</h3>
          </div>
          <p className="text-xs text-subtle">
            {home && away ? `${home} – ${away}` : "Cały mecz"}
            {rates?.tot ? ` · λ ${fmtNum(rates.tot, 2)}` : ""}
          </p>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Cell label="BTTS" pick="TAK" pct={rates?.bttsYes ?? s.bttsProjectedPct} hint={rates ? `forma ${fmtPct(payload?.home.bttsPct, 0)} / ${fmtPct(payload?.away.bttsPct, 0)}` : undefined} />
          <Cell label="BTTS" pick="NIE" pct={rates?.bttsNo ?? (s.bttsProjectedPct ? 100 - s.bttsProjectedPct : 0)} />
          <Cell label="Over 1.5" pick="TAK" pct={rates?.o15 ?? 0} hint={rates?.tot ? `λ ${fmtNum(rates.tot, 2)}` : undefined} />
          <Cell label="Over 2.5" pick="TAK" pct={rates?.o25 ?? s.over25ProjectedPct} hint={payload ? `forma ${fmtPct(payload.home.over25Pct, 0)} / ${fmtPct(payload.away.over25Pct, 0)}` : undefined} />
          <Cell label="Under 2.5" pick="TAK" pct={rates?.u25 ?? (s.over25ProjectedPct ? 100 - s.over25ProjectedPct : 0)} />
          <Cell label="Gol 1. połowa" pick="TAK" pct={rates?.h1 ?? 0} hint={rates?.l1 ? `λ ${fmtNum(rates.l1, 2)}` : undefined} />
          <Cell label="Gol 2. połowa" pick="TAK" pct={rates?.h2 ?? 0} hint={rates?.l2 ? `λ ${fmtNum(rates.l2, 2)}` : undefined} />
          <Cell label="Rożne Over 8.5" pick="TAK" pct={rates?.cor85 ?? 0} hint={rates?.corL ? `śr. ${fmtNum(rates.corL, 1)}` : undefined} />
          <Cell label="Rożne Over 9.5" pick="TAK" pct={rates?.cor95 ?? 0} hint={rates?.corL ? `śr. ${fmtNum(rates.corL, 1)}` : undefined} />
          <Cell label="Kartki Over 3.5" pick="TAK" pct={rates?.cards35 ?? 0} hint={rates?.cardsL ? `śr. ${fmtNum(rates.cardsL, 1)}` : undefined} />
          <Cell label="Kartki Over 4.5" pick="TAK" pct={rates?.cards45 ?? 0} hint={rates?.cardsL ? `śr. ${fmtNum(rates.cardsL, 1)}` : undefined} />
          <li className="min-w-0 rounded-md border border-border bg-elevated px-3 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Kierunek 1X2</div>
            <div className="mt-0.5 font-display text-lg leading-tight">{s.direction}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-xs tabular-nums">
              <div>
                <div className="text-subtle">1</div>
                <div>{s.homeWinProb ? fmtPct(s.homeWinProb, 0) : "—"}</div>
              </div>
              <div>
                <div className="text-subtle">X</div>
                <div>{s.drawProb ? fmtPct(s.drawProb, 0) : "—"}</div>
              </div>
              <div>
                <div className="text-subtle">2</div>
                <div>{s.awayWinProb ? fmtPct(s.awayWinProb, 0) : "—"}</div>
              </div>
            </div>
          </li>
        </ul>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">xG / xGA</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xl tabular-nums">
                {rates && (rates.xgHome || rates.xgaHome) ? `${fmtNum(rates.xgHome, 2)} / ${fmtNum(rates.xgaHome, 2)}` : "—"}
              </div>
              <div className="text-[11px] text-subtle">Gospodarz</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl tabular-nums">
                {rates && (rates.xgAway || rates.xgaAway) ? `${fmtNum(rates.xgAway, 2)} / ${fmtNum(rates.xgaAway, 2)}` : "—"}
              </div>
              <div className="text-[11px] text-subtle">Gość</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Rożne · śr. / mecz</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xl tabular-nums">{rates?.cornersHome ? fmtNum(rates.cornersHome, 1) : "—"}</div>
              <div className="text-[11px] text-subtle">Gospodarz</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl tabular-nums">{rates?.cornersAway ? fmtNum(rates.cornersAway, 1) : "—"}</div>
              <div className="text-[11px] text-subtle">Gość</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Kartki · śr. / mecz</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xl tabular-nums">{rates?.cardsHome ? fmtNum(rates.cardsHome, 1) : "—"}</div>
              <div className="text-[11px] text-subtle">Gospodarz</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl tabular-nums">{rates?.cardsAway ? fmtNum(rates.cardsAway, 1) : "—"}</div>
              <div className="text-[11px] text-subtle">Gość</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Śr. gole</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xl tabular-nums">{s.goalsHome ? fmtNum(s.goalsHome, 2) : "—"}</div>
              <div className="text-[11px] text-subtle">Gospodarz</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl tabular-nums">{s.goalsAway ? fmtNum(s.goalsAway, 2) : "—"}</div>
              <div className="text-[11px] text-subtle">Gość</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
