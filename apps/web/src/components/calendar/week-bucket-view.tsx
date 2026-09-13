"use client";

import { Fragment } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { dataset } from "@/lib/dataset";
import { classForModuleCode } from "@/lib/module-colors";
import type { Session, WeekTag } from "@mse-timetable/shared";

/**
 * Mirrors the official ZHAW MSE module-selection tool's week view: a fixed
 * weekday x time-of-day grid (Morning/Afternoon/Evening — no clock times),
 * one card per course per day, rather than a real time-proportional grid.
 *
 * The 4th row ("Block", for intensive block-format courses that don't run
 * on a fixed weekday) is always empty here: cross-checked every module in
 * the catalog workbook against the timetable workbook (55/55 AUT modules
 * match with no leftovers on either side) and there's no "block" mention
 * anywhere in either file's legends — this region's data genuinely has no
 * block-format modules. The row is still rendered, for visual parity with
 * the official tool and in case a future semester's data has some.
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

      {/* Same weekday-columns/time-of-day-rows grid in both orientations —
          portrait doesn't transpose it (a week grid isn't a month grid; the
          rows aren't naturally "vertical days" the way month weeks are, and
          a transpose read worse in practice). Instead portrait shrinks
          padding/text and abbreviates weekday names, and the grid enforces
          a minimum per-day-column width so text never gets squished below
          legibility — the outer overflow-x-auto lets a narrow phone scroll
          sideways through the remaining days instead. */}
      <div className="overflow-x-auto rounded-md border">
        <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-px bg-border portrait:grid-cols-[52px_repeat(5,minmax(92px,1fr))]">
          <div className="bg-background" />
          {weekDates.map((d, i) => (
            <div key={i} className="bg-background p-2 text-center text-sm font-semibold portrait:p-1.5 portrait:text-xs">
              <span className="portrait:hidden">{format(d, "EEEE")}</span>
              <span className="hidden portrait:inline">{format(d, "EEE")}</span>
              <div className="text-xs font-normal text-muted-foreground portrait:text-[10px]">{format(d, "MMM d")}</div>
            </div>
          ))}

          {TIME_OF_DAY_ROWS.map((bucket) => (
            <Fragment key={bucket}>
              <div
                key={`${bucket}-label`}
                className="flex items-center justify-center bg-background p-2 text-xs font-medium text-muted-foreground portrait:p-1 portrait:text-[10px]"
              >
                {TIME_OF_DAY_LABELS[bucket]}
              </div>
              {weekDates.map((d, i) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const cards = [...cardsByKey.entries()]
                  .filter(([key]) => key.startsWith(`${dateStr}|${bucket}|`))
                  .map(([, card]) => card);
                return (
                  <div key={`${bucket}-${i}`} className="min-h-20 bg-background p-1 portrait:min-h-16">
                    {/* flex-1 on each card: a single card fills the entire
                        section height (matching the tallest cell in this
                        row, since grid items stretch by default); multiple
                        cards in the same cell split it evenly instead. */}
                    <div className="flex h-full flex-col gap-1">
                      {cards.map((card) => (
                        <div
                          key={card.moduleCode}
                          className={cn(
                            "flex flex-1 flex-col items-center justify-center rounded-sm px-2 py-1.5 text-center text-sm font-medium text-white",
                            "portrait:px-1.5 portrait:py-1 portrait:text-xs",
                            classForModuleCode(card.moduleCode),
                          )}
                        >
                          {card.moduleCode}
                          {card.hasRoomException && (
                            <span className="text-xs font-normal opacity-90 portrait:text-[10px]">room change</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}

          {/* Always-empty "Block" row — see the file-level comment above.
              Spans all 5 day columns as one cell, matching the official
              tool's layout for a row that isn't really per-weekday. */}
          <div className="flex items-center justify-center bg-background p-2 text-xs font-medium text-muted-foreground portrait:p-1 portrait:text-[10px]">
            Block
          </div>
          <div className="col-span-5 min-h-12 bg-background p-1" />
        </div>
      </div>
    </div>
  );
}
