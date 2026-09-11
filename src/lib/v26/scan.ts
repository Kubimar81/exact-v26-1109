import { z } from "zod";
import { extractJson } from "./normalize";
import { resolveLeague } from "./leagues";
import { coerceKickoff } from "./wniosek";

export const ScanSchema = z.object({
  images: z
    .array(
      z.object({
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        data: z.string().min(80).max(1_200_000),
      }),
    )
    .min(1)
    .max(3),
});

export type ScanMatchResult = {
  home: string;
  away: string;
  league: string;
  kickoff: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
  exacts: string;
  notes: string;
  sourceHint: string;
  fieldsFilled: string[];
};

export type ScanResponse = { ok: true; result: ScanMatchResult } | { ok: false; error: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function warsawYmd(now: Date): { y: number; m: number; d: number; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return { y, m, d, iso: `${y}-${pad2(m)}-${pad2(d)}` };
}

export function buildScanPrompt(now = new Date()): string {
  const today = warsawYmd(now);
  const tomUtc = Date.UTC(today.y, today.m - 1, today.d + 1);
  const tom = new Date(tomUtc);
  const tomorrow = `${tom.getUTCFullYear()}-${pad2(tom.getUTCMonth() + 1)}-${pad2(tom.getUTCDate())}`;
  return `Odczytaj screen meczu piłkarskiego (Flashscore, SofaScore, Superbet, Fortuna, Bet365, kupon exact, karta meczu, tabela).
Dzisiaj (Europe/Warsaw) = ${today.iso}. Jutro = ${tomorrow}.
Zwróć WYŁĄCZNIE JSON:
{
  "home": "gospodarz",
  "away": "goście",
  "league": "nazwa ligi",
  "kickoff": "YYYY-MM-DDTHH:mm w Europe/Warsaw — NIGDY pusty gdy widać godzinę",
  "oddsHome": number lub null,
  "oddsDraw": number lub null,
  "oddsAway": number lub null,
  "exacts": { "2:0": 7.5 },
  "notes": "inne widoczne fakty, KONIECZNIE surowy tekst godziny z kuponu (np. Dziś 19:00)",
  "sourceHint": "flashscore|sofascore|bukmacher|kupon|other"
}
ZERO DOMYSŁÓW poza datą kickoff ze wskazówek niżej. Gospodarz po lewej/górze/„1”. Kursy 1X2 dokładnie. Nie tłumacz nazw klubów.
GODZINA MECZU (obowiązkowa — każdy kupon ma zegar):
- Superbet/Fortuna: „Dziś HH:mm” / „Jutro, HH:mm” TO JEST kickoff. Wpisz datę ${today.iso} albo ${tomorrow} + tę godzinę.
- Dziś / Today → ${today.iso}. Jutro / Tomorrow → ${tomorrow}.
- Sama godzina HH:mm bez daty → ${today.iso}T HH:mm.
- Data 04.09 / 4 wrz + godzina → złóż w kickoff.
- Nie zostawiaj kickoff pustego gdy zegar jest na screenie.
- Skopiuj widoczny tekst godziny też do notes.`;
}

function resolveXaiKey(): string | undefined {
  const keys = [process.env.XAI_API_KEY, process.env.GROK_API_KEY, process.env.X_AI_API_KEY, process.env.XAI_KEY];
  for (const k of keys) {
    if (typeof k === "string" && k.trim().length > 8) return k.trim();
  }
  return undefined;
}

function asNumStr(v: unknown): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 1 ? String(n) : "";
}

export function normalizeScan(raw: Record<string, unknown>, now = new Date()): ScanMatchResult {
  const exactsRaw = (raw.exacts ?? {}) as Record<string, unknown>;
  const exacts = Object.entries(exactsRaw)
    .filter(([k, v]) => /^\d+:\d+$/.test(k) && Number(v) > 1)
    .map(([k, v]) => `${k}=${Number(v)}`)
    .join(", ");
  const home = String(raw.home ?? "").trim();
  const away = String(raw.away ?? "").trim();
  const leagueRaw = String(raw.league ?? "").trim();
  const oddsHome = asNumStr(raw.oddsHome);
  const oddsDraw = asNumStr(raw.oddsDraw);
  const oddsAway = asNumStr(raw.oddsAway);
  const notes = String(raw.notes ?? "").trim();
  const kickoff = coerceKickoff(String(raw.kickoff ?? "").trim(), notes, now);
  const fieldsFilled: string[] = [];
  if (home) fieldsFilled.push("gospodarz");
  if (away) fieldsFilled.push("goście");
  if (leagueRaw) fieldsFilled.push("liga");
  if (kickoff) fieldsFilled.push("termin");
  if (oddsHome || oddsDraw || oddsAway) fieldsFilled.push("kursy 1X2");
  if (exacts) fieldsFilled.push("exacty");
  if (notes) fieldsFilled.push("notatki ze screena");
  return {
    home,
    away,
    league: resolveLeague(home, away, leagueRaw),
    kickoff,
    oddsHome,
    oddsDraw,
    oddsAway,
    exacts,
    notes,
    sourceHint: String(raw.sourceHint ?? ""),
    fieldsFilled,
  };
}

/** Zawsze JSON — nigdy nie rzuca. Timeout 22 s, jeden strzał do vision. */
export async function runScanScreens(input: unknown): Promise<ScanResponse> {
  try {
    const data = ScanSchema.parse(input);
    const apiKey = resolveXaiKey();
    if (!apiKey) return { ok: false, error: "Skaner screenów jest niedostępny. Wpisz mecz ręcznie." };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 22_000);
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0,
          max_tokens: 900,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildScanPrompt() },
                ...data.images.map((img) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${img.mime};base64,${img.data}`, detail: "low" as const },
                })),
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `Skaner API ${res.status}${t ? `: ${t.slice(0, 140)}` : ""}` };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) return { ok: false, error: "Pusta odpowiedź skanera. Wpisz mecz ręcznie." };
      const parsed = extractJson(content) as Record<string, unknown>;
      return { ok: true, result: normalizeScan(parsed) };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) return { ok: false, error: "Skaner nie zdążył (timeout). Wgraj mniejszy kadr albo wpisz mecz ręcznie." };
    if (/too_big|too large|max/i.test(msg)) return { ok: false, error: "Screen jest za duży. Wytnij kadr z nazwami drużyn." };
    return { ok: false, error: msg.slice(0, 180) || "Skan nie powiódł się." };
  }
}
