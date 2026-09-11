import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EngineOutput, GateRecord } from "@/lib/v26/types";

function Row({ label, g }: { label: string; g: GateRecord }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-0 sm:grid-cols-[11rem_1fr_7rem] sm:items-start">
      <div className="text-sm">{label}</div>
      <div>
        <div className="font-mono text-xs text-muted">{g.data}</div>
        <div className="mt-1 text-xs text-subtle">{g.reason}</div>
      </div>
      <div className="sm:text-right">
        <Badge variant={g.active ? "warn" : "default"}>{g.status}</Badge>
      </div>
    </div>
  );
}

export function GatesPanel({ engine }: { engine: EngineOutput }) {
  const g = engine.gates;
  return (
    <Card className="p-5">
      <h3 className="font-display text-xl">Bramki V26 · Zero Domysłów</h3>
      <p className="mt-1 text-sm text-muted">
        CS faworyta: {g.csFav} · Direction Gate {g.homeDirection.met}/4{" "}
        {g.homeDirection.approved ? "TAK — faworyt flow" : "NIE — niepewny kierunek"} · Early Season: {g.earlySeason.note}
      </p>
      <div className="mt-2 text-xs text-subtle">{g.csFavData}</div>
      {g.homeDirection.details[0] ? (
        <p className="mt-2 text-sm text-fg">{g.homeDirection.details[0]}</p>
      ) : null}
      <div className="mt-4">
        <Row label="High Variance" g={g.highVariance} />
        <Row label="Underdog Goal Override" g={g.ugo} />
        <Row label="Big Quality Gap" g={g.bigQualityGap} />
        <Row label="Dominator Expansion" g={g.dominatorExpansion} />
        <Row label="Extreme Dominator" g={g.extremeDominator} />
        <Row label="Remis Safety" g={g.remisSafety} />
        <Row label="Soft Band" g={g.softBand} />
        <Row label="Low Kurs Dominator" g={g.lowKursDominator} />
        <Row label="Chaos Reserve" g={g.chaosReserve} />
        <Row label="Minimal Exact" g={g.minimalExact} />
      </div>
      {g.ugo.details.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {g.ugo.details.map((d) => (
            <li key={d}>UGO · {d}</li>
          ))}
        </ul>
      )}
      {engine.compression.log.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-accent">
          {engine.compression.log.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
