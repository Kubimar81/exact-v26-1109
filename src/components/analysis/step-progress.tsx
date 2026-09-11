import { STEPS } from "@/lib/v26/types";
import type { StepResult } from "@/lib/v26/types";

export function StepProgress({
  steps,
  status,
  extra,
}: {
  steps: StepResult[];
  status: string;
  extra?: string;
}) {
  const running = status === "running-p1" || status === "running-p2";
  const byK = new Map(steps.map((s) => [s.k, s]));
  const okN = STEPS.filter((m) => (byK.get(m.k)?.audit.pct ?? 0) >= 80).length;
  const haveN = STEPS.filter((m) => byK.has(m.k)).length;
  const allOk = status === "complete" && haveN >= 18;
  const k11ok = status === "awaiting-k11" && STEPS.filter((m) => m.phase === 1 && byK.has(m.k)).length >= 10;
  const label = running
    ? status === "running-p2"
      ? "Zamykam K12–K18…"
      : "Pobieram K0–K11…"
    : allOk
      ? "K0–K18 załadowane · możesz czytać wynik"
      : k11ok
        ? "K0–K11 OK · daj zielone na K12–K18"
        : extra || "Czekam na kroki";

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {running ? (
            <span
              aria-hidden
              className="inline-block size-4 shrink-0 rounded-full border-2 border-border-strong border-t-primary"
              style={{ animation: "exact-spin 0.8s linear infinite" }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{
                background: allOk || k11ok ? "#6b9a7a" : "#c4a15a",
                boxShadow: allOk ? "0 0 0 4px rgba(107,154,122,0.2)" : "none",
              }}
            />
          )}
          <p className="text-sm font-medium">{label}</p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-subtle">
          {okN}/19
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {STEPS.map((m) => {
          const s = byK.get(m.k);
          const pct = s?.audit.pct ?? 0;
          const tone = !s ? "#2a2d2a" : pct >= 95 ? "#6b9a7a" : pct >= 80 ? "#c4a15a" : "#c45c4a";
          return (
            <span
              key={m.k}
              title={`K${m.k} ${m.name}${s ? ` ${pct}%` : " — brak"}`}
              className="inline-flex size-6 items-center justify-center rounded-full font-mono text-[9px] tabular-nums"
              style={{
                background: s ? `${tone}22` : "#141614",
                color: s ? tone : "#6e706a",
                border: `1px solid ${s ? tone : "#2a2d2a"}`,
                animation: running && !s ? "exact-pulse 1.2s ease-in-out infinite" : undefined,
              }}
            >
              {m.k}
            </span>
          );
        })}
      </div>
    </div>
  );
}
