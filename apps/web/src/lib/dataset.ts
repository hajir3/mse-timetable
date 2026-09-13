import raw from "@/data/generated/AY26-27.json";
import { GeneratedDatasetSchema, type GeneratedDataset } from "@mse-timetable/shared";

/**
 * The static dataset produced by `packages/data-build` at build time (see
 * CLAUDE.md — "The data-update workflow"). Re-validating it at import time
 * is cheap at this size and catches a stale/corrupt generated file early.
 */
export const dataset: GeneratedDataset = GeneratedDatasetSchema.parse(raw);

export function termForSemesterKey(semesterKey: string): "AUT" | "SPR" {
  return semesterKey.startsWith("AUT") ? "AUT" : "SPR";
}

/** Picks the semester whose date range contains `now`, else the next
 * upcoming one, else the last one in the dataset. */
export function getDefaultSemesterKey(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const current = dataset.semesters.find((s) => iso >= s.start && iso <= s.end);
  if (current) return current.key;
  const upcoming = dataset.semesters
    .filter((s) => s.start > iso)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (upcoming) return upcoming.key;
  return dataset.semesters[dataset.semesters.length - 1].key;
}
