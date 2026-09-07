export const PERIOD_TYPES = [
  { value: "REGISTRATION", label: "Registration" },
  { value: "LESSON", label: "Lesson" },
  { value: "BREAK", label: "Break" },
  { value: "LUNCH", label: "Lunch" },
  { value: "STUDY", label: "Study" },
  { value: "CLUB", label: "Club" },
  { value: "FREE", label: "Free" },
] as const;

export type PeriodType = (typeof PERIOD_TYPES)[number]["value"];

export const GRID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// A "fixed" row always has the same periodType every day (registration,
// break, lunch) — cells there are always plain text. A "variable" row
// (lesson slots) can hold a subject on one day and e.g. "Study" on another,
// so its actual per-cell type is inferred server-side from what's typed.
export const FIXED_PERIOD_TYPES: PeriodType[] = ["REGISTRATION", "BREAK", "LUNCH"];

export type GridCell = {
  day: number; // 0-4, Mon-Fri
  value: string; // subject name, "Study", a club name, or blank
  highlight?: boolean;
};

export type GridPeriodRow = {
  periodName: string;
  startTime: string;
  endTime: string;
  periodType: PeriodType; // default/fallback type for this row
  cells: GridCell[];
};

type SlotForGrouping = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  periodName: string | null;
  periodType: string;
  label: string | null;
  highlight: boolean;
  subject: { name: string } | null;
};

/** Groups flat TimetableSlot rows (Mon-Fri only) back into editable grid rows. */
export function slotsToGridRows(slots: SlotForGrouping[]): GridPeriodRow[] {
  const rows = new Map<string, GridPeriodRow>();

  for (const slot of slots) {
    if (slot.dayOfWeek > 4) continue; // grid editor only manages the school week, Mon-Fri
    const key = `${slot.startTime}-${slot.endTime}-${slot.periodName ?? ""}`;
    if (!rows.has(key)) {
      rows.set(key, {
        periodName: slot.periodName ?? "",
        startTime: slot.startTime,
        endTime: slot.endTime,
        periodType: (slot.periodType as PeriodType) ?? "LESSON",
        cells: [],
      });
    }
    rows.get(key)!.cells.push({
      day: slot.dayOfWeek,
      value: slot.subject?.name ?? slot.label ?? "",
      highlight: slot.highlight,
    });
  }

  return Array.from(rows.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Infers the real periodType for one cell of a "variable" row from its text. */
export function inferCellPeriodType(rowDefault: PeriodType, text: string): PeriodType {
  const t = text.trim().toLowerCase();
  if (!t) return rowDefault;
  if (t === "study" || t === "private study") return "STUDY";
  if (t === "free" || t === "free period") return "FREE";
  if (t.includes("club")) return "CLUB";
  return rowDefault;
}
