import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  MAX_MINUTES,
  MIN_MINUTES,
  clampMinutes,
  fallbackPlan,
  minutesFor,
  parsePlan,
  planDates,
  planProgress,
  readinessSeries,
  type PlanDay,
} from "@/lib/school/exam-plan";

const today = new Date(2026, 8, 23); // Wednesday
const keys = (dates: Date[]) => dates.map((d) => format(d, "yyyy-MM-dd"));

describe("planDates", () => {
  it("runs from today to the day before the exam", () => {
    const dates = planDates(today, new Date(2026, 8, 28), today);
    expect(keys(dates)).toEqual(["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  });

  // The paper is not a revision day. Whatever happens that morning is not the
  // plan's business.
  it("never plans the exam day itself", () => {
    const dates = planDates(today, new Date(2026, 8, 25), today);
    expect(keys(dates)).not.toContain("2026-09-25");
  });

  it("has nothing to plan for an exam today or already gone", () => {
    expect(planDates(today, today, today)).toEqual([]);
    expect(planDates(today, new Date(2026, 8, 20), today)).toEqual([]);
  });

  it("never starts in the past, whatever it is handed", () => {
    const dates = planDates(new Date(2026, 8, 1), new Date(2026, 8, 27), today);
    expect(keys(dates)[0]).toBe("2026-09-23");
  });

  // A plan with no gaps is one you break the first evening something comes up,
  // and a broken plan gets abandoned rather than adjusted.
  it("leaves rest days in a long run-up", () => {
    const dates = planDates(today, new Date(2026, 9, 23), today);
    expect(dates.length).toBeLessThan(30);
    expect(dates.length).toBeGreaterThan(18);
  });

  it("works every day when the run-up is already short", () => {
    const dates = planDates(today, new Date(2026, 8, 29), today);
    expect(keys(dates)).toHaveLength(6);
  });

  it("keeps the last days before the paper as working days", () => {
    const dates = planDates(today, new Date(2026, 9, 23), today);
    const last = keys(dates).slice(-3);
    expect(last).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("refuses to plan an absurd number of days", () => {
    expect(planDates(today, new Date(2030, 0, 1), today).length).toBeLessThanOrEqual(120);
  });
});

describe("minutesFor", () => {
  it("asks for more as the exam gets closer", () => {
    expect(minutesFor(9, 10)).toBeGreaterThan(minutesFor(0, 10));
  });

  it("stays inside what a school night can hold", () => {
    for (let i = 0; i < 40; i++) {
      const m = minutesFor(i, 40);
      expect(m).toBeGreaterThanOrEqual(MIN_MINUTES);
      expect(m).toBeLessThanOrEqual(MAX_MINUTES);
    }
  });

  it("handles a one-day run-up without dividing by zero", () => {
    expect(Number.isFinite(minutesFor(0, 1))).toBe(true);
  });
});

describe("clampMinutes", () => {
  it.each([
    [0, MIN_MINUTES],
    [10, MIN_MINUTES],
    [45, 45],
    [600, MAX_MINUTES],
    [Number.NaN, MIN_MINUTES],
    [Number.POSITIVE_INFINITY, MIN_MINUTES],
  ])("turns %s into %s", (input, expected) => {
    expect(clampMinutes(input)).toBe(expected);
  });
});

describe("fallbackPlan", () => {
  const dates = planDates(today, new Date(2026, 8, 29), today);
  const topics = [
    { name: "Organic chemistry", progressPct: 20 },
    { name: "Moles", progressPct: 45 },
    { name: "Electrolysis", progressPct: 80 },
  ];

  // This is not a placeholder for a missing key. It is the honest floor, built
  // from the student's own topics rather than from invented syllabus content.
  //
  // Handed in the order they happen to come out of the database — strongest
  // first here — because a test fed pre-sorted topics passes with the sort
  // deleted, which is how "weakest first" quietly stops being true.
  it("works from the weakest topic first, whatever order it is handed them in", () => {
    const unsorted = [
      { name: "Electrolysis", progressPct: 80 },
      { name: "Moles", progressPct: 45 },
      { name: "Organic chemistry", progressPct: 20 },
    ];
    const plan = fallbackPlan(dates, unsorted, "Chemistry");
    expect(plan[0].focus).toBe("Organic chemistry");
    expect(plan[1].focus).toBe("Moles");
    expect(plan[2].focus).toBe("Electrolysis");
  });

  it("comes back to the weakest topics rather than padding with new ones", () => {
    const plan = fallbackPlan(dates, topics, "Chemistry");
    const focuses = plan.slice(0, -1).map((d) => d.focus);
    expect(focuses.filter((f) => f === "Organic chemistry").length).toBeGreaterThan(1);
    expect(new Set(focuses).size).toBeLessThanOrEqual(topics.length);
  });

  // Meeting something for the first time the night before is how the things
  // you did know get crowded out.
  it("makes the last day review only", () => {
    const plan = fallbackPlan(dates, topics, "Chemistry");
    expect(plan[plan.length - 1].focus).toMatch(/no new material/i);
  });

  it("still plans when the subject has no topics broken out", () => {
    const plan = fallbackPlan(dates, [], "Chemistry");
    expect(plan).toHaveLength(dates.length);
    expect(plan[0].focus).toContain("Chemistry");
  });

  it("plans nothing when there are no days", () => {
    expect(fallbackPlan([], topics, "Chemistry")).toEqual([]);
  });

  it("gives every day a focus and a real number of minutes", () => {
    for (const day of fallbackPlan(dates, topics, "Chemistry")) {
      expect(day.focus.length).toBeGreaterThan(0);
      expect(day.minutes).toBeGreaterThanOrEqual(MIN_MINUTES);
    }
  });
});

describe("parsePlan", () => {
  const dates = planDates(today, new Date(2026, 8, 27), today);
  const base: PlanDay[] = fallbackPlan(dates, [{ name: "Moles", progressPct: 30 }], "Chemistry");

  it("takes the model's days when they line up with the dates asked for", () => {
    const reply = JSON.stringify({
      days: dates.map((d, i) => ({ date: format(d, "yyyy-MM-dd"), focus: `Day ${i}`, detail: "Do this", minutes: 50 })),
    });
    const plan = parsePlan(reply, dates, base);
    expect(plan.map((d) => d.focus)).toEqual(dates.map((_, i) => `Day ${i}`));
    expect(plan.every((d) => d.minutes === 50)).toBe(true);
  });

  it("reads through a code fence, which models add even when told not to", () => {
    const reply = "```json\n" + JSON.stringify({ days: [{ date: format(dates[0], "yyyy-MM-dd"), focus: "Fenced" }] }) + "\n```";
    expect(parsePlan(reply, dates, base)[0].focus).toBe("Fenced");
  });

  // A plan is a promise about specific days. A reply that invents a date must
  // not quietly become the plan — which is guaranteed by building the result
  // from the dates that were asked for rather than from the model's keys, so
  // this holds however the parsing above goes wrong.
  it("ignores dates nobody asked for", () => {
    const reply = JSON.stringify({ days: [{ date: "2027-01-01", focus: "Invented" }] });
    expect(parsePlan(reply, dates, base).map((d) => d.focus)).not.toContain("Invented");
  });

  it("fills a day the model skipped from the rule-based plan", () => {
    const reply = JSON.stringify({ days: [{ date: format(dates[0], "yyyy-MM-dd"), focus: "Only one" }] });
    const plan = parsePlan(reply, dates, base);
    expect(plan).toHaveLength(dates.length);
    expect(plan[1].focus).toBe(base[1].focus);
  });

  it.each(["not json at all", "", "{}", '{"days":"nope"}', '{"days":[{"focus":"no date"}]}'])(
    "falls back cleanly on %s",
    (reply) => {
      const plan = parsePlan(reply, dates, base);
      expect(plan.map((d) => d.focus)).toEqual(base.map((d) => d.focus));
    }
  );

  it("clamps minutes the model invented", () => {
    const reply = JSON.stringify({ days: [{ date: format(dates[0], "yyyy-MM-dd"), focus: "Long", minutes: 9000 }] });
    expect(parsePlan(reply, dates, base)[0].minutes).toBe(MAX_MINUTES);
  });

  it("drops a day with an empty focus rather than showing a blank row", () => {
    const reply = JSON.stringify({ days: [{ date: format(dates[0], "yyyy-MM-dd"), focus: "   " }] });
    expect(parsePlan(reply, dates, base)[0].focus).toBe(base[0].focus);
  });
});

describe("readinessSeries", () => {
  const dates = planDates(today, new Date(2026, 8, 27), today);

  // A day you didn't rate is not a day you felt terrible, and a line dragged to
  // the floor by silence is the reason nobody trusts a chart like this.
  it("leaves an unrated day null rather than zero", () => {
    const series = readinessSeries(dates, new Map([["2026-09-23", 3]]), new Map());
    expect(series[0].readiness).toBe(3);
    expect(series[1].readiness).toBeNull();
  });

  it("carries whether the day's work happened", () => {
    const series = readinessSeries(dates, new Map(), new Map([["2026-09-24", true]]));
    expect(series.find((p) => p.dateKey === "2026-09-24")?.done).toBe(true);
    expect(series[0].done).toBeNull();
  });

  it("has one point per planned day", () => {
    expect(readinessSeries(dates, new Map(), new Map())).toHaveLength(dates.length);
  });
});

describe("planProgress", () => {
  const day = (offset: number, done: boolean) => ({ date: new Date(2026, 8, 23 + offset), done });

  it("counts what is done out of the whole plan", () => {
    const progress = planProgress([day(0, true), day(1, false), day(2, false)], today);
    expect(progress).toMatchObject({ total: 3, done: 1, pct: 33 });
  });

  // A day that has passed without being ticked is the thing worth noticing.
  it("counts a past day that was never ticked as missed", () => {
    const progress = planProgress([day(-2, false), day(-1, true), day(3, false)], today);
    expect(progress.missed).toBe(1);
  });

  it("does not call a future day missed", () => {
    expect(planProgress([day(5, false)], today).missed).toBe(0);
  });

  it("is zero, not NaN, for an empty plan", () => {
    expect(planProgress([], today)).toMatchObject({ total: 0, done: 0, pct: 0 });
  });
});
