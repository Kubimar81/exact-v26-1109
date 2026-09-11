import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { systemPrompt, userPrompt, factsPrompt, formPrompt, gapsPrompt, detailsPrompt } from "./prompt";
import { resolveLeague, filterMatchSources } from "./leagues";
import { extractJson, normalizePayload, sanitizeFacts, compactPrior, backfillPayload, payloadFromFacts, closeFromPrior, mergeFactBlobs, factsQuality, applyT60Overlay } from "./normalize";
import { listGaps, hardStops } from "./fill-steps";
import { gatherFromApiFootball, hasApiFootballKey, confirmLineupsT60 } from "./api-football";
import { missingSetPieces, missingSetPieceNote, overlaySetPieces, parseBookieCorners, setPiecePrompt, shouldSkipSetPieceScout, sparseBoxLeague } from "./set-piece-fallback";
import { fetchFotmobSetPieces } from "./fotmob-box";
import { fetchFlashscoreSetPieces } from "./flashscore-box";
import { attachPrevSeasonLive } from "./prev-season-live";
import { fetchOffCatalogForm } from "./web-form";
import type { MatchInput, PhasePayload } from "./types";
import { runScanScreens } from "./scan";

const InputSchema = z.object({
  home: z.string().min(1),
  away: z.string().min(1),
  league: z.string().min(1),
  kickoff: z.string().optional().default(""),
  oddsHome: z.number().optional(),
  oddsDraw: z.number().optional(),
  oddsAway: z.number().optional(),
  exactOdds: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
  priorJson: z.string().optional(),
  factsJson: z.string().optional(),
});

let envReady: Promise<void> | null = null;

function withResolvedLeague<T extends { home: string; away: string; league: string; notes?: string }>(data: T): T {
  const hint = [data.league, data.notes].filter((s) => typeof s === "string" && s.trim()).join(" · ");
  return { ...data, league: resolveLeague(data.home, data.away, hint) || data.league };
}

function ensureLocalEnv() {
  if (typeof window !== "undefined") return Promise.resolve();
  if (!envReady) {
    envReady = (async () => {
      try {
        const [{ readFileSync, existsSync }, { resolve }] = await Promise.all([
          import("node:fs"),
          import("node:path"),
        ]);
        const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")];
        for (const file of candidates) {
          if (!existsSync(file)) continue;
          const text = readFileSync(file, "utf8");
          for (const line of text.split("\n")) {
            const t = line.trim();
            if (!t || t.startsWith("#")) continue;
            const i = t.indexOf("=");
            if (i < 1) continue;
            const k = t.slice(0, i).trim();
            let v = t.slice(i + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (k && process.env[k] === undefined) process.env[k] = v;
          }
          break;
        }
      } catch {
        /* ignore — platform already injects XAI_API_KEY */
      }
    })();
  }
  return envReady;
}

function resolveXaiKey(): string | undefined {
  const keys = [
    process.env.XAI_API_KEY,
    process.env.GROK_API_KEY,
    process.env.X_AI_API_KEY,
    process.env.XAI_KEY,
  ];
  for (const k of keys) {
    if (typeof k === "string" && k.trim().length > 8) return k.trim();
  }
  return undefined;
}

type GrokResult =
  | { ok: true; payload: PhasePayload; citations: string[] }
  | { ok: false; error: string };

async function callGrok(
  input: MatchInput,
  phase: 1 | 2,
  priorJson?: string,
  factsJson?: string,
): Promise<GrokResult> {
  await ensureLocalEnv();
  const apiKey = resolveXaiKey();
  if (!apiKey) {
    return { ok: false, error: "Brak XAI_API_KEY na serwerze — silnik i scout nie mogą działać. Ustaw klucz w env App Buildera." };
  }

  const system = systemPrompt(phase);
  const user = userPrompt(input, phase, phase === 2 ? compactPrior(priorJson) : priorJson, factsJson);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        messages,
        temperature: 0.15,
        max_tokens: phase === 2 ? 4000 : 2800,
        response_format: { type: "json_object" },
      }),
      signal: abortAfter(58_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `xAI API ${res.status}${t ? `: ${t.slice(0, 180)}` : ""}` };
    }
    const json = (await res.json()) as unknown;
    const { text, citations } = parseXaiOutput(json);
    if (!text.trim()) return { ok: false, error: "Pusta odpowiedź modelu V26." };
    const parsed = extractJson(text);
    const payload = backfillPayload(normalizePayload(parsed, input.home, input.away), factsJson, input);
    const factSources = extractFactSources(factsJson);
    const allCitations = filterMatchSources(
      [...citations, ...factSources, ...payload.sources],
      input.home,
      input.away,
      input.league,
    ).slice(0, 16);
    return { ok: true, payload, citations: allCitations };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Błąd połączenia z modelem";
    return {
      ok: false,
      error: /abort/i.test(msg) ? "Zapis V26 trwał za długo. Spróbuj ponownie ten mecz." : msg,
    };
  }
}

type FactsResult = { facts: string; citations: string[]; error?: string };

async function gatherFacts(input: MatchInput): Promise<FactsResult> {
  // 1) API-Football (stabilna forma/H2H) — gdy jest klucz
  if (hasApiFootballKey()) {
    const af = await gatherFromApiFootball(input);
    if (af.facts && af.facts.length > 40) {
      return { facts: af.facts, citations: af.citations, error: af.error };
    }
    // jeśli AF padł, dorzucamy błąd i lecimy w web_search
    const web = await scout(input, {
      instructions: factsPrompt(input),
      input: `Zbierz tabelę, formę 8–10 meczów, H2H i xG: ${input.home} vs ${input.away}, liga ${input.league}.`,
      maxTool: 4,
      maxOut: 3500,
      timeout: 55_000,
    });
    if (web.facts && web.facts.length > 40) return web;
    return {
      facts: af.facts || web.facts || "",
      citations: [...(af.citations || []), ...(web.citations || [])],
      error: [af.error, web.error].filter(Boolean).join(" · ") || "Brak faktów z API-Football i web_search",
    };
  }
  return scout(input, {
    instructions: factsPrompt(input),
    input: `Zbierz tabelę, formę 8–10 meczów, H2H i xG: ${input.home} vs ${input.away}, liga ${input.league}.`,
    maxTool: 4,
    maxOut: 3500,
    timeout: 55_000,
  });
}

async function gatherForm(input: MatchInput): Promise<FactsResult> {
  return scout(input, {
    instructions:
      "Wyniki AKTUALNEGO sezonu z Flashscore/Sofascore/FotMob/Transfermarkt. Użyj web_search minimum 2 razy. Wszystkie mecze ligowe ile jest. form[] z scoreFor/scoreAgainst/date/opponent/ha. JSON.",
    input: formPrompt(input),
    maxTool: 5,
    maxOut: 2400,
    timeout: 70_000,
  });
}

async function gatherDetails(input: MatchInput): Promise<FactsResult> {
  return scout(input, {
    instructions:
      "FootyStats / TotalCorner / FotMob / Sofascore. xG, SOT (tylko celne), rożne, kartki. Paywall = null nie 0. web_search. JSON. Zero zgadywania.",
    input: detailsPrompt(input),
    maxTool: 4,
    maxOut: 2200,
    timeout: 40_000,
    retry: false,
  });
}

async function gatherStats(input: MatchInput): Promise<FactsResult> {
  return gatherDetails(input);
}

async function gatherContext(input: MatchInput): Promise<FactsResult> {
  return gatherDetails(input);
}

async function gatherSetPieces(input: MatchInput, factsJson: string): Promise<FactsResult> {
  const p = payloadFromFacts(factsJson || "{}", input);
  const missing = missingSetPieces(p);
  if (!missing.length) return { facts: "{}", citations: [] };
  const raw = await scout(input, {
    instructions:
      sparseBoxLeague(input.league, input.home, input.away)
        ? "API bez boxu (Superettan/OBOS/CFL). SOT+rożne z FotMob/Flashscore/Sofascore, min 2 mecze. TotalCorner tylko rożne. Nie zgaduj. Nie ruszaj goli/formy/kartek/λ."
        : "Tylko luka SOT/rożne/kartki PER KLUB. FotMob/Sofascore=SOT+rożne. TotalCorner=rożne. Paywall=null. Nie zgaduj. Nie ruszaj formy/kursów/xG/strony która już ma liczbę.",
    input: setPiecePrompt(input, missing, missingSetPieceNote(p)),
    maxTool: 4,
    maxOut: 4000,
    timeout: 70_000,
    retry: false,
  });
  if (!raw.facts) return raw;
  try {
    const parsed = JSON.parse(raw.facts) as unknown;
    const { facts, filled } = overlaySetPieces(p, parsed, missing);
    if (!filled.length) return { facts: "{}", citations: raw.citations };
    return { facts: JSON.stringify(facts), citations: raw.citations };
  } catch {
    return { facts: "{}", citations: raw.citations, error: raw.error };
  }
}

async function applySetPieceFallback(
  input: MatchInput,
  factsJson: string,
  cites: string[],
  errors: string[],
): Promise<string> {
  if (/mizoram|lawngtlai|lawtngtlai/i.test(`${input.league} ${input.home} ${input.away}`)) {
    return factsJson;
  }
  let p = payloadFromFacts(factsJson || "{}", input);
  if (!missingSetPieces(p).length) return factsJson;

  if (sparseBoxLeague(input.league, input.home, input.away)) {
    const direct = async (
      job: Promise<{ facts: Record<string, unknown>; filled: string[] } | null>,
    ) =>
      Promise.race([
        job,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 28_000)),
      ]);
    try {
      const [fm, fs] = await Promise.all([
        direct(fetchFotmobSetPieces(input, p)),
        direct(fetchFlashscoreSetPieces(input, p)),
      ]);
      for (const pack of [fm, fs]) {
        if (pack?.facts && pack.filled.length) {
          factsJson = mergeFacts(factsJson, JSON.stringify(pack.facts));
          const src = Array.isArray((pack.facts as { sources?: unknown }).sources)
            ? ((pack.facts as { sources: string[] }).sources[0] as string | undefined)
            : undefined;
          if (src) cites.push(src);
          else cites.push("https://www.fotmob.com/");
          p = payloadFromFacts(factsJson, input);
        }
      }
      if (shouldSkipSetPieceScout(p)) return factsJson;
    } catch {
      /* FotMob/Flashscore nie mogą zatrzymać Fazy 1 */
    }
  }

  const bookie = parseBookieCorners(input.notes || "");
  if (bookie) {
    const home: Record<string, number> = {};
    const away: Record<string, number> = {};
    if (!(p.home.corners > 0)) home.corners = bookie.home;
    if (!(p.away.corners > 0)) away.corners = bookie.away;
    if (home.corners || away.corners) {
      factsJson = mergeFacts(factsJson, JSON.stringify({ home, away }));
      p = payloadFromFacts(factsJson, input);
    }
  }
  if (shouldSkipSetPieceScout(p)) return factsJson;

  try {
    let timedOut = false;
    const sp = await Promise.race([
      gatherSetPieces(input, factsJson),
      new Promise<FactsResult>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve({ facts: "{}", citations: [] });
        }, 80_000),
      ),
    ]);
    if (timedOut) return factsJson;
    if (sp.citations?.length) cites.push(...sp.citations);
    if (sp.error) errors.push(sp.error);
    if (sp.facts && sp.facts !== "{}") return mergeFacts(factsJson, sp.facts);
  } catch {
    /* luka SOT/rożnych nie może zatrzymać Fazy 1 */
  }
  return factsJson;
}

function leftoverNeedsFullGaps(gaps: string[]): boolean {
  return gaps.some((g) => !/rożne|strzały celne|kartek/i.test(g));
}

async function gatherGaps(input: MatchInput, factsJson: string): Promise<FactsResult> {
  const payload = payloadFromFacts(factsJson || "{}", input);
  const gaps = listGaps(payload);
  if (!gaps.length) return { facts: factsJson || "{}", citations: [] };
  const extra = await scout(input, {
    instructions:
      "Uzupełnij TYLKO braki z listy. Paywall = null, nie 0. SOT tylko celne, nie total shots. web_search. JSON.",
    input: gapsPrompt(input, gaps),
    maxTool: 5,
    maxOut: 2400,
    timeout: 70_000,
  });
  if (!extra.facts) return { facts: factsJson || "{}", citations: extra.citations, error: extra.error };
  try {
    const merged = mergeFactBlobs(JSON.parse(factsJson || "{}"), JSON.parse(extra.facts));
    return { facts: JSON.stringify(sanitizeFacts(merged)), citations: extra.citations };
  } catch {
    return { facts: factsJson || "{}", citations: extra.citations, error: extra.error };
  }
}

async function scoutOnce(
  opts: { instructions: string; input: string; maxTool: number; maxOut: number; timeout: number },
  apiKey: string,
): Promise<FactsResult> {
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      instructions: opts.instructions,
      input: opts.input,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      max_tool_calls: opts.maxTool,
      temperature: 0,
      max_output_tokens: opts.maxOut,
    }),
    signal: abortAfter(opts.timeout),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { facts: "", citations: [], error: `scout HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ""}` };
  }
  const json = (await res.json()) as unknown;
  const { text, citations } = parseXaiOutput(json);
  if (!text.trim()) return { facts: "", citations, error: "scout: pusta odpowiedź po web_search" };
  try {
    return { facts: JSON.stringify(sanitizeFacts(extractJson(text))), citations };
  } catch {
    return { facts: text.slice(0, 12000), citations };
  }
}

async function scout(
  input: MatchInput,
  opts: { instructions: string; input: string; maxTool: number; maxOut: number; timeout: number; retry?: boolean },
): Promise<FactsResult> {
  await ensureLocalEnv();
  const apiKey = resolveXaiKey();
  if (!apiKey) {
    return {
      facts: "",
      citations: [],
      error: "Brak XAI_API_KEY — scout nie może pobrać danych z internetu. Ustaw klucz w env serwera.",
    };
  }
  try {
    const first = await scoutOnce(opts, apiKey);
    if (first.facts && first.facts !== "{}" && first.facts.length > 20) return first;
    if (opts.retry === false) return first;
    // Retry once with stricter instruction
    const retry = await scoutOnce(
      {
        ...opts,
        instructions: `${opts.instructions} RETRY: poprzednie wyszukiwanie puste. Szukaj konkretnych URL Flashscore/Sofascore dla obu drużyn.`,
        maxTool: Math.min(opts.maxTool + 1, 6),
        timeout: opts.timeout + 15_000,
      },
      apiKey,
    );
    if (retry.facts && retry.facts.length > 20) return retry;
    return {
      facts: first.facts || retry.facts || "",
      citations: [...first.citations, ...retry.citations],
      error: first.error || retry.error || "scout: brak faktów po 2 próbach",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scout error";
    return {
      facts: "",
      citations: [],
      error: /abort/i.test(msg) ? "scout: timeout — spróbuj ponownie" : msg,
    };
  }
}

function extractFactSources(factsJson?: string): string[] {
  if (!factsJson) return [];
  try {
    const parsed = JSON.parse(factsJson) as { sources?: unknown };
    return Array.isArray(parsed.sources)
      ? parsed.sources.filter((s): s is string => typeof s === "string" && s.startsWith("http")).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function parseXaiOutput(json: unknown): { text: string; citations: string[] } {
  const j = (json ?? {}) as Record<string, unknown>;
  const citations = new Set<string>();

  const pushCite = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//.test(v)) citations.add(v);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string") citations.add(o.url);
      if (typeof o.uri === "string") citations.add(o.uri);
    }
  };

  if (Array.isArray(j.citations)) j.citations.forEach(pushCite);

  if (typeof j.output_text === "string" && j.output_text.trim()) {
    return { text: j.output_text, citations: [...citations] };
  }

  const choiceText = (j.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content;
  if (typeof choiceText === "string" && choiceText.trim()) {
    return { text: choiceText, citations: [...citations] };
  }

  // Some Responses API payloads put final text on `text` / `content` root
  if (typeof j.text === "string" && j.text.trim()) {
    return { text: j.text, citations: [...citations] };
  }
  if (typeof j.content === "string" && j.content.trim()) {
    return { text: j.content, citations: [...citations] };
  }

  const messageTexts: string[] = [];
  const output = Array.isArray(j.output) ? j.output : Array.isArray(j.data) ? (j.data as unknown[]) : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (Array.isArray(it.citations)) it.citations.forEach(pushCite);
    if (Array.isArray(it.sources)) it.sources.forEach(pushCite);
    const action = it.action as Record<string, unknown> | undefined;
    if (action && typeof action.url === "string") citations.add(action.url);
    // tool result payloads sometimes embed JSON as string result
    if (typeof it.result === "string" && it.result.includes("{")) messageTexts.push(it.result);
    if (typeof it.output === "string" && it.output.includes("{")) messageTexts.push(it.output);
    const content = it.content;
    if (typeof content === "string" && (it.type === "message" || it.role === "assistant" || it.type === "output_text")) {
      messageTexts.push(content);
    }
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") parts.push(b.text);
        if (Array.isArray(b.annotations)) b.annotations.forEach(pushCite);
      }
      if (parts.length) messageTexts.push(parts.join("\n"));
    }
  }
  const lastJson = [...messageTexts]
    .reverse()
    .find((t) => t.includes("{") && t.includes("}") && !/"name"\s*:\s*"web_search"/.test(t));
  return { text: lastJson || messageTexts.at(-1) || "", citations: [...citations] };
}

export const runGatherFacts = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherFacts(data);
  });

/** API-Football TYLKO na serwerze (CORS w przeglądarce blokuje api-sports.io). */
export const runGatherApiFootball = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    await ensureLocalEnv();
    return gatherFromApiFootball(withResolvedLeague(data));
  });

export const runGatherForm = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherForm(data);
  });

export const runGatherDetails = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherDetails(data);
  });

export const runGatherStats = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherStats(data);
  });

export const runGatherContext = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherContext(data);
  });

export const runFillGaps = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    return gatherGaps(data, data.factsJson || "");
  });

export const runPhase1 = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const factsJson = data.factsJson || "{}";
    const q = factsQuality(factsJson);
    if (!q.useful) {
      return {
        ok: false as const,
        error: `Faza 1 przerwana — brak formy do K0 (formN=${q.formN}). ${q.reason}`,
      };
    }
    return {
      ok: true as const,
      payload: payloadFromFacts(factsJson, data),
      citations: extractFactSources(factsJson),
    };
  });

export const runPhase2 = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const prior = data.priorJson || data.factsJson || "{}";
    const payload = closeFromPrior(prior, data);
    const stops = hardStops(payload, data);
    if (stops.length) {
      return {
        ok: false as const,
        error: `K12 zablokowane — ${stops.join("; ")}. Dociągnij dane (odśwież K0–K11), dopiero potem lock EPL.`,
      };
    }
    return {
      ok: true as const,
      payload,
      citations: filterMatchSources(extractFactSources(data.factsJson), data.home, data.away, data.league),
    };
  });


function mergeFacts(base: string, extra: string): string {
  if (!extra) return base;
  if (!base) return extra;
  try {
    const left = JSON.parse(base) as unknown;
    let right: unknown;
    try {
      right = JSON.parse(extra);
    } catch {
      return base;
    }
    if (!right || typeof right !== "object") return base;
    return JSON.stringify(sanitizeFacts(mergeFactBlobs(left, right)));
  } catch {
    return base;
  }
}

function priorToFacts(priorJson?: string): string {
  if (!priorJson) return "";
  try {
    const p = JSON.parse(priorJson) as Record<string, unknown>;
    return JSON.stringify({
      home: p.home,
      away: p.away,
      h2h: p.h2h,
      h2hAvgGoals: p.h2hAvgGoals,
      injuries: p.injuries,
      weather: p.weather,
      coach: p.coach,
      odds: p.odds,
      match: p.match,
    });
  } catch {
    return "";
  }
}

/**
 * Cała Faza 1 na SERWERZE: API-Football → detale (xG/SOT/kadra) → luki → payload V26.
 */
export const runPhase1Full = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data: raw }) => {
    await ensureLocalEnv();
    const data = withResolvedLeague(raw);
    const cites: string[] = [];
    const errors: string[] = [];
    let factsJson = "";

    try {
      const af = await gatherFromApiFootball(data);
      if (af.facts) factsJson = af.facts;
      if (af.citations?.length) cites.push(...af.citations);
      if (af.error) errors.push(af.error);
      if (af.error && /nie jest w składzie|nie znaleziono ligi|homonim/i.test(af.error)) {
        return { ok: false as const, error: af.error };
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    const q0 = factsQuality(factsJson);
    if (!q0.useful) {
      try {
        let off = await fetchOffCatalogForm(data);
        if (!off?.facts) off = await fetchOffCatalogForm(data);
        if (off?.facts) {
          factsJson = mergeFacts(factsJson, off.facts);
          if (off.citations.length) cites.push(...off.citations);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const mpl = /mizoram|lawngtlai|lawtngtlai/i.test(`${data.league} ${data.home} ${data.away}`);
    if (!factsQuality(factsJson).useful) {
      if (mpl) {
        return {
          ok: false as const,
          error:
            errors.filter(Boolean).slice(0, 2).join(" · ") ||
            "Mizoram Premier League poza API-Football. The Away End nie zwróciło formy — spróbuj ponownie (bez scouta angielskiej Premier League).",
        };
      }
      try {
        const web = await scout(data, {
          instructions: factsPrompt(data),
          input: `Zbierz tabelę, formę 8–10 meczów, H2H i xG: ${data.home} vs ${data.away}, liga ${data.league}.`,
          maxTool: 4,
          maxOut: 3500,
          timeout: 55_000,
        });
        if (web.facts) factsJson = mergeFacts(factsJson, web.facts);
        if (web.citations?.length) cites.push(...web.citations);
        if (web.error) errors.push(web.error);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const q = factsQuality(factsJson);
    if (!q.useful) {
      return {
        ok: false as const,
        error:
          errors.filter(Boolean).slice(0, 2).join(" · ") ||
          `Brak formy meczowej (formN=${q.formN}). API-Football/scout nie zwróciły meczów.`,
      };
    }

    // API (szybkie) + zapas SOT/rożnych (TotalCorner), bez długiego details/gaps — limit proxy ~125 s.
    factsJson = await applySetPieceFallback(data, factsJson, cites, errors);

    let payload = payloadFromFacts(factsJson, data);
    try {
      const glued = await attachPrevSeasonLive(payload.home, payload.away, data.league);
      payload = { ...payload, home: glued.home, away: glued.away };
      if (glued.log.length) cites.push(...glued.log.filter((l) => l.startsWith("http")));
      payload.sources = [...(payload.sources || []), ...glued.log];
    } catch {
      /* 25.19 live nie może zatrzymać Fazy 1 */
    }

    return {
      ok: true as const,
      payload,
      citations: filterMatchSources([...new Set(cites)], data.home, data.away, data.league),
      factsMeta: factsQuality(factsJson),
    };
  });

/**
 * Dociąga xG / SOT / timing / kadrę / pogodę do już zapisanej analizy (bez resetu fazy).
 */
export const runEnrich = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data: raw }) => {
    await ensureLocalEnv();
    const data = withResolvedLeague(raw);
    const cites: string[] = [];
    const errors: string[] = [];
    let factsJson = priorToFacts(data.priorJson);

    if (!factsQuality(factsJson).useful) {
      try {
        const af = await gatherFromApiFootball(data);
        if (af.facts) factsJson = mergeFacts(factsJson, af.facts);
        if (af.citations?.length) cites.push(...af.citations);
        if (af.error) errors.push(af.error);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    factsJson = await applySetPieceFallback(data, factsJson, cites, errors);

    const probe = payloadFromFacts(factsJson, data);
    const holes = listGaps(probe);
    const hasBox = probe.home.corners > 0 || probe.away.corners > 0 || probe.home.shotsOnTarget > 0 || probe.away.shotsOnTarget > 0;
    const needXg = holes.some((g) => /xG i xGA/i.test(g)) && !hasBox && !sparseBoxLeague(data.league, data.home, data.away);
    if (needXg) {
      try {
        const details = await gatherDetails(data);
        if (details.facts) factsJson = mergeFacts(factsJson, details.facts);
        if (details.citations?.length) cites.push(...details.citations);
        if (details.error) errors.push(details.error);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return {
      ok: true as const,
      payload: payloadFromFacts(factsJson, data),
      citations: [...new Set(cites)],
      factsMeta: factsQuality(factsJson),
      errors,
    };
  });

export const runT60 = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    await ensureLocalEnv();
    let prior: PhasePayload;
    try {
      prior = JSON.parse(data.priorJson || data.factsJson || "{}") as PhasePayload;
    } catch {
      return { ok: false as const, error: "Brak payloadu analizy do T−60." };
    }
    if (!prior?.home || !prior?.away) {
      return { ok: false as const, error: "T−60 wymaga zamkniętego K0–K11." };
    }
    const res = await confirmLineupsT60({
      home: data.home,
      away: data.away,
      league: data.league,
      kickoff: data.kickoff,
      oddsHome: data.oddsHome,
      oddsAway: data.oddsAway,
      favorite: prior.favorite,
      sources: prior.sources,
    });
    if (!res.overlay.xiReady) {
      return {
        ok: false as const,
        error: res.error || "XI jeszcze nieopublikowane. Nie ruszam Conf — spróbuj za chwilę, bliżej kickoff.",
      };
    }
    const payload = applyT60Overlay(prior, res.overlay);
    return {
      ok: true as const,
      payload,
      overlay: res.overlay,
      citations: res.citations,
      error: res.error,
    };
  });

export const checkAi = createServerFn({ method: "GET" }).handler(async () => {
  await ensureLocalEnv();
  return { available: Boolean(resolveXaiKey()) || hasApiFootballKey(), apiFootball: hasApiFootballKey(), xai: Boolean(resolveXaiKey()) };
});

export type { ScanMatchResult } from "./scan";

export const scanMatchScreens = createServerFn({ method: "POST" })
  .handler(async ({ data }): Promise<import("./scan").ScanResponse> => {
    await ensureLocalEnv();
    return runScanScreens(data);
  });
