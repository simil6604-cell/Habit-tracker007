import { describe, it, expect } from "vitest";
import {
  buildPlan,
  filterMilestones,
  matchesMilestone,
  milestoneCounts,
  nextUp,
  parseMilestoneTab,
  scoreMilestone,
  unitFor,
  type Milestone,
} from "@/lib/progress/milestones";

function ms(over: Partial<Milestone> = {}): Milestone {
  return {
    id: "m1",
    name: "Session Starter",
    description: "Log 10 training sessions",
    category: "Consistency",
    target: 10,
    value: 0,
    unit: "sessions",
    ...over,
  };
}

describe("scoreMilestone", () => {
  it("turns a real count into a percentage and what is left", () => {
    expect(scoreMilestone(ms({ value: 4, target: 10 }))).toMatchObject({ pct: 40, done: false, remaining: 6 });
  });

  it("is done at the target, not one past it", () => {
    expect(scoreMilestone(ms({ value: 10, target: 10 })).done).toBe(true);
  });

  it("caps at 100 — going past a target is not 140% of a milestone", () => {
    const over = scoreMilestone(ms({ value: 14, target: 10 }));
    expect(over.pct).toBe(100);
    expect(over.done).toBe(true);
    expect(over.remaining).toBe(0);
  });

  it("does not divide by zero, and does not render NaN%", () => {
    const zero = scoreMilestone(ms({ target: 0, value: 0 }));
    expect(zero.pct).toBe(100);
    expect(Number.isNaN(zero.pct)).toBe(false);
  });

  it("treats a negative count as nothing rather than as negative progress", () => {
    expect(scoreMilestone(ms({ value: -3, target: 10 })).pct).toBe(0);
  });
});

describe("nextUp", () => {
  it("picks the unfinished one closest to its target", () => {
    const list = [
      scoreMilestone(ms({ id: "a", value: 1, target: 10 })),
      scoreMilestone(ms({ id: "b", value: 8, target: 10 })),
      scoreMilestone(ms({ id: "c", value: 3, target: 10 })),
    ];
    expect(nextUp(list)?.id).toBe("b");
  });

  it("measures closeness by proportion, not by how few are left", () => {
    // 3 more out of 5 is nearer done than 3 more out of 50, and a plan that
    // said otherwise would keep pointing at the biggest target on the page.
    const list = [
      scoreMilestone(ms({ id: "small", value: 2, target: 5 })),
      scoreMilestone(ms({ id: "huge", value: 47, target: 50 })),
    ];
    expect(nextUp(list)?.id).toBe("huge");

    const other = [
      scoreMilestone(ms({ id: "small", value: 2, target: 5 })),
      scoreMilestone(ms({ id: "huge", value: 7, target: 50 })),
    ];
    expect(nextUp(other)?.id).toBe("small");
  });

  it("never suggests something already done", () => {
    const list = [
      scoreMilestone(ms({ id: "done", value: 10, target: 10 })),
      scoreMilestone(ms({ id: "open", value: 1, target: 10 })),
    ];
    expect(nextUp(list)?.id).toBe("open");
  });

  it("is null when everything is finished", () => {
    expect(nextUp([scoreMilestone(ms({ value: 10, target: 10 }))])).toBeNull();
    expect(nextUp([])).toBeNull();
  });

  it("does not reshuffle between two equally close milestones", () => {
    const list = [
      scoreMilestone(ms({ id: "first", value: 5, target: 10 })),
      scoreMilestone(ms({ id: "second", value: 5, target: 10 })),
    ];
    expect(nextUp(list)?.id).toBe("first");
    expect(nextUp([...list])?.id).toBe("first");
  });
});

describe("matchesMilestone", () => {
  const milestone = scoreMilestone(ms({ name: "Deck Collector", description: "Create 5 flashcard decks", category: "Mastery" }));

  it("matches on name, description and category", () => {
    expect(matchesMilestone(milestone, "deck")).toBe(true);
    expect(matchesMilestone(milestone, "flashcard")).toBe(true);
    expect(matchesMilestone(milestone, "mastery")).toBe(true);
    expect(matchesMilestone(milestone, "football")).toBe(false);
  });

  it("needs every word, in any order", () => {
    expect(matchesMilestone(milestone, "collector deck")).toBe(true);
    expect(matchesMilestone(milestone, "deck football")).toBe(false);
  });

  it("an empty search matches everything", () => {
    expect(matchesMilestone(milestone, "")).toBe(true);
    expect(matchesMilestone(milestone, "  ")).toBe(true);
  });
});

describe("filterMilestones and the counts", () => {
  const list = [
    scoreMilestone(ms({ id: "a", name: "Alpha", value: 10, target: 10 })),
    scoreMilestone(ms({ id: "b", name: "Beta", value: 2, target: 10 })),
    scoreMilestone(ms({ id: "c", name: "Gamma", value: 0, target: 10 })),
  ];

  it("splits done from not done", () => {
    expect(filterMilestones(list, "COMPLETED", "").map((m) => m.id)).toEqual(["a"]);
    expect(filterMilestones(list, "REMAINING", "").map((m) => m.id)).toEqual(["b", "c"]);
    expect(filterMilestones(list, "ALL", "")).toHaveLength(3);
  });

  it("counts after the search, so the tabs match what is listed", () => {
    expect(milestoneCounts(list, "")).toEqual({ ALL: 3, COMPLETED: 1, REMAINING: 2 });
    expect(milestoneCounts(list, "beta")).toEqual({ ALL: 1, COMPLETED: 0, REMAINING: 1 });
  });

  it("combines the search with the tab", () => {
    expect(filterMilestones(list, "REMAINING", "alpha")).toHaveLength(0);
    expect(filterMilestones(list, "COMPLETED", "alpha").map((m) => m.id)).toEqual(["a"]);
  });

  it("falls back rather than trusting the tab in the URL", () => {
    expect(parseMilestoneTab("COMPLETED")).toBe("COMPLETED");
    expect(parseMilestoneTab("banana")).toBe("ALL");
    expect(parseMilestoneTab(undefined)).toBe("ALL");
  });
});

describe("buildPlan", () => {
  const extras = { focus: [], highlights: [] };

  it("reports the share of milestones finished, not an average of part-done ones", () => {
    // Averaging would let a row of barely-started targets read as progress:
    // four at 25% would show 25% when nothing at all has been finished.
    const plan = buildPlan(
      "GYM",
      [ms({ id: "a", value: 2, target: 8 }), ms({ id: "b", value: 2, target: 8 }), ms({ id: "c", value: 2, target: 8 }), ms({ id: "d", value: 2, target: 8 })],
      extras
    );
    expect(plan.completed).toBe(0);
    expect(plan.overallPct).toBe(0);
    expect(plan.remaining).toBe(4);
  });

  it("counts completed and remaining, and they add up", () => {
    const plan = buildPlan("SCHOOL", [ms({ id: "a", value: 10 }), ms({ id: "b", value: 1 }), ms({ id: "c", value: 0 })], extras);
    expect(plan.completed).toBe(1);
    expect(plan.remaining).toBe(2);
    expect(plan.completed + plan.remaining).toBe(plan.milestones.length);
    expect(plan.overallPct).toBe(33);
  });

  it("has no next step once everything is done", () => {
    const plan = buildPlan("FOOTBALL", [ms({ value: 10, target: 10 })], extras);
    expect(plan.next).toBeNull();
    expect(plan.overallPct).toBe(100);
  });

  it("survives a domain with no milestones at all", () => {
    const plan = buildPlan("FOOTBALL", [], extras);
    expect(plan.overallPct).toBe(0);
    expect(plan.next).toBeNull();
    expect(Number.isNaN(plan.overallPct)).toBe(false);
  });

  it("keeps each domain's plan its own", () => {
    // The whole point of three plans: a plan carries its domain and nothing
    // is summed across them.
    expect(buildPlan("SCHOOL", [ms()], extras).domain).toBe("SCHOOL");
    expect(buildPlan("GYM", [ms()], extras).domain).toBe("GYM");
    expect(buildPlan("FOOTBALL", [ms()], extras).domain).toBe("FOOTBALL");
  });
});

describe("unitFor", () => {
  it("agrees with the number in front of it", () => {
    // "1 areas to go" is the kind of small wrongness that makes a whole page
    // read as machine-written.
    expect(unitFor({ unit: "areas" }, 1)).toBe("area");
    expect(unitFor({ unit: "areas" }, 2)).toBe("areas");
    expect(unitFor({ unit: "areas" }, 0)).toBe("areas");
  });

  it("handles the units these plans actually use", () => {
    for (const [unit, one] of [
      ["sessions", "session"],
      ["topics", "topic"],
      ["plans", "plan"],
      ["PBs", "PB"],
      ["weigh-ins", "weigh-in"],
      ["minutes", "minute"],
    ] as const) {
      expect(unitFor({ unit }, 1)).toBe(one);
    }
  });

  it("leaves a unit with no trailing s alone", () => {
    expect(unitFor({ unit: "kg" }, 1)).toBe("kg");
  });

  it("uses the named singular where dropping an s would be wrong", () => {
    // The fallback would produce "entrie".
    expect(unitFor({ unit: "entries" }, 1)).toBe("entrie");
    expect(unitFor({ unit: "entries", unitOne: "entry" }, 1)).toBe("entry");
  });
});
