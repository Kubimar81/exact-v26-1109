import { createFileRoute } from "@tanstack/react-router";
import { runScanScreens, type ScanResponse } from "@/lib/v26/scan";

function json(body: ScanResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/scan")({
  component: () => null,
  server: {
    handlers: {
      GET: async () => json({ ok: false, error: "Użyj POST." }),
      POST: async ({ request }) => {
        try {
          const raw = await request.json().catch(() => null);
          if (!raw || typeof raw !== "object") {
            return json({ ok: false, error: "Brak obrazu. Wgraj screen meczu." });
          }
          const images = (raw as { images?: unknown }).images;
          return json(await runScanScreens({ images }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Skan nie powiódł się.";
          return json({ ok: false, error: msg.slice(0, 180) });
        }
      },
    },
  },
});
