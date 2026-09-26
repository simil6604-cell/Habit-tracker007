import { describe, expect, it } from "vitest";
import { currentHabitStreak, donePct, heroCopy, weekCompletion, weekMarks, type SchoolHeroData } from "@/lib/school/hero";

const base: SchoolHeroData = {
  doneToday: 0,
  totalToday: 0,
  startHere: null,
  flashcardsDue: 0,
  subjectCount: 3,
  topicCount: 12,
  week: [],
  streak: 0,
};

// A Wednesday.
const today = new Date(2026, 8, 23);

describe("donePct", () => {
  it("is the share of today's list that is ticked", () => {
    expect(donePct(0, 4)).toBe(0);
    expect(donePct(1, 4)).toBe(25);
    expect(donePct(4, 4)).toBe(100);
  });

  // Nothing due is a full ring. An empty ring would read as "you have done
  // none of it", which is the opposite of what an empty list means.
  it("is full when there is nothing due at all", () => {
    expect(donePct(0, 0)).toBe(100);
  });

  it("never leaves the 0-100 range, whatever it is handed", () => {
    expect(donePct(9, 4)).toBe(100);
    expect(donePct(-3, 4)).toBe(0);
  });
});

describe("heroCopy", () => {
  it("asks for a first subject when the account is empty", () => {
    const copy = heroCopy({ ...base, subjectCount: 0, topicCount: 0 });
    expect(copy.eyebrow).toBe("Getting started");
    expect(copy.accentLine).toMatch(/first subject/i);
  });

  it("says plainly when nothing is due", () => {
    const copy = heroCopy({ ...base, totalToday: 0 });
    expect(copy.headline).toMatch(/Nothing is due today/);
  });

  it("counts what is left, in the singular when it is one", () => {
    expect(heroCopy({ ...base, totalToday: 4, doneToday: 1 }).headline).toBe("3 things left today.");
    expect(heroCopy({ ...base, totalToday: 4, doneToday: 3 }).headline).toBe("1 thing left today.");
  });

  it("marks a finished list as finished rather than as zero left", () => {
    const copy = heroCopy({ ...base, totalToday: 4, doneToday: 4 });
    expect(copy.headline).toMatch(/done/i);
    expect(copy.headline).not.toMatch(/^0 /);
  });

  // The button has to go somewhere that exists and do something real.
  it("offers the flashcards when some are due, and the School AI otherwise", () => {
    const withCards = heroCopy({ ...base, totalToday: 2, doneToday: 0, flashcardsDue: 7 });
    expect(withCards.cta).toEqual({ label: "Review 7 flashcards", href: "/school/flashcards" });

    const oneCard = heroCopy({ ...base, totalToday: 2, doneToday: 0, flashcardsDue: 1 });
    expect(oneCard.cta.label).toBe("Review 1 flashcard");

    expect(heroCopy({ ...base, totalToday: 2, doneToday: 0 }).cta.href).toBe("/school/ai");
  });

  it("never leaves a line blank, in any state", () => {
    const states: SchoolHeroData[] = [
      { ...base, subjectCount: 0 },
      { ...base, totalToday: 0 },
      { ...base, totalToday: 3, doneToday: 3 },
      { ...base, totalToday: 3, doneToday: 1 },
    ];
    for (const state of states) {
      const copy = heroCopy(state);
      for (const [key, value] of Object.entries({ ...copy, cta: copy.cta.label })) {
        expect(String(value).length, `${key} is empty`).toBeGreaterThan(0);
      }
      expect(copy.cta.href.startsWith("/")).toBe(true);
    }
  });
});

describe("weekMarks", () => {
  it("gives seven days, oldest first, ending on today", () => {
    const marks = weekMarks(new Map(), today);
    expect(marks).toHaveLength(7);
    expect(marks[0].dateKey).toBe("2026-09-17");
    expect(marks[6].dateKey).toBe("2026-09-23");
    expect(marks[6].isToday).toBe(true);
    expect(marks.filter((m) => m.isToday)).toHaveLength(1);
  });

  // A day with no habits at all is not a day the student failed.
  it("leaves a day with no data without a percentage", () => {
    expect(weekMarks(new Map(), today)[3].pct).toBeNull();
  });

  it("carries a day's completion through", () => {
    const marks = weekMarks(new Map([["2026-09-22", 60]]), today);
    expect(marks.find((m) => m.dateKey === "2026-09-22")?.pct).toBe(60);
  });
});

describe("currentHabitStreak", () => {
  const full = (keys: string[]) => new Map(keys.map((k) => [k, 100]));

  it("counts complete days back from today", () => {
    expect(currentHabitStreak(full(["2026-09-23", "2026-09-22", "2026-09-21"]), today)).toBe(3);
  });

  // It is the evening and today isn't finished. A streak that resets every
  // morning would announce the run is over at breakfast.
  it("survives today not being finished yet", () => {
    expect(currentHabitStreak(full(["2026-09-22", "2026-09-21"]), today)).toBe(2);
  });

  it("stops at a part-done day, because a streak means all of it", () => {
    const partial = new Map([["2026-09-23", 100], ["2026-09-22", 50], ["2026-09-21", 100]]);
    expect(currentHabitStreak(partial, today)).toBe(1);
  });

  it("is zero with nothing tracked", () => {
    expect(currentHabitStreak(new Map(), today)).toBe(0);
  });
});

describe("weekCompletion", () => {
  const monday = new Date(2026, 8, 21);

  // Adding a habit today must not paint the six days behind it as a week of
  // failure, about a habit that did not exist yet.
  it("leaves days before the first habit existed without a score", () => {
    const completion = weekCompletion(new Map(), 2, monday, today);
    expect(completion.has("2026-09-20")).toBe(false);
    expect(completion.has("2026-09-17")).toBe(false);
    expect(completion.has("2026-09-21")).toBe(true);
  });

  it("scores a day with no ticks as zero once habits exist", () => {
    expect(weekCompletion(new Map(), 2, monday, today).get("2026-09-22")).toBe(0);
  });

  it("scores a part-done day as its share", () => {
    const done = new Map([["2026-09-22", 1]]);
    expect(weekCompletion(done, 4, monday, today).get("2026-09-22")).toBe(25);
  });

  it("scores a full day as 100", () => {
    const done = new Map([["2026-09-23", 3]]);
    expect(weekCompletion(done, 3, monday, today).get("2026-09-23")).toBe(100);
  });

  it("has nothing to say when there are no habits at all", () => {
    expect(weekCompletion(new Map(), 0, null, today).size).toBe(0);
    expect(weekCompletion(new Map(), 2, null, today).size).toBe(0);
  });

  it("never reaches outside the seven days on screen", () => {
    const completion = weekCompletion(new Map(), 1, new Date(2020, 0, 1), today);
    expect([...completion.keys()].sort()).toEqual([
      "2026-09-17","2026-09-18","2026-09-19","2026-09-20","2026-09-21","2026-09-22","2026-09-23",
    ]);
  });
});
