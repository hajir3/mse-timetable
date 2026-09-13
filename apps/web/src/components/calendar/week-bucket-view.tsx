"use client";

import { Fragment } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { dataset } from "@/lib/dataset";
import type { Session, WeekTag } from "@mse-timetable/shared";

/**
 * Mirrors the official ZHAW MSE module-selection tool's week view: a fixed
 * weekday x time-of-day grid (Morning/Afternoon/Evening — no clock times),
 * one card per course per day, rather than a real time-proportional grid.
 * There's no "Block" row (the 4th row on the official tool, for intensive
 * block-format courses): nothing in this data is tagged that way — see
 * CLAUDE.md.
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const TIME_OF_DAY_ROWS = ["morning", "afternoon", "evening"] as const;
const TIME_OF_DAY_LABELS: Record<(typeof TIME_OF_DAY_ROWS)[number], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const BANNER_TAGS = new Set<WeekTag>(["holiday", "lecture-free", "exam-regular", "exam-resit", "viewing-session"]);

interface CourseCard {
  moduleCode: string;
  hasRoomException: boolean;
}

function aggregateByDayAndBucket(sessions: Session[]): Map<string, CourseCard> {
  const byKey = new Map<string, CourseCard>();
  for (const s of sessions) {
    const key = `${s.date}|${s.timeOfDay}|${s.moduleCode}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.hasRoomException = existing.hasRoomException || s.isRoomException;
    } else {
      byKey.set(key, { moduleCode: s.moduleCode, hasRoomException: s.isRoomException });
    }
  }
  return byKey;
}

export function WeekBucketView({
  semesterKey,
  date,
  selectedCodes,
}: {
  semesterKey: string;
  date: Date;
  selectedCodes: Set<string>;
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekDates = WEEKDAYS.map((_, i) => addDays(weekStart, i));
  const weekEnd = weekDates[weekDates.length - 1];

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");
  const week = dataset.calendarWeeks.find((w) => w.semester === semesterKey && w.weekStart === weekStartStr);
  const bannerTag = week?.tags.find((t) => BANNER_TAGS.has(t));

  const sessionsThisWeek = dataset.sessions.filter(
    (s) => s.semester === semesterKey && selectedCodes.has(s.moduleCode) && s.date >= weekStartStr && s.date <= weekEndStr,
  );
  const cardsByKey = aggregateByDayAndBucket(sessionsThisWeek);

  return (
    <div className="flex flex-col gap-2">
      {bannerTag && (
        <div className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          {week!.comment || week!.studentNote || bannerTag}
        </div>
      )}

      <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-px overflow-hidden rounded-md border bg-border">
        <div className="bg-background" />
        {weekDates.map((d, i) => (
          <div key={i} className="bg-background p-2 text-center text-sm font-semibold">
            {format(d, "EEEE")}
            <div className="text-xs font-normal text-muted-foreground">{format(d, "MMM d")}</div>
          </div>
        ))}

        {TIME_OF_DAY_ROWS.map((bucket) => (
          <Fragment key={bucket}>
            <div
              key={`${bucket}-label`}
              className="flex items-center justify-center bg-background p-2 text-xs font-medium text-muted-foreground"
            >
              {TIME_OF_DAY_LABELS[bucket]}
            </div>
            {weekDates.map((d, i) => {
              const dateStr = format(d, "yyyy-MM-dd");
              const cards = [...cardsByKey.entries()]
                .filter(([key]) => key.startsWith(`${dateStr}|${bucket}|`))
                .map(([, card]) => card);
              return (
                <div key={`${bucket}-${i}`} className="min-h-20 bg-background p-1">
                  <div className="flex h-full flex-col gap-1">
                    {cards.map((card) => (
                      <div
                        key={card.moduleCode}
                        className={cn(
                          "rounded-sm px-2 py-1.5 text-sm font-medium text-white",
                          "bg-blue-600",
                        )}
                      >
                        {card.moduleCode}
                        {card.hasRoomException && <span className="block text-xs font-normal opacity-90">room change</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
