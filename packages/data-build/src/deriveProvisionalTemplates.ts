import type { ModuleOffering, SemesterTerm, TimeOfDay } from "@mse-timetable/shared";
import type { SessionTemplate } from "./parseTimetable";

/**
 * When the school hasn't published a semester's real per-session timetable
 * workbook yet, approximates one weekly session per module straight from
 * the catalog workbook's own generic weekday + timeslot label (see
 * SPECIFICATION.md §8.11) — the same rows the catalog page already lists,
 * just turned into SessionTemplates so materializeSessions can expand them
 * across the semester's teaching weeks like any other template.
 *
 * Necessarily coarser than a real published timetable: one block per
 * module (no lecture/tutorial split), no room number, and no room-change
 * exceptions. The catalog's timeslot label has a form like "17:10 to
 * 19:45; possibly until 20:40" — the trailing "possibly until" clause means
 * a later sub-slot (e.g. a second tutorial) sometimes runs. We take the
 * *widest* span (first time to last time in the label) rather than the
 * "guaranteed" one, so a provisional block errs toward reserving too much
 * of the user's time rather than too little — the honest failure mode for
 * a placeholder that's later replaced by real per-session data.
 */

const TIME_RE = /\d{1,2}:\d{2}/g;

function timeOfDayFor(start: string): TimeOfDay {
  if (start < "12:00") return "morning";
  if (start < "17:00") return "afternoon";
  return "evening";
}

export function deriveProvisionalTemplates(offerings: ModuleOffering[], term: SemesterTerm): SessionTemplate[] {
  return offerings
    .filter((o) => o.semester === term)
    .map((o) => {
      const times = o.timeslotLabel.match(TIME_RE);
      if (!times || times.length < 2) {
        throw new Error(
          `Catalog offering "${o.moduleCode}" (${term}): couldn't parse a start/end time out of timeslot label "${o.timeslotLabel}"`,
        );
      }
      const start = times[0].padStart(5, "0");
      const end = times[times.length - 1].padStart(5, "0");
      const mode = o.location === "online" ? "online" : "on-site";

      return {
        moduleCode: o.moduleCode,
        weekday: o.weekday,
        lessonType: "class",
        timeOfDay: timeOfDayFor(start),
        segments: [{ start, end }],
        start,
        end,
        mode,
        venue: mode === "online" ? "" : o.location,
        room: mode === "online" ? "" : "Room TBD",
        exception: null,
        isProvisional: true,
      };
    });
}
