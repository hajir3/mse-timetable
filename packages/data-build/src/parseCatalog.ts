import ExcelJS from "exceljs";
import {
  LOCATION_MODES,
  MODULE_PREFIXES,
  PRIORITY_CODES,
  SEMESTER_TERMS,
  type LocationMode,
  type Module,
  type ModuleOffering,
  type ModulePrefix,
  type PriorityCode,
  type SemesterTerm,
  type SpecializationProfile,
  type Weekday,
  WEEKDAYS,
} from "@mse-timetable/shared";

/**
 * Parses the module-catalog workbook (`*_filter_function.xlsx`).
 *
 * Sheet `offer_AY<year>` layout (see SPECIFICATION.md §5.1), header on row 2,
 * data from row 3: A=flipped-classroom flag, B=multi-execution flag,
 * C=module number, D=module code, E=location, F=semester term, G=weekday,
 * H=generic timeslot label, I-W=15 specialization-profile priority columns
 * (in a fixed, hand-verified order — see PROFILE_COLUMN_ORDER), X=blank
 * spacer, Y=English module title.
 *
 * The `explanations` sheet's profile-code -> full-name legend is static
 * (15 codes, effectively never changes) so it's hardcoded here as
 * PROFILE_NAMES rather than re-parsed from the sheet each time.
 */

const PROFILE_COLUMN_ORDER = [
  "Avi",
  "BE",
  "BT",
  "CE",
  "CS",
  "DS",
  "ElE",
  "EnEn",
  "Geo",
  "ICS",
  "MA",
  "ME",
  "Med",
  "Pho",
  "ReLa",
] as const;

const PROFILE_NAMES: Record<string, string> = {
  Avi: "Aviation",
  BE: "Business Engineering",
  BT: "Building Technologies",
  CE: "Civil Engineering",
  CS: "Computer Science",
  DS: "Data Science",
  ElE: "Electrical Engineering",
  EnEn: "Energy and Environment",
  Geo: "Geomatics",
  ICS: "Information and Cyber Security",
  MA: "Mechatronics and Automation",
  ME: "Mechanical Engineering",
  Med: "Medical Engineering",
  Pho: "Photonics and Laser Engineering",
  ReLa: "Raumentwicklung und Landschaftsarchitektur",
};

const CATALOG_FIRST_DATA_ROW = 3;
const CATALOG_COLS = {
  flippedClassroom: 1,
  moduleNumber: 3,
  moduleCode: 4,
  location: 5,
  semester: 6,
  weekday: 7,
  timeslot: 8,
  profilesStart: 9, // column I
  title: 25, // column Y
} as const;

export interface CatalogResult {
  profiles: SpecializationProfile[];
  modules: Module[];
  offerings: ModuleOffering[];
}

function deriveModuleParts(code: string): {
  baseCode: string;
  executionVariant: string | null;
  prefix: ModulePrefix;
} {
  const prefixMatch = MODULE_PREFIXES.find((p) => code.startsWith(`${p}_`));
  if (!prefixMatch) {
    throw new Error(
      `Catalog: module code "${code}" doesn't start with a known prefix (${MODULE_PREFIXES.join(", ")})`,
    );
  }
  const variantMatch = code.match(/^(.*)_([A-Z])$/);
  return {
    baseCode: variantMatch ? variantMatch[1] : code,
    executionVariant: variantMatch ? variantMatch[2] : null,
    prefix: prefixMatch,
  };
}

function assertOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  context: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${context}: unexpected value "${value}" (expected one of ${allowed.join(", ")})`);
  }
  return value as T;
}

export async function parseCatalog(filePath: string): Promise<CatalogResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets.find((s) => s.name.startsWith("offer_"));
  if (!sheet) {
    throw new Error(`Catalog workbook ${filePath}: no sheet starting with "offer_" found`);
  }

  const modulesByCode = new Map<string, Module>();
  const offerings: ModuleOffering[] = [];

  for (let rowNum = CATALOG_FIRST_DATA_ROW; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const moduleCode = row.getCell(CATALOG_COLS.moduleCode).text.trim();
    if (!moduleCode) continue; // blank spacer row

    const moduleNumber = row.getCell(CATALOG_COLS.moduleNumber).text.trim();

    const location = assertOneOf(
      row.getCell(CATALOG_COLS.location).text.trim(),
      LOCATION_MODES,
      `Catalog row ${rowNum} (${moduleCode}): location`,
    ) as LocationMode;
    const semester = assertOneOf(
      row.getCell(CATALOG_COLS.semester).text.trim(),
      SEMESTER_TERMS,
      `Catalog row ${rowNum} (${moduleCode}): semester`,
    ) as SemesterTerm;
    const weekday = assertOneOf(
      row.getCell(CATALOG_COLS.weekday).text.trim(),
      WEEKDAYS,
      `Catalog row ${rowNum} (${moduleCode}): weekday`,
    ) as Weekday;
    const timeslotLabel = row.getCell(CATALOG_COLS.timeslot).text.trim();
    const title = row.getCell(CATALOG_COLS.title).text.trim();
    const isFlippedClassroom = row.getCell(CATALOG_COLS.flippedClassroom).text.trim().toLowerCase() === "x";

    const priorities: Record<string, PriorityCode | null> = {};
    PROFILE_COLUMN_ORDER.forEach((profileCode, i) => {
      const cellText = row.getCell(CATALOG_COLS.profilesStart + i).text.trim();
      if (!cellText) {
        priorities[profileCode] = null;
        return;
      }
      priorities[profileCode] = assertOneOf(
        cellText,
        PRIORITY_CODES,
        `Catalog row ${rowNum} (${moduleCode}): priority for profile "${profileCode}"`,
      ) as PriorityCode;
    });

    if (!modulesByCode.has(moduleCode)) {
      const { baseCode, executionVariant, prefix } = deriveModuleParts(moduleCode);
      modulesByCode.set(moduleCode, {
        code: moduleCode,
        baseCode,
        executionVariant,
        number: moduleNumber,
        title,
        prefix,
        mutuallyExclusiveGroup: moduleNumber.endsWith("*") ? moduleNumber : null,
      });
    }

    offerings.push({
      moduleCode,
      semester,
      location,
      weekday,
      timeslotLabel,
      isFlippedClassroom,
      priorities,
    });
  }

  const profiles: SpecializationProfile[] = PROFILE_COLUMN_ORDER.map((code) => ({
    code,
    name: PROFILE_NAMES[code],
  }));

  return { profiles, modules: [...modulesByCode.values()], offerings };
}
