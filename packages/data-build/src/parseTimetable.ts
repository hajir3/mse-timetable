import ExcelJS from "exceljs";
import { format } from "date-fns";
import { TIME_OF_DAY_VALUES, WEEKDAYS, type SessionSegment, type TimeOfDay, type Weekday } from "@mse-timetable/shared";

/**
 * Parses a semester timetable workbook (`*_timetable_MSE_Reg-D_v9_published.xlsx`).
 *
 * Each data row is one weekly-recurring session block (see SPECIFICATION.md
 * §5.2): location, weekday, module number/code, lesson type, time slot,
 * mode, default venue/room, and an optional room-change exception (one or
 * more dates + an override venue/room shared across all of them).
 *
 * Column layout is fixed and hand-verified against the source file; the
 * header row is located dynamically (by matching the "module code" column
 * header) so a one-row shift between file versions doesn't break parsing,
 * but the column *positions* themselves are assumed stable.
 */

const COLS = {
  location: 2,
  weekday: 3,
  moduleNumber: 4,
  moduleCode: 5,
  lessonType: 6,
  timeSlot: 7,
  timeOfDay: 8,
  mode: 9,
  venueDefault: 10,
  roomDefault: 11,
  exceptionDates: 12,
  venueException: 13,
  roomException: 14,
} as const;

const TIME_PAIR_RE = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;

export interface SessionException {
  dates: string[]; // ISO "YYYY-MM-DD"
  venue: string;
  room: string;
}

export interface SessionTemplate {
  moduleCode: string;
  weekday: Weekday;
  lessonType: string;
  timeOfDay: TimeOfDay;
  segments: SessionSegment[];
  start: string;
  end: string;
  mode: "on-site" | "online";
  venue: string;
  room: string;
  exception: SessionException | null;
  isProvisional: boolean;
}

function parseSegments(timeSlot: string, context: string): SessionSegment[] {
  const matches = [...timeSlot.matchAll(TIME_PAIR_RE)];
  if (matches.length === 0) {
    throw new Error(`${context}: couldn't parse any HH:MM-HH:MM pair out of time slot "${timeSlot}"`);
  }
  return matches.map((m) => ({ start: m[1].padStart(5, "0"), end: m[2].padStart(5, "0") }));
}

function parseDotDate(text: string, context: string): string {
  const m = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) {
    throw new Error(`${context}: couldn't parse date "${text}" (expected dd.mm.yyyy)`);
  }
  const [, day, month, year] = m;
  return `${year}-${month}-${day}`;
}

function parseExceptionDates(cellValue: unknown, context: string): string[] {
  if (cellValue == null || cellValue === "") return [];
  if (cellValue instanceof Date) {
    return [format(cellValue, "yyyy-MM-dd")];
  }
  const text = String(cellValue);
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseDotDate(s, context));
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  for (let rowNum = 1; rowNum <= sheet.rowCount; rowNum++) {
    const cellText = sheet.getRow(rowNum).getCell(COLS.moduleCode).text.trim().toLowerCase();
    if (cellText === "module code") return rowNum;
  }
  throw new Error(`Timetable sheet "${sheet.name}": couldn't find header row (no "module code" column found)`);
}

export async function parseTimetable(filePath: string, sheetName: string): Promise<SessionTemplate[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Timetable workbook ${filePath}: no sheet named "${sheetName}" found`);
  }

  const headerRow = findHeaderRow(sheet);
  const templates: SessionTemplate[] = [];

  for (let rowNum = headerRow + 1; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const moduleCode = row.getCell(COLS.moduleCode).text.trim();
    if (!moduleCode) continue;

    const context = `Timetable row ${rowNum} (${moduleCode})`;
    const weekdayText = row.getCell(COLS.weekday).text.trim();
    if (!(WEEKDAYS as readonly string[]).includes(weekdayText)) {
      throw new Error(`${context}: unexpected weekday "${weekdayText}"`);
    }
    const weekday = weekdayText as Weekday;

    const lessonType = row.getCell(COLS.lessonType).text.trim();
    const segments = parseSegments(row.getCell(COLS.timeSlot).text.trim(), context);
    const start = segments.reduce((a, b) => (a < b.start ? a : b.start), segments[0].start);
    const end = segments.reduce((a, b) => (a > b.end ? a : b.end), segments[0].end);

    const timeOfDayText = row.getCell(COLS.timeOfDay).text.trim().toLowerCase();
    if (!(TIME_OF_DAY_VALUES as readonly string[]).includes(timeOfDayText)) {
      throw new Error(
        `${context}: unexpected time-of-day "${timeOfDayText}" (expected one of ${TIME_OF_DAY_VALUES.join(", ")})`,
      );
    }
    const timeOfDay = timeOfDayText as TimeOfDay;

    const modeText = row.getCell(COLS.mode).text.trim();
    const mode = modeText === "Lecture on-site" ? "on-site" : modeText === "Lecture online" ? "online" : null;
    if (!mode) {
      throw new Error(`${context}: unexpected mode "${modeText}" (expected "Lecture on-site" or "Lecture online")`);
    }

    const venue = row.getCell(COLS.venueDefault).text.trim();
    const room = row.getCell(COLS.roomDefault).text.trim();

    const exceptionDates = parseExceptionDates(row.getCell(COLS.exceptionDates).value, context);
    const exception: SessionException | null =
      exceptionDates.length > 0
        ? {
            dates: exceptionDates,
            venue: row.getCell(COLS.venueException).text.trim(),
            room: row.getCell(COLS.roomException).text.trim(),
          }
        : null;

    templates.push({
      moduleCode,
      weekday,
      lessonType,
      timeOfDay,
      segments,
      start,
      end,
      mode,
      venue,
      room,
      exception,
      isProvisional: false,
    });
  }

  return templates;
}
