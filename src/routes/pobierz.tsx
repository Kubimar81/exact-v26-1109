import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { DownloadProgramButtons } from "@/components/download-program";

export const Route = createFileRoute("/pobierz")({ component: PobierzPage });

function PobierzPage() {
  return (
    <AppShell>
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Eksport</p>
      <h1 className="mt-2 font-display text-4xl">Pobierz program</h1>
      <p className="mt-3 max-w-xl text-muted">
        Aktualny kod EXACT V26. Przycisk pakuje to, co teraz stoi w programie — ZIP i RAR.
        Otwórz w WinRAR / Plikach. LM/LE/LKE nie wchodzą.
      </p>

      <Card className="mt-8 max-w-xl p-6">
        <p className="font-display text-xl">V26 Liga</p>
        <p className="mt-1 text-sm text-muted">
          RAR albo ZIP — plik zapisze się jako V26 Liga.rar / V26 Liga.zip. Paczka 09.09.2026 z
          GitHub (exact-v26-0909). Selekcja: sitko 1.40–1.75 / Soft 1.70–2.10, 1b OUT, Conf nie tnie.
          Silnik HOLD.
        </p>
        <div className="mt-5">
          <DownloadProgramButtons />
        </div>
        <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Rozpakuj archiwum</li>
          <li>
            <code className="font-mono text-fg">npm install</code>
          </li>
          <li>
            Skopiuj <code className="font-mono text-fg">.env.example</code> →{" "}
            <code className="font-mono text-fg">.env</code> i wklej{" "}
            <code className="font-mono text-fg">XAI_API_KEY</code>
          </li>
          <li>
            <code className="font-mono text-fg">npm run dev</code>
          </li>
        </ol>
      </Card>
    </AppShell>
  );
}
