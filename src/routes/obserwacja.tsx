import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  OBSERWACJA,
  type ObserwacjaCase,
  type ObserwacjaCaseKind,
  type ObserwacjaNote,
  type ObserwacjaStatus,
} from "@/lib/v26/obserwacja";

export const Route = createFileRoute("/obserwacja")({ component: ObserwacjaPage });

function statusTone(s: ObserwacjaStatus) {
  if (s === "HOLD") return "warn" as const;
  if (s === "PATCH") return "danger" as const;
  return "default" as const;
}

function kindBadge(kind: ObserwacjaCaseKind) {
  if (kind === "HIT") return <Badge variant="ok">HIT</Badge>;
  if (kind === "MISS_PROGRAMU") return <Badge variant="danger">MISS programu</Badge>;
  if (kind === "MISS_PRZEBIEGU") return <Badge variant="warn">MISS przebiegu</Badge>;
  return <Badge>OCZEKUJE</Badge>;
}

function CaseCard({ c }: { c: ObserwacjaCase }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-display text-lg">{c.match}</div>
          <div className="text-xs text-muted">
            {c.conf} · model {c.top3} · FT {c.ft}
          </div>
        </div>
        {kindBadge(c.kind)}
      </div>
      <p className="mt-2 text-sm text-muted">{c.why}</p>
      <p className="mt-2 text-sm text-fg">
        <span className="text-accent">Veto: </span>
        {c.veto}
      </p>
    </Card>
  );
}

function CaseSection({ title, items }: { title: string; items: ObserwacjaCase[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="mt-8 font-display text-xl">{title}</h3>
      <div className="mt-3 grid gap-3">
        {items.map((c) => (
          <CaseCard key={c.match} c={c} />
        ))}
      </div>
    </>
  );
}

function NoteBlock({ note }: { note: ObserwacjaNote }) {
  const hits = note.cases.filter((c) => c.kind === "HIT");
  const prog = note.cases.filter((c) => c.kind === "MISS_PROGRAMU");
  const przeb = note.cases.filter((c) => c.kind === "MISS_PRZEBIEGU");
  const wait = note.cases.filter((c) => c.kind === "OCZEKUJE");
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{note.date}</p>
          <h2 className="font-display text-2xl">{note.title}</h2>
        </div>
        <Badge variant={statusTone(note.status)}>{note.status}</Badge>
      </div>
      <Card className="p-5">
        <p className="text-sm text-muted">{note.summary}</p>
      </Card>

      {note.rules.length > 0 && (
        <>
          <h3 className="mt-8 font-display text-xl">Zasady HOLD</h3>
          <ul className="mt-3 space-y-2">
            {note.rules.map((r) => (
              <li key={r} className="flex gap-3 text-sm leading-relaxed text-muted">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <CaseSection title="HIT — lista dnia" items={hits} />
      <CaseSection title="MISS programu — nie łatamy" items={prog} />
      <CaseSection title="MISS przebiegu — nie łatamy silnikiem" items={przeb} />
      <CaseSection title="OCZEKUJE — bez FT" items={wait} />

      {note.hitsToProtect.length > 0 && (
        <>
          <h3 className="mt-8 font-display text-xl">HIT-y, których nie wolno ruszyć</h3>
          <Card className="mt-3 p-5">
            <ul className="space-y-2 text-sm text-muted">
              {note.hitsToProtect.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {note.tabela23.length > 0 && (
        <>
          <h3 className="mt-8 font-display text-xl">Kotwice z Tabeli 23</h3>
          <Card className="mt-3 p-5">
            <ul className="space-y-2 text-sm text-muted">
              {note.tabela23.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}

function ObserwacjaPage() {
  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Historical Validation Layer</p>
      <h1 className="mt-2 font-display text-4xl">Obserwacja</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Folder obok Archiwum. Tu zapisujemy uwagi z audytów, żeby nie uciekły przy następnej zmianie.
        Nie nadaje bonusów do silnika. Czytać przed każdą łatką EPL i przed nową analizą nietypowego
        exactu.
      </p>
      <p className="mt-2 text-sm text-muted">
        Karty:{" "}
        <Link to="/archiwum" className="text-fg underline-offset-2 hover:underline">
          Archiwum
        </Link>
        {" · "}
        rozliczenie:{" "}
        <Link to="/tabela-23" className="text-fg underline-offset-2 hover:underline">
          Tabela 23
        </Link>
        {" · "}
        sitko:{" "}
        <Link to="/selekcja" className="text-fg underline-offset-2 hover:underline">
          Selekcja
        </Link>
        .
      </p>
      {OBSERWACJA.map((n) => (
        <NoteBlock key={n.id} note={n} />
      ))}
    </AppShell>
  );
}
