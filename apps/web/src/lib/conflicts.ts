import type { Session } from "@mse-timetable/shared";

/** A selected pair of modules whose weekly slots overlap (FR9 — a warning,
 * not a hard block, since e.g. one might drop before the other starts). */
export interface ModuleConflict {
  moduleA: string;
  moduleB: string;
  weekday: string;
  timeA: string;
  timeB: string;
}

interface Slot {
  moduleCode: string;
  weekday: string;
  start: string;
  end: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

/** Finds weekly-slot conflicts among the given module codes, using the
 * distinct (weekday, start, end) combinations already present in `sessions`
 * (deduped) rather than comparing every individual dated occurrence. */
export function findConflicts(selectedCodes: string[], sessions: Session[]): ModuleConflict[] {
  const selected = new Set(selectedCodes);
  const seen = new Set<string>();
  const slots: Slot[] = [];

  for (const s of sessions) {
    if (!selected.has(s.moduleCode)) continue;
    const key = `${s.moduleCode}|${s.weekday}|${s.start}|${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ moduleCode: s.moduleCode, weekday: s.weekday, start: s.start, end: s.end });
  }

  const conflicts: ModuleConflict[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.moduleCode === b.moduleCode || a.weekday !== b.weekday) continue;
      if (overlaps(a.start, a.end, b.start, b.end)) {
        conflicts.push({
          moduleA: a.moduleCode,
          moduleB: b.moduleCode,
          weekday: a.weekday,
          timeA: `${a.start}-${a.end}`,
          timeB: `${b.start}-${b.end}`,
        });
      }
    }
  }
  return conflicts;
}
