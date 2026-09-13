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
  const [error, setError] = useState<string | null>(null);

  const selectedModules: SelectedModules = useMemo(() => {
    if (!user) return {};
    const parsed = SelectedModulesSchema.safeParse(user.unsafeMetadata?.selectedModules);
    return parsed.success ? parsed.data : {};
  }, [user]);

  const save = useCallback(
    async (semesterKey: string, moduleCodes: string[]) => {
      if (!user) return;
      setSaving(true);
      setError(null);
      try {
        const next: SelectedModules = { ...selectedModules, [semesterKey]: moduleCodes };
        // user.update({ unsafeMetadata }) is deprecated in this Clerk version
        // (Core 3) in favor of updateMetadata, which deep-merges — we still
        // compute the full merged value ourselves for predictability.
        await user.updateMetadata({ unsafeMetadata: { selectedModules: next } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save your selection.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user, selectedModules],
  );

  return { isLoaded, saving, error, selectedModules, save };
}
