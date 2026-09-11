import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/standard")({ component: StandardPage });

const BLOCKS = [
  {
    title: "Filozofia",
    body: "Matematyka + Flow + Motywacja. Jakość danych ponad szablon. Każdy mecz od zera. EPL% to siła rankingu (85–92 na CORE), nie implied probability. Confidence = suma 0–105 / 105, bez ręcznej korekty po wyliczeniu.",
  },
  {
    title: "Conflict Resolution Gate",
    body: "1. Safety / Hard Gates (Early Season, HV, Low Conf, TOP3). 2. Mandatory Overrides (UGO, Remis Safety). 3. Dominator Expansion. 4. EPL / Flow / QOI. 5. Market Alignment. 6. Kurs correct-score jako potwierdzenie. Reguła niższa nie anuluje wyższej.",
  },
  {
    title: "High Variance Filter",
    body: "TAK gdy ≥1: średnia goli drużyny ≥ 3.80, BTTS ≥ 65%, liga HV. Skutek: mixed w TOP3, czysty exact nie może być EPL1. HV nie obcina skali 0–105 (Sample i tak ≤3/5; Flow 5–6 gdy HV). UGO nie obcina Sample.",
  },
  {
    title: "Underdog Goal Override",
    body: "TAK przy ≥2/4: CS faworyta Weak/Medium; kurs 1.40–1.85; strata gola w ≥50% z 8–10; HV lub jakość underdoga. Przy Conf 85–89% + CS Strong/Medium + HV NIE → 2:0 może zostać EPL1. CS Weak lub HV → 2:1 minimum EPL1. Kurs ≤1.50 + CS ≠ Strong → mixed w TOP3.",
  },
  {
    title: "Clean Sheet",
    body: "Strong: CS% ≥50 (8–10) oraz CS venue ≥60 lub 0–1 gol w 5. Medium: 30–49 / 2–3 gole. Weak: <30 lub ≥4 gole. Strong jako CORE tylko przy gf rywala ≤0.90, BTTS rywala ≤40%, liga nie HV, kurs ≤1.45.",
  },
  {
    title: "Dominator i Big Quality Gap",
    body: "Conf ≥88% + kurs ≤1.55 + Controlled Favorite → 3+ w TOP3. Extreme Boost (≥87% + gap≥2 + xG≥2.3 + HV NIE + brak UGO) → 4:0/5:0 jako Value. BQG: kurs ≤1.60 + Δ miejsc ≥8 → 3+ w TOP3 oraz ochrona 1:0/0:1.",
  },
  {
    title: "Remis Safety i Soft Band",
    body: "Conf 80–90% + HV lub liga średniej wariancji → 0:0/1:1 w TOP4. Conf ≤80% + Away Favorite + HV → 0:0/1:1 w TOP4. Soft Band 1.70–2.10: priorytet 1:0/2:0, 3:0 max EPL3. Protection ≠ TOP3, chyba że reguła mówi TOP3.",
  },
  {
    title: "Checkpoint K11 i TOP3 Gate",
    body: "Po Kroku 11 analiza stoi, aż dasz OK. Finalnie maksymalnie 3 exacty na kupon. EPL1 na dwóch kuponach, EPL2/EPL3 na trzecim. Anti-dublowanie: 3:1 może jednocześnie spełniać UGO + Higher Exact + Mixed.",
  },
  {
    title: "Confidence Kryteria v2.1 (31.08)",
    body: "Forma 20, xG 15, H2H 10, Home/Away Split 15, QOI+Motivation 10 (luka ≥8 → min 8), Flow 10, Market 10 (nie EPL%−implied), Squad 10, Sample+Variance 5. ≥88 Premium, 85–87 Strong, 70–84 MIXED ONLY, <70 NO EXECUTION. Próg <76 wycofany. UGO nie obniża Sample. 70–84: zakaz GREEN-Dominator i 4:0/5:1 w TOP3; luka ≥8 + kurs ≤1.45 → WATCH albo AH −1.5.",
  },
];

function StandardPage() {
  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">V26-Liga · zgodna z V26-13</p>
      <h1 className="mt-2 font-display text-4xl">Standard nienaruszalny</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Silnik stosuje te reguły twardo: najpierw bramki bezpieczeństwa, potem override, na końcu
        rynek. Ranking EPL z Kroku 12 jest zamykany; K13–K18 tylko kontrolują zgodność. Audyty, czego
        nie patchować:{" "}
        <Link to="/obserwacja" className="text-fg underline-offset-2 hover:underline">
          Obserwacja
        </Link>
        .
      </p>
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {BLOCKS.map((b) => (
          <Card key={b.title} className="p-5">
            <h2 className="font-display text-xl">{b.title}</h2>
            <p className="mt-2 text-sm text-muted">{b.body}</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
