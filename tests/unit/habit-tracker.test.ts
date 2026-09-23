import { describe, expect, it } from "vitest";
import {
  MAX_WEEKS_BACK,
  buildDays,
  currentStreak,
  dateKey,
  dayPct,
  parseHabitDate,
  parseWeekOffset,
  weekDates,
  weekLabel,
  type HabitRow,
} from "@/lib/school/habit-tracker";

const habits: HabitRow[] = [
  { id: "h1", name: "Reviewed today's lessons", emoji: "📘" },
  { id: "h2", name: "Did the homework", emoji: null },
  { id: "h3", name: "Read 20 minutes", emoji: "📖" },
  { id: "h4", name: "Packed the bag", emoji: null },
];

// A Wednesday, so a week's cards run Mon 21st through Sun 27th with three
// days already past, today, and three still to come.
const today = new Date(2026, 8, 23);

describe("dayPct", () => {
  it("is the share of the day's habits that were ticked", () => {
    expect(dayPct(2, 4, false)).toBe(50);
    expect(dayPct(4, 4, false)).toBe(100);
    expect(dayPct(0, 4, false)).toBe(0);
  });

  it("rounds to whole percents", () => {
    expect(dayPct(1, 3, false)).toBe(33);
    expect(dayPct(2, 3, false)).toBe(67);
  });

  // A day that hasn't happened is not a failed day. Scoring Thursday 0% on a
  // Wednesday makes every week look like it collapsed the moment it started.
  it("has no score for a day that hasn't happened yet", () => {
    expect(dayPct(0, 4, true)).toBeNull();
  });

  it("has no score when there are no habits to tick", () => {
    expect(dayPct(0, 0, false)).toBeNull();
  });
});

describe("buildDays", () => {
  const done = new Set([
    "h1|2026-09-21",
    "h2|2026-09-21",
    "h1|2026-09-22",
    "h1|2026-09-23",
    "h2|2026-09-23",
    "h3|2026-09-23",
  ]);
  const days = buildDays(weekDates(today, 0), habits, done, today);

  it("makes one card per day of the week, Monday first", () => {
    expect(days).toHaveLength(7);
    expect(days[0].weekdayLabel).toBe("Mon");
    expect(days[0].dateKey).toBe("2026-09-21");
    expect(days[6].dateKey).toBe("2026-09-27");
  });

  it("gives each card every habit, ticked or not", () => {
    expect(days[0].checks.map((c) => c.habitId)).toEqual(["h1", "h2", "h3", "h4"]);
    expect(days[0].checks.map((c) => c.done)).toEqual([true, true, false, false]);
  });

  it("scores each card on its own", () => {
    expect(days[0].pct).toBe(50); // Mon: 2 of 4
    expect(days[1].pct).toBe(25); // Tue: 1 of 4
    expect(days[2].pct).toBe(75); // Wed: 3 of 4
  });

  it("marks today, and only today", () => {
    expect(days.filter((d) => d.isToday).map((d) => d.dateKey)).toEqual(["2026-09-23"]);
  });

  it("marks the rest of the week as not yet, rather than as missed", () => {
    expect(days.slice(3).every((d) => d.isFuture)).toBe(true);
    expect(days.slice(0, 3).some((d) => d.isFuture)).toBe(false);
  });

  it("carries the emoji and name through to the checkbox label", () => {
    expect(days[0].checks[0]).toMatchObject({ name: "Reviewed today's lessons", emoji: "📘" });
    expect(days[0].checks[1].emoji).toBeNull();
  });

  it("still builds a week when there are no habits at all", () => {
    const empty = buildDays(weekDates(today, 0), [], new Set(), today);
    expect(empty).toHaveLength(7);
    expect(empty[0].checks).toEqual([]);
    expect(empty[0].totalCount).toBe(0);
  });
});

describe("currentStreak", () => {
  const key = (d: Date) => dateKey(d);
  const day = (offset: number) => new Date(2026, 8, 23 + offset);

  it("counts the run of days ending today", () => {
    const done = new Set([`h1|${key(day(0))}`, `h1|${key(day(-1))}`, `h1|${key(day(-2))}`]);
    expect(currentStreak("h1", done, today)).toBe(3);
  });

  // It is the evening and you haven't ticked today yet. A streak that resets
  // itself every morning would tell you a three-week run is over, at breakfast.
  it("survives today not being ticked yet", () => {
    const done = new Set([`h1|${key(day(-1))}`, `h1|${key(day(-2))}`]);
    expect(currentStreak("h1", done, today)).toBe(2);
  });

  it("ends at the first missed day", () => {
    const done = new Set([`h1|${key(day(0))}`, `h1|${key(day(-1))}`, `h1|${key(day(-3))}`]);
    expect(currentStreak("h1", done, today)).toBe(2);
  });

  it("is zero when neither today nor yesterday happened", () => {
    expect(currentStreak("h1", new Set([`h1|${key(day(-2))}`]), today)).toBe(0);
    expect(currentStreak("h1", new Set(), today)).toBe(0);
  });

  it("counts each habit's own run, not the other's", () => {
    const done = new Set([`h1|${key(day(0))}`, `h1|${key(day(-1))}`, `h2|${key(day(0))}`]);
    expect(currentStreak("h1", done, today)).toBe(2);
    expect(currentStreak("h2", done, today)).toBe(1);
  });
});

describe("weekDates", () => {
  it("starts the week on Monday", () => {
    expect(weekDates(today, 0).map(dateKey)[0]).toBe("2026-09-21");
  });

  it("steps back a whole week at a time", () => {
    expect(weekDates(today, 1).map(dateKey)[0]).toBe("2026-09-14");
    expect(weekDates(today, 4).map(dateKey)[0]).toBe("2026-08-24");
  });

  it("gives seven consecutive days", () => {
    const keys = weekDates(today, 2).map(dateKey);
    expect(keys).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });
});

describe("weekLabel", () => {
  it("names the two weeks you actually look at", () => {
    expect(weekLabel(weekDates(today, 0), 0)).toBe("This week");
    expect(weekLabel(weekDates(today, 1), 1)).toBe("Last week");
  });

  it("gives older weeks their dates", () => {
    expect(weekLabel(weekDates(today, 2), 2)).toBe("7–13 Sep");
  });

  it("names both months when a week straddles them", () => {
    // Mon 31 Aug 2026 to Sun 6 Sep 2026 — the case "24–30 Aug" would render as
    // "31–6 Sep", which reads as a week running backwards.
    expect(weekLabel(weekDates(today, 3), 3)).toBe("31 Aug – 6 Sep");
  });
});

describe("parseWeekOffset", () => {
  it("reads a week out of the URL", () => {
    expect(parseWeekOffset("3")).toBe(3);
    expect(parseWeekOffset(["2"])).toBe(2);
  });

  it("defaults to this week", () => {
    expect(parseWeekOffset(undefined)).toBe(0);
    expect(parseWeekOffset("")).toBe(0);
  });

  // The value reaches a date calculation, so a URL nobody meant to type must
  // not produce a week in the year 3000 or an infinite loop counting backwards.
  it.each(["banana", "1.5", "NaN", "1e400", "-0.1"])("refuses %s", (raw) => {
    expect(parseWeekOffset(raw)).toBe(0);
  });

  it("clamps to a real range", () => {
    expect(parseWeekOffset("-5")).toBe(0);
    expect(parseWeekOffset("99999")).toBe(MAX_WEEKS_BACK);
  });
});

describe("parseHabitDate", () => {
  it("reads the day a checkbox belongs to", () => {
    expect(parseHabitDate("2026-09-21", today)?.toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("accepts today itself", () => {
    expect(parseHabitDate("2026-09-23", today)).not.toBeNull();
  });

  // The cards disable tomorrow's checkboxes, but a disabled button in a browser
  // is not a rule: a habit logged for next Thursday arrives pre-ticked on
  // Thursday, and the stats have been quietly wrong since.
  it("refuses a day that hasn't happened", () => {
    expect(parseHabitDate("2026-09-24", today)).toBeNull();
    expect(parseHabitDate("2027-01-01", today)).toBeNull();
  });

  // The value comes back from a form post and reaches `new Date`, which answers
  // "Invalid Date" instead of throwing — and Prisma then fails with an error
  // about nothing the student did.
  it.each(["", "banana", "2026-9-1", "2026-09-21T10:00", "../../etc", "0000-00-00"])("refuses %s", (raw) => {
    expect(parseHabitDate(raw, today)).toBeNull();
  });

  // Most junk is caught by Date refusing to parse it, which makes the shape
  // check look redundant — it isn't. `new Date("+002026-09-21T00:00:00")` is a
  // valid expanded-year date, so without the shape check this one gets through
  // and writes a log the app can never show, under a key no card looks up.
  it("refuses an expanded-year date that Date itself happily parses", () => {
    expect(new Date("+002026-09-21T00:00:00").getTime()).not.toBeNaN();
    expect(parseHabitDate("+002026-09-21", today)).toBeNull();
  });
});
