import type { Session, TimeOfDay } from "@mse-timetable/shared";

/**
 * One merged block per module per day per time-of-day bucket — a lecture
 * and its tutorial(s) on the same day collapse into a single widened
 * start/end span. Shared by the week view (renders one card per block) and
 * the calendar export (one VEVENT per block) so both agree on what "a
 * course block" is.
 */
export interface AggregatedCard {
  date: string;
  timeOfDay: TimeOfDay;
  moduleCode: string;
  hasRoomException: boolean;
  start: string;
  end: string;
  room: string;
  mode: "on-site" | "online";
}

export function aggregateByDayAndBucket(sessions: Session[]): Map<string, AggregatedCard> {
  const byKey = new Map<string, AggregatedCard>();
  for (const s of sessions) {
    const key = `${s.date}|${s.timeOfDay}|${s.moduleCode}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.hasRoomException = existing.hasRoomException || s.isRoomException;
      if (s.start < existing.start) existing.start = s.start;
      if (s.end > existing.end) existing.end = s.end;
    } else {
      byKey.set(key, {
        date: s.date,
        timeOfDay: s.timeOfDay,
        moduleCode: s.moduleCode,
        hasRoomException: s.isRoomException,
        start: s.start,
        end: s.end,
        room: s.room,
        mode: s.mode,
      });
    }
  }
  return byKey;
}
