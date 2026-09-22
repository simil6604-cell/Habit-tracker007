import { describe, expect, it } from "vitest";
import { daysUntil, daysUntilLabel } from "@/lib/planner/days-until";

/**
 * The bug this replaces: dividing the millisecond gap and rounding it. At
 * eight in the evening an exam the next morning is eleven hours away, which
 * rounds to zero — so the app told you your exam was in "0 days" when it was
 * tomorrow, and every other countdown was short by one from mid-afternoon on.
 */
const at = (iso: string) => new Date(iso);

describe("daysUntil", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const evening = at("2026-09-22T20:00:00");
    expect(daysUntil(at("2026-09-22T23:59:00"), evening)).toBe(0); // still today
    expect(daysUntil(at("2026-09-23T08:00:00"), evening)).toBe(1); // tomorrow morning
    expect(daysUntil(at("2026-09-24T08:00:00"), evening)).toBe(2);
    expect(daysUntil(at("2026-09-29T08:00:00"), evening)).toBe(7);
  });

  it("gives the same answer whatever time of day it is asked", () => {
    // The old arithmetic gave 1 in the morning and 0 in the evening for the
    // same exam. The answer must not depend on when you look.
    const exam = at("2026-09-23T00:00:00");
    for (const hour of ["00:05", "07:00", "12:00", "18:30", "23:50"]) {
      expect(daysUntil(exam, at(`2026-09-22T${hour}:00`)), `asked at ${hour}`).toBe(1);
    }
  });

  it("reads a date that has passed as 0, not as a negative", () => {
    expect(daysUntil(at("2026-09-20T08:00:00"), at("2026-09-22T20:00:00"))).toBe(0);
  });
});

describe("daysUntilLabel", () => {
  it("says today, tomorrow, and then counts", () => {
    const evening = at("2026-09-22T20:00:00");
    expect(daysUntilLabel(at("2026-09-22T22:00:00"), evening)).toBe("today");
    expect(daysUntilLabel(at("2026-09-23T08:00:00"), evening)).toBe("tomorrow");
    expect(daysUntilLabel(at("2026-09-25T08:00:00"), evening)).toBe("in 3 days");
  });
});
