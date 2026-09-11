import { Badge } from "@/components/ui/badge";
import { fmtPct } from "@/lib/v26/format";
import type { EngineOutput, WniosekMarket } from "@/lib/v26/types";
import type { MarketPick } from "@/lib/v26/markets";

function shortMarket(m: string) {
  if (/btts/i.test(m)) return "BTTS";
  if (/1\.\s*połow/i.test(m)) return "1H";
  if (/2\.\s*połow/i.test(m)) return "2H";
  if (/celne|sot|shots on/i.test(m)) return "SOT";
  if (/rożn|corner/i.test(m)) return "Rożne";
  if (/kartk|card/i.test(m)) return "Kartki";
  if (/gole|over|under/i.test(m)) return "Gole";
  return m;
}

function previewLabel(m: MarketPick) {
  const qty = m.qty != null ? `${m.qty} · ` : "";
  const p = fmtPct(m.pct, 0);
  if (m.id === "sot") return `SOT ${qty}${p} gol`;
  if (m.id === "o15") return `Gole ${qty}O1.5 ${p}`;
  if (m.id === "o25") return `Gole ${qty}O2.5 ${p}`;
  if (m.id === "u25") return `Gole ${qty}U2.5 ${p}`;
  if (m.id === "k95") return `Rożne ${qty}O9.5 ${p}`;
  if (m.id === "k85") return `Rożne ${qty}O8.5 ${p}`;
  if (m.id === "c35") return `Kartki ${qty}O3.5 ${p}`;
  if (m.id === "c45") return `Kartki ${qty}O4.5 ${p}`;
  if (m.id === "h1-y") return `1H ${qty}TAK ${p}`;
  if (m.id === "h2-y") return `2H ${qty}TAK ${p}`;
  return `${shortMarket(m.market)} ${qty}${m.pick} ${p}`;
}

export function MarketResultChips({ markets }: { markets?: WniosekMarket[] }) {
  if (!markets?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {markets.map((m) => (
        <Badge
          key={m.id}
          variant={m.hit === true ? "ok" : m.hit === false ? "danger" : "warn"}
        >
          {shortMarket(m.market)} {m.pick} · FT {m.actual}
          {m.hit === true ? " HIT" : m.hit === false ? " MISS" : ""}
        </Badge>
      ))}
    </div>
  );
}

export function MarketPreviewChips({
  engine,
}: {
  engine?: EngineOutput | null;
}) {
  const track = (engine?.markets?.track || []) as MarketPick[];
  if (!track.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {track.map((m) => (
        <Badge key={m.id} variant={m.id === "sot" ? "accent" : m.pct >= 70 ? "ok" : m.pct >= 55 ? "accent" : "warn"}>
          {previewLabel(m)}
        </Badge>
      ))}
    </div>
  );
}
