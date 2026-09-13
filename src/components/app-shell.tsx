import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, ClipboardList, Download, Eye, Filter, GanttChart, Menu, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { loadArchive, pullWnioski } from "@/lib/v26/store";
import { cn } from "@/lib/utils";
import { ReadyChip } from "@/components/boot-ready";

const NAV = [
  { to: "/", label: "Pulpit", icon: GanttChart },
  { to: "/nowa", label: "Nowa analiza", icon: Plus },
  { to: "/standard", label: "Standard V26", icon: ClipboardList },
  { to: "/selekcja", label: "Selekcja", icon: Filter },
  { to: "/tabela-23", label: "Tabela 23", icon: Table2 },
  { to: "/archiwum", label: "Archiwum", icon: Archive },
  { to: "/obserwacja", label: "Obserwacja", icon: Eye },
  { to: "/pobierz", label: "Pobierz program", icon: Download },
];

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={cn(
              "flex h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors",
              active ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadArchive();
    const t = window.setInterval(() => {
      void loadArchive();
    }, 5 * 60 * 1000);
    const w = window.setInterval(() => {
      void pullWnioski();
    }, 90 * 1000);
    const once = window.setTimeout(() => {
      void pullWnioski();
    }, 4000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(w);
      window.clearTimeout(once);
    };
  }, []);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-surface px-4 py-6 md:flex md:flex-col">
        <Link to="/" className="mb-8 block px-2">
          <div className="font-display text-2xl font-medium tracking-tight">EXACT V26</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">V26 Liga</div>
        </Link>
        <NavLinks />
        <div className="mt-auto space-y-3 px-2">
          <ReadyChip />
          <p className="text-[11px] leading-relaxed text-subtle">
            Standard V26-Liga. Zapis w folderze programu. 2 h po HIT/MISS analiza schodzi do Archiwum.
            Audyty HIT/MISS — Obserwacja, zanim ruszamy silnik.
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-bg/95 px-4 md:hidden">
        <Link to="/" className="font-display text-lg">
          V26 Liga
        </Link>
        <div className="flex items-center gap-2">
          <ReadyChip />
          <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <Link to="/" className="mb-6 mt-4 block" onClick={() => setOpen(false)}>
              <div className="font-display text-2xl">EXACT V26</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted">V26 Liga</div>
            </Link>
            <NavLinks onClick={() => setOpen(false)} />
            <div className="mt-6">
              <ReadyChip />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="min-w-0 md:pl-60">
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 pb-16 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
