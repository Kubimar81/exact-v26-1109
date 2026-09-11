export function fmtPct(n: number | undefined, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtNum(n: number | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function fmtKickoff(iso?: string) {
  if (!iso) return "Termin nieustalony";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(d);
}

export function eplRankingTitle(home?: string, away?: string) {
  const h = (home ?? "").trim();
  const a = (away ?? "").trim();
  if (h && a) return `Ranking EPL, ${h} – ${a}`;
  if (h || a) return `Ranking EPL, ${h || a}`;
  return "Ranking EPL";
}

export function decisionTone(d: string) {
  if (d === "GREEN LIGHT") return "ok" as const;
  if (d === "MIXED ONLY" || d === "WATCH" || d === "WAIT") return "warn" as const;
  return "danger" as const;
}
