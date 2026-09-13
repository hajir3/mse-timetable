"use client";

import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type Event as RBCEvent, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { dataset } from "@/lib/dataset";
import { useSelectedModules } from "@/lib/selection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

// Weeks tagged with one of these get a whole-week banner (FR15). Others
// (teaching, semester-start, partial-holiday, compensation-day) are either
// fully normal or already covered precisely by a single-day specialDate
// entry instead — see SPECIFICATION.md §8.1 / CLAUDE.md.
const BANNER_TAGS = new Set(["holiday", "lecture-free", "exam-regular", "exam-resit", "viewing-session"]);

interface CalEvent extends RBCEvent {
  kind: "session" | "week-banner" | "special-date";
}

const EVENT_COLORS: Record<CalEvent["kind"], string> = {
  session: "#2563eb",
  "week-banner": "#6b7280",
  "special-date": "#d97706",
};

// 24h time everywhere, no AM/PM (uses the localizer's own date-fns format).
const FORMATS = {
  timeGutterFormat: "HH:mm",
  eventTimeRangeFormat: (
    { start, end }: { start: Date; end: Date },
    culture?: string,
    loc?: { format: (d: Date, f: string, c?: string) => string },
  ) => `${loc?.format(start, "HH:mm", culture)}–${loc?.format(end, "HH:mm", culture)}`,
};

// The week/day time grid is trimmed to the earliest start / latest end across
// every session in the dataset (not just the user's own selection, so the
// range doesn't jump around as their selection changes), rounded out to the
// nearest hour.
function computeTimeBounds() {
  let minMinutes = Infinity;
  let maxMinutes = -Infinity;
  for (const s of dataset.sessions) {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    minMinutes = Math.min(minMinutes, sh * 60 + sm);
    maxMinutes = Math.max(maxMinutes, eh * 60 + em);
  }
  if (!Number.isFinite(minMinutes)) {
    minMinutes = 8 * 60;
    maxMinutes = 18 * 60;
  }
  const minHour = Math.floor(minMinutes / 60);
  const maxHour = Math.ceil(maxMinutes / 60);
  return { min: new Date(0, 0, 0, minHour, 0), max: new Date(0, 0, 0, maxHour, 0) };
}
const TIME_BOUNDS = computeTimeBounds();

function getInitialSemesterKey(): string {
  const now = new Date().toISOString().slice(0, 10);
  const current = dataset.semesters.find((s) => now >= s.start && now <= s.end);
  return (current ?? dataset.semesters[0]).key;
}

export function CalendarView() {
  const { selectedModules } = useSelectedModules();
  const [semesterKey, setSemesterKey] = useState(getInitialSemesterKey);
  const semester = dataset.semesters.find((s) => s.key === semesterKey) ?? dataset.semesters[0];

  // react-big-calendar's own uncontrolled view/date state (defaultView /
  // defaultDate) doesn't reliably update in this React 19 / Next.js 16 dev
  // setup — the Toolbar's Month/Week/Day and Back/Next clicks silently no-op.
  // Controlling both explicitly sidesteps that entirely.
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(() => parseISO(semester.start));
  const [dateInitializedFor, setDateInitializedFor] = useState(semesterKey);
  if (dateInitializedFor !== semesterKey) {
    setDateInitializedFor(semesterKey);
    setDate(parseISO(semester.start));
  }

  const events = useMemo<CalEvent[]>(() => {
    const selected = new Set(selectedModules[semesterKey] ?? []);
    const out: CalEvent[] = [];

    for (const s of dataset.sessions) {
      if (s.semester !== semesterKey || !selected.has(s.moduleCode)) continue
      out.push({
        kind: "session",
        title: `${s.moduleCode} — ${s.lessonType}${s.isRoomException ? " (room change)" : ""}`,
        start: parse(`${s.date} ${s.start}`, "yyyy-MM-dd HH:mm", new Date()),
        end: parse(`${s.date} ${s.end}`, "yyyy-MM-dd HH:mm", new Date()),
        resource: s,
      });
    }

    for (const w of dataset.calendarWeeks) {
      if (w.semester !== semesterKey) continue;
      const tag = w.tags.find((t) => BANNER_TAGS.has(t));
      if (!tag) continue;
      out.push({
        kind: "week-banner",
        title: w.comment || w.studentNote || tag,
        start: parseISO(w.weekStart),
        end: addDays(parseISO(w.weekEnd), 1),
        allDay: true,
        resource: w,
      });
    }

    for (const d of dataset.specialDates) {
      if (d.date < semester.start || d.date > semester.end) continue;
      out.push({
        kind: "special-date",
        title: d.description,
        start: parseISO(d.date),
        end: addDays(parseISO(d.date), 1),
        allDay: true,
        resource: d,
      });
    }

    return out;
  }, [semesterKey, selectedModules, semester]);

  return (
    <div className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
      <Tabs value={semesterKey} onValueChange={(v) => setSemesterKey(v as string)}>
        <TabsList>
          {dataset.semesters.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="rounded-md border bg-background p-2">
        <Calendar
          localizer={localizer}
          events={events}
          // "work_week" (Mon-Fri only) instead of "week" (Mon-Sun) — no
          // module ever meets on a weekend in this data, and unlike month
          // view, react-big-calendar's work_week is a first-class 5-day
          // view rather than something that has to be faked with CSS.
          views={["month", "work_week", "day"]}
          messages={{ work_week: "Week" }}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          min={TIME_BOUNDS.min}
          max={TIME_BOUNDS.max}
          formats={FORMATS}
          // A percentage height here can collapse to ~0 depending on how
          // many flex layers are above it (a well-known react-big-calendar
          // gotcha) — an explicit viewport-relative height sidesteps that.
          style={{ height: "calc(100vh - 220px)" }}
          eventPropGetter={(event) => ({
            style: { backgroundColor: EVENT_COLORS[(event as CalEvent).kind] },
          })}
        />
      </div>
    </div>
  );
}
