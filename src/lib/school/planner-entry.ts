/**
 * Turning what someone typed into the planner into a study block.
 *
 * The planner was generated and nothing else: three days of suggestions with
 * an "accept" button, and no way to write down the thing you had already
 * decided to do. This is the parsing half of fixing that, kept pure so every
 * refusal below is covered by a test rather than by trying it in the browser.
 */

export const MIN_BLOCK_MINUTES = 10;
export const MAX_BLOCK_MINUTES = 6 * 60;
export const MAX_TITLE_LENGTH = 80;

/**
 * The run of days the planner always shows, starting today.
 *
 * Not a limit on how far ahead you can write any more — that was the old
 * meaning, and it meant an exam three weeks out could not be prepared for in
 * the one place meant for preparing. A day further out than this appears as
 * soon as something is written on it, so the page stays a week long when you
 * are living a week at a time and grows only where you have made plans.
 */
export const PLANNER_DAYS = 7;

/** How far ahead anything can be written down at all. */
export const MAX_PLAN_AHEAD_DAYS = 365;

/** `yyyy-MM-dd` for a local date, without pulling in a formatter. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Which days the planner draws a card for.
 *
 * The next PLANNER_DAYS always, so today is at the top and the week is there
 * whether or not anything is in it — plus every later day that has something
 * written on it. Writing for a date beyond the window would otherwise store a
 * block the page never shows, which is worse than refusing it.
 *
 * `written` is whatever the database returned; days before today and anything
 * unparseable are dropped rather than trusted, and duplicates collapse.
 */
export function plannerDays(today: Date, written: string[] = []): Date[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const byKey = new Map<string, Date>();

  for (let i = 0; i < PLANNER_DAYS; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    byKey.set(dayKey(day), day);
  }

  // A key already in the week re-parses to the same day and overwrites itself,
  // so there is nothing to skip — the Map does the de-duplicating.
  for (const key of written) {
    const day = parseLocalDate(key);
    if (!day || day < start) continue;
    byKey.set(key, day);
  }

  return [...byKey.values()].sort((a, b) => a.getTime() - b.getTime());
}

export type ParsedBlock = {
  title: string;
  subjectId: string | null;
  start: Date;
  end: Date;
};

/**
 * A block with no fixed time is stored with start === end.
 *
 * No extra column, and nothing ambiguous about it: a timed block is at least
 * MIN_BLOCK_MINUTES long, so zero length cannot mean anything else. It also
 * falls out right everywhere that already reads these rows — analytics counts
 * end minus start, and "something to do on Tuesday" is not study time logged
 * until you actually do it.
 */
export function isAnytime(block: { start: Date; end: Date }): boolean {
  return block.start.getTime() === block.end.getTime();
}

export type ParseResult = { ok: true; value: ParsedBlock } | { ok: false; error: string };

/**
 * A calendar date, as a local-time Date at midnight.
 *
 * The shape check is not redundant with Date's own parsing: `new Date("+002026-09-21")`
 * is a valid date to JavaScript, and so is "2026-9-1". Neither is a date this
 * app wrote, so both are refused before the parts are read.
 *
 * Built field by field rather than from the string, because `new Date("2026-09-27")`
 * is parsed as UTC midnight — which in any zone BEHIND UTC (the Americas) is
 * still the evening before, so a block written for Monday would be filed under
 * Sunday. It happens not to bite in Europe/Zurich, where this app runs today;
 * that is luck about one TZ setting, not a property of the code, and the test
 * for it forces a western zone rather than trusting the machine it runs on.
 */
export function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects 2026-02-31 and friends, which roll over silently.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** "HH:MM" in 24-hour form, or null. */
export function parseClockTime(value: string): { hours: number; minutes: number } | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function parseBlockInput(input: {
  title: unknown;
  date: unknown;
  time: unknown;
  minutes: unknown;
  subjectId?: unknown;
  /** Today, when the caller wants the horizon checked. The server passes it. */
  today?: Date;
}): ParseResult {
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, error: "Write what you want to study." };
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Keep the title under ${MAX_TITLE_LENGTH} characters.` };
  }

  const day = parseLocalDate(String(input.date ?? ""));
  if (!day) return { ok: false, error: "Pick a date." };

  /*
   * The horizon. A date in the past cannot be planned for and would be
   * written somewhere the planner never looks; a date years out is a typo in
   * the year far more often than a real plan. Both are said out loud rather
   * than quietly accepted into a row nothing will ever show.
   */
  if (input.today instanceof Date) {
    const start = new Date(input.today.getFullYear(), input.today.getMonth(), input.today.getDate());
    if (day < start) return { ok: false, error: "That day has already gone — pick today or a day after it." };
    const limit = new Date(start.getFullYear(), start.getMonth(), start.getDate() + MAX_PLAN_AHEAD_DAYS);
    if (day > limit) return { ok: false, error: "That is more than a year away. Check the year on that date." };
  }

  /*
   * The time is optional, and that is the whole point of this form.
   *
   * It used to be required, together with a length in minutes — so writing
   * down "Monday: finish the Economics essay" meant inventing a clock time
   * and a duration for something that has neither. Reported as not being able
   * to write down what to do on which day, which is exactly what it was: the
   * form asked for a timetable entry when what was wanted was a plan.
   *
   * Leave it blank and the block belongs to the day rather than to an hour.
   */
  const rawTime = String(input.time ?? "").trim();
  const rawMinutes = String(input.minutes ?? "").trim();

  if (!rawTime) {
    // A length without a time is half an answer: there is no hour to measure
    // it from, so it is refused rather than quietly thrown away.
    if (rawMinutes) {
      return { ok: false, error: "Give a start time as well, or clear the minutes and write it down for the day." };
    }
    const anytime = new Date(day);
    const rawSubjectAnytime = String(input.subjectId ?? "").trim();
    return {
      ok: true,
      value: { title, subjectId: rawSubjectAnytime || null, start: anytime, end: new Date(anytime) },
    };
  }

  const clock = parseClockTime(rawTime);
  if (!clock) return { ok: false, error: "That start time can't be read — use HH:MM, or leave it blank." };

  const minutes = Number(rawMinutes);
  if (!Number.isInteger(minutes) || minutes < MIN_BLOCK_MINUTES || minutes > MAX_BLOCK_MINUTES) {
    // Said as a range rather than clamped: a silently shortened block is a
    // block you planned and the app quietly changed behind your back.
    return { ok: false, error: `How long? Between ${MIN_BLOCK_MINUTES} and ${MAX_BLOCK_MINUTES} minutes.` };
  }

  const start = new Date(day);
  start.setHours(clock.hours, clock.minutes, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);

  const rawSubject = String(input.subjectId ?? "").trim();
  return { ok: true, value: { title, subjectId: rawSubject || null, start, end } };
}
