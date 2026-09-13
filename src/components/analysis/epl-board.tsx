import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { eplRankingTitle } from "@/lib/v26/format";
import type { EngineOutput } from "@/lib/v26/types";

export function EplBoard({
  engine,
  home,
  away,
}: {
  engine: EngineOutput;
  home?: string;
  away?: string;
}) {
  return (
    <Card className="min-w-0 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl break-words">{eplRankingTitle(home, away)}</h3>
          <p className="text-sm text-muted">
            Central Exact {engine.centralExact} · EPF {engine.centralEpf}/10 · TOP3 Gate
          </p>
        </div>
        <Badge variant={engine.consistencyOk ? "ok" : "warn"}>
          {engine.consistencyOk ? "Consistency OK" : "Relock"}
        </Badge>
      </div>
      <ol className="mt-5 space-y-3">
        {engine.epl.map((ex, i) => (
          <li
            key={ex.score}
            className="flex items-center gap-4 rounded-md border border-border bg-elevated px-4 py-3"
          >
            <div className="font-mono text-xs tabular-nums text-subtle">EPL{i + 1}</div>
            <div className="font-mono text-2xl tabular-nums tracking-tight">{ex.score}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={i === 0 ? "accent" : "default"}>{ex.role}</Badge>
                {ex.satisfies.slice(0, 2).map((s) => (
                  <span key={s} className="truncate text-[11px] text-muted">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, (ex.epl.pct / 95) * 100)}%` }}
                />
              </div>
              {ex.reasons[0] && (
                <p className="mt-1 truncate text-[11px] text-subtle">{ex.reasons[0]}</p>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-lg tabular-nums">{ex.epl.pct}%</div>
              <div className="text-[11px] text-subtle">EPF {ex.epf.total}</div>
            </div>
          </li>
        ))}
      </ol>
      {engine.protection.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Protection / TOP4</div>
          <ul className="mt-2 space-y-1 text-sm">
            {engine.protection.map((p) => (
              <li key={p.score} className="flex justify-between gap-3">
                <span className="font-mono tabular-nums">
                  {p.score} · {p.satisfies.join(", ")}
                </span>
                <span className="font-mono tabular-nums text-muted">{p.epl.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
