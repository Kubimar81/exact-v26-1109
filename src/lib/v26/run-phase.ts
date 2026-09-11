import { runGatherDetails, runGatherFacts, runGatherForm, runGatherApiFootball, runFillGaps, runPhase1, runPhase1Full, runPhase2, runEnrich, runT60 } from "./api";
import { mergeFactBlobs, sanitizeFacts, coerceForm, factsQuality } from "./normalize";
import type { MatchInput, PhasePayload } from "./types";

export type PhaseCall =
  | { ok: true; payload: PhasePayload; citations: string[] }
  | { ok: false; error: string };

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!msg || /abort/i.test(msg) || /undefined/i.test(msg) || /failed to fetch/i.test(msg)) {
    return "Połączenie się urwało. Spróbuj ponownie ten sam mecz.";
  }
  return msg;
}

function parseBlob(s?: string): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function formCount(factsJson: string): number {
  const blob = parseBlob(factsJson) as { home?: { form?: unknown }; away?: { form?: unknown } };
  return coerceForm(blob.home?.form).length + coerceForm(blob.away?.form).length;
}

function hasUsefulFacts(factsJson: string): boolean {
  return factsQuality(factsJson).useful;
}

export async function callPhase(
  phase: 1 | 2,
  input: MatchInput,
  priorJson?: string,
): Promise<PhaseCall> {
  try {
    if (phase === 1) {
      const res = await runPhase1Full({ data: input });
      if (!res) return { ok: false, error: "Silnik nie zwrócił odpowiedzi. Spróbuj ponownie." };
      if (!res.ok) {
        return { ok: false, error: res.error || "Scout/API-Football nie pobrał formy meczowej." };
      }
      return { ok: true, payload: res.payload, citations: res.citations ?? [] };
    }

    const res = await runPhase2({ data: { ...input, priorJson } });
    if (!res) return { ok: false, error: "Silnik nie zwrócił odpowiedzi. Spróbuj ponownie." };
    if (!("ok" in res) || !res.ok) {
      return { ok: false, error: (res as { error?: string })?.error || "Analiza nieudana." };
    }
    return { ok: true, payload: res.payload, citations: res.citations ?? [] };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function callEnrich(
  input: MatchInput,
  priorJson?: string,
): Promise<PhaseCall> {
  try {
    const res = await runEnrich({ data: { ...input, priorJson } });
    if (!res) return { ok: false, error: "Dociąganie danych nie zwróciło odpowiedzi." };
    if (!("ok" in res) || !res.ok || !res.payload) {
      return { ok: false, error: (res as { error?: string })?.error || "Nie udało się dociągnąć xG/SOT/timingu." };
    }
    return { ok: true, payload: res.payload, citations: res.citations ?? [] };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function callT60(
  input: MatchInput,
  priorJson?: string,
): Promise<PhaseCall & { note?: string }> {
  try {
    const res = await runT60({ data: { ...input, priorJson } });
    if (!res) return { ok: false, error: "T−60 nie zwróciło odpowiedzi." };
    if (!("ok" in res) || !res.ok || !res.payload) {
      return { ok: false, error: (res as { error?: string })?.error || "Nie udało się potwierdzić XI." };
    }
    const note = (res as { overlay?: { note?: string }; error?: string }).overlay?.note
      || (res as { error?: string }).error
      || "T−60 zapisane.";
    return { ok: true, payload: res.payload, citations: res.citations ?? [], note };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}
