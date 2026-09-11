import { ImagePlus, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ScanMatchResult, ScanResponse } from "@/lib/v26/scan";
import { compressScreenshot } from "@/lib/v26/compress-image";
import { cn } from "@/lib/utils";

type Shot = { id: string; name: string; preview: string; mime: "image/jpeg"; data: string };

export function ScanDropzone({
  disabled,
  onScanned,
}: {
  disabled?: boolean;
  onScanned: (result: ScanMatchResult) => void;
}) {
  const inputId = useId();
  const cameraId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      toast.error("Wgraj zrzut ekranu (JPG/PNG).");
      return;
    }
    try {
      const next: Shot[] = [];
      for (const file of list.slice(0, 3)) {
        const c = await compressScreenshot(file);
        next.push({ id: crypto.randomUUID(), ...c });
      }
      setShots((prev) => [...prev, ...next].slice(0, 3));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wczytać screena.");
    }
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) void addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  async function scan() {
    if (!shots.length) {
      toast.error("Najpierw dodaj screen meczu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ images: shots.map((s) => ({ mime: s.mime, data: s.data })) }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        toast.error("Skaner nie odpowiedział. Wgraj mniejszy kadr z nazwami drużyn albo wpisz mecz ręcznie.");
        return;
      }
      const payload = (await res.json()) as ScanResponse;
      if (!payload?.ok) {
        toast.error(payload && "error" in payload ? payload.error : "Skaner nie zwrócił odpowiedzi.");
        return;
      }
      if (!payload.result.home && !payload.result.away) {
        toast.error("Nie rozpoznałem drużyn. Wgraj czytelniejszy kadr z nazwami.");
        return;
      }
      onScanned(payload.result);
      toast.success(
        payload.result.fieldsFilled.length
          ? `Odczytano: ${payload.result.fieldsFilled.join(", ")}.`
          : "Screen odczytany.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/content-type|invariant|failed to fetch|network/i.test(msg)) {
        toast.error("Skaner nie odpowiedział. Wpisz mecz ręcznie albo wgraj mniejszy kadr.");
      } else {
        toast.error(msg || "Skan nie powiódł się.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="skan"
      data-scan-ready="1"
      data-scan-busy={busy || disabled ? "1" : "0"}
      className={cn("scroll-mt-20 p-5 transition-colors", drag && "border-accent bg-elevated")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void addFiles(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const files = [...e.clipboardData.items]
          .filter((i) => i.type.startsWith("image/"))
          .map((i) => i.getAsFile())
          .filter((f): f is File => !!f);
        if (files.length) void addFiles(files);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Skan ze screena</p>
          <h2 className="mt-1 font-display text-xl">Wrzuć kadr meczu</h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Flashscore, SofaScore, kupon 1X2 albo exacty. Do 3 zdjęć. Pola uzupełnią się same — sprawdź
            i odpal V26.
          </p>
        </div>
        <ScanLine className="size-5 text-accent" />
      </div>

      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camRef}
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {shots.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="mt-4 flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-elevated px-4 py-8 text-center text-sm text-muted hover:border-accent hover:text-fg"
        >
          <ImagePlus className="size-6 text-accent" />
          <span>Upuść screen, wklej (Ctrl+V) albo wybierz plik</span>
        </button>
      ) : (
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {shots.map((s) => (
            <li key={s.id} className="relative overflow-hidden rounded-sm border border-border">
              <img src={s.preview} alt={s.name} className="h-24 w-full object-cover" />
              <button
                type="button"
                aria-label="Usuń screen"
                className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-sm bg-bg/80 text-fg"
                onClick={() => setShots((prev) => prev.filter((x) => x.id !== s.id))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void scan()} disabled={disabled || busy || !shots.length}>
          {busy ? "Odczytuję screen…" : "Odczytaj dane meczu"}
        </Button>
        <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
          Dodaj plik
        </Button>
        <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => camRef.current?.click()}>
          Aparat
        </Button>
      </div>
    </Card>
  );
}
