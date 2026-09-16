import { describe, expect, it } from "vitest";
import { generateFullDayPlans } from "@/lib/gym/meal-plan";
import {
  BREAKFAST_OPTIONS,
  MEAL_OPTIONS,
  SNACK_OPTIONS,
  kcalFromMacros,
  type MealOption,
} from "@/lib/data/meal-plan-foods";

const ALL = [...BREAKFAST_OPTIONS, ...SNACK_OPTIONS, ...MEAL_OPTIONS];

describe("the food list", () => {
  // Portions are approximate by nature, but they must not contradict
  // themselves: a day's totals are built by adding these up.
  it.each(ALL)("$name: macros add up to its stated calories", (meal) => {
    const drift = Math.abs(kcalFromMacros(meal) - meal.kcal) / meal.kcal;
    expect(drift).toBeLessThanOrEqual(0.05);
  });

  it("uses whole, non-negative grams throughout", () => {
    for (const m of ALL) {
      for (const value of [m.kcal, m.proteinG, m.carbsG, m.fatG]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has no duplicate names, which would make a day read as a mistake", () => {
    expect(new Set(ALL.map((m) => m.name)).size).toBe(ALL.length);
  });
});

/** The closest any snack combination can bring `base` to the goal. */
function bestAchievableMiss(base: number, goal: number): number {
  let best = Math.abs(base - goal);
  for (let a = 0; a < SNACK_OPTIONS.length; a++) {
    best = Math.min(best, Math.abs(base + SNACK_OPTIONS[a].proteinG - goal));
    for (let b = a + 1; b < SNACK_OPTIONS.length; b++) {
      best = Math.min(best, Math.abs(base + SNACK_OPTIONS[a].proteinG + SNACK_OPTIONS[b].proteinG - goal));
    }
  }
  return best;
}

const GOALS = [120, 130, 150, 160, 170, 180];
const VARIANTS = [0, 1, 2, 5];

describe("generateFullDayPlans", () => {
  it("lays out five weekdays, breakfast first and dinner last", () => {
    const plans = generateFullDayPlans(0, 150);
    expect(plans.map((p) => p.day)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    for (const p of plans) {
      expect(p.meals[0].slot).toBe("Breakfast");
      expect(p.meals[p.meals.length - 1].slot).toBe("Dinner");
      expect(new Set(p.meals.map((m) => m.slot)).size).toBe(p.meals.length);
    }
  });

  it("serves a different lunch and dinner on a day", () => {
    for (const p of generateFullDayPlans(0, 150)) {
      const lunch = p.meals.find((m) => m.slot === "Lunch")!;
      const dinner = p.meals.find((m) => m.slot === "Dinner")!;
      expect(lunch.name).not.toBe(dinner.name);
    }
  });

  // The honesty guarantee: a plan may only use portions from the list, exactly
  // as listed. Scaling one to hit a number would make the totals fiction.
  it("only ever uses listed portions, unchanged", () => {
    const byName = new Map(ALL.map((m) => [m.name, m] as const));
    for (const goal of GOALS) {
      for (const variant of VARIANTS) {
        for (const p of generateFullDayPlans(variant, goal)) {
          for (const meal of p.meals) {
            const source = byName.get(meal.name);
            expect(source, `${meal.name} is not on the list`).toBeDefined();
            const portion: MealOption = {
              name: meal.name,
              kcal: meal.kcal,
              proteinG: meal.proteinG,
              carbsG: meal.carbsG,
              fatG: meal.fatG,
            };
            expect(portion).toEqual(source);
          }
        }
      }
    }
  });

  it("reports totals that are the sum of the day's meals", () => {
    for (const p of generateFullDayPlans(3, 160)) {
      const summed = p.meals.reduce(
        (t, m) => ({
          kcal: t.kcal + m.kcal,
          proteinG: t.proteinG + m.proteinG,
          carbsG: t.carbsG + m.carbsG,
          fatG: t.fatG + m.fatG,
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      );
      expect(p.totals).toEqual(summed);
      expect(p.proteinVsGoal).toBe(p.totals.proteinG - 160);
    }
  });

  it("picks the snacks that land the day as close to the goal as the list allows", () => {
    for (const goal of GOALS) {
      for (const variant of VARIANTS) {
        for (const p of generateFullDayPlans(variant, goal)) {
          const snackProtein = p.meals
            .filter((m) => m.slot === "Snack" || m.slot === "Second snack")
            .reduce((sum, m) => sum + m.proteinG, 0);
          expect(Math.abs(p.proteinVsGoal)).toBe(bestAchievableMiss(p.totals.proteinG - snackProtein, goal));
        }
      }
    }
  });

  it("never stacks more than two snacks onto a day", () => {
    for (const goal of GOALS) {
      for (const p of generateFullDayPlans(0, goal)) {
        expect(p.meals.filter((m) => m.slot.includes("nack")).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("gets every day within 10g of a realistic protein goal", () => {
    for (const goal of GOALS) {
      for (const variant of VARIANTS) {
        for (const p of generateFullDayPlans(variant, goal)) {
          expect(Math.abs(p.proteinVsGoal), `${goal}g goal, ${p.day}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("keeps the calories in a sane range while chasing the protein", () => {
    for (const goal of GOALS) {
      for (const p of generateFullDayPlans(0, goal)) {
        expect(p.totals.kcal).toBeGreaterThan(1200);
        expect(p.totals.kcal).toBeLessThan(3200);
      }
    }
  });

  it("is deterministic per variant, so the same plan comes back on a refresh", () => {
    expect(generateFullDayPlans(3, 160)).toEqual(generateFullDayPlans(3, 160));
  });

  it("actually changes when you regenerate", () => {
    expect(generateFullDayPlans(0, 160)).not.toEqual(generateFullDayPlans(1, 160));
  });

  it("follows the goal rather than a hardcoded number", () => {
    const low = generateFullDayPlans(0, 120).map((p) => p.totals.proteinG);
    const high = generateFullDayPlans(0, 180).map((p) => p.totals.proteinG);
    expect(Math.max(...low)).toBeLessThan(Math.min(...high));
  });
});
