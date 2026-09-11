import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listColdArchivedAnalyses } from "@/lib/v26/archive-api";
import { loadArchive, useAnalyses } from "@/lib/v26/store";
import { verdictLabel, verdictTone } from "@/lib/v26/wniosek";
import type { SavedAnalysis } from "@/lib/v26/types";
import { MarketResultChips } from "@/components/analysis/market-chips";

export function AutoWnioski() {
  const live = useAnalyses((s) => s.items);
  const [cold, setCold] = useState<SavedAnalysis[]>([]);
  useEffect(() => {
    void loadArchive();
    void listColdArchivedAnalyses()
      .then((list) => setCold(Array.isArray(list) ? list : []))
      .catch(() => setCold([]));
  }, []);

  const rows = useMemo(() => {
    const map = new Map<string, SavedAnalysis>();
    for (const a of [...live, ...cold]) {
      if (!a?.id || a.demo || a.id.startsWith("demo-") || a.id.startsWith("test-")) continue;
      if (!a.wniosek || a.wniosek.verdict === "OCZEKUJE") continue;
      const prev = map.get(a.id);
      if (!prev || Date.parse(a.wniosek.analyzedAt) >= Date.parse(prev.wniosek?.analyzedAt || "")) {
        map.set(a.id, a);
      }
    }
    return [...map.values()].sort(
      (a, b) => Date.parse(b.wniosek?.analyzedAt || b.createdAt) - Date.parse(a.wniosek?.analyzedAt || a.createdAt),
    );
  }, [live, cold]);

  const hits = rows.filter((r) => r.wniosek?.verdict === "HIT").length;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">Wnioski automatyczne</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Ostatnia rubryka. Godzinę po meczu program bierze nasze EPL, ściąga FT ze źródła i pisze HIT /
            MISS programu / MISS przebiegu. Historycznych bloków powyżej nie rusza.
          </p>
        </div>
        <span className="text-xs text-subtle">
          {hits} HIT / {rows.length - hits} MISS · {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          Jeszcze brak rozliczeń. Pojawią się same godzinę po końcu każdego zapisanego meczu.
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((a) => {
            const w = a.wniosek!;
            return (
              <Link key={a.id} to="/analiza/$id" params={{ id: a.id }} className="block">
                <Card className="p-4 transition-colors hover:bg-elevated">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg">
                        {a.input.home} – {a.input.away}
                      </div>
                      <div className="text-xs text-muted">
                        TOP3 {w.eplTop3.join(" / ") || "—"} · FT {w.ft}
                        {w.hitSlot ? ` · ${w.hitSlot}` : ""}
                      </div>
                      <MarketResultChips markets={w.markets} />
                    </div>
                    <Badge variant={verdictTone(w.verdict)}>{verdictLabel(w.verdict)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">{w.text}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
