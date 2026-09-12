import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/selekcja")({ component: SelekcjaPage });

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <p className="text-[11px] uppercase tracking-[0.22em] text-accent">{n}</p>
      <h2 className="mt-1 font-display text-3xl">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Dot({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-muted">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}

function SelekcjaPage() {
  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
        V26 Liga · 12.09.2026 · sitko kuponu 2×2 · 1:0 / 0:1
      </p>
      <h1 className="mt-2 font-display text-4xl">Standard selekcji meczów</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Silnik K0–K18, CORE, TOP3: HOLD. Ten plik zmienia tylko sito operatora. Źródło: praktyka 05.09
        (10 HIT) + sitko rana 08.09 (9 HIT). Conf nie tnie listy.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="accent">12.09.2026</Badge>
        <Badge>sitko 1.40–1.75</Badge>
        <Badge variant="warn">soft 1.70–2.10</Badge>
        <Badge variant="ok">CORE 1:0 / 0:1</Badge>
        <Badge>BTTS NIE / U2.5</Badge>
        <Badge variant="danger">1b OUT</Badge>
        <Badge>Conf nie tnie</Badge>
      </div>
      <p className="mt-3 text-sm text-muted">
        Silnik:{" "}
        <Link to="/standard" className="text-fg underline-offset-2 hover:underline">
          Standard V26
        </Link>
        {" · "}
        rozliczenie:{" "}
        <Link to="/tabela-23" className="text-fg underline-offset-2 hover:underline">
          Tabela 23
        </Link>
        {" · "}
        audyt:{" "}
        <Link to="/obserwacja" className="text-fg underline-offset-2 hover:underline">
          Obserwacja
        </Link>
        .
      </p>

      <Step n="Role" title="Kto co robi">
        <Card className="p-5">
          <ul className="space-y-2">
            <Dot>
              <span className="text-fg">Warstwa 1</span> — skan rynku robi Grok według tego pliku.
              Lista do V26.
            </Dot>
            <Dot>
              <span className="text-fg">Warstwa 2</span> — pełne V26 K0–K18 robi operator w programie.
            </Dot>
            <Dot>
              <span className="text-fg">Kupony</span> — Grok składa tylko gdy operator poprosi. Nie z
              palca, tylko z TOP3 karty.
            </Dot>
          </ul>
        </Card>
      </Step>

      <Step n="Warstwa 1" title="Lista dnia — przed V26">
        <p className="text-sm text-muted">
          Jedna lista. Bez ósemki vs Watch jako jakość. Kolejność analizy, nie ranking.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-5">
            <Badge variant="ok">1. Sitko</Badge>
            <p className="mt-3 font-display text-2xl">1.40–1.75</p>
            <p className="mt-2 text-sm text-muted">Najpierw te.</p>
          </Card>
          <Card className="p-5">
            <Badge variant="warn">2. Soft</Badge>
            <p className="mt-3 font-display text-2xl">1.70–2.10</p>
            <p className="mt-2 text-sm text-muted">Druga kolejka.</p>
          </Card>
          <Card className="p-5">
            <Badge variant="danger">3. Short</Badge>
            <p className="mt-3 font-display text-2xl">{`<1.40`}</p>
            <p className="mt-2 text-sm text-muted">Input, nie sitko kuponu.</p>
          </Card>
        </div>
        <Card className="p-5">
          <h3 className="font-display text-xl">Warunki wejścia</h3>
          <ul className="mt-3 space-y-2">
            <Dot>liga krajowa (nie puchar, nie LM/LE)</Dot>
            <Dot>jest faworyt 1X2</Dot>
            <Dot>pasmo kursu jak wyżej</Dot>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Wide {`>2.10`} — nie z porannej listy. Nakładka 1.70–1.75 jest legalna.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-xl">Na listę zostają</h3>
          <ul className="mt-3 space-y-2">
            <Dot>HV ligi (Cymru, Parva, NIFL, Super Liga — 05.09 wchodziły)</Dot>
            <Dot>faworyt wyjazdowy (St. Mirren 1:2, Västerås 0:1 — 05.09 HIT)</Dot>
            <Dot>short jako input (Dinamo 1.13, TNS 1.18, Haugesund 1.27, Larne 1.14)</Dot>
          </ul>
          <p className="mt-4 text-sm text-muted">
            Conf / MIXED / skład nie filtrują wejścia. Martwy underdog nie jest warunkiem listy — to
            warunek kuponu po K18.
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-xl">Short</h3>
          <p className="mt-3 text-sm text-muted">
            Na liście analizy jak 05.09 i 08.09. Na kupon tylko gdy karta sama da CORE 1:0 (Larne).
          </p>
        </Card>
      </Step>

      <Step n="Warstwa 2" title="Po K18 — sitko kuponu 2×2 · 1:0 / 0:1">
        <p className="text-sm text-muted">
          Tu wybierasz najlepsze mecze pod dwójkę. Operator bierze TOP3 z karty. Nic nie dopisuje, nie
          łata slotów.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-5">
            <Badge variant="ok">Na dwójkę</Badge>
            <p className="mt-3 font-display text-2xl">CORE 1:0 albo 0:1</p>
            <ul className="mt-3 space-y-2">
              <Dot>
                oraz <span className="text-fg">BTTS NIE</span> albo <span className="text-fg">U2.5</span>
              </Dot>
              <Dot>
                dom → <span className="text-fg">1:0</span>, wyjazd → <span className="text-fg">0:1</span>
              </Dot>
              <Dot>pasmo Soft / sitko</Dot>
            </ul>
          </Card>
          <Card className="p-5">
            <Badge variant="warn">Nie na dwójkę</Badge>
            <p className="mt-3 font-display text-2xl">zostaje TOP3</p>
            <ul className="mt-3 space-y-2">
              <Dot>1:1 / 0:0 / 1:2 / 2:1 — rozliczenie, nie kupon 2×2</Dot>
              <Dot>short 2:0 / 2:1 / 1:0 — nawet gdy EPL 2:1, nie forsuj</Dot>
              <Dot>short z EPL 2:1 zostaje na TOP3, nie na dwójkę</Dot>
            </ul>
          </Card>
        </div>
        <Card className="p-5">
          <h3 className="font-display text-xl">Nie jako EPL1</h3>
          <p className="mt-3 text-sm text-muted">3:0 / 4:0 / 3:1 — poza pierwszym slotem.</p>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-xl">Info na karcie, nie sito</h3>
          <p className="mt-3 text-sm text-muted">
            H2H, xG, kartki, seria, Conf — na karcie jako informacja. Nie tną dwójki.
          </p>
        </Card>
        <Card className="p-5">
          <ul className="space-y-2">
            <Dot>
              Operator bierze <span className="text-fg">TOP3 z programu</span>. Nic nie dopisuje (ani
              1:1, ani 2:0, ani 3:0).
            </Dot>
            <Dot>Profil chaos (Craiova: 3:1 / 2:2 / 0:3) poza dwójką.</Dot>
            <Dot>Martwy underdog = sitko kuponu, nie listy.</Dot>
            <Dot>Dwa kupony po dwa.</Dot>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-display text-xl">Conf</h3>
          <p className="mt-3 text-sm text-muted">
            Conf jest na karcie jako informacja. Nie tnie listy. Nie tnie dwójki. Z archiwum 03–09.09:
            42/51 HIT {`< 70`}. Całe 08.09 (9 HIT) było 45.7–63.8. Bez XI program sam stawia Conf 69% /
            NO EXECUTION. To nie jest sitko rana.
          </p>
        </Card>
      </Step>

      <Step n="HOLD" title="Czego nie ruszamy w programie">
        <Card className="p-5">
          <ul className="space-y-2">
            <Dot>K0–K18</Dot>
            <Dot>wzór Conf</Dot>
            <Dot>układ TOP3</Dot>
            <Dot>obowiązkowe 1:1 / 2:0 / 0:2 w TOP3 — nie wprowadzamy</Dot>
          </ul>
        </Card>
      </Step>

      <Step n="Test dnia" title="Jak ma wyglądać lista">
        <Card className="p-5">
          <p className="text-sm text-muted">
            Lista ma wyglądać jak 05.09 / rano 08.09: sitko H + Soft + short input. Ligi narodowe
            (także HV). Conf nie zamyka wrzutu.
          </p>
        </Card>
      </Step>
    </AppShell>
  );
}
