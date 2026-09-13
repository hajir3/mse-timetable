"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { dataset } from "@/lib/dataset";
import { classForModuleCode } from "@/lib/module-colors";
import type { WeekTag } from "@mse-timetable/shared";

/**
 * A plain chronological list of the day's sessions — no time-axis grid, no
 * gutter of hour labels. Each card is self-describing (time, module code,
 * room) instead of relying on its vertical position to convey when it is.
 */

const BANNER_TAGS = new Set<WeekTag>(["holiday", "lecture-free", "exam-regular", "exam-resit", "viewing-session"]);

export function DayAgendaView({
  semesterKey,
  date,
  selectedCodes,
}: {
  semesterKey: string;
  date: Date;
  selectedCodes: Set<string>;
}) {
  const dateStr = format(date, "yyyy-MM-dd");

  const week = dataset.calendarWeeks.find(
    (w) => w.semester === semesterKey && dateStr >= w.weekStart && dateStr <= w.weekEnd,
  );
  const bannerTag = week?.tags.find((t) => BANNER_TAGS.has(t));
  const special = dataset.specialDates.find((d) => d.date === dateStr);

  const sessions = dataset.sessions
    .filter((s) => s.semester === semesterKey && selectedCodes.has(s.moduleCode) && s.date === dateStr)
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="flex flex-col gap-2">
      {bannerTag && (
        <div className="rounded-md bg-slate-500 px-3 py-1.5 text-sm text-white">
          {week!.comment || week!.studentNote || bannerTag}
        </div>
      )}
      {special && <div className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white">{special.description}</div>}

      {sessions.length === 0 && !bannerTag && !special && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No sessions this day.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sessions.map((s, i) => (
          <div
            key={`${s.moduleCode}-${s.lessonType}-${i}`}
            className={cn("rounded-md p-3 text-white", classForModuleCode(s.moduleCode))}
          >
            <div className="text-xs opacity-90">
              {s.start}–{s.end}
            </div>
            <div className="text-base font-semibold">{s.moduleCode}</div>
            <div className="text-sm">
              {s.mode === "online" ? "Online" : s.room}
              {s.isRoomException && " (room change)"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
