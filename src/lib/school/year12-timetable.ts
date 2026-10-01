/**
 * Your Year 12 week, written down once.
 *
 * The sheet the school hands out is the whole year group: four or five option
 * subjects stacked in one cell, of which you take one. Typing that into the
 * grid by hand is forty cells of work, so it is read off the photo once here,
 * with the option blocks resolved to the subjects you actually take:
 *
 *   - Computer Science / Chemistry / Art / ENGLISH      -> English
 *   - Economics / Media Studies / Biology              -> Economics
 *   - Physics / History / Psychology                   -> none, so free
 *
 * German, EPQ, PE, PSHE, Community & Integration and the registrations are the
 * same for everyone in the year.
 *
 * Maths is deliberately not placed. You take it with the Year 11 group, which
 * runs on a different sheet, so the Year 12 maths periods are free time for
 * you — labelled, so you can drop the real times in when you have them. The
 * subject itself is still created: homework, flashcards and exams all hang off
 * it whether or not a slot on this sheet does.
 *
 * Teacher names are not in here on purpose. This file is source code in a git
 * repository, and the people it would name did not put them there; add them on
 * the subject itself, where they belong.
 */

export type Year12Slot = {
  /** 0 = Monday … 4 = Friday */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  periodName: string;
  periodType: "REGISTRATION" | "LESSON" | "BREAK" | "LUNCH" | "FREE" | "CLUB";
  /** The subject's name, created if this account does not have it yet. */
  subject?: string;
  /** Shown instead of a subject: registrations, breaks, free periods, clubs. */
  label?: string;
  room?: string;
};

/**
 * The subjects this timetable needs, created on import if missing.
 * Maths is in the list but in none of the slots — see the note above.
 */
export const YEAR12_SUBJECTS = ["German", "English", "Economics", "EPQ", "Maths"] as const;

const DAYS = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4 } as const;

/** The period grid, identical every day. */
const PERIODS = {
  REG: { startTime: "08:30", endTime: "08:40", periodName: "AM Reg" },
  P1: { startTime: "08:40", endTime: "09:35", periodName: "P1" },
  P2: { startTime: "09:35", endTime: "10:30", periodName: "P2" },
  BREAK: { startTime: "10:30", endTime: "10:55", periodName: "Break" },
  P3: { startTime: "10:55", endTime: "11:50", periodName: "P3" },
  P4: { startTime: "11:50", endTime: "12:45", periodName: "P4" },
  LUNCH: { startTime: "12:45", endTime: "13:30", periodName: "Lunch" },
  P5: { startTime: "13:30", endTime: "14:25", periodName: "P5" },
  P6: { startTime: "14:25", endTime: "15:20", periodName: "P6" },
  PM: { startTime: "15:20", endTime: "15:30", periodName: "PM Reg" },
  AFTER: { startTime: "15:30", endTime: "16:30", periodName: "After school" },
} as const;

type PeriodKey = keyof typeof PERIODS;

function slot(
  day: number,
  period: PeriodKey,
  rest: Omit<Year12Slot, "dayOfWeek" | "startTime" | "endTime" | "periodName">
): Year12Slot {
  return { dayOfWeek: day, ...PERIODS[period], ...rest };
}

/** Registration, break and lunch are the same five days a week. */
const everyDay: Year12Slot[] = [DAYS.MON, DAYS.TUE, DAYS.WED, DAYS.THU, DAYS.FRI].flatMap((day) => [
  slot(day, "REG", { periodType: "REGISTRATION", label: "AM Reg", room: "S19-Impact Hub" }),
  slot(day, "BREAK", { periodType: "BREAK", label: "Break" }),
  slot(day, "LUNCH", { periodType: "LUNCH", label: "Lunch" }),
  slot(day, "PM", { periodType: "REGISTRATION", label: "PM Reg", room: "S19-Impact Hub" }),
]);

/** What a Year 12 maths period means for someone sitting in the Year 11 set. */
const MATHS_ELSEWHERE = "Free — Maths with Year 11";

/** A period filled by an option block you are not in. */
const FREE = "Free period";

export const YEAR12_TIMETABLE: Year12Slot[] = [
  ...everyDay,

  // Monday
  slot(DAYS.MON, "P1", { periodType: "LESSON", subject: "German", room: "S5-German Native" }),
  slot(DAYS.MON, "P2", { periodType: "LESSON", subject: "German", room: "S5-German Native" }),
  slot(DAYS.MON, "P3", { periodType: "LESSON", label: "PE", room: "ISCS Gym" }),
  slot(DAYS.MON, "P4", { periodType: "FREE", label: FREE }),
  slot(DAYS.MON, "P5", { periodType: "LESSON", subject: "English", room: "S2-English" }),
  slot(DAYS.MON, "P6", { periodType: "LESSON", subject: "Economics", room: "S11-Economics" }),

  // Tuesday
  slot(DAYS.TUE, "P1", { periodType: "LESSON", subject: "Economics", room: "S11-Economics" }),
  slot(DAYS.TUE, "P2", { periodType: "FREE", label: MATHS_ELSEWHERE }),
  slot(DAYS.TUE, "P3", { periodType: "LESSON", subject: "German", room: "S5-German Native" }),
  slot(DAYS.TUE, "P4", { periodType: "LESSON", subject: "English", room: "S2-English" }),
  slot(DAYS.TUE, "P5", { periodType: "FREE", label: FREE }),
  slot(DAYS.TUE, "P6", { periodType: "FREE", label: FREE }),
  slot(DAYS.TUE, "AFTER", { periodType: "CLUB", label: "After-school clubs" }),

  // Wednesday
  slot(DAYS.WED, "P1", { periodType: "LESSON", subject: "German", room: "S5-German Native" }),
  slot(DAYS.WED, "P2", { periodType: "LESSON", subject: "EPQ", room: "S12-Media Room" }),
  slot(DAYS.WED, "P3", { periodType: "LESSON", subject: "English", room: "S2-English" }),
  slot(DAYS.WED, "P4", { periodType: "LESSON", subject: "Economics", room: "S11-Economics" }),
  slot(DAYS.WED, "P5", { periodType: "LESSON", label: "PE", room: "ISCS Gym" }),
  slot(DAYS.WED, "P6", { periodType: "LESSON", label: "Community and Integration", room: "S17-Mathematics/Science" }),

  // Thursday
  slot(DAYS.THU, "P1", { periodType: "LESSON", subject: "English", room: "S2-English" }),
  slot(DAYS.THU, "P2", { periodType: "FREE", label: MATHS_ELSEWHERE }),
  slot(DAYS.THU, "P3", { periodType: "LESSON", subject: "German", room: "S5-German Native" }),
  slot(DAYS.THU, "P4", { periodType: "FREE", label: MATHS_ELSEWHERE }),
  slot(DAYS.THU, "P5", { periodType: "LESSON", subject: "Economics", room: "S11-Economics" }),
  slot(DAYS.THU, "P6", { periodType: "FREE", label: MATHS_ELSEWHERE }),
  slot(DAYS.THU, "AFTER", { periodType: "CLUB", label: "After-school clubs" }),

  // Friday
  slot(DAYS.FRI, "P1", { periodType: "LESSON", label: "PSHE", room: "S19-Impact Hub" }),
  slot(DAYS.FRI, "P2", { periodType: "LESSON", subject: "English", room: "S2-English" }),
  slot(DAYS.FRI, "P3", { periodType: "LESSON", subject: "Economics", room: "S11-Economics" }),
  slot(DAYS.FRI, "P4", { periodType: "FREE", label: MATHS_ELSEWHERE }),
  slot(DAYS.FRI, "P5", { periodType: "FREE", label: FREE }),
  slot(DAYS.FRI, "P6", { periodType: "FREE", label: FREE }),
];

/** How many periods each subject or label holds in the week. */
export function lessonCounts(slots: Year12Slot[] = YEAR12_TIMETABLE): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of slots) {
    const name = s.subject ?? s.label;
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}
