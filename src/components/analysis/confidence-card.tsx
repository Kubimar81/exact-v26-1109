import { Card } from "@/components/ui/card";
import type { ConfidenceBreakdown } from "@/lib/v26/types";

const ROWS: { key: keyof Omit<ConfidenceBreakdown, "sum" | "pct" | "band" | "notes">; label: string; max: number }[] = [
  { key: "forma", label: "Forma", max: 20 },
  { key: "xg", label: "xG", max: 15 },
  { key: "h2h", label: "H2H", max: 10 },
  { key: "homeAway", label: "Home/Away Split", max: 15 },
  { key: "qoi", label: "QOI + Motivation", max: 10 },
  { key: "flow", label: "Flow / Direction", max: 10 },
  { key: "market", label: "Market Alignment", max: 10 },
  { key: "squad", label: "Squad Availability", max: 10 },
  { key: "sample", label: "Sample + Variance", max: 5 },
];

export function ConfidenceCard({ c }: { c: ConfidenceBreakdown }) {
  const legacy = c as ConfidenceBreakdown & { atakObrona?: number; override?: number; leagueGap?: number };
  const view: ConfidenceBreakdown = {
    ...c,
    homeAway: c.homeAway ?? legacy.atakObrona ?? 0,
    squad: c.squad ?? legacy.override ?? 0,
    sample: c.sample ?? legacy.leagueGap ?? 0,
  };
  return (
    <Card className="p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">Confidence Score</h3>
          <p className="text-sm text-muted">{view.band} · Kryteria v2.1 · bez ręcznej korekty po sumie</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl tabular-nums leading-none">{view.pct}%</div>
          <div className="mt-1 text-xs text-muted">
            {view.sum}/105 = {view.pct}% · to nie szansa na dokładny wynik
          </div>
          {view.pct >= 70 && view.pct < 85 ? (
            <div className="mt-0.5 text-xs text-muted">70–84%: nie czysty CS CORE</div>
          ) : null}
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {ROWS.map((row) => {
          const v = view[row.key];
          return (
            <li key={row.key} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span className="text-muted">{row.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${(v / row.max) * 100}%` }}
                />
              </div>
              <span className="text-right font-mono text-xs tabular-nums">
                {v}/{row.max}
              </span>
            </li>
          );
        })}
      </ul>
      {view.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted">
          {view.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
