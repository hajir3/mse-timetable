import type { ModulePrefix } from "@mse-timetable/shared";
import { dataset } from "@/lib/dataset";

/** One color per module type (CM/FTP/TSM), used consistently across month,
 * week, and day views — mirrors the official ZHAW tool's per-type coloring. */
export const MODULE_PREFIX_COLORS: Record<ModulePrefix, string> = {
  TSM: "bg-orange-500",
  FTP: "bg-indigo-600",
  CM: "bg-emerald-600",
};
const FALLBACK_COLOR = "bg-slate-600";

export const MODULE_PREFIX_BY_CODE = new Map(dataset.modules.map((m) => [m.code, m.prefix]));

export function classForModuleCode(moduleCode: string): string {
  const prefix = MODULE_PREFIX_BY_CODE.get(moduleCode);
  return prefix ? MODULE_PREFIX_COLORS[prefix] : FALLBACK_COLOR;
}
