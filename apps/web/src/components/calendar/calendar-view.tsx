"use client";

import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type Event as RBCEvent, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, addMonths, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { dataset } from "@/lib/dataset";
import { hexForModuleCode } from "@/lib/module-colors";
import { useSelectedModules } from "@/lib/selection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeekBucketView } from "./week-bucket-view";
import { MonthGridView } from "./month-grid-view";

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
  moduleCode?: string;
}

// 24h time everywhere, no AM/PM (uses the localizer's own date-fns format).
const FORMATS = {
  timeGutterFormat: "HH:mm",
  eventTimeRangeFormat: (
    { start, end }: { start: Date; end: Date },
    culture?: string,
    loc?: { format: (d: Date, f: string, c?: string) => string },
  ) => `${loc?.format(start, "HH:mm", culture)}–${loc?.format(end, "HH:mm", culture)}`,
};

// The day time grid is trimmed to the earliest start / latest end across
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
  const selectedCodes = useMemo(() => new Set(selectedModules[semesterKey] ?? []), [selectedModules, semesterKey]);

  // Month and Week are custom-built grids (see month-grid-view.tsx /
  // week-bucket-view.tsx) — react-big-calendar only renders Day view now,
  // where a real time-proportional grid genuinely earns its keep (several
  // lecture/tutorial parts with real overlapping times).
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState<Date>(() => parseISO(semester.start));
  const [dateInitializedFor, setDateInitializedFor] = useState(semesterKey);
  if (dateInitializedFor !== semesterKey) {
    setDateInitializedFor(semesterKey);
    setDate(parseISO(semester.start));
  }

  // Only used by Day view — full per-lesson-type breakdown, plus
  // holiday/exam-week banners and single-day special-date markers.
  const dayEvents = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];

    for (const s of dataset.sessions) {
      if (s.semester !== semesterKey || !selectedCodes.has(s.moduleCode)) continue;
      out.push({
        kind: "session",
        moduleCode: s.moduleCode,
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
  }, [semesterKey, selectedCodes, semester]);

  const title =
    view === "month"
      ? format(date, "MMMM yyyy")
      : view === "day"
        ? format(date, "EEEE, MMMM d, yyyy")
        : `${format(startOfWeek(date, { weekStartsOn: 1 }), "MMM d")} – ${format(addDays(startOfWeek(date, { weekStartsOn: 1 }), 4), "MMM d, yyyy")}`;

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

      {/* One shared toolbar drives all three views — react-big-calendar's
          own Toolbar is suppressed (`toolbar={false}` below) since Month and
          Week aren't <Calendar> at all anymore. */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDate(view === "month" ? addMonths(date, -1) : addDays(date, view === "day" ? -1 : -7))
            }
          >
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(view === "month" ? addMonths(date, 1) : addDays(date, view === "day" ? 1 : 7))}
          >
            Next
          </Button>
        </div>
        <p className="text-sm font-medium">{title}</p>
        <div className="flex gap-1 rounded-md bg-muted p-0.5">
          {(["month", "work_week", "day"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "work_week" ? "Week" : v === "month" ? "Month" : "Day"}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && <MonthGridView semesterKey={semesterKey} date={date} selectedCodes={selectedCodes} />}
      {view === "work_week" && (
        <WeekBucketView semesterKey={semesterKey} date={date} selectedCodes={selectedCodes} />
      )}
      {view === "day" && (
        <div className="rounded-md border bg-background p-2">
          <Calendar
            localizer={localizer}
            events={dayEvents}
            views={["day"]}
            toolbar={false}
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
            style={{ height: "calc(100vh - 260px)" }}
            eventPropGetter={(event) => {
              // Inline style, not a Tailwind className: react-big-calendar's
              // own .rbc-event rule has equal selector specificity and wins
              // on stylesheet order, so only a real inline color reliably
              // overrides it (confirmed — a className attempt here didn't
              // take effect).
              const e = event as CalEvent;
              if (e.kind === "session" && e.moduleCode) {
                return { style: { backgroundColor: hexForModuleCode(e.moduleCode) } };
              }
              if (e.kind === "special-date") return { style: { backgroundColor: "#f59e0b" } };
              return { style: { backgroundColor: "#64748b" } };
            }}
          />
        </div>
      )}
    </div>
  );
}
