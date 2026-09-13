"use client";

import { Fragment } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { dataset } from "@/lib/dataset";
import { classForModuleCode } from "@/lib/module-colors";
import { aggregateByDayAndBucket, type AggregatedCard } from "@/lib/aggregate-sessions";
import type { WeekTag } from "@mse-timetable/shared";

/**
 * Mirrors the official ZHAW MSE module-selection tool's week view: a fixed
 * weekday x time-of-day grid (Morning/Afternoon/Evening — no clock times),
 * one card per course per day, rather than a real time-proportional grid.
 *
 * Landscape and portrait render genuinely different DOM structures (both
 * always present, toggled by `hidden`/`landscape:`/`portrait:` — no JS
 * orientation detection):
 * - Landscape has room for a leading time-of-day label column plus 5 day
 *   columns with a comfortable minimum width; if it's ever too narrow the
 *   grid scrolls horizontally rather than squeezing further.
 * - Portrait moves each time-of-day label into its own full-width header
 *   bar above that section instead of a column, freeing the 5 day columns
 *   to be plain equal-width (grid-cols-5, no minimum) — same sizing as
 *   month view, so it fits the screen without needing to scroll, just
 *   with more compact cards.
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

function CourseCardView({ card, compact }: { card: AggregatedCard; compact: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col justify-center overflow-hidden rounded-sm text-left text-white",
        compact ? "px-1.5 py-1" : "px-2 py-1.5",
        classForModuleCode(card.moduleCode),
      )}
    >
      <div className={cn("opacity-90", compact ? "text-[10px]" : "text-xs")}>
        {card.start}–{card.end}
      </div>
      <div className={cn("break-words font-semibold", compact ? "text-xs" : "text-sm")}>{card.moduleCode}</div>
      <div className={cn("opacity-90", compact ? "text-[10px]" : "text-xs")}>
        {card.mode === "online" ? "Online" : card.room}
        {card.hasRoomException && " (room change)"}
      </div>
    </div>
  );
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

  function cardsFor(d: Date, bucket: (typeof TIME_OF_DAY_ROWS)[number]) {
    const dateStr = format(d, "yyyy-MM-dd");
    return [...cardsByKey.entries()].filter(([key]) => key.startsWith(`${dateStr}|${bucket}|`)).map(([, card]) => card);
  }

  return (
    <div className="flex flex-col gap-2">
      {bannerTag && (
        <div className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          {week!.comment || week!.studentNote || bannerTag}
        </div>
      )}

      {/* Landscape: time-of-day label column + 5 day columns, comfortable
          minimum width, scrolls horizontally if it doesn't fit. */}
      <div className="hidden overflow-x-auto rounded-md border landscape:block">
        <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-px bg-border">
          <div className="bg-background" />
          {weekDates.map((d, i) => (
            <div key={i} className="bg-background p-2 text-center text-sm font-semibold">
              {format(d, "EEEE")}
              <div className="text-xs font-normal text-muted-foreground">{format(d, "MMM d")}</div>
            </div>
          ))}

          {TIME_OF_DAY_ROWS.map((bucket) => (
            <Fragment key={bucket}>
              <div className="flex items-center justify-center bg-background p-2 text-xs font-medium text-muted-foreground">
                {TIME_OF_DAY_LABELS[bucket]}
              </div>
              {weekDates.map((d, i) => (
                <div key={i} className="min-h-20 bg-background p-1">
                  <div className="flex h-full flex-col gap-1">
                    {cardsFor(d, bucket).map((card) => (
                      <CourseCardView key={card.moduleCode} card={card} compact={false} />
                    ))}
                  </div>
                </div>
              ))}
            </Fragment>
          ))}

          <div className="flex items-center justify-center bg-background p-2 text-xs font-medium text-muted-foreground">
            Block
          </div>
          <div className="col-span-5 min-h-12 bg-background p-1" />
        </div>
      </div>

      {/* Portrait: no label column. Each time-of-day section gets its own
          full-width header bar instead, so the 5 day columns are plain
          equal-width (grid-cols-5, no minimum) — same sizing approach as
          month view, so it fits the screen without scrolling. */}
      <div className="hidden portrait:flex portrait:flex-col portrait:gap-2">
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-t-md border bg-border">
          {weekDates.map((d, i) => (
            <div key={i} className="bg-background p-1.5 text-center text-xs font-semibold">
              {format(d, "EEE")}
              <div className="text-[10px] font-normal text-muted-foreground">{format(d, "d")}</div>
            </div>
          ))}
        </div>

        {TIME_OF_DAY_ROWS.map((bucket) => (
          <div key={bucket} className="overflow-hidden rounded-md border">
            <div className="bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {TIME_OF_DAY_LABELS[bucket]}
            </div>
            <div className="grid grid-cols-5 gap-px bg-border">
              {weekDates.map((d, i) => (
                <div key={i} className="min-h-16 bg-background p-1">
                  <div className="flex h-full flex-col gap-1">
                    {cardsFor(d, bucket).map((card) => (
                      <CourseCardView key={card.moduleCode} card={card} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Always-empty "Block" section — see the file-level comment above. */}
        <div className="overflow-hidden rounded-md border">
          <div className="bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Block</div>
          <div className="min-h-10 bg-background p-1" />
        </div>
      </div>
    </div>
  );
}
