import { readFile } from "node:fs/promises";
import {
  CalendarWeekSchema,
  SpecialDateSchema,
  type CalendarWeek,
  type SemesterInfo,
  type SpecialDate,
} from "@mse-timetable/shared";
import { z } from "zod";

/**
 * Reads the hand-maintained academic-calendar.json (re-keyed once a year
 * from the school's PDF — see SPECIFICATION.md §8.3) and validates it.
 */

const RawCalendarSchema = z.object({
  academicYear: z.string(),
  region: z.string(),
  source: z.string(),
  semesters: z.record(z.string(), z.object({ label: z.string(), start: z.string(), end: z.string() })),
  weeks: z.array(CalendarWeekSchema),
  specialDates: z.array(SpecialDateSchema),
  legend: z.record(z.string(), z.string()),
});

export interface CalendarResult {
  academicYear: string;
  semesters: SemesterInfo[];
  weeks: CalendarWeek[];
  specialDates: SpecialDate[];
}

export async function parseCalendar(filePath: string): Promise<CalendarResult> {
  const raw = JSON.parse(await readFile(filePath, "utf-8"));
  const parsed = RawCalendarSchema.parse(raw);

  const semesters: SemesterInfo[] = Object.entries(parsed.semesters).map(([key, info]) => ({
    key,
    ...info,
  }));

  return {
    academicYear: parsed.academicYear,
    semesters,
    weeks: parsed.weeks,
    specialDates: parsed.specialDates,
  };
}
