"use client";

import { useMemo, useState } from "react";
import { format, startOfWeek, addDays, addMonths, parseISO } from "date-fns";
import { dataset } from "@/lib/dataset";
import { useSelectedModules } from "@/lib/selection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekBucketView } from "./week-bucket-view";
import { MonthGridView } from "./month-grid-view";
import { DayAgendaView } from "./day-agenda-view";
import { SubscribeCalendarButton } from "./subscribe-calendar-button";

// Month, Week, and Day are all custom-built views (see month-grid-view.tsx,
// week-bucket-view.tsx, day-agenda-view.tsx) — nothing here depends on
// react-big-calendar any more. See CLAUDE.md for why each one is custom.
type ViewMode = "month" | "work_week" | "day";

function getInitialSemesterKey(): string {
  const now = new Date().toISOString().slice(0, 10);
  const current = dataset.semesters.find((s) => now >= s.start && now <= s.end);
  return (current ?? dataset.semesters[0]).key;
}

export function CalendarView({ subscribeUrl }: { subscribeUrl: string | null }) {
  const { selectedModules } = useSelectedModules();
  const [semesterKey, setSemesterKey] = useState(getInitialSemesterKey);
  const semester = dataset.semesters.find((s) => s.key === semesterKey) ?? dataset.semesters[0];
  const selectedCodes = useMemo(() => new Set(selectedModules[semesterKey] ?? []), [selectedModules, semesterKey]);

  const [view, setView] = useState<ViewMode>("work_week");
  const [date, setDate] = useState<Date>(() => parseISO(semester.start));
  const [dateInitializedFor, setDateInitializedFor] = useState(semesterKey);
  if (dateInitializedFor !== semesterKey) {
    setDateInitializedFor(semesterKey);
    setDate(parseISO(semester.start));
  }

  // Week view's title is the ISO week number from the academic calendar
  // (dataset.calendarWeeks — sourced from the school's own dates PDF) rather
  // than a date range: "Week 38" is how the school itself refers to weeks,
  // and it's what the official module-selection tool's own week view shows.
  // Month/Day keep date-based titles — a month spans many weeks so a single
  // week number wouldn't represent it, and a day view without its actual
  // date would lose the one piece of information Back/Next alone can't
  // convey (which day, not just which week).
  const currentWeek = dataset.calendarWeeks.find(
    (w) => w.semester === semesterKey && w.weekStart === format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  );
  const title =
    view === "month"
      ? format(date, "MMMM yyyy")
      : view === "day"
        ? format(date, "EEEE, d. MMMM yyyy")
        : currentWeek
          ? `Week ${currentWeek.weekNumber}`
          : `${format(startOfWeek(date, { weekStartsOn: 1 }), "MMM d")} – ${format(addDays(startOfWeek(date, { weekStartsOn: 1 }), 4), "MMM d, yyyy")}`;

  return (
    <div className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={semesterKey} onValueChange={(v) => setSemesterKey(v as string)}>
          <TabsList>
            {dataset.semesters.map((s) => (
              <TabsTrigger key={s.key} value={s.key}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {subscribeUrl && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={subscribeUrl} download="mse-timetable.ics" />}
            >
              <Download />
              Download .ics
            </Button>
            <SubscribeCalendarButton url={subscribeUrl} />
          </div>
        )}
      </div>

      {/* Landscape: one row, three groups spaced with justify-between (as
          before). Portrait: too cramped for that — stack the three groups
          vertically instead, each centered. */}
      <div className="flex flex-col items-center gap-2 landscape:flex-row landscape:items-center landscape:justify-between landscape:gap-0">
        <div className="order-2 flex gap-1 landscape:order-1">
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
        {/* In portrait this is the topmost group; in landscape it's back in
            the middle, between nav and switcher, matching the original
            single-row layout (order-2). */}
        <p className="order-1 text-sm font-medium landscape:order-2">{title}</p>
        <div className="order-3 flex gap-1 rounded-md bg-muted p-0.5">
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
      {view === "day" && <DayAgendaView semesterKey={semesterKey} date={date} selectedCodes={selectedCodes} />}
    </div>
  );
}
