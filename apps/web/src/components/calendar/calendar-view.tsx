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

function getInitialSemesterKey(): string {
  const now = new Date().toISOString().slice(0, 10);
  const current = dataset.semesters.find((s) => now >= s.start && now <= s.end);
  return (current ?? dataset.semesters[0]).key;
}

export function CalendarView() {
  const { selectedModules } = useSelectedModules();
  const [semesterKey, setSemesterKey] = useState(getInitialSemesterKey);
  const modulesByCode = useMemo(() => new Map(dataset.modules.map((m) => [m.code, m])), []);
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
      const mod = modulesByCode.get(s.moduleCode);
      out.push({
        kind: "session",
        title: `${mod?.title ?? s.moduleCode} — ${s.lessonType}${s.isRoomException ? " (room change)" : ""}`,
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
  }, [semesterKey, selectedModules, modulesByCode, semester]);

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
          views={["month", "week", "day"]}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
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
