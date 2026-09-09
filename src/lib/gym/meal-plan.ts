import { MEAL_OPTIONS, type MealOption } from "@/lib/data/meal-plan-foods";

export type DayPlan = {
  day: string;
  lunch: MealOption;
  dinner: MealOption;
  totalKcal: number;
  totalProteinG: number;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Small seeded PRNG so a given variant always produces the same plan
// (deterministic per click of "Regenerate"), without needing to persist it.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks 10 unique combos out of MEAL_OPTIONS for the week, then pairs the
 * highest- and lowest-protein picks together (Monday gets #1 highest + #1
 * lowest, Tuesday #2 + #2, ...) so each day lands close to the same total —
 * stable calories/protein day to day rather than a random spread.
 */
export function generateWeeklyMealPlan(variant: number): DayPlan[] {
  const pool = seededShuffle(MEAL_OPTIONS, variant).slice(0, 10);
  const byProteinDesc = [...pool].sort((a, b) => b.proteinG - a.proteinG);
  const rand = mulberry32(variant + 1);

  return WEEKDAYS.map((day, i) => {
    const high = byProteinDesc[i];
    const low = byProteinDesc[9 - i];
    const highIsLunch = rand() > 0.5;
    const lunch = highIsLunch ? high : low;
    const dinner = highIsLunch ? low : high;
    return {
      day,
      lunch,
      dinner,
      totalKcal: lunch.kcal + dinner.kcal,
      totalProteinG: lunch.proteinG + dinner.proteinG,
    };
  });
}
