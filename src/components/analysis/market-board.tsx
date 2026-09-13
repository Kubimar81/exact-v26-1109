import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtPct } from "@/lib/v26/format";
import { buildMarkets, type MarketPick } from "@/lib/v26/markets";
import type { EngineOutput, MatchInput, PhasePayload } from "@/lib/v26/types";

function PickCard({ p, rank }: { p: MarketPick; rank: number }) {
  const tone = p.pct >= 70 ? "ok" : p.pct >= 55 ? "accent" : "warn";
  return (
    <li className="rounded-md border border-border bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">#{rank} · {p.market}</div>
          <div className="mt-1 font-display text-xl leading-tight">{p.pick}</div>
        </div>
        <Badge variant={tone}>{fmtPct(p.pct, 0)}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted">{p.why}</p>
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs tabular-nums text-subtle">
        <span>źródło: {p.source ?? "—"}</span>
        <span>fair {p.fairOdds.toFixed(2)}</span>
        {p.impliedPct != null && <span>implied {fmtPct(p.impliedPct, 0)}</span>}
        {p.edge != null && <span className={p.edge > 0 ? "text-ok" : "text-danger"}>edge {p.edge > 0 ? "+" : ""}{p.edge.toFixed(1)} pp</span>}
      </div>
    </li>
  );
}

export function MarketBoard({
  engine,
  input,
  payload,
}: {
  engine: EngineOutput;
  input?: MatchInput;
  payload?: PhasePayload;
}) {
  const m = engine.markets ?? (input && payload ? buildMarkets(input, payload, engine) : undefined);
  if (!m || (m.surest.length === 0 && m.value.length === 0)) return null;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <p className="text-[11px] uppercase tracking-wider text-muted">Top 3 najpewniejsze</p>
        <h3 className="font-display text-xl">Pewność z zebranych danych</h3>
        <ul className="mt-4 space-y-3">
          {m.surest.map((p, i) => (
            <PickCard key={p.id} p={p} rank={i + 1} />
          ))}
        </ul>
        {m.surest.length === 0 && (
          <p className="mt-4 text-sm text-muted">
            Za mało formy/statystyk na Top 3. V26 nie pokazuje % z powietrza.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <p className="text-[11px] uppercase tracking-wider text-muted">Najlepsze value</p>
        <h3 className="font-display text-xl">Edge vs implied / typowy kurs</h3>
        {m.value.length ? (
          <ul className="mt-4 space-y-3">
            {m.value.map((p, i) => (
              <PickCard key={p.id} p={p} rank={i + 1} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Brak value: albo nie ma kursów, albo nie ma formy/statystyk do modelu. V26 nie zgaduje %.
          </p>
        )}
      </Card>
    </div>
  );
}
