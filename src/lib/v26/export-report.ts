import { mergeSteps } from "./engine";
import { eplRankingTitle } from "./format";
import { STEPS } from "./types";
import type { SavedAnalysis } from "./types";

function esc(s: string) {
  return s
    .replaceAll("&", `&${"amp"};`)
    .replaceAll("<", `&${"lt"};`)
    .replaceAll(">", `&${"gt"};`)
    .replaceAll('"', `&${"quot"};`);
}

function dash(n: number | undefined) {
  if (n == null || n === 0) return "—";
  return String(n);
}

export function fileBase(a: SavedAnalysis) {
  const h = a.input.home.replace(/\s+/g, "_");
  const aw = a.input.away.replace(/\s+/g, "_");
  const d = (a.input.kickoff || a.createdAt).slice(0, 10);
  return `V26_${h}_vs_${aw}_${d}`;
}

export function toMarkdown(a: SavedAnalysis): string {
  const e = a.engine;
  const steps = mergeSteps(a.phase1, a.phase2);
  const lines: string[] = [
    `# EXACT V26 — ${a.input.home} vs ${a.input.away}`,
    ``,
    `Liga: ${a.input.league}  `,
    `Termin: ${a.input.kickoff || "—"}  `,
    `Kursy: ${a.input.oddsHome ?? "—"} / ${a.input.oddsDraw ?? "—"} / ${a.input.oddsAway ?? "—"}  `,
    `Status: ${a.status} | Decyzja: ${e?.decision ?? "—"}  `,
    `Confidence: ${e ? `${e.confidence.sum}/105 = ${e.confidence.pct}% (${e.confidence.band})` : "—"}  `,
    `Profil: ${e?.profile ?? "—"} | Kierunek: ${e?.direction ?? "—"} (${e?.stats.directionProb ?? "—"}%)`,
    ``,
    `## Statystyki`,
    ``,
    `| | Gospodarz | Gość |`,
    `|---|---|---|`,
    `| Śr. gole | ${dash(e?.stats.goalsHome)} | ${dash(e?.stats.goalsAway)} |`,
    `| Rożne | ${dash(e?.stats.cornersHome)} | ${dash(e?.stats.cornersAway)} |`,
    `| Celne strzały | ${dash(e?.stats.sotHome)} | ${dash(e?.stats.sotAway)} |`,
    `| Kartki | ${dash(e?.stats.cardsHome)} | ${dash(e?.stats.cardsAway)} |`,
    `| BTTS % | ${e?.stats.bttsHomePct ?? "—"} | ${e?.stats.bttsAwayPct ?? "—"} |`,
    ``,
    `BTTS proj. ${e?.stats.bttsProjectedPct ?? "—"}% · O2.5 proj. ${e?.stats.over25ProjectedPct ?? "—"}% · 1X2 ${e?.stats.homeWinProb}/${e?.stats.drawProb}/${e?.stats.awayWinProb}`,
    ``,
    `## Top 3 najpewniejsze zakłady`,
    ``,
  ];
  (e?.markets?.surest ?? []).forEach((m, i) => {
    lines.push(`${i + 1}. **${m.pick}** (${m.market}) — ${m.pct}% · fair ${m.fairOdds.toFixed(2)}`);
    lines.push(`   ${m.why}`);
  });
  lines.push(``, `## Najlepsze value`, ``);
  (e?.markets?.value ?? []).forEach((m, i) => {
    lines.push(`${i + 1}. **${m.pick}** (${m.market}) — ${m.pct}% · edge ${m.edge ?? "—"} pp · fair ${m.fairOdds.toFixed(2)}`);
    lines.push(`   ${m.why}`);
  });
  lines.push(
    ``,
    `## ${eplRankingTitle(a.input.home, a.input.away)} (TOP3 Gate)`,
    ``,
  );
  e?.epl.forEach((x, i) => {
    lines.push(`${i + 1}. **${x.score}** → ${x.epl.pct}%  ${x.role}  (EPF ${x.epf.total}/10) — ${x.satisfies.join(", ")}`);
  });
  if (e?.protection.length) {
    lines.push(``, `Protection / TOP4:`);
    e.protection.forEach((x) => lines.push(`- ${x.score} → ${x.epl.pct}% (${x.satisfies.join(", ")})`));
  }
  lines.push(
    ``,
    `Central Exact: ${e?.centralExact} (EPF ${e?.centralEpf}/10) — ${e?.centralWhy}`,
    ``,
    `## Confidence 0–105`,
    ``,
  );
  if (e) {
    lines.push(
      `- Forma ${e.confidence.forma}/20`,
      `- xG ${e.confidence.xg}/15`,
      `- H2H ${e.confidence.h2h}/10`,
      `- Home/Away Split ${e.confidence.homeAway}/15`,
      `- QOI + Motivation ${e.confidence.qoi}/10`,
      `- Flow / Direction Fit ${e.confidence.flow}/10`,
      `- Market Alignment ${e.confidence.market}/10`,
      `- Squad Availability ${e.confidence.squad}/10`,
      `- Sample Size + Variance ${e.confidence.sample}/5`,
      `- **SUMA ${e.confidence.sum}/105 = ${e.confidence.pct}%**`,
    );
  }
  lines.push(``, `## Bramki / Override / Gates`, ``);
  if (e) {
    const g = e.gates;
    lines.push(
      `- HV: ${g.highVariance.status} — ${g.highVariance.data}`,
      `- UGO: ${g.ugo.status} (${g.ugo.met}/4) — ${g.ugo.data}`,
      `- CS faworyta: ${g.csFav} — ${g.csFavData}`,
      `- Direction Gate: ${g.homeDirection.met}/4 ${g.homeDirection.approved ? "zatwierdzony" : "odrzucony"}`,
      `- Early Season: ${g.earlySeason.note}`,
      `- Big Quality Gap: ${g.bigQualityGap.status}`,
      `- Dominator Expansion: ${g.dominatorExpansion.status}`,
      `- Remis Safety: ${g.remisSafety.status}`,
      `- Soft Band: ${g.softBand.status}`,
    );
  }
  lines.push(``, `## Kupony`, ``);
  e?.coupons.forEach((c) => {
    lines.push(`- Kupon ${c.id} (${c.weight}): ${c.exacts.join(" / ")} — ${c.thesis}`);
  });
  lines.push(``, `## Synteza Gustawa`, ``, e?.gustaw.k4 || "", ``, e?.gustaw.k12 || "", ``, e?.gustaw.k17 || "");
  lines.push(``, `## Kroki V26`, ``);
  for (const meta of STEPS) {
    const s = steps.find((x) => x.k === meta.k);
    lines.push(`### K${meta.k} — ${s?.name || meta.name}`);
    if (!s) {
      lines.push(`_Brak danych._`, ``);
      continue;
    }
    s.points.forEach((p) => {
      lines.push(`**${p.n}. ${p.title}**`, `- Gospodarz: ${p.home}`, `- Goście: ${p.away}`, `- Wniosek: ${p.conclusion}`, ``);
    });
    lines.push(`Podsumowanie: ${s.summary}`, ``, `Audyt: ${s.audit.pct}% · ${s.audit.good} ${s.audit.bad}`, ``);
  }
  if (a.citations.length) {
    lines.push(`## Źródła`, ``, ...a.citations.map((u) => `- ${u}`));
  }
  return lines.join("\n");
}

export function toHtml(a: SavedAnalysis): string {
  const mdish = toMarkdown(a)
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${esc(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${esc(line.slice(3))}</h2>`;
      if (line.startsWith("### ")) return `<h3>${esc(line.slice(4))}</h3>`;
      if (line.startsWith("- ")) return `<li>${esc(line.slice(2))}</li>`;
      if (line.startsWith("|")) return `<pre class="row">${esc(line)}</pre>`;
      if (!line.trim()) return "";
      return `<p>${esc(line)}</p>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="pl">
<meta charset="utf-8"/>
<title>${esc(fileBase(a))}</title>
<style>
  body{font-family:Georgia,serif;max-width:820px;margin:40px auto;padding:0 20px;color:#161616;background:#f6f4ef;line-height:1.5}
  h1{font-size:28px;margin-bottom:8px}
  h2{margin-top:32px;border-top:1px solid #ddd;padding-top:16px;font-size:18px}
  h3{margin-top:24px;font-size:16px}
  li{margin-left:18px}
  pre.row{font-family:ui-monospace,monospace;font-size:12px;margin:0}
  .meta{color:#555;font-size:13px}
</style>
<body>
${mdish}
<p class="meta">Wygenerowano w EXACT V26 · standard ligowy V26-13</p>
</body></html>`;
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
