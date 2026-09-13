import { addDays, format, parseISO } from "date-fns";
import type { CalendarWeek, Session, SpecialDate, Weekday } from "@mse-timetable/shared";
import type { SessionTemplate } from "./parseTimetable";

/**
 * Expands weekly-recurring SessionTemplates into concrete Session rows for
 * one semester — see SPECIFICATION.md §8.1 for why this happens at build
 * time instead of via an RRULE-style read-time expansion.
 *
 * Rules:
 * - Weeks tagged holiday / lecture-free / exam-regular / exam-resit produce
 *   no sessions at all that week (no regular lectures happen).
 * - Every other week (teaching, semester-start, viewing-session,
 *   partial-holiday, compensation-day) generates the normal Monday-Friday
 *   grid — a week being flagged as "compensation-day" doesn't need special
 *   handling here, because the compensation date is just an ordinary
 *   Monday within a normal week; it's flagged purely for the UI to explain
 *   *why* that particular day exists to the user (see isCompensation below).
 * - A specialDate of type "holiday" cancels just that one date, regardless
 *   of the week's own tag (this is how single-day holidays like Ascension
 *   Day or Pentecost Monday are modeled without cancelling their whole week).
 * - A specialDate of type "compensation" doesn't change generation — it
 *   only sets `isCompensation: true` on whichever session(s) land on that
 *   date, so the UI can explain the day's significance.
 */

const SKIP_WEEK_TAGS = new Set(["holiday", "lecture-free", "exam-regular", "exam-resit"]);
const WEEKDAY_OFFSETS: Weekday[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function materializeSessions(
  templates: SessionTemplate[],
  semesterKey: string,
  calendarWeeks: CalendarWeek[],
  specialDates: SpecialDate[],
): Session[] {
  const weeks = calendarWeeks.filter((w) => w.semester === semesterKey);
  const holidayDates = new Map(specialDates.filter((d) => d.type === "holiday").map((d) => [d.date, d]));
  const compensationDates = new Set(specialDates.filter((d) => d.type === "compensation").map((d) => d.date));

  const templatesByWeekday = new Map<Weekday, SessionTemplate[]>();
  for (const t of templates) {
    const list = templatesByWeekday.get(t.weekday) ?? [];
    list.push(t);
    templatesByWeekday.set(t.weekday, list);
  }

  const sessions: Session[] = [];

  for (const week of weeks) {
    if (week.tags.some((tag) => SKIP_WEEK_TAGS.has(tag))) continue;

    WEEKDAY_OFFSETS.forEach((weekday, offset) => {
      const date = format(addDays(parseISO(week.weekStart), offset), "yyyy-MM-dd");
      if (holidayDates.has(date)) return; // single-day cancellation

      const dayTemplates = templatesByWeekday.get(weekday) ?? [];
      for (const t of dayTemplates) {
        const isRoomException = t.exception?.dates.includes(date) ?? false;
        sessions.push({
          moduleCode: t.moduleCode,
          semester: semesterKey,
          date,
          weekday,
          lessonType: t.lessonType,
          segments: t.segments,
          start: t.start,
          end: t.end,
          mode: t.mode,
          venue: isRoomException ? t.exception!.venue : t.venue,
          room: isRoomException ? t.exception!.room : t.room,
          isRoomException,
          isCompensation: compensationDates.has(date),
        });
      }
    });
  }

  return sessions.sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}
