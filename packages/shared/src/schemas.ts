import { z } from "zod";

/**
 * Shared Zod schemas for the MSE timetable app.
 *
 * These are the single contract between `@mse-timetable/data-build` (which
 * produces a GeneratedDataset from the raw source files) and the web app
 * (which consumes it, and validates a user's selection against it). See
 * SPECIFICATION.md §7 for the conceptual data model this implements.
 */

export const SEMESTER_TERMS = ["AUT", "SPR"] as const;
export const SemesterTermSchema = z.enum(SEMESTER_TERMS);
export type SemesterTerm = z.infer<typeof SemesterTermSchema>;

export const MODULE_PREFIXES = ["CM", "FTP", "TSM"] as const;
export const ModulePrefixSchema = z.enum(MODULE_PREFIXES);
export type ModulePrefix = z.infer<typeof ModulePrefixSchema>;

export const PRIORITY_CODES = ["I", "II", "III"] as const;
export const PriorityCodeSchema = z.enum(PRIORITY_CODES);
export type PriorityCode = z.infer<typeof PriorityCodeSchema>;

/** Regular module sessions only ever use Monday-Friday. Saturday/Sunday are
 * included for forward-compatibility with a future academic year whose
 * calendar might place a compensation day on a weekend (see SpecialDate) —
 * not currently used. */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const LOCATION_MODES = ["Zurich", "Winterthur", "online", "FC"] as const;
export const LocationModeSchema = z.enum(LOCATION_MODES);
export type LocationMode = z.infer<typeof LocationModeSchema>;

export const SpecializationProfileSchema = z.object({
  code: z.string(), // e.g. "DS"
  name: z.string(), // e.g. "Data Science"
});
export type SpecializationProfile = z.infer<typeof SpecializationProfileSchema>;

export const ModuleSchema = z.object({
  code: z.string(), // e.g. "FTP_MachLe_A"
  baseCode: z.string(), // e.g. "FTP_MachLe" (code with _A/_B suffix stripped)
  executionVariant: z.string().nullable(), // e.g. "A", "B", or null
  number: z.string(), // kept as string: some are like "59*"
  title: z.string(),
  prefix: ModulePrefixSchema,
  mutuallyExclusiveGroup: z.string().nullable(), // e.g. "59*" for 59*/95* pairs
});
export type Module = z.infer<typeof ModuleSchema>;

export const ModuleOfferingSchema = z.object({
  moduleCode: z.string(),
  semester: SemesterTermSchema, // AUT or SPR
  location: LocationModeSchema,
  weekday: WeekdaySchema,
  timeslotLabel: z.string(), // human-readable generic slot from the catalog sheet
  isFlippedClassroom: z.boolean(),
  priorities: z.record(z.string(), PriorityCodeSchema.nullable()), // profile code -> priority
});
export type ModuleOffering = z.infer<typeof ModuleOfferingSchema>;

export const SessionSegmentSchema = z.object({
  start: z.string(), // "HH:MM"
  end: z.string(),
});
export type SessionSegment = z.infer<typeof SessionSegmentSchema>;

export const LESSON_TYPES_HINT = ["lecture", "tutorial"] as const; // lessonType is free-form ("tutorial 1", "tutorial 2", ...) but usually starts with one of these

// Straight from the timetable workbook's own "time-of-day" column — not
// derived from start/end times, so it stays faithful to the school's own
// bucketing (used for the official-tool-style week view; see CLAUDE.md).
export const TIME_OF_DAY_VALUES = ["morning", "afternoon", "evening"] as const;
export const TimeOfDaySchema = z.enum(TIME_OF_DAY_VALUES);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const SessionSchema = z.object({
  moduleCode: z.string(),
  semester: z.string(), // semester *key*, e.g. "AUT26-27" (not just the term) to stay unambiguous across academic years
  date: z.string(), // "YYYY-MM-DD"
  weekday: WeekdaySchema,
  lessonType: z.string(), // "lecture", "tutorial 1", "tutorial 2", ...
  timeOfDay: TimeOfDaySchema,
  segments: z.array(SessionSegmentSchema).min(1),
  start: z.string(), // earliest segment start, "HH:MM" — convenience for calendar rendering
  end: z.string(), // latest segment end, "HH:MM"
  mode: z.enum(["on-site", "online"]),
  venue: z.string(),
  room: z.string(),
  isRoomException: z.boolean(), // true if this date used the override venue/room
  isCompensation: z.boolean(), // true if this occurrence was added for a compensation day (see SpecialDate)
});
export type Session = z.infer<typeof SessionSchema>;

export const WEEK_TAGS = [
  "teaching",
  "holiday",
  "lecture-free",
  "partial-holiday",
  "exam-regular",
  "exam-resit",
  "viewing-session",
  "semester-start",
  "compensation-day",
] as const;
export const WeekTagSchema = z.enum(WEEK_TAGS);
export type WeekTag = z.infer<typeof WeekTagSchema>;

export const CalendarWeekSchema = z.object({
  weekNumber: z.number(),
  weekStart: z.string(), // "YYYY-MM-DD", Monday
  weekEnd: z.string(), // "YYYY-MM-DD", Friday
  semester: z.string(), // e.g. "AUT26-27" | "SPR27" (semester *key*, not just term)
  tags: z.array(WeekTagSchema).min(1),
  comment: z.string(),
  studentNote: z.string(),
});
export type CalendarWeek = z.infer<typeof CalendarWeekSchema>;

export const SpecialDateSchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  weekday: z.string(),
  type: z.enum(["holiday", "compensation"]),
  description: z.string(),
  relatedDate: z.string().nullable(),
});
export type SpecialDate = z.infer<typeof SpecialDateSchema>;

export const SemesterInfoSchema = z.object({
  key: z.string(), // e.g. "AUT26-27"
  label: z.string(),
  start: z.string(),
  end: z.string(),
});
export type SemesterInfo = z.infer<typeof SemesterInfoSchema>;

/** The single static dataset produced by the data build and shipped with the app. */
export const GeneratedDatasetSchema = z.object({
  academicYear: z.string(), // e.g. "AY26-27"
  generatedAt: z.string(),
  semesters: z.array(SemesterInfoSchema),
  profiles: z.array(SpecializationProfileSchema),
  modules: z.array(ModuleSchema),
  offerings: z.array(ModuleOfferingSchema),
  sessions: z.array(SessionSchema),
  calendarWeeks: z.array(CalendarWeekSchema),
  specialDates: z.array(SpecialDateSchema),
});
export type GeneratedDataset = z.infer<typeof GeneratedDatasetSchema>;

/**
 * Shape of the per-user selection stored in Clerk's `unsafeMetadata`
 * (see SPECIFICATION.md §7 — this is the app's only persisted, per-user
 * state, and it lives on the auth provider, not in any app-owned storage).
 */
export const SelectedModulesSchema = z.record(z.string(), z.array(z.string()));
export type SelectedModules = z.infer<typeof SelectedModulesSchema>;
