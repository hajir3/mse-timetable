import { readdir } from "node:fs/promises";
import path from "node:path";
import { GeneratedDatasetSchema, type GeneratedDataset, type Session } from "@mse-timetable/shared";
import { parseCatalog } from "./parseCatalog";
import { parseTimetable } from "./parseTimetable";
import { parseCalendar } from "./parseCalendar";
import { materializeSessions } from "./materialize";

/**
 * Builds the static GeneratedDataset from everything under `dataDir`
 * (expects one `*_filter_function.xlsx` catalog workbook, one
 * `academic-calendar.json`, and one or more `*published*.xlsx` semester
 * timetable workbooks — see SPECIFICATION.md §5). Fails loudly (throws) on
 * anomalies rather than silently shipping bad data (FR4).
 */
export async function buildDataset(dataDir: string): Promise<GeneratedDataset> {
  const files = await readdir(dataDir);

  const catalogFile = files.find((f) => f.endsWith("_filter_function.xlsx"));
  if (!catalogFile) {
    throw new Error(`${dataDir}: no *_filter_function.xlsx catalog workbook found`);
  }
  const calendarFile = files.find((f) => f === "academic-calendar.json");
  if (!calendarFile) {
    throw new Error(`${dataDir}: no academic-calendar.json found`);
  }
  const timetableFiles = files.filter((f) => f.endsWith(".xlsx") && /published/i.test(f));
  if (timetableFiles.length === 0) {
    throw new Error(`${dataDir}: no *published*.xlsx semester timetable workbook(s) found`);
  }

  const { profiles, modules, offerings } = await parseCatalog(path.join(dataDir, catalogFile));
  const { academicYear, semesters, weeks, specialDates } = await parseCalendar(path.join(dataDir, calendarFile));

  const moduleCodes = new Set(modules.map((m) => m.code));
  const allSessions: Session[] = [];

  for (const timetableFile of timetableFiles) {
    const semesterKey = timetableFile.split("_")[0]; // e.g. "AUT26-27" from "AUT26-27_timetable_..."
    if (!semesters.some((s) => s.key === semesterKey)) {
      throw new Error(
        `Timetable file "${timetableFile}": derived semester key "${semesterKey}" isn't one of the semesters in academic-calendar.json (${semesters.map((s) => s.key).join(", ")})`,
      );
    }

    const templates = await parseTimetable(path.join(dataDir, timetableFile), semesterKey);

    for (const t of templates) {
      if (!moduleCodes.has(t.moduleCode)) {
        throw new Error(
          `Timetable file "${timetableFile}": module code "${t.moduleCode}" doesn't exist in the catalog workbook (${catalogFile})`,
        );
      }
      if (t.exception) {
        for (const exceptionDate of t.exception.dates) {
          const week = weeks.find((w) => exceptionDate >= w.weekStart && exceptionDate <= w.weekEnd);
          if (!week || week.semester !== semesterKey) {
            console.warn(
              `[data-build] warning: "${t.moduleCode}" (${timetableFile}) has a room-change exception date ${exceptionDate} that falls outside semester ${semesterKey}'s weeks — double check this date.`,
            );
          }
        }
      }
    }

    allSessions.push(...materializeSessions(templates, semesterKey, weeks, specialDates));
  }

  const dataset: GeneratedDataset = {
    academicYear,
    generatedAt: new Date().toISOString(),
    semesters,
    profiles,
    modules,
    offerings,
    sessions: allSessions,
    calendarWeeks: weeks,
    specialDates,
  };

  return GeneratedDatasetSchema.parse(dataset);
}
