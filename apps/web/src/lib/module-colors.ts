import type { ModulePrefix } from "@mse-timetable/shared";
import { dataset } from "@/lib/dataset";

/** One color per module type (CM/FTP/TSM), used consistently across month,
 * week, and day views — mirrors the official ZHAW tool's per-type coloring.
 * Both forms are kept in sync here: `className` for our own custom grids
 * (month-grid-view/week-bucket-view), `hex` for react-big-calendar's Day
 * view, where its own `.rbc-event` CSS rule has equal selector specificity
 * to a Tailwind bg-* class and wins on stylesheet order — an inline style
 * (which needs a real color value, not a class) reliably overrides it. */
export const MODULE_PREFIX_COLORS: Record<ModulePrefix, { className: string; hex: string }> = {
  TSM: { className: "bg-orange-500", hex: "#f97316" },
  FTP: { className: "bg-indigo-600", hex: "#4f46e5" },
  CM: { className: "bg-emerald-600", hex: "#059669" },
};
const FALLBACK_COLOR = { className: "bg-slate-600", hex: "#475569" };

export const MODULE_PREFIX_BY_CODE = new Map(dataset.modules.map((m) => [m.code, m.prefix]));

function colorForModuleCode(moduleCode: string) {
  const prefix = MODULE_PREFIX_BY_CODE.get(moduleCode);
  return prefix ? MODULE_PREFIX_COLORS[prefix] : FALLBACK_COLOR;
}

export function classForModuleCode(moduleCode: string): string {
  return colorForModuleCode(moduleCode).className;
}

export function hexForModuleCode(moduleCode: string): string {
  return colorForModuleCode(moduleCode).hex;
}
