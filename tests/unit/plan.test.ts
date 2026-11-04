import { describe, it, expect } from "vitest";
import {
  checkKey,
  countStates,
  dayKey,
  groupByDay,
  indexChecks,
  itemsOn,
  isPlanStatus,
  monthParam,
  monthWeeks,
  parseDay,
  parseMonth,
  planState,
  sortWithinDay,
  type PlanCheckRow,
  type PlanItem,
} from "@/lib/plan/plan";

function item(over: Partial<PlanItem> = {}): PlanItem {
  return {
    sourceKey: "homework:a",
    kind: "HOMEWORK",
    date: new Date(2026, 10, 18),
    time: null,
    title: "Economics worksheet",
    context: "Economics",
    detail: [],
    href: "/school#homework",
    nativeStatus: null,
    ...over,
  };
}

function check(over: Partial<PlanCheckRow> = {}): PlanCheckRow {
  return {
    sourceKey: "homework:a",
    date: new Date(2026, 10, 18),
    status: "DONE",
    note: null,
    atTime: null,
    ...over,
  };
}

describe("checkKey", () => {
  it("is the thing and the day together, so a weekly plan is a new mark each week", () => {
    // One Workout row, every Tuesday. The mark cannot live on the row, or
    // ticking off this Tuesday would tick off the whole year.
    const first = checkKey("workout:legs", new Date(2026, 10, 3));
    const second = checkKey("workout:legs", new Date(2026, 10, 10));
    expect(first).not.toBe(second);
    expect(first).toBe("workout:legs@2026-11-03");
  });

  it("does not drift with the clock time of the day it is given", () => {
    const morning = checkKey("match:x", new Date(2026, 10, 18, 7, 30));
    const evening = checkKey("match:x", new Date(2026, 10, 18, 22, 45));
    expect(morning).toBe(evening);
  });
});

describe("planState", () => {
  it("is open when nothing says otherwise", () => {
    expect(planState(item(), indexChecks([])).status).toBe("OPEN");
  });

  it("takes the mark made here", () => {
    const state = planState(item(), indexChecks([check({ status: "MISSED", note: "Trainer cancelled" })]));
    expect(state.status).toBe("MISSED");
    expect(state.note).toBe("Trainer cancelled");
  });

  it("takes the thing's own status when nothing was marked here", () => {
    // Homework ticked off on the School page. Without this it would sit in
    // this list looking undone, and two screens disagreeing about the same
    // piece of work is worse than either being wrong alone.
    expect(planState(item({ nativeStatus: "DONE" }), indexChecks([])).status).toBe("DONE");
  });

  it("lets the mark made here win over the thing's own status", () => {
    // Un-ticking here is the more recent statement, and has to be able to
    // say so — otherwise a mis-tap on the School page could never be undone.
    const state = planState(item({ nativeStatus: "DONE" }), indexChecks([check({ status: "MISSED" })]));
    expect(state.status).toBe("MISSED");
  });

  it("keeps a note written against a day the mark no longer claims", () => {
    const state = planState(item(), indexChecks([check({ status: "", note: "half done" })]));
    expect(state.status).toBe("OPEN");
    expect(state.note).toBe("half done");
  });

  it("does not read another day's mark", () => {
    const state = planState(
      item({ date: new Date(2026, 10, 25) }),
      indexChecks([check({ date: new Date(2026, 10, 18) })])
    );
    expect(state.status).toBe("OPEN");
  });
});

describe("sortWithinDay", () => {
  it("puts the things with a clock time first, in time order", () => {
    const sorted = sortWithinDay([
      item({ sourceKey: "a", title: "Essay", time: null }),
      item({ sourceKey: "b", title: "Match", time: "14:00" }),
      item({ sourceKey: "c", title: "Exam", time: "08:30" }),
    ]);
    expect(sorted.map((i) => i.title)).toEqual(["Exam", "Match", "Essay"]);
  });

  it("does not float the untimed ones above the day by pretending they are 00:00", () => {
    const sorted = sortWithinDay([
      item({ sourceKey: "a", title: "Workout", time: null }),
      item({ sourceKey: "b", title: "Lesson", time: "08:00" }),
    ]);
    expect(sorted[0].title).toBe("Lesson");
  });

  it("does not mutate what it was given", () => {
    const input = [item({ sourceKey: "a", title: "B", time: null }), item({ sourceKey: "b", title: "A", time: null })];
    sortWithinDay(input);
    expect(input.map((i) => i.title)).toEqual(["B", "A"]);
  });
});

describe("groupByDay", () => {
  it("makes one group per day, oldest first, and leaves empty days out", () => {
    const days = groupByDay([
      item({ sourceKey: "a", date: new Date(2026, 10, 25) }),
      item({ sourceKey: "b", date: new Date(2026, 10, 18) }),
      item({ sourceKey: "c", date: new Date(2026, 10, 18) }),
    ]);
    expect(days.map((d) => dayKey(d.date))).toEqual(["2026-11-18", "2026-11-25"]);
    expect(days[0].items).toHaveLength(2);
  });

  it("puts two things logged at different times of the same day together", () => {
    const days = groupByDay([
      item({ sourceKey: "a", date: new Date(2026, 10, 18, 8, 0) }),
      item({ sourceKey: "b", date: new Date(2026, 10, 18, 19, 30) }),
    ]);
    expect(days).toHaveLength(1);
  });
});

describe("monthWeeks", () => {
  const weeks = monthWeeks(new Date(2026, 10, 1));

  it("is whole weeks of seven, Monday first", () => {
    for (const week of weeks) expect(week).toHaveLength(7);
    // 1 November 2026 is a Sunday, so the first row starts the Monday before.
    expect(dayKey(weeks[0][0])).toBe("2026-10-26");
    expect(weeks[0][0].getDay()).toBe(1);
  });

  it("covers the whole month, including the days that fill the first and last row", () => {
    const all = weeks.flat().map(dayKey);
    expect(all).toContain("2026-11-01");
    expect(all).toContain("2026-11-30");
    expect(all[all.length - 1]).toBe("2026-12-06");
  });

  it("handles a month that starts on a Monday without an empty leading week", () => {
    // June 2026 starts on a Monday. A grid built by padding blindly would
    // open with a row of seven days from May.
    const june = monthWeeks(new Date(2026, 5, 1));
    expect(dayKey(june[0][0])).toBe("2026-06-01");
  });
});

describe("itemsOn", () => {
  it("matches by the day, not by the exact timestamp", () => {
    const items = [
      item({ sourceKey: "a", date: new Date(2026, 10, 18, 7, 0) }),
      item({ sourceKey: "b", date: new Date(2026, 10, 19) }),
    ];
    expect(itemsOn(items, new Date(2026, 10, 18, 23, 59)).map((i) => i.sourceKey)).toEqual(["a"]);
  });
});

describe("countStates", () => {
  it("adds up to the total, with nothing counted twice", () => {
    const items = [
      item({ sourceKey: "homework:a" }),
      item({ sourceKey: "homework:b" }),
      item({ sourceKey: "homework:c", nativeStatus: "DONE" }),
    ];
    const counts = countStates(items, indexChecks([check({ sourceKey: "homework:b", status: "MISSED" })]));
    expect(counts).toEqual({ total: 3, done: 1, missed: 1, open: 1 });
    expect(counts.done + counts.missed + counts.open).toBe(counts.total);
  });
});

describe("the query-string parsers", () => {
  const today = new Date(2026, 10, 4);

  it("reads a month, and falls back to this one rather than trusting the URL", () => {
    expect(monthParam(parseMonth("2027-03", today))).toBe("2027-03");
    expect(monthParam(parseMonth(undefined, today))).toBe("2026-11");
    expect(monthParam(parseMonth("banana", today))).toBe("2026-11");
    expect(monthParam(parseMonth("2026-13", today))).toBe("2026-11");
    expect(monthParam(parseMonth("2026-00", today))).toBe("2026-11");
    expect(monthParam(parseMonth("1200-05", today))).toBe("2026-11");
  });

  it("reads a day, and gives back nothing rather than a guess", () => {
    expect(dayKey(parseDay("2026-11-18")!)).toBe("2026-11-18");
    expect(parseDay("18.11.2026")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });
});

describe("isPlanStatus", () => {
  it("accepts only the two states, because this decides what gets written", () => {
    expect(isPlanStatus("DONE")).toBe(true);
    expect(isPlanStatus("MISSED")).toBe(true);
    expect(isPlanStatus("PENDING")).toBe(false);
    expect(isPlanStatus("")).toBe(false);
    expect(isPlanStatus(null)).toBe(false);
  });
});
