/**
 * The timetable, as something the tutor can read.
 *
 * It could not see it at all. Asked for a study plan it would place work in
 * the afternoon without knowing the student is in a double Chemistry then,
 * and asked "when should I do this?" it had to ask back. The student put the
 * whole timetable into the app — period by period, five days — and none of
 * it reached the one part of the app that plans their time. Said plainly by
 * the tutor itself: "Wann du Unterricht oder Freistunden hast, sehe ich
 * nicht. Wenn ich jetzt so tun würde, als ob, würde ich dir Lernzeiten in
 * Stunden legen, in denen du gar nicht frei bist."
 *
 * Everything here is pure: rows in, prose out. What the prose is for is a
 * model reading it, so it is written to be unambiguous rather than pretty —
 * and above all it separates the periods they are sitting in a lesson from
 * the ones they are free, because that distinction is the only reason the
 * timetable is worth sending at all.
 */

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ContextSlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  periodName: string | null;
  periodType: string;
  label: string | null;
  subjectName: string | null;
};

/** The period types that are time this student can actually work in. */
const WORKABLE = new Set(["FREE", "STUDY"]);

export function isWorkable(slot: { periodType: string }): boolean {
  return WORKABLE.has(slot.periodType);
}

/** What to call a period: the subject if there is one, else whatever was typed. */
export function slotLabel(slot: ContextSlot): string {
  if (slot.subjectName) return slot.subjectName;
  const written = slot.label?.trim();
  if (written) return written;
  switch (slot.periodType) {
    case "FREE":
      return "free";
    case "STUDY":
      return "study period";
    case "BREAK":
      return "break";
    case "LUNCH":
      return "lunch";
    case "REGISTRATION":
      return "registration";
    case "CLUB":
      return "club";
    default:
      return "lesson";
  }
}

function byTime(a: ContextSlot, b: ContextSlot): number {
  return a.startTime.localeCompare(b.startTime);
}

/** Every period they are free to work in, in week order. */
export function freePeriods(slots: ContextSlot[]): ContextSlot[] {
  return slots
    .filter(isWorkable)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || byTime(a, b));
}

/** How many minutes a period runs for, or 0 if the times do not parse. */
export function slotMinutes(slot: { startTime: string; endTime: string }): number {
  const parse = (time: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = parse(slot.startTime);
  const end = parse(slot.endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

/** "Monday 09:45–10:45 (P2)" — the one line a plan needs to place work. */
export function describeFreePeriod(slot: ContextSlot): string {
  const name = slot.periodName?.trim();
  return `${DAY_NAMES[slot.dayOfWeek] ?? "Someday"} ${slot.startTime}–${slot.endTime}${name ? ` (${name})` : ""}`;
}

/**
 * The free periods as one line per day, which is how someone thinks about
 * their week: "Monday I have a free after break".
 */
export function freePeriodLines(slots: ContextSlot[]): string[] {
  const free = freePeriods(slots);
  const lines: string[] = [];
  for (let day = 0; day < DAY_NAMES.length; day++) {
    const onDay = free.filter((slot) => slot.dayOfWeek === day);
    if (onDay.length === 0) continue;
    const total = onDay.reduce((sum, slot) => sum + slotMinutes(slot), 0);
    const periods = onDay
      .map((slot) => `${slot.startTime}–${slot.endTime}${slot.periodName ? ` (${slot.periodName})` : ""}`)
      .join(", ");
    lines.push(`- ${DAY_NAMES[day]}: ${periods}${total > 0 ? ` — ${total} min in all` : ""}`);
  }
  return lines;
}

/** The whole week, one line a day, so "what have I got on Thursday" is answerable. */
export function weekLines(slots: ContextSlot[]): string[] {
  const lines: string[] = [];
  for (let day = 0; day < DAY_NAMES.length; day++) {
    const onDay = slots.filter((slot) => slot.dayOfWeek === day).sort(byTime);
    if (onDay.length === 0) continue;
    lines.push(
      `- ${DAY_NAMES[day]}: ${onDay.map((slot) => `${slot.startTime} ${slotLabel(slot)}`).join(" · ")}`
    );
  }
  return lines;
}

/**
 * The timetable as the tutor is told it.
 *
 * Returns null when there is none, and the caller says so in its own words —
 * an empty heading with nothing under it reads, to a model, like a student
 * with no lessons.
 */
export function timetablePrompt(slots: ContextSlot[], now: Date = new Date()): string | null {
  if (slots.length === 0) return null;

  // JS counts from Sunday; this app counts from Monday, as the timetable does.
  const today = (now.getDay() + 6) % 7;
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const lines = [
    "This student's timetable. It is the same every week, and it is real — these are the lessons they are sitting in.",
    ...weekLines(slots),
  ];

  const free = freePeriodLines(slots);
  if (free.length > 0) {
    lines.push(
      "",
      "When they are free during the school day. These, and the evening, are the only times you may put work in — anything else is a period they are in a lesson:",
      ...free
    );
  } else {
    lines.push(
      "",
      "They have no free or study periods in the school day, so school-day work can only go in breaks, lunch or the evening."
    );
  }

  const laterToday = freePeriods(slots).filter(
    (slot) => slot.dayOfWeek === today && slot.endTime > clock
  );
  if (laterToday.length > 0) {
    lines.push(
      "",
      `Still free today (${DAY_NAMES[today]}, it is ${clock} now): ${laterToday
        .map((slot) => `${slot.startTime}–${slot.endTime}`)
        .join(", ")}.`
    );
  }

  return lines.join("\n");
}
