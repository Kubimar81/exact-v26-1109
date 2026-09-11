import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfidenceCard } from "@/components/analysis/confidence-card";
import { DataSheet } from "@/components/analysis/data-sheet";
import { DownloadBar } from "@/components/analysis/download-bar";
import { EplBoard } from "@/components/analysis/epl-board";
import { GatesPanel } from "@/components/analysis/gates-panel";
import { MarketBoard } from "@/components/analysis/market-board";
import { StatsGrid } from "@/components/analysis/stats-grid";
import { StepList } from "@/components/analysis/step-list";
import { StepProgress } from "@/components/analysis/step-progress";
import { WniosekCard } from "@/components/analysis/wniosek-card";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { mergeSteps, runEngine } from "@/lib/v26/engine";
import { needsEnrich, hardStops } from "@/lib/v26/fill-steps";
import { decisionTone, fmtKickoff } from "@/lib/v26/format";
import { callEnrich, callPhase, callT60 } from "@/lib/v26/run-phase";
import { missingSetPieces } from "@/lib/v26/set-piece-fallback";
import { STEPS } from "@/lib/v26/types";
import { getArchivedAnalysis } from "@/lib/v26/archive-api";
import { useAnalyses, loadArchive, requestWniosek, mergeArchivedRow } from "@/lib/v26/store";
import { isWniosekDue, resolveKickoff } from "@/lib/v26/wniosek";
import { AppErrorComponent } from "@/lib/error-component";

export const Route = createFileRoute("/analiza/$id")({
  loader: async ({ params }) => {
    try {
      const row = await getArchivedAnalysis({ data: { id: params.id } });
      return { row: row?.id ? row : null };
    } catch {
      return { row: null };
    }
  },
  component: AnalysisPage,
  errorComponent: AppErrorComponent,
});

const inflight = new Map<string, number>();
const enrichTried = new Set<string>();
const INFLIGHT_MAX_MS = 120_000;

function beginJob(key: string) {
  const t = inflight.get(key);
  if (t && Date.now() - t < INFLIGHT_MAX_MS) return false;
  inflight.set(key, Date.now());
  return true;
}

function endJob(key: string) {
  inflight.delete(key);
}

function AnalysisPage() {
  const { id } = Route.useParams();
  const { row } = Route.useLoaderData();
  const fromStore = useAnalyses((s) => s.items.find((x) => x.id === id));
  const hydrated = useAnalyses((s) => s.hydrated);
  const analysis = fromStore && row ? mergeArchivedRow(row, fromStore) : fromStore || row || undefined;
  const setPhase1 = useAnalyses((s) => s.setPhase1);
  const setPhase2 = useAnalyses((s) => s.setPhase2);
  const setStatus = useAnalyses((s) => s.setStatus);
  const setK11Note = useAnalyses((s) => s.setK11Note);
  const patchPhase1 = useAnalyses((s) => s.patchPhase1);
  const applyT60 = useAnalyses((s) => s.applyT60);
  const [busy, setBusy] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [t60busy, setT60busy] = useState(false);
  const [wbusy, setWbusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const fresh = await getArchivedAnalysis({ data: { id } });
        if (!alive || !fresh?.id) return;
        const loc = useAnalyses.getState().items.find((x) => x.id === id);
        const next = mergeArchivedRow(fresh, loc);
        const locS3 = !!(loc?.input?.massOutFav || loc?.phase1?.massOutFav || loc?.input?.keyOutFav || loc?.phase1?.keyOutFav);
        const nextS3 = !!(next.input?.massOutFav || next.phase1?.massOutFav || next.input?.keyOutFav || next.phase1?.keyOutFav);
        const newer = !loc || Date.parse(fresh.updatedAt || "") !== Date.parse(loc.updatedAt || "") || locS3 !== nextS3;
        if (newer) useAnalyses.getState().upsert(next);
      } catch {
        /* ignore */
      }
    }
    if (row?.id) {
      const loc = useAnalyses.getState().items.find((x) => x.id === row.id);
      const diskRicher =
        !loc
        || (row.phase1?.steps?.length ?? 0) > (loc.phase1?.steps?.length ?? 0)
        || (row.phase2?.steps?.length ?? 0) > (loc.phase2?.steps?.length ?? 0)
        || (row.status === "complete" && loc.status !== "complete")
        || Date.parse(row.updatedAt || "") > Date.parse(loc.updatedAt || "");
      if (diskRicher) useAnalyses.getState().upsert(mergeArchivedRow(row, loc));
    }
    void loadArchive();
    void pull();
    const t = window.setInterval(() => {
      void pull();
    }, 4000);
    const stop = window.setTimeout(() => window.clearInterval(t), 90_000);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, [id, row?.id, row?.updatedAt]);

  const e = useMemo(() => {
    if (!analysis?.phase1) return analysis?.engine;
    try {
      return runEngine(analysis.input, analysis.phase1, analysis.phase2);
    } catch {
      return analysis.engine;
    }
  }, [analysis]);

  const steps = useMemo(() => {
    if (!analysis) return [];
    try {
      const c = e?.confidence;
      const p2 = analysis.phase2 && c
        ? {
            ...analysis.phase2,
            confidenceParts: {
              forma: c.forma,
              xg: c.xg,
              h2h: c.h2h,
              homeAway: c.homeAway,
              qoi: c.qoi,
              flow: c.flow,
              market: c.market,
              squad: c.squad,
              sample: c.sample,
            },
          }
        : analysis.phase2;
      return mergeSteps(analysis.phase1, p2);
    } catch {
      return analysis.phase1?.steps || analysis.phase2?.steps || [];
    }
  }, [analysis, e]);

  useEffect(() => {
    if (!analysis || analysis.demo || analysis.status !== "complete") return;
    if (analysis.wniosek && analysis.wniosek.verdict !== "OCZEKUJE") return;
    if (!isWniosekDue(resolveKickoff(analysis.input.kickoff, analysis.input.notes, analysis.createdAt))) return;
    void requestWniosek(analysis.id);
  }, [analysis?.id, analysis?.status, analysis?.wniosek?.verdict, analysis?.input.kickoff]);

  useEffect(() => {
    if (!analysis || analysis.demo) return;
    if (analysis.status === "draft" && !analysis.phase1) {
      setStatus(analysis.id, "running-p1");
      return;
    }
    if (analysis.status !== "running-p1" && analysis.status !== "running-p2") return;
    const key = `${analysis.id}:${analysis.status}`;
    if (!beginJob(key)) return;

    const phase = analysis.status === "running-p2" ? 2 : 1;
    const input = {
      ...analysis.input,
      notes: [analysis.input.notes, analysis.k11Note].filter(Boolean).join("\n") || analysis.input.notes,
    };
    const prior = phase === 2 && analysis.phase1 ? JSON.stringify(analysis.phase1) : undefined;
    const analysisId = analysis.id;

    void (async () => {
      try {
        const res = await callPhase(phase, input, prior);
        const latest = useAnalyses.getState().items.find((x) => x.id === analysisId);
        const expected = phase === 1 ? "running-p1" : "running-p2";
        if (!latest || latest.status !== expected) return;
        if (!res.ok) {
          setStatus(analysisId, "error", res.error);
          toast.error(res.error);
          return;
        }
        if (phase === 1) {
          const fh = res.payload?.home?.form?.length ?? 0;
          const fa = res.payload?.away?.form?.length ?? 0;
          if (fh + fa < 2) {
            const msg =
              "Analiza przerwana: scout nie zwrócił formy meczowej (formN=0). Bez meczów aktualnego sezonu kroki V26 są puste. Sprawdź XAI_API_KEY i uruchom ponownie.";
            setStatus(analysisId, "error", msg);
            toast.error(msg);
            return;
          }
          setPhase1(analysisId, res.payload, res.citations);
          enrichTried.delete(analysisId);
          toast.success("Kroki 0–11 gotowe. Potwierdź, aby iść dalej.");
        } else {
          setPhase2(analysisId, res.payload, res.citations);
          toast.success("K12–K18 zamknięte. EPL zablokowany.");
        }
      } finally {
        endJob(key);
      }
    })();
  }, [analysis?.id, analysis?.status, analysis?.demo, setPhase1, setPhase2, setStatus]);

  useEffect(() => {
    if (!analysis || analysis.demo) return;
    if (analysis.status === "running-p1" || analysis.status === "running-p2" || analysis.status === "draft") return;
    if (!analysis.phase1) return;
    const setGaps = missingSetPieces(analysis.phase1).filter((k) => k !== "cards");
    if (analysis.status === "complete" && !setGaps.length) return;
    if (!needsEnrich(analysis.phase1) && !setGaps.length) return;
    if (enrichTried.has(analysis.id)) return;
    const key = `enrich:${analysis.id}`;
    if (!beginJob(key)) return;
    enrichTried.add(analysis.id);
    setEnriching(true);
    const analysisId = analysis.id;
    const input = analysis.input;
    const prior = JSON.stringify(analysis.phase1);
    void (async () => {
      try {
        const res = await callEnrich(input, prior);
        if (!res.ok) {
          toast.error(res.error || "Nie dociągnąłem xG/SOT/timingu.");
          return;
        }
        patchPhase1(analysisId, res.payload, res.citations);
        toast.success("Dociągnąłem xG, SOT, timing i kadrę — kroki powyżej 90%.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Dociąganie braków przerwane.");
      } finally {
        setEnriching(false);
        endJob(key);
      }
    })();
  }, [analysis?.id, analysis?.status, analysis?.demo, analysis?.enrichedAt, patchPhase1]);

  if (!analysis) {
    return (
      <AppShell>
        <h1 className="font-display text-3xl">{hydrated ? "Nie znaleziono analizy" : "Ładowanie analizy…"}</h1>
        <p className="mt-3 text-sm text-muted">
          {hydrated
            ? "Ta karta nie jest w pulpicie ani w archiwum."
            : "Dociągam mecz z zapisu — zostaw kartę otwartą."}
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/">Wróć do pulpitu</Link>
        </Button>
      </AppShell>
    );
  }

  const running = analysis.status === "running-p1" || analysis.status === "running-p2";
  const stops = analysis.phase1 ? hardStops(analysis.phase1, analysis.input) : [];

  function retry() {
    if (!analysis) return;
    endJob(`${analysis.id}:running-p1`);
    endJob(`${analysis.id}:running-p2`);
    endJob(`enrich:${analysis.id}`);
    enrichTried.delete(analysis.id);
    setStatus(analysis.id, "running-p1");
  }

  function continuePhase2() {
    if (!analysis?.phase1) return;
    setBusy(true);
    endJob(`${analysis.id}:running-p2`);
    setStatus(analysis.id, "running-p2");
    setBusy(false);
  }

  async function confirmT60() {
    if (!analysis?.phase1 || t60busy) return;
    setT60busy(true);
    const before = (analysis.engine?.epl || e?.epl || []).map((x) => x.score).join(" / ");
    const prior = JSON.stringify(analysis.phase1);
    try {
      const res = await callT60(analysis.input, prior);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applyT60(analysis.id, res.payload, res.citations);
      const afterA = useAnalyses.getState().items.find((x) => x.id === analysis.id);
      const after = (afterA?.engine?.epl || []).map((x) => x.score).join(" / ");
      if (before && after && before !== after) {
        toast.success(`T−60: EPL ${before} → ${after}`);
      } else {
        toast.success(res.note || "T−60: XI zapisane, kupon przeliczony.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "T−60 nie doszło. Zostań na karcie i spróbuj jeszcze raz.");
    } finally {
      setT60busy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{analysis.input.league}</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">
            {analysis.input.home} <span className="text-subtle">–</span> {analysis.input.away}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {fmtKickoff(analysis.input.kickoff)} · 1X2 {analysis.input.oddsHome ?? "—"} /{" "}
            {analysis.input.oddsDraw ?? "—"} / {analysis.input.oddsAway ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {analysis.demo && <Badge>Przykład</Badge>}
          <Badge>{statusLabel(analysis.status)}</Badge>
          {e && <Badge variant={decisionTone(e.decision)}>{e.decision}</Badge>}
        </div>
      </div>

      {running && <RunningPanel status={analysis.status} />}
      <StepProgress
        steps={steps}
        status={analysis.status}
        extra={enriching ? "Dociągam xG / SOT / timing" : t60busy ? "Sprawdzam XI T−60" : undefined}
      />
      {enriching && !running && analysis.status !== "complete" && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-xl">Dociągam braki K5 / K6 / K10</h2>
          <p className="mt-2 text-sm text-muted">
            xG z expected_goals, strzały celne, rożne, minuty goli, kadra i pogoda. Zostań na stronie — audyt każdego
            kroku ma zostać powyżej 90%.
          </p>
        </Card>
      )}

      {analysis.status === "error" && (
        <Card className="mt-6 border-danger/40 p-5">
          <h2 className="font-display text-xl">Analiza zatrzymana</h2>
          <p className="mt-2 text-sm text-muted">{analysis.error}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={retry}>
              Spróbuj ponownie ten mecz
            </Button>
            <Button asChild variant="ghost">
              <Link to="/nowa">Nowa analiza</Link>
            </Button>
          </div>
        </Card>
      )}

      {analysis.status === "awaiting-k11" && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-xl">Checkpoint K11</h2>
          <p className="mt-2 text-sm text-muted">
            V26 wymaga potwierdzenia, zanim wolno otworzyć K12. Sprawdź kroki 0–11, dopisz korektę
            jeśli dane są niepełne, potem daj OK.
          </p>
          {stops.length ? (
            <div className="mt-4 rounded-md border border-danger/40 bg-elevated p-3 text-sm">
              <p className="font-medium text-danger">EPL zablokowane — twarde braki:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {stops.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-subtle">Odśwież K0–K11. Audyt 92% przy luce to nie komplet.</p>
            </div>
          ) : null}
          <Textarea
            className="mt-4"
            placeholder="Opcjonalna korekta do fazy 2…"
            value={analysis.k11Note ?? ""}
            onChange={(ev) => setK11Note(analysis.id, ev.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" disabled={busy || stops.length > 0} onClick={() => continuePhase2()}>
              {busy
                ? "Liczą się K12–K18…"
                : stops.length
                  ? "Uzupełnij braki zanim zamkniesz EPL"
                  : "OK — idź do kroków 12–18"}
            </Button>
            <Button variant="outline" onClick={retry}>
              Odśwież dane K0–K11
            </Button>
            <Button variant="outline" disabled={t60busy} onClick={() => void confirmT60()}>
              {t60busy ? "Sprawdzam XI…" : "Potwierdź XI · T−60"}
            </Button>
          </div>
        </Card>
      )}

      {analysis.status === "complete" && analysis.phase1 && (
        <Card className="mt-6 p-5">
          <h2 className="font-display text-xl">Potwierdź XI · T−60</h2>
          {/XI potwierdzone/i.test(analysis.phase1.injuries || "") ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
              {(analysis.phase1.injuries || "").split("|")[0].trim()}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Godzinę przed meczem dociąga składy i zawieszenia. Przelicza kupon (S1–S4, P2) jak drugi lock
              K12–18 — EPL2/EPL3 mogą się zamienić. Bez XI: Conf 69%, NO EXECUTION. Forma i Fill bez zmian.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" disabled={t60busy} onClick={() => void confirmT60()}>
              {t60busy ? "Sprawdzam XI…" : /XI potwierdzone/i.test(analysis.phase1.injuries || "") ? "Odśwież XI · T−60" : "Potwierdź XI · T−60"}
            </Button>
          </div>
        </Card>
      )}

      {e && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Panel podsumowujący</div>
              <p className="font-display text-2xl">
                {e.profile} · Conf {e.confidence.pct}%
              </p>
            </div>
            <DownloadBar analysis={analysis} />
          </div>

          <StatsGrid engine={e} />

          <MarketBoard engine={e} input={analysis.input} payload={analysis.phase1} />

          <div className="grid gap-4 lg:grid-cols-2">
            <EplBoard engine={e} home={analysis.input.home} away={analysis.input.away} />
            <ConfidenceCard c={e.confidence} />
          </div>

          <GatesPanel engine={e} />

          <Card className="p-5">
            <h3 className="font-display text-xl">Kupony</h3>
            <ul className="mt-4 grid gap-3 md:grid-cols-3">
              {e.coupons.map((c) => (
                <li key={c.id} className="rounded-md border border-border bg-elevated p-4">
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    Kupon {c.id} · {c.weight}
                  </div>
                  <div className="mt-2 font-mono text-xl tabular-nums">{c.exacts.join("  ·  ")}</div>
                  <p className="mt-2 text-sm text-muted">{c.thesis}</p>
                </li>
              ))}
            </ul>
          </Card>

          {(e.gustaw.k4 || e.gustaw.k12 || e.gustaw.k17) && (
            <Card className="p-5">
              <h3 className="font-display text-xl">Synteza Gustawa</h3>
              <div className="mt-3 space-y-3 text-sm text-muted">
                {e.gustaw.k4 && <p>{e.gustaw.k4}</p>}
                {e.gustaw.k12 && <p>{e.gustaw.k12}</p>}
                {e.gustaw.k17 && <p>{e.gustaw.k17}</p>}
              </div>
            </Card>
          )}
        </div>
      )}

      {analysis.status === "complete" && !analysis.demo && (
        <div className="mt-6">
          <WniosekCard
            analysis={{ ...analysis, engine: e || analysis.engine }}
            busy={wbusy}
            onRun={(force) => {
              setWbusy(true);
              void requestWniosek(analysis.id, force).finally(() => setWbusy(false));
            }}
          />
        </div>
      )}

      {analysis.phase1 && (
        <div className="mt-8">
          <DataSheet payload={analysis.phase1} />
        </div>
      )}

      <Tabs defaultValue="p1" className="mt-10">
        <TabsList>
          <TabsTrigger value="p1">Kroki 0–11</TabsTrigger>
          <TabsTrigger value="p2">Kroki 12–18</TabsTrigger>
          <TabsTrigger value="src">Źródła</TabsTrigger>
        </TabsList>
        <TabsContent value="p1">
          <StepList steps={steps} phase={1} />
        </TabsContent>
        <TabsContent value="p2">
          <StepList steps={steps} phase={2} />
        </TabsContent>
        <TabsContent value="src">
          <Card className="p-5">
            {analysis.citations.length === 0 ? (
              <p className="text-sm text-muted">Brak zacytowanych URL.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {analysis.citations.map((u) => (
                  <li key={u} className="break-all">
                    <a
                      href={u}
                      className="text-accent underline-offset-2 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function RunningPanel({ status }: { status: string }) {
  const phase = status === "running-p2" ? 2 : 1;
  const list = STEPS.filter((s) => s.phase === phase);
  return (
    <Card className="mt-6 p-5">
      <h2 className="font-display text-xl">
        {phase === 1 ? "Pobieram dane i liczę K0–K11" : "Zamykam EPL · K12–K18"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        Grok dociąga xG/SOT/rożne/kartki i kadrę po tabeli i formie (API-Football, FootyStats, FotMob, FBref). Zostań na stronie — to trwa dłużej niż samo K0.
      </p>
      <ol className="mt-4 grid gap-1 sm:grid-cols-2">
        {list.map((s) => (
          <li key={s.k} className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
            K{s.k} {s.name}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function statusLabel(s: string) {
  if (s === "complete") return "Kompletna";
  if (s === "awaiting-k11") return "Czeka na K11";
  if (s === "running-p1") return "Faza 1";
  if (s === "running-p2") return "Faza 2";
  if (s === "error") return "Błąd";
  return "Szkic";
}
