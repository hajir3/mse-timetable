"use client";

import { useUser } from "@clerk/nextjs";
import { useCallback, useMemo, useState } from "react";
import { SelectedModulesSchema, type SelectedModules } from "@mse-timetable/shared";

/**
 * The app's only persisted, per-user state: which module codes someone
 * picked, per semester. Lives on the Clerk account itself (`unsafeMetadata`,
 * writable straight from the browser) — there is no app-owned database. See
 * SPECIFICATION.md §7 / CLAUDE.md.
 */
export function useSelectedModules() {
  const { user, isLoaded } = useUser();
  const [saving, setSaving] = useState(false);

  const selectedModules: SelectedModules = useMemo(() => {
    if (!user) return {};
    const parsed = SelectedModulesSchema.safeParse(user.unsafeMetadata?.selectedModules);
    return parsed.success ? parsed.data : {};
  }, [user]);

  const save = useCallback(
    async (semesterKey: string, moduleCodes: string[]) => {
      if (!user) return;
      setSaving(true);
      try {
        const next: SelectedModules = { ...selectedModules, [semesterKey]: moduleCodes };
        await user.update({ unsafeMetadata: { ...user.unsafeMetadata, selectedModules: next } });
      } finally {
        setSaving(false);
      }
    },
    [user, selectedModules],
  );

  return { isLoaded, saving, selectedModules, save };
}
