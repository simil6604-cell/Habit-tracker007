import { describe, it, expect } from "vitest";
import { buildTracker, topTracks } from "@/lib/plan/tracker";
import { indexChecks, type PlanCheckRow, type PlanItem } from "@/lib/plan/plan";

const NOV = new Date(2026, 10, 1);
/** A Friday, mid-month, so there is a before and an after inside November. */
const TODAY = new Date(2026, 10, 13);

function workoutOn(days: number[], over: Partial<PlanItem> = {}): PlanItem[] {
  return days.map((day) => ({
    sourceKey: "workout:push",
    kind: "WORKOUT" as const,
    date: new Date(2026, 10, day),
    time: null,
    title: "Push Day",
    context: null,
    detail: [],
    href: "/gym",
    nativeStatus: null,
    ...over,
  }));
}

const check = (day: number, status: string, sourceKey = "workout:push"): PlanCheckRow => ({
  sourceKey,
  date: new Date(2026, 10, day),
  status,
  note: null,
  atTime: null,
});

describe("one row per thing, one square per day", () => {
  it("folds a weekly plan into a single row", () => {
    // Four Tuesdays is one workout, not four. A row per occurrence would
    // make the table unreadable by the second week.
    const data = buildTracker(workoutOn([3, 10, 17, 24]), indexChecks([]), NOV, TODAY);
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].title).toBe("Push Day");
  });

  it("gives every day of the table a square, planned or not", () => {
    const data = buildTracker(workoutOn([3, 10]), indexChecks([]), NOV, TODAY);
    expect(data.tracks[0].cells).toHaveLength(data.days.length);
    // A rest day is not a failure, and has to be told apart from one.
    const restDay = data.tracks[0].cells.find((cell) => cell.date.getDate() === 4)!;
    expect(restDay.state).toBe("NONE");
  });
});

describe("what counts against you", () => {
  it("does not count a day that has not happened yet", () => {
    // The 17th and 24th are after today. A tracker that marked them down
    // would open every month at 0% and stay wrong until the month ended.
    const data = buildTracker(workoutOn([3, 10, 17, 24]), indexChecks([check(3, "DONE"), check(10, "DONE")]), NOV, TODAY);
    expect(data.tracks[0].due).toBe(2);
    expect(data.tracks[0].done).toBe(2);
    expect(data.tracks[0].upcoming).toBe(2);
    expect(data.tracks[0].pct).toBe(100);
  });

  it("counts a day that has gone by with nothing ticked", () => {
    const data = buildTracker(workoutOn([3, 10]), indexChecks([check(3, "DONE")]), NOV, TODAY);
    expect(data.tracks[0].due).toBe(2);
    expect(data.tracks[0].slipped).toBe(1);
    expect(data.tracks[0].pct).toBe(50);
  });

  it("keeps the tick when something was done ahead of its day", () => {
    // Homework finished on Sunday for Thursday. Reading the date before the
    // state threw the tick away and told you the work was not done, which
    // is the one thing a tracker must never do to someone who was early.
    const data = buildTracker(workoutOn([24]), indexChecks([check(24, "DONE")]), NOV, TODAY);
    expect(data.tracks[0].cells.find((c) => c.date.getDate() === 24)!.state).toBe("DONE");
    expect(data.tracks[0].done).toBe(1);
    expect(data.tracks[0].due).toBe(1);
    expect(data.tracks[0].upcoming).toBe(0);
  });

  it("leaves today alone until it is over", () => {
    // Not ticked off at nine in the morning is not missed. Counting it
    // would mean every day starts by telling you that you have failed.
    const data = buildTracker(workoutOn([13]), indexChecks([]), NOV, TODAY);
    expect(data.tracks[0].due).toBe(0);
    expect(data.tracks[0].pct).toBeNull();
  });

  it("separates a day you marked as missed from one you ignored", () => {
    const data = buildTracker(workoutOn([3, 10]), indexChecks([check(3, "MISSED")]), NOV, TODAY);
    expect(data.tracks[0].missed).toBe(1);
    expect(data.tracks[0].slipped).toBe(1);
    expect(data.tracks[0].cells.find((c) => c.date.getDate() === 3)!.state).toBe("MISSED");
    expect(data.tracks[0].cells.find((c) => c.date.getDate() === 10)!.state).toBe("OPEN");
  });

  it("says nothing rather than 0% when nothing is due yet", () => {
    const empty = buildTracker([], indexChecks([]), NOV, TODAY);
    expect(empty.pct).toBeNull();
    // "0%" on a month that has not started is the most dishonest number a
    // tracker can show, and the one a spreadsheet always shows.
    expect(empty.due).toBe(0);
  });
});

describe("streaks", () => {
  it("counts ticks in a row and remembers the best one", () => {
    const data = buildTracker(
      workoutOn([2, 3, 4, 5, 6, 9, 10]),
      indexChecks([check(2, "DONE"), check(3, "DONE"), check(4, "DONE"), check(5, "MISSED"), check(6, "DONE"), check(9, "DONE"), check(10, "DONE")]),
      NOV,
      TODAY
    );
    expect(data.tracks[0].longestStreak).toBe(3);
    expect(data.tracks[0].streak).toBe(3);
  });

  it("is broken by a missed day, not by a rest day", () => {
    // Mondays and Thursdays with nothing in between: that is the plan, and
    // the days off it must not count as breaks.
    const data = buildTracker(
      workoutOn([2, 5, 9, 12]),
      indexChecks([check(2, "DONE"), check(5, "DONE"), check(9, "DONE"), check(12, "DONE")]),
      NOV,
      TODAY
    );
    expect(data.tracks[0].streak).toBe(4);
  });
});

describe("the weekly bars", () => {
  it("add up to the month, and a future week is empty rather than zero", () => {
    const data = buildTracker(
      workoutOn([3, 10, 17, 24]),
      indexChecks([check(3, "DONE"), check(10, "MISSED")]),
      NOV,
      TODAY
    );
    const counted = data.weeks.reduce((sum, week) => sum + week.due, 0);
    expect(counted).toBe(data.due);
    const future = data.weeks.find((week) => week.from.getDate() === 23)!;
    expect(future.due).toBe(0);
    expect(future.pct).toBeNull();
  });
});

describe("the split by domain", () => {
  it("keeps school, gym and football apart and in a fixed order", () => {
    const items: PlanItem[] = [
      ...workoutOn([3], { sourceKey: "workout:a", title: "Chest day" }),
      ...workoutOn([4], { sourceKey: "homework:a", kind: "HOMEWORK", title: "Mathe AB", context: "Mathematics", href: "/school" }),
      ...workoutOn([5], { sourceKey: "training:a", kind: "TRAINING", title: "Dribbling", context: "Technique", href: "/football" }),
    ];
    const data = buildTracker(items, indexChecks([]), NOV, TODAY);
    expect(data.domains.map((d) => d.domain)).toEqual(["SCHOOL", "GYM", "FOOTBALL"]);
    // And the rows are grouped the same way, so a colour never moves.
    expect(data.tracks.map((t) => t.domain)).toEqual(["SCHOOL", "GYM", "FOOTBALL"]);
  });

  it("leaves out a domain with nothing in it rather than showing an empty ring", () => {
    const data = buildTracker(workoutOn([3]), indexChecks([]), NOV, TODAY);
    expect(data.domains.map((d) => d.domain)).toEqual(["GYM"]);
  });
});

describe("topTracks", () => {
  it("ranks by how well it is going, and leaves out what is not due yet", () => {
    const items: PlanItem[] = [
      ...workoutOn([3, 10], { sourceKey: "a", title: "A" }),
      ...workoutOn([3, 10], { sourceKey: "b", title: "B" }),
      ...workoutOn([24], { sourceKey: "c", title: "C" }),
    ];
    const data = buildTracker(
      items,
      indexChecks([check(3, "DONE", "a"), check(10, "DONE", "a"), check(3, "DONE", "b")]),
      NOV,
      TODAY
    );
    const top = topTracks(data.tracks);
    expect(top.map((t) => t.title)).toEqual(["A", "B"]);
    expect(top[0].pct).toBe(100);
    expect(top[1].pct).toBe(50);
  });
});
