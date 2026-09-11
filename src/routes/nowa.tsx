import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ScanDropzone } from "@/components/scan-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ScanMatchResult } from "@/lib/v26/api";
import { coerceKickoff, toWarsawDatetimeLocal } from "@/lib/v26/wniosek";
import { LEAGUES, resolveLeague } from "@/lib/v26/leagues";
import { useAnalyses } from "@/lib/v26/store";
import type { MatchInput } from "@/lib/v26/types";

export const Route = createFileRoute("/nowa")({ component: NewAnalysis });

function NewAnalysis() {
  const nav = useNavigate();
  const createDraft = useAnalyses((s) => s.createDraft);
  const setStatus = useAnalyses((s) => s.setStatus);
  const [scanNote, setScanNote] = useState("");
  const [form, setForm] = useState({
    home: "",
    away: "",
    league: "Ekstraklasa",
    kickoff: "",
    oddsHome: "",
    oddsDraw: "",
    oddsAway: "",
    exacts: "",
    notes: "",
    squadVerified: false,
    squadNote: "",
    keyOutFav: false,
    gkOutFav: false,
    massOutFav: false,
    keyOutUd: false,
  });

  const leagueOptions = LEAGUES.includes(form.league) ? LEAGUES : [form.league, ...LEAGUES];

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function applyScan(result: ScanMatchResult) {
    const kickoff = toWarsawDatetimeLocal(result.kickoff) || toWarsawDatetimeLocal(result.notes);
    setForm((s) => ({
      home: result.home || s.home,
      away: result.away || s.away,
      league: resolveLeague(result.home || s.home, result.away || s.away, result.league || s.league),
      kickoff: kickoff || s.kickoff,
      oddsHome: result.oddsHome || s.oddsHome,
      oddsDraw: result.oddsDraw || s.oddsDraw,
      oddsAway: result.oddsAway || s.oddsAway,
      exacts: result.exacts || s.exacts,
      notes: result.notes
        ? [s.notes, `Ze screena (${result.sourceHint || "kadr"}): ${result.notes}`].filter(Boolean).join("\n")
        : s.notes,
      squadVerified: s.squadVerified,
      squadNote: s.squadNote,
      keyOutFav: s.keyOutFav,
      gkOutFav: s.gkOutFav,
      massOutFav: s.massOutFav,
      keyOutUd: s.keyOutUd,
    }));
    setScanNote(
      result.fieldsFilled.length
        ? `Wypełnione ze screena: ${result.fieldsFilled.join(", ")}. Sprawdź pola przed analizą.`
        : "",
    );
  }

  function parseExacts(raw: string): Record<string, number> | undefined {
    const out: Record<string, number> = {};
    raw.split(/[,;\n]/).forEach((part) => {
      const m = part.trim().match(/^(\d+:\d+)\s*=\s*(\d+(?:[.,]\d+)?)/);
      if (m) out[m[1]] = Number(m[2].replace(",", "."));
    });
    return Object.keys(out).length ? out : undefined;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.home.trim() || !form.away.trim()) {
      toast.error("Podaj obie drużyny.");
      return;
    }
    const kickoffRaw =
      form.kickoff ||
      (typeof document !== "undefined"
        ? (document.getElementById("kickoff") as HTMLInputElement | null)?.value || ""
        : "");
    const kickIso = coerceKickoff(kickoffRaw, form.notes);
    const input: MatchInput = {
      home: form.home.trim(),
      away: form.away.trim(),
      league: resolveLeague(form.home.trim(), form.away.trim(), form.league),
      kickoff: kickIso && Number.isFinite(Date.parse(kickIso)) ? kickIso : "",
      oddsHome: form.oddsHome ? Number(form.oddsHome.replace(",", ".")) : undefined,
      oddsDraw: form.oddsDraw ? Number(form.oddsDraw.replace(",", ".")) : undefined,
      oddsAway: form.oddsAway ? Number(form.oddsAway.replace(",", ".")) : undefined,
      exactOdds: parseExacts(form.exacts),
      notes: form.notes.trim() || undefined,
      squadVerified: form.squadVerified === true,
      squadNote: [
        form.squadNote.trim(),
        form.keyOutFav && "napastnik out",
        form.gkOutFav && "bramkarz out",
        form.massOutFav && "3+ out",
        form.keyOutUd && "underdog kluczowy out",
      ].filter(Boolean).join("; ") || undefined,
      keyOutFav: !!form.keyOutFav,
      gkOutFav: !!form.gkOutFav,
      massOutFav: !!form.massOutFav,
      keyOutUd: !!form.keyOutUd,
    };
    const draft = createDraft(input);
    setStatus(draft.id, "running-p1");
    nav({ to: "/analiza/$id", params: { id: draft.id } });
  }

  return (
    <AppShell>
      <div className="max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Faza 1 · K0–K11</p>
        <h1 className="mt-2 font-display text-4xl">Nowa analiza</h1>
        <p className="mt-3 text-muted">
          Wrzuć screen albo wpisz mecz ręcznie. Silnik pobierze tabelę, formę, H2H i xG, potem
          zatrzyma się na Kroku 11.
        </p>
      </div>

      <div className="mt-8 max-w-2xl">
        <ScanDropzone onScanned={applyScan} />
      </div>

      <Card className="mt-4 max-w-2xl p-5">
        {scanNote && <p className="mb-4 text-sm text-accent">{scanNote}</p>}
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="home">Gospodarz</Label>
              <Input
                id="home"
                value={form.home}
                onChange={(e) => set("home", e.target.value)}
                placeholder="Lech Poznań"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="away">Goście</Label>
              <Input
                id="away"
                value={form.away}
                onChange={(e) => set("away", e.target.value)}
                placeholder="Radomiak Radom"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="league">Liga</Label>
              <select
                id="league"
                value={form.league}
                onChange={(e) => set("league", e.target.value)}
                className="flex h-11 w-full rounded-sm border border-border bg-elevated px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {leagueOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kickoff">Data i godzina</Label>
              <Input
                id="kickoff"
                type="datetime-local"
                value={form.kickoff}
                onChange={(e) => set("kickoff", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="o1">Kurs 1</Label>
              <Input id="o1" inputMode="decimal" value={form.oddsHome} onChange={(e) => set("oddsHome", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ox">Kurs X</Label>
              <Input id="ox" inputMode="decimal" value={form.oddsDraw} onChange={(e) => set("oddsDraw", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o2">Kurs 2</Label>
              <Input id="o2" inputMode="decimal" value={form.oddsAway} onChange={(e) => set("oddsAway", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex">Kursy exact (opcjonalnie)</Label>
            <Input
              id="ex"
              value={form.exacts}
              onChange={(e) => set("exacts", e.target.value)}
              placeholder="2:0=7.5, 2:1=8.2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notatki / rotacje</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Kontuzje, skład, kontekst kolejki…"
            />
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.squadVerified}
                onChange={(e) => setForm((s) => ({ ...s, squadVerified: e.target.checked }))}
              />
              Kadra komplet / XI zweryfikowany (Sofascore Lineups albo Transfermarkt)
            </label>
            <Label htmlFor="squadNote">Absencje (jedna linia)</Label>
            <Input
              id="squadNote"
              value={form.squadNote}
              onChange={(e) => setForm((s) => ({ ...s, squadNote: e.target.value }))}
              placeholder="kadra komplet  /  napastnik out  /  bramkarz out"
            />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.keyOutFav} onChange={(e) => setForm((s) => ({ ...s, keyOutFav: e.target.checked }))} /> keyOut faworyt</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.gkOutFav} onChange={(e) => setForm((s) => ({ ...s, gkOutFav: e.target.checked }))} /> GK out faworyt</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.massOutFav} onChange={(e) => setForm((s) => ({ ...s, massOutFav: e.target.checked }))} /> 3+ out faworyt</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.keyOutUd} onChange={(e) => setForm((s) => ({ ...s, keyOutUd: e.target.checked }))} /> keyOut underdog</label>
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Uruchom analizę V26
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
