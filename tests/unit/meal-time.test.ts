import { describe, expect, it } from "vitest";
import { currentMealType } from "@/lib/gym/meal-time";

describe("currentMealType", () => {
  it.each([
    [5, "BREAKFAST"],
    [8, "BREAKFAST"],
    [10, "BREAKFAST"],
    [11, "LUNCH"],
    [13, "LUNCH"],
    [14, "LUNCH"],
    [15, "SNACK"],
    [17, "SNACK"],
    [18, "DINNER"],
    [21, "DINNER"],
  ])("at %i:00 it opens %s", (hour, expected) => {
    expect(currentMealType(hour)).toBe(expected);
  });

  it("keeps dinner open through the small hours rather than jumping to breakfast at midnight", () => {
    expect([23, 0, 2, 4].map(currentMealType)).toEqual(["DINNER", "DINNER", "DINNER", "DINNER"]);
  });

  it("always names one of the four sections, for every hour of the day", () => {
    const sections = new Set(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]);
    for (let hour = 0; hour < 24; hour++) {
      expect(sections.has(currentMealType(hour))).toBe(true);
    }
  });
});
