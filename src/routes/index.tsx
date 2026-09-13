import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Plus, ScanLine } from "lucide-react";
import { DownloadProgramButtons } from "@/components/download-program";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { decisionTone, fmtKickoff, fmtPct, fmtXgPair } from "@/lib/v26/format";
import { fmtTtl } from "@/lib/v26/archive-ttl";
import { verdictLabel, verdictTone } from "@/lib/v26/wniosek";
import { loadArchive, useAnalyses } from "@/lib/v26/store";
import { listArchivedAnalyses } from "@/lib/v26/archive-api";
import { MarketPreviewChips, MarketResultChips } from "@/components/analysis/market-chips";
import type { SavedAnalysis } from "@/lib/v26/types";

function isPinnedRow(a: SavedAnalysis) {
  return Boolean(a.demo) || a.id.startsWith("test-") || a.id.startsWith("demo-");
}

export const Route = createFileRoute("/")({
  loader: () => listArchivedAnalyses(),
  component: Home,
});

function Home() {
  const disk = Route.useLoaderData();
  const items = useAnalyses((s) => s.items);
  useEffect(() => {
    void loadArchive();
  }, []);
  const live = (items.length ? items : Array.isArray(disk) ? disk : []).filter((a) => !isPinnedRow(a));

  return (
    <AppShell>
      <section className="mt-2 max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Standard V26-Liga</p>
        <h2 className="mt-3 font-display text-4xl font-medium md:text-5xl">
          Exact ligowy.
          <span className="block text-muted">Osiemnaście kroków, zero domysłów.</span>
        </h2>
        <p className="mt-4 max-w-xl text-pretty text-muted">
          Silnik EXACT liczy Confidence 0–105, bramki UGO / HV / Dominator i zamyka ranking EPL
          zgodnie z V26. Wpisz mecz ręcznie albo wrzuć screen. Po Kroku 11 analiza czeka na Twoje
          OK. Lista dnia nie jest w programie — kartę dodajesz sam.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/nowa">
              <Plus className="size-4" />
              Nowa analiza
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/nowa" hash="skan">
              <ScanLine className="size-4" />
              Skanuj screen
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/pobierz">
              Pobierz program
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/analiza/$id" params={{ id: "demo-lech-radomiak" }}>
              Otwórz przykład
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <Card className="mt-8 max-w-xl p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Pełny kod</p>
        <h2 className="mt-1 font-display text-2xl">Pobierz EXACT V26</h2>
        <p className="mt-2 text-sm text-muted">
          RAR albo ZIP — plik: V26 Liga (backup 09.09.2026 23:28). Selekcja 08.09, 1B wypięte.
          Po kliknięciu zapisze się na telefonie jako V26 Liga.rar / V26 Liga.zip.
        </p>
        <div className="mt-4">
          <DownloadProgramButtons />
        </div>
      </Card>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl">Bieżące analizy</h2>
          <span className="text-xs text-subtle">{live.length} · 2 h po HIT/MISS → Archiwum</span>
        </div>
        {live.length === 0 ? (
          <Card className="p-8 text-sm text-muted">
            Brak kart na pulpicie. Dodaj mecz przez{" "}
            <Link to="/nowa" className="text-fg underline-offset-2 hover:underline">
              Nową analizę
            </Link>
            {" "}albo skan screena. 2 h po HIT/MISS karta schodzi do{" "}
            <Link to="/archiwum" className="text-fg underline-offset-2 hover:underline">
              Archiwum
            </Link>
            .
          </Card>
        ) : (
          <ul className="grid gap-3">
            {live.map((a) => (
              <li key={a.id}>
                <Link to="/analiza/$id" params={{ id: a.id }} className="block">
                  <Card className="p-4 transition-colors hover:bg-elevated">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-display text-xl leading-tight">
                          {a.input.home}{" "}
                          <span className="text-subtle">–</span> {a.input.away}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {a.input.league} · {fmtKickoff(a.input.kickoff)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warn">{fmtTtl(a)}</Badge>
                        {a.engine && (
                          <Badge variant={decisionTone(a.engine.decision)}>{a.engine.decision}</Badge>
                        )}
                        <Badge>{statusLabel(a.status)}</Badge>
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
                    {a.wniosek && a.wniosek.verdict !== "OCZEKUJE" ? (
                      <MarketResultChips markets={a.wniosek.markets} />
                    ) : (
                      <MarketPreviewChips engine={a.engine} />
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function statusLabel(s: string) {
  if (s === "complete") return "Kompletna";
  if (s === "awaiting-k11") return "Czeka na K11";
  if (s === "running-p1" || s === "running-p2") return "Liczy…";
  if (s === "error") return "Błąd";
  return "Szkic";
}
