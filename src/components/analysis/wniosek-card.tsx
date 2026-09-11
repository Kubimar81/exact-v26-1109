import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MarketResultChips } from "@/components/analysis/market-chips";
import {
  fmtWhen,
  isWniosekDue,
  matchEndAt,
  wniosekDueAt,
  verdictLabel,
  verdictTone,
  resolveKickoff,
} from "@/lib/v26/wniosek";
import type { MatchWniosek, SavedAnalysis } from "@/lib/v26/types";

export function WniosekCard({
  analysis,
  busy,
  onRun,
}: {
  analysis: SavedAnalysis;
  busy?: boolean;
  onRun: (force: boolean) => void;
}) {
  const w: MatchWniosek | undefined = analysis.wniosek;
  const kick = resolveKickoff(analysis.input.kickoff, analysis.input.notes, analysis.createdAt);
  const end = matchEndAt(kick);
  const due = wniosekDueAt(kick);
  const dueNow = isWniosekDue(kick);
  const final = w && w.verdict !== "OCZEKUJE";
  const noClock = !kick;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">Po meczu</div>
          <h3 className="font-display text-xl">Wniosek</h3>
        </div>
        {w ? <Badge variant={verdictTone(w.verdict)}>{verdictLabel(w.verdict)}</Badge> : <Badge variant="warn">Czekam</Badge>}
      </div>
      <p className="mt-2 text-sm text-muted">
        Koniec meczu ~ {fmtWhen(end)}. Automat godzinę później ({fmtWhen(due)}). Exact TOP3 vs FT, plus BTTS / gole /
        rożne / kartki z tablicy przed meczem.
      </p>
      {w ? (
        <div className="mt-4 space-y-2">
          <div className="font-mono text-sm tabular-nums text-muted">
            EPL {w.eplTop3.join(" / ") || "—"} · FT {w.ft}
            {w.hitSlot ? ` · ${w.hitSlot}` : ""}
          </div>
          <MarketResultChips markets={w.markets} />
          <p className="text-sm">{w.text}</p>
          {w.events.details.length > 0 && (
            <ul className="text-xs text-muted">
              {w.events.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {dueNow
            ? "Godzina po meczu minęła — program ściąga FT i liczy wniosek."
            : noClock
              ? "Brak godziny z kuponu — tapnij, żeby ściągnąć kickoff/FT z API."
              : "Jeszcze za wcześnie. Wniosek pojawi się sam godzinę po końcu."}
        </p>
      )}
      <div className="mt-4">
        <Button variant="outline" disabled={busy || (!dueNow && !final && !noClock)} onClick={() => onRun(Boolean(final) || noClock)}>
          {busy ? "Liczy wniosek…" : final ? "Przelicz wniosek" : dueNow || noClock ? "Pobierz FT i rozlicz" : "Czekam na godzinę po meczu"}
        </Button>
      </div>
    </Card>
  );
}
