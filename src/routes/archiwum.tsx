import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listColdArchivedAnalyses } from "@/lib/v26/archive-api";
import { fmtKickoff, fmtPct, fmtXgPair, decisionTone } from "@/lib/v26/format";
import { verdictLabel, verdictTone } from "@/lib/v26/wniosek";
import { tickWnioski } from "@/lib/v26/wniosek-api";
import { runEngine } from "@/lib/v26/engine";
import type { SavedAnalysis } from "@/lib/v26/types";

export const Route = createFileRoute("/archiwum")({
  loader: () => listColdArchivedAnalyses(),
  component: ArchivePage,
});

function dayLabel(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "bez daty";
  return new Date(t).toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function withEngine(a: SavedAnalysis): SavedAnalysis {
  if (a.engine || !a.phase1) return a;
  try {
    return { ...a, engine: runEngine(a.input, a.phase1, a.phase2) };
  } catch {
    return a;
  }
}

function ArchivePage() {
  const initial = Route.useLoaderData();
  const [rows, setRows] = useState<SavedAnalysis[] | null>(Array.isArray(initial) ? initial : null);
  useEffect(() => {
    let stop = false;
    void tickWnioski()
      .catch(() => {})
      .then(() => listColdArchivedAnalyses())
      .then((list) => {
        if (!stop) setRows(Array.isArray(list) ? list.map(withEngine) : []);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SavedAnalysis[]>();
    for (const a of rows || []) {
      const key = dayLabel(a.createdAt);
      const bucket = map.get(key) || [];
      bucket.push(a);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Historical Validation Layer</p>
      <h1 className="mt-2 font-display text-4xl">Archiwum analiz</h1>
      <p className="mt-3 max-w-2xl text-muted">
        2 h po HIT/MISS karta schodzi z pulpitu tutaj. Silnik jej nie kasuje — pełna analiza K18
        zostaje. Klik otwiera kartę; w razie potrzeby da się ją wyciągnąć z powrotem na pulpit.
        Tabela 23 zostaje rozliczeniem EPL vs FT. Audyty, czego nie patchować:{" "}
        <Link to="/obserwacja" className="text-fg underline-offset-2 hover:underline">
          Obserwacja
        </Link>
        .
      </p>

      {rows === null ? (
        <Card className="mt-10 p-8 text-sm text-muted">Ładuję archiwum…</Card>
      ) : rows.length === 0 ? (
        <Card className="mt-10 p-8 text-sm text-muted">
          <div className="mb-2 flex items-center gap-2 font-display text-xl text-fg">
            <Archive className="size-5 text-accent" />
            Pusto
          </div>
          Jeszcze nic nie spadło z pulpitu. Po HIT/MISS karta zostaje 2 h na pulpicie, potem
          znajdziesz ją tutaj.
        </Card>
      ) : (
        groups.map(([day, items]) => (
          <section key={day} className="mt-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-2xl capitalize">{day}</h2>
              <span className="text-xs text-subtle">{items.length} analiz</span>
            </div>
            <ul className="grid gap-3">
              {items.map((a) => (
                <li key={a.id}>
                  <Link to="/analiza/$id" params={{ id: a.id }} className="block">
                    <Card className="p-4 transition-colors hover:bg-elevated">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-display text-xl leading-tight">
                            {a.input.home} <span className="text-subtle">–</span> {a.input.away}
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {a.input.league} · {fmtKickoff(a.input.kickoff)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warn">Archiwum</Badge>
                          {a.engine && (
                            <Badge variant={decisionTone(a.engine.decision)}>{a.engine.decision}</Badge>
                          )}
                          <Badge>{a.status === "complete" ? "Kompletna" : a.status === "error" ? "Błąd" : a.status}</Badge>
                          {a.wniosek && a.wniosek.verdict !== "OCZEKUJE" && (
                            <Badge variant={verdictTone(a.wniosek.verdict)}>{verdictLabel(a.wniosek.verdict)}</Badge>
                          )}
                        </div>
                      </div>
                      {a.engine && (
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs tabular-nums text-muted">
                          <span>Conf {fmtPct(a.engine.confidence.pct)}</span>
                          <span>
                            EPL1 {a.engine.epl[0]?.score ?? "—"} {a.engine.epl[0] ? `${a.engine.epl[0].epl.pct}%` : ""}
                          </span>
                          <span>
                            EPL2 {a.engine.epl[1]?.score ?? "—"} {a.engine.epl[1] ? `${a.engine.epl[1].epl.pct}%` : ""}
                          </span>
                          <span>
                            EPL3 {a.engine.epl[2]?.score ?? "—"} {a.engine.epl[2] ? `${a.engine.epl[2].epl.pct}%` : ""}
                          </span>
                          <span>
                            xG {fmtXgPair((a.phase2 || a.phase1)?.home.xg, (a.phase2 || a.phase1)?.away.xg)}
                          </span>
                          <span>Kierunek {a.engine.direction}</span>
                        </div>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </AppShell>
  );
}
