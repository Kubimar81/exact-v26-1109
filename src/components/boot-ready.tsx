import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { loadArchive, useAnalyses } from "@/lib/v26/store";

/** Jednorazowe dociągnięcie archiwum — UI nie czeka w nieskończoność. */
export function BootGate() {
  useEffect(() => {
    void loadArchive();
  }, []);
  return null;
}

function cssAlive() {
  if (typeof window === "undefined") return false;
  return getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim().length > 0;
}

function scanZoneReady() {
  if (typeof document === "undefined") return false;
  const el = document.querySelector("[data-scan-ready]");
  if (!el) return false;
  return el.getAttribute("data-scan-busy") !== "1";
}

export function ReadyChip() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hydrated = useAnalyses((s) => s.hydrated);
  const running = useAnalyses((s) =>
    s.items.some((x) => !x.demo && (x.status === "running-p1" || x.status === "running-p2")),
  );
  const [css, setCss] = useState(false);
  const [scanOk, setScanOk] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (cssAlive()) {
      setCss(true);
      return;
    }
    const t = window.setInterval(() => {
      if (cssAlive()) {
        setCss(true);
        window.clearInterval(t);
      }
    }, 200);
    const cap = window.setTimeout(() => {
      setCss(true);
      window.clearInterval(t);
    }, 1200);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    const cap = window.setTimeout(() => setGaveUp(true), 1800);
    return () => window.clearTimeout(cap);
  }, []);

  useEffect(() => {
    const onNowa = pathname.startsWith("/nowa");
    if (!onNowa) {
      setScanOk(true);
      return;
    }
    setScanOk(false);
    const tick = () => {
      if (scanZoneReady()) {
        setScanOk(true);
        return true;
      }
      return false;
    };
    if (tick()) return;
    const t = window.setInterval(() => {
      if (tick()) window.clearInterval(t);
    }, 120);
    const cap = window.setTimeout(() => {
      setScanOk(true);
      window.clearInterval(t);
    }, 1600);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(cap);
    };
  }, [pathname]);

  const onNowa = pathname.startsWith("/nowa");
  const engineOk = (hydrated || gaveUp) && css;
  const ok = engineOk && (!onNowa || scanOk) && !running;

  let label = "Ładuję…";
  let title = "Silnik i archiwum jeszcze wstają — chwilę";
  if (!engineOk) {
    label = "Ładuję…";
    title = "Start programu — pomarańcz, aż V26 jest w pamięci";
  } else if (running) {
    label = "Liczy…";
    title = "Trwa K0–K18. Zielone wróci, gdy krok się zamknie.";
  } else if (onNowa && !scanOk) {
    label = "Ładuję skaner…";
    title = "Strefa screena jeszcze nie jest gotowa";
  } else if (onNowa) {
    label = "Gotowe · screen";
    title = "Możesz wrzucić kadr meczu";
  } else {
    label = "Gotowe · K18";
    title = "Silnik V26 gotowy — możesz analizować";
  }

  return (
    <div
      className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] tracking-wide"
      style={{
        borderColor: ok ? "#3d5a46" : "#5a4a28",
        background: ok ? "#142018" : "#1c1810",
        color: ok ? "#8fbf9c" : "#c4a15a",
      }}
      title={title}
      data-ready={ok ? "1" : "0"}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ok ? "#6b9a7a" : "#c4a15a",
          animation: ok ? "none" : "exact-pulse 1s ease-in-out infinite",
        }}
      />
      {label}
    </div>
  );
}
