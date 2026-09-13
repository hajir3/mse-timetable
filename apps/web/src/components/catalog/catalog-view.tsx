"use client";

import { useMemo, useState } from "react";
import { dataset, termForSemesterKey } from "@/lib/dataset";
import { useSelectedModules } from "@/lib/selection";
import { findConflicts } from "@/lib/conflicts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ALL = "__all__";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

function getInitialSemesterKey(): string {
  const now = new Date().toISOString().slice(0, 10);
  const current = dataset.semesters.find((s) => now >= s.start && now <= s.end);
  return (current ?? dataset.semesters[0]).key;
}

export function CatalogView() {
  const { isLoaded, selectedModules, save, saving, error: saveError } = useSelectedModules();
  const [semesterKey, setSemesterKey] = useState(getInitialSemesterKey);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState(ALL);
  const [weekday, setWeekday] = useState(ALL);
  const [prefix, setPrefix] = useState(ALL);
  const [localSelection, setLocalSelection] = useState<string[]>([]);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  // Seed local selection from the user's saved Clerk metadata once it's
  // loaded, and again whenever the semester tab changes. This adjusts state
  // during render (React's documented pattern for "reset state when a prop
  // changes") rather than in an effect, avoiding an extra cascading render.
  const resetKey = isLoaded ? semesterKey : null;
  if (resetKey !== null && resetKey !== initializedFor) {
    setInitializedFor(resetKey);
    setLocalSelection(selectedModules[resetKey] ?? []);
  }

  const term = termForSemesterKey(semesterKey);
  const modulesByCode = useMemo(() => new Map(dataset.modules.map((m) => [m.code, m])), []);
  const offerings = useMemo(() => dataset.offerings.filter((o) => o.semester === term), [term]);

  const filtered = offerings.filter((o) => {
    const mod = modulesByCode.get(o.moduleCode);
    if (!mod) return false;
    if (prefix !== ALL && mod.prefix !== prefix) return false;
    if (weekday !== ALL && o.weekday !== weekday) return false;
    if (profile !== ALL && !o.priorities[profile]) return false;
    if (search && !`${mod.title} ${mod.code}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const semesterSessions = useMemo(() => dataset.sessions.filter((s) => s.semester === semesterKey), [semesterKey]);
  const conflicts = useMemo(() => findConflicts(localSelection, semesterSessions), [localSelection, semesterSessions]);
  const hasSessions = semesterSessions.length > 0;
  const savedForSemester = selectedModules[semesterKey] ?? [];
  const dirty = JSON.stringify([...localSelection].sort()) !== JSON.stringify([...savedForSemester].sort());

  function toggle(code: string, checked: boolean) {
    setLocalSelection((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <Tabs value={semesterKey} onValueChange={(v) => setSemesterKey(v as string)}>
        <TabsList>
          {dataset.semesters.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!hasSessions && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          The school hasn&apos;t published session times for this semester yet — you can still pick modules
          now, and they&apos;ll appear on your calendar once the timetable is imported.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={profile} onValueChange={(v) => setProfile(v as string)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Specialization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All specializations</SelectItem>
            {dataset.profiles.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={weekday} onValueChange={(v) => setWeekday(v as string)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Weekday" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any weekday</SelectItem>
            {WEEKDAYS.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prefix} onValueChange={(v) => setPrefix(v as string)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any type</SelectItem>
            <SelectItem value="CM">CM</SelectItem>
            <SelectItem value="FTP">FTP</SelectItem>
            <SelectItem value="TSM">TSM</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Time conflicts in your current selection:</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c, i) => (
              <li key={i}>
                {c.moduleA} ({c.timeA}) overlaps {c.moduleB} ({c.timeB}) on {c.weekday}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((o) => {
          const mod = modulesByCode.get(o.moduleCode)!;
          const checked = localSelection.includes(o.moduleCode);
          const priority = profile !== ALL ? o.priorities[profile] : null;
          return (
            <Card key={o.moduleCode} className="flex flex-row items-center gap-3 p-3">
              <Checkbox
                checked={checked}
                onCheckedChange={(c) => toggle(o.moduleCode, c)}
                id={o.moduleCode}
              />
              <label htmlFor={o.moduleCode} className="flex flex-1 cursor-pointer flex-col gap-0.5">
                <span className="flex items-center gap-2 font-medium">
                  {mod.title}
                  <Badge variant="secondary">{mod.prefix}</Badge>
                  {priority && <Badge>{priority}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {mod.code} &middot; {o.weekday} &middot; {o.timeslotLabel} &middot; {o.location}
                </span>
              </label>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">No modules match these filters.</p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 flex flex-col gap-1 border-t bg-background/95 p-3 backdrop-blur">
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {localSelection.length} module{localSelection.length === 1 ? "" : "s"} selected
          </span>
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              save(semesterKey, localSelection).catch(() => {
                // surfaced via saveError above
              });
            }}
          >
            {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
}
