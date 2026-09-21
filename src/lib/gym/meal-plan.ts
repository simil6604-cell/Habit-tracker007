import {
  MEAL_OPTIONS,
  BREAKFAST_OPTIONS,
  SNACK_OPTIONS,
  type MealOption,
} from "@/lib/data/meal-plan-foods";

export type MealSlot = "Breakfast" | "Lunch" | "Snack" | "Second snack" | "Dinner";
export type PlannedMeal = MealOption & { slot: MealSlot };

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type FullDayPlan = {
  day: string;
  /** In the order you'd eat them: breakfast, lunch, snack(s), dinner. */
  meals: PlannedMeal[];
  totals: Totals;
  proteinGoalG: number;
  /** Signed: positive means the day lands over the goal. */
  proteinVsGoal: number;
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

function sum(meals: MealOption[]): Totals {
  return meals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      proteinG: t.proteinG + m.proteinG,
      carbsG: t.carbsG + m.carbsG,
      fatG: t.fatG + m.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

/** Every way to take no snack, one snack, or two distinct snacks. */
const SNACK_COMBOS: MealOption[][] = (() => {
  const combos: MealOption[][] = [[]];
  for (let a = 0; a < SNACK_OPTIONS.length; a++) {
    combos.push([SNACK_OPTIONS[a]]);
    for (let b = a + 1; b < SNACK_OPTIONS.length; b++) combos.push([SNACK_OPTIONS[a], SNACK_OPTIONS[b]]);
  }
  return combos;
})();

/**
 * The snack combination that lands `baseProtein` closest to the goal. Ties go
 * to fewer snacks and then to fewer calories, so a day is never padded with
 * food it doesn't need to hit the same number.
 */
function bestSnacks(baseProtein: number, proteinGoalG: number): MealOption[] {
  const rank = (combo: MealOption[]): [number, number, number] => {
    const t = sum(combo);
    return [Math.abs(baseProtein + t.proteinG - proteinGoalG), combo.length, t.kcal];
  };
  return SNACK_COMBOS.reduce((best, combo) => {
    const [m, n, k] = rank(combo);
    const [bm, bn, bk] = rank(best);
    return m < bm || (m === bm && (n < bn || (n === bn && k < bk))) ? combo : best;
  }, [] as MealOption[]);
}

/**
 * Builds five example days, breakfast through dinner, aimed at your own
 * protein goal.
 *
 * Each day starts from a breakfast and a balanced lunch/dinner pair — the
 * week's highest-protein main is paired with its lowest, the second-highest
 * with the second-lowest, and so on, so days land near each other rather than
 * swinging. Snacks are then chosen as whichever listed combination (none, one
 * or two) brings the day closest to the goal. If a day is still more than 10g
 * short, the lighter of its two mains is swapped for another main from the
 * week's pool and the snacks re-chosen — a demanding goal needs a bigger
 * dinner, not a third snack.
 *
 * Every gram comes from a listed portion; nothing is scaled or invented to
 * make the total work, and a day that still can't reach the goal reports the
 * shortfall rather than hiding it.
 */
export function generateFullDayPlans(variant: number, proteinGoalG: number): FullDayPlan[] {
  const breakfasts = seededShuffle(BREAKFAST_OPTIONS, variant + 7);
  const mains = seededShuffle(MEAL_OPTIONS, variant).slice(0, 10);
  const byProteinDesc = [...mains].sort((a, b) => b.proteinG - a.proteinG);
  const rand = mulberry32(variant + 1);

  return WEEKDAYS.map((day, i) => {
    const breakfast = breakfasts[i % breakfasts.length];
    const high = byProteinDesc[i];
    const low = byProteinDesc[9 - i];
    const highIsLunch = rand() > 0.5;

    const build = (other: MealOption) => {
      const lunch = highIsLunch ? high : other;
      const dinner = highIsLunch ? other : high;
      const baseProtein = sum([breakfast, lunch, dinner]).proteinG;
      const snacks = bestSnacks(baseProtein, proteinGoalG);
      const meals: PlannedMeal[] = [
        { ...breakfast, slot: "Breakfast" },
        { ...lunch, slot: "Lunch" },
        ...snacks.map((s, n) => ({ ...s, slot: (n === 0 ? "Snack" : "Second snack") as MealSlot })),
        { ...dinner, slot: "Dinner" },
      ];
      const totals = sum(meals);
      return { day, meals, totals, proteinGoalG, proteinVsGoal: totals.proteinG - proteinGoalG };
    };

    const balanced = build(low);
    if (Math.abs(balanced.proteinVsGoal) <= 10) return balanced;

    // Still off: try the other mains in the pool, keeping the balanced pairing
    // unless another genuinely gets closer (ties keep it, so variety is only
    // given up when it buys something).
    return mains
      .filter((m) => m !== high)
      .map(build)
      .reduce((best, candidate) =>
        Math.abs(candidate.proteinVsGoal) < Math.abs(best.proteinVsGoal) ? candidate : best,
      balanced);
  });
}
