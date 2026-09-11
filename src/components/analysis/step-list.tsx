import { Badge } from "@/components/ui/badge";
import { STEPS } from "@/lib/v26/types";
import type { StepResult } from "@/lib/v26/types";

export function StepList({ steps, phase }: { steps: StepResult[]; phase?: 1 | 2 }) {
  const meta = phase ? STEPS.filter((s) => s.phase === phase) : STEPS;
  return (
    <div className="space-y-3">
      {meta.map((m) => {
        const s = steps.find((x) => x.k === m.k);
        const pct = s?.audit?.pct ?? 0;
        const tone = !s ? "default" : pct >= 95 ? "ok" : pct >= 80 ? "warn" : "danger";
        const label = !s ? "brak" : pct >= 95 ? "AKTYWNA" : pct >= 80 ? "CZĘŚCIOWA" : "NIEAKTYWNA";
        const caveat = s?.audit.good && /zastrzeż|WYJĄTEK|sparing/i.test(s.audit.good) ? s.audit.good : "";
        const note = s && pct < 95 ? s.audit.bad || s.audit.impact : caveat;
        return (
          <details
            key={m.k}
            open={Boolean(s && pct < 80)}
            className="group rounded-xl border border-border bg-surface open:bg-surface"
          >
            <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-subtle">K{m.k}</span>
                <span className="flex-1 text-sm font-medium">{s?.name || m.name}</span>
                <Badge variant={tone}>
                  {label} {s ? `${pct}%` : ""}
                </Badge>
              </div>
              {note ? (
                <p className={`mt-2 text-xs leading-snug ${pct < 80 ? "text-danger" : "text-warn"}`}>
                  {pct < 95 ? `Brakuje: ${note}` : note}
                </p>
              ) : null}
            </summary>
            <div className="border-t border-border px-4 py-4">
              {!s ? (
                <p className="text-sm text-muted">Ten krok jeszcze nie został policzony.</p>
              ) : (
                <>
                  <ol className="space-y-4">
                    {(s.points || []).map((p) => (
                      <li key={`${s.k}-${p.n}`}>
                        <div className="text-sm font-medium">
                          {p.n}. {p.title}
                        </div>
                        <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                          <p className="whitespace-pre-line">
                            <span className="block text-[11px] uppercase tracking-wider text-subtle">
                              Gospodarz
                            </span>
                            {p.home}
                          </p>
                          <p className="whitespace-pre-line">
                            <span className="block text-[11px] uppercase tracking-wider text-subtle">
                              Goście
                            </span>
                            {p.away}
                          </p>
                          <p className="whitespace-pre-line">
                            <span className="block text-[11px] uppercase tracking-wider text-subtle">
                              Wniosek
                            </span>
                            {p.conclusion}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-sm text-muted">{s.summary}</p>
                  {Object.keys(s.numbers).length > 0 && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs tabular-nums sm:grid-cols-4">
                      {Object.entries(s.numbers).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[10px] uppercase tracking-wider text-subtle">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-subtle">
                    Audyt: {s.audit.good} {s.audit.bad} {s.audit.impact}
                  </p>
                  {s.sources.length > 0 && (
                    <p className="mt-2 truncate text-xs text-subtle">Źródła: {s.sources.join(" · ")}</p>
                  )}
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
