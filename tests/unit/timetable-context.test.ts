import { describe, expect, it } from "vitest";
import {
  describeFreePeriod,
  freePeriodLines,
  freePeriods,
  slotLabel,
  slotMinutes,
  timetablePrompt,
  weekLines,
  type ContextSlot,
} from "@/lib/school/timetable-context";

/**
 * The timetable as the tutor reads it.
 *
 * The whole reason this exists is one sentence the tutor had to say to the
 * student: "Wann du Unterricht oder Freistunden hast, sehe ich nicht. Wenn
 * ich jetzt so tun würde, als ob, würde ich dir Lernzeiten in Stunden legen,
 * in denen du gar nicht frei bist."
 *
 * So the thing worth pinning is not the prose. It is that a period they are
 * sitting in a lesson never comes out looking like time they are free.
 */

const slot = (over: Partial<ContextSlot> = {}): ContextSlot => ({
  dayOfWeek: 0,
  startTime: "08:45",
  endTime: "09:45",
  periodName: "P1",
  periodType: "LESSON",
  label: null,
  subjectName: "Biology",
  ...over,
});

describe("which periods are time to work in", () => {
  it("counts free and study periods, and nothing else", () => {
    const week = [
      slot({ periodType: "LESSON", subjectName: "Biology" }),
      slot({ periodType: "FREE", subjectName: null, startTime: "09:45", endTime: "10:45", periodName: "P2" }),
      slot({ periodType: "STUDY", subjectName: null, startTime: "11:00", endTime: "12:00", periodName: "P3" }),
      // Twenty minutes with a bag to move and a corridor to cross is not a
      // revision slot, and a plan that books it is a plan that gets dropped.
      slot({ periodType: "BREAK", subjectName: null, startTime: "10:45", endTime: "11:00", label: "Break" }),
      slot({ periodType: "LUNCH", subjectName: null, startTime: "12:00", endTime: "13:00", label: "Lunch" }),
      slot({ periodType: "REGISTRATION", subjectName: null, startTime: "08:30", endTime: "08:45" }),
      slot({ periodType: "CLUB", subjectName: null, startTime: "15:45", endTime: "16:45", label: "Debating" }),
    ];
    expect(freePeriods(week).map((s) => s.startTime)).toEqual(["09:45", "11:00"]);
  });

  it("puts the week in order, across days and within a day", () => {
    const week = [
      slot({ dayOfWeek: 2, periodType: "FREE", subjectName: null, startTime: "14:00", endTime: "15:00" }),
      slot({ dayOfWeek: 0, periodType: "FREE", subjectName: null, startTime: "13:00", endTime: "14:00" }),
      slot({ dayOfWeek: 0, periodType: "FREE", subjectName: null, startTime: "09:45", endTime: "10:45" }),
    ];
    expect(freePeriods(week).map((s) => `${s.dayOfWeek}@${s.startTime}`)).toEqual(["0@09:45", "0@13:00", "2@14:00"]);
  });
});

describe("how a period is named", () => {
  it("prefers the subject, then whatever was typed, then the kind of period", () => {
    expect(slotLabel(slot({ subjectName: "Biology", label: "ignored" }))).toBe("Biology");
    expect(slotLabel(slot({ subjectName: null, label: "Debating club" }))).toBe("Debating club");
    expect(slotLabel(slot({ subjectName: null, label: null, periodType: "FREE" }))).toBe("free");
    expect(slotLabel(slot({ subjectName: null, label: "   ", periodType: "LUNCH" }))).toBe("lunch");
  });
});

describe("how long a period is", () => {
  it("measures it, and refuses to guess at a time it cannot read", () => {
    expect(slotMinutes({ startTime: "09:45", endTime: "10:45" })).toBe(60);
    expect(slotMinutes({ startTime: "08:30", endTime: "08:45" })).toBe(15);
    // A backwards or unreadable pair is zero rather than a negative number
    // that would quietly subtract from a day's total.
    expect(slotMinutes({ startTime: "10:00", endTime: "09:00" })).toBe(0);
    expect(slotMinutes({ startTime: "soon", endTime: "later" })).toBe(0);
    expect(slotMinutes({ startTime: "09:45", endTime: "09:45" })).toBe(0);
  });

  it("adds a day's free time up, so a plan knows what fits", () => {
    const [monday] = freePeriodLines([
      slot({ periodType: "FREE", subjectName: null, startTime: "09:45", endTime: "10:45", periodName: "P2" }),
      slot({ periodType: "STUDY", subjectName: null, startTime: "13:00", endTime: "13:30", periodName: "P5" }),
    ]);
    expect(monday).toContain("Monday");
    expect(monday).toContain("09:45–10:45 (P2)");
    expect(monday).toContain("90 min in all");
  });

  it("names a free period the way someone would say it", () => {
    expect(describeFreePeriod(slot({ dayOfWeek: 3, periodType: "FREE", startTime: "11:00", endTime: "12:00" })))
      .toBe("Thursday 11:00–12:00 (P1)");
  });
});

describe("the week as the tutor is told it", () => {
  const week: ContextSlot[] = [
    slot({ dayOfWeek: 0, startTime: "08:45", endTime: "09:45", subjectName: "Biology" }),
    slot({ dayOfWeek: 0, startTime: "09:45", endTime: "10:45", subjectName: null, periodType: "FREE", periodName: "P2" }),
    slot({ dayOfWeek: 1, startTime: "08:45", endTime: "09:45", subjectName: "Mathematics" }),
  ];

  it("gives a line per day, in the order the day happens", () => {
    expect(weekLines(week)).toEqual([
      "- Monday: 08:45 Biology · 09:45 free",
      "- Tuesday: 08:45 Mathematics",
    ]);
  });

  it("says plainly which periods may be planned into", () => {
    const text = timetablePrompt(week, new Date("2026-11-26T08:00:00"))!;
    expect(text).toContain("Monday: 08:45 Biology");
    expect(text).toContain("09:45–10:45 (P2)");
    // The sentence that stops a plan being written into a lesson.
    expect(text).toMatch(/never|only times you may put work in/i);
  });

  it("says what is still free today, and not what has already gone", () => {
    const thursday: ContextSlot[] = [
      slot({ dayOfWeek: 3, periodType: "FREE", subjectName: null, startTime: "09:00", endTime: "10:00" }),
      slot({ dayOfWeek: 3, periodType: "FREE", subjectName: null, startTime: "14:00", endTime: "15:00" }),
    ];
    // Thursday lunchtime: the morning free has gone, the afternoon has not.
    const text = timetablePrompt(thursday, new Date("2026-11-26T12:30:00"))!;
    expect(text).toContain("Still free today");
    expect(text).toContain("14:00–15:00");
    expect(text).not.toMatch(/Still free today[^\n]*09:00/);
  });

  it("says nothing at all rather than an empty timetable", () => {
    // An empty heading with nothing under it reads, to a model, like a
    // student with no lessons — which is worse than no timetable, because
    // it would plan straight through the school day.
    expect(timetablePrompt([], new Date())).toBeNull();
  });

  it("tells it when there is no free period in the week", () => {
    const text = timetablePrompt([slot({ periodType: "LESSON" })], new Date("2026-11-26T08:00:00"))!;
    expect(text).toMatch(/no free or study periods/i);
  });
});
