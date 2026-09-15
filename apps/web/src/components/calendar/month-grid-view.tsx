"use client";

import { Fragment } from "react";
import { addDays, endOfMonth, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { dataset } from "@/lib/dataset";
import { classForModuleCode } from "@/lib/module-colors";
import type { Session, WeekTag } from "@mse-timetable/shared";

/**
 * Custom month grid, Monday-Friday only. No module in this data ever meets
 * on a weekend (confirmed — see CLAUDE.md), and react-big-calendar's month
 * view can't safely drop the Sat/Sun columns: its event blocks use
 * hardcoded 1/7-width percentages that would misalign against a 5-column
 * grid (tested and confirmed before building this). Building the whole
 * month grid ourselves — same approach as WeekBucketView — sidesteps that
 * entirely, since we own the column math.
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const BANNER_TAGS = new Set<WeekTag>(["holiday", "lecture-free", "exam-regular", "exam-resit", "viewing-session"]);

interface CourseCard {
  moduleCode: string;
  hasRoomException: boolean;
  isProvisional: boolean;
}

function aggregateByDay(sessions: Session[]): Map<string, CourseCard[]> {
  const byDate = new Map<string, Map<string, CourseCard>>();
  for (const s of sessions) {
    let dayMap = byDate.get(s.date);
    if (!dayMap) {
      dayMap = new Map();
      byDate.set(s.date, dayMap);
    }
    const existing = dayMap.get(s.moduleCode);
    if (existing) {
      existing.hasRoomException = existing.hasRoomException || s.isRoomException;
      existing.isProvisional = existing.isProvisional || s.isProvisional;
    } else {
      dayMap.set(s.moduleCode, {
        moduleCode: s.moduleCode,
        hasRoomException: s.isRoomException,
        isProvisional: s.isProvisional,
      });
    }
  }
  const result = new Map<string, CourseCard[]>();
  for (const [dateStr, dayMap] of byDate) result.set(dateStr, [...dayMap.values()]);
  return result;
}

function getMonthWeeks(date: Date): Date[] {
  const firstWeekStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  const weeks: Date[] = [];
  for (let cursor = firstWeekStart; cursor <= lastWeekStart; cursor = addDays(cursor, 7)) {
    weeks.push(cursor);
  }
  return weeks;
}

export function MonthGridView({
  semesterKey,
  date,
  selectedCodes,
}: {
  semesterKey: string;
  date: Date;
  selectedCodes: Set<string>;
}) {
  const weekStarts = getMonthWeeks(date);

  const sessionsThisMonth = dataset.sessions.filter(
    (s) => s.semester === semesterKey && selectedCodes.has(s.moduleCode),
  );
  const cardsByDate = aggregateByDay(sessionsThisMonth);
  const specialByDate = new Map(dataset.specialDates.map((d) => [d.date, d]));

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="grid grid-cols-5 gap-px bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-background p-2 text-center text-sm font-semibold">
            {w}
          </div>
        ))}

        {weekStarts.map((weekStart) => {
          const weekStartStr = format(weekStart, "yyyy-MM-dd");
          const week = dataset.calendarWeeks.find((w) => w.semester === semesterKey && w.weekStart === weekStartStr);
          const bannerTag = week?.tags.find((t) => BANNER_TAGS.has(t));

          return (
            <Fragment key={weekStartStr}>
              {bannerTag && (
                <div className="col-span-5 bg-slate-500 px-3 py-1 text-sm text-white">
                  {week!.comment || week!.studentNote || bannerTag}
                </div>
              )}
              {WEEKDAYS.map((_, i) => {
                const day = addDays(weekStart, i);
                const dateStr = format(day, "yyyy-MM-dd");
                const cards = cardsByDate.get(dateStr) ?? [];
                const special = specialByDate.get(dateStr);
                const inMonth = isSameMonth(day, date);
                return (
                  <div
                    key={dateStr}
                    className={cn("min-h-24 bg-background p-1", !inMonth && "bg-muted/40 text-muted-foreground")}
                  >
                    <div className="px-1 text-xs">{format(day, "d")}</div>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {special && (
                        <div className="rounded-sm bg-amber-500 px-1.5 py-1 text-xs font-medium text-white">
                          {special.description}
                        </div>
                      )}
                      {cards.map((card) => (
                        <div
                          key={card.moduleCode}
                          className={cn(
                            "rounded-sm px-1.5 py-1 text-xs font-medium text-white",
                            card.isProvisional && "border border-dashed border-white/70",
                            classForModuleCode(card.moduleCode),
                          )}
                        >
                          {card.moduleCode}
                          {card.hasRoomException && <span className="block text-[10px] font-normal opacity-90">room change</span>}
                          {card.isProvisional && <span className="block text-[10px] font-normal opacity-90">provisional</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
