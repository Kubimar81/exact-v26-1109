import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SavedAnalysis } from "./types";

const IdSchema = z.object({ id: z.string().min(8).max(80) });

export const listArchivedAnalyses = createServerFn({ method: "GET" }).handler(async () => {
  const { listAnalyses } = await import("./archive.server");
  return listAnalyses();
});

export const getArchivedAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data }) => {
    const { readAnalysis } = await import("./archive.server");
    return readAnalysis(data.id);
  });

export const saveArchivedAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => input as SavedAnalysis)
  .handler(async ({ data }) => {
    const { writeAnalysis } = await import("./archive.server");
    return writeAnalysis(data);
  });

export const deleteArchivedAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteAnalysis } = await import("./archive.server");
    return { ok: deleteAnalysis(data.id) };
  });

export const listColdArchivedAnalyses = createServerFn({ method: "GET" }).handler(async () => {
  const { listColdAnalyses } = await import("./archive.server");
  return listColdAnalyses();
});

export const pruneArchivedAnalyses = createServerFn({ method: "POST" }).handler(async () => {
  const { pruneExpired } = await import("./archive.server");
  return { removed: pruneExpired() };
});

export const restoreArchivedAnalysis = createServerFn({ method: "POST" })
  .validator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data }) => {
    const { restoreFromCold } = await import("./archive.server");
    return restoreFromCold(data.id);
  });
