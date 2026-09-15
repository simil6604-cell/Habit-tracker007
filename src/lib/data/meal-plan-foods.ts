// Ready-made meal ideas with widely-published approximate macros for the
// described portion. A starting point to rotate through — swap anything for
// what you actually have, and adjust portions to taste. Never a strict,
// enforced diet, and never a measurement of what you personally ate.
//
// Every entry's macros are internally consistent: 4·protein + 4·carbs +
// 9·fat lands within a few percent of the stated kcal (checked by the
// macro-consistency test), so a day's totals can't quietly contradict
// themselves even though the portions are approximate.
export type MealOption = {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const BREAKFAST_OPTIONS: MealOption[] = [
  { name: "Greek yogurt with berries, oats & honey", kcal: 415, proteinG: 32, carbsG: 52, fatG: 9 },
  { name: "Scrambled eggs on wholegrain toast with avocado", kcal: 465, proteinG: 26, carbsG: 32, fatG: 26 },
  { name: "Protein oats with banana & peanut butter", kcal: 520, proteinG: 38, carbsG: 60, fatG: 14 },
  { name: "Cottage cheese with rye bread, tomato & chives", kcal: 360, proteinG: 34, carbsG: 38, fatG: 8 },
  { name: "Omelette with cheese, spinach & a wholegrain roll", kcal: 450, proteinG: 33, carbsG: 30, fatG: 22 },
  { name: "Quark bowl with muesli, apple & cinnamon", kcal: 425, proteinG: 36, carbsG: 55, fatG: 7 },
  { name: "Smoked salmon bagel with cream cheese", kcal: 450, proteinG: 28, carbsG: 48, fatG: 16 },
  { name: "Skyr with granola, blueberries & almonds", kcal: 415, proteinG: 30, carbsG: 45, fatG: 13 },
];

export const SNACK_OPTIONS: MealOption[] = [
  { name: "Whey shake with milk", kcal: 220, proteinG: 32, carbsG: 14, fatG: 4 },
  { name: "Tuna on crispbread", kcal: 205, proteinG: 24, carbsG: 18, fatG: 4 },
  { name: "Handful of almonds & an apple", kcal: 305, proteinG: 8, carbsG: 28, fatG: 18 },
  { name: "Two boiled eggs & a banana", kcal: 265, proteinG: 14, carbsG: 27, fatG: 11 },
  { name: "Quark with honey", kcal: 180, proteinG: 22, carbsG: 16, fatG: 3 },
  { name: "Protein bar & an orange", kcal: 295, proteinG: 22, carbsG: 34, fatG: 8 },
  { name: "Cheese cubes & wholegrain crackers", kcal: 285, proteinG: 16, carbsG: 22, fatG: 15 },
  { name: "Turkey slices in a wholemeal pita", kcal: 280, proteinG: 26, carbsG: 30, fatG: 6 },
];

/** Lunch/dinner combos: a protein source, a carb side and vegetables. */
export const MEAL_OPTIONS: MealOption[] = [
  { name: "Grilled chicken breast, rice & steamed broccoli", kcal: 610, proteinG: 58, carbsG: 60, fatG: 15 },
  { name: "Baked salmon, sweet potato & green beans", kcal: 606, proteinG: 45, carbsG: 57, fatG: 22 },
  { name: "Lean beef stir-fry with rice & mixed vegetables", kcal: 615, proteinG: 50, carbsG: 62, fatG: 18 },
  { name: "Turkey breast, quinoa & side salad", kcal: 585, proteinG: 63, carbsG: 48, fatG: 15 },
  { name: "Tofu & vegetable stir-fry with rice", kcal: 520, proteinG: 28, carbsG: 62, fatG: 17 },
  { name: "Tuna pasta salad with mixed greens", kcal: 560, proteinG: 44, carbsG: 58, fatG: 17 },
  { name: "Shrimp stir-fry with rice noodles & vegetables", kcal: 540, proteinG: 40, carbsG: 68, fatG: 12 },
  { name: "Cottage cheese bowl with quinoa, cucumber & tomato", kcal: 480, proteinG: 42, carbsG: 45, fatG: 14 },
  { name: "Lentil & vegetable curry with rice", kcal: 560, proteinG: 33, carbsG: 80, fatG: 12 },
  { name: "Egg & vegetable fried rice", kcal: 520, proteinG: 30, carbsG: 55, fatG: 20 },
  { name: "Grilled chicken wrap with side salad", kcal: 550, proteinG: 48, carbsG: 48, fatG: 18 },
  { name: "Baked cod, couscous & roasted vegetables", kcal: 480, proteinG: 42, carbsG: 52, fatG: 11 },
  { name: "Chickpea & vegetable stew with couscous", kcal: 540, proteinG: 26, carbsG: 78, fatG: 14 },
  { name: "Turkey meatballs with pasta & tomato sauce", kcal: 620, proteinG: 46, carbsG: 68, fatG: 18 },
  { name: "Steak, potatoes & green beans", kcal: 640, proteinG: 52, carbsG: 45, fatG: 28 },
  { name: "Chicken & quinoa bowl with Greek yogurt dressing", kcal: 560, proteinG: 52, carbsG: 50, fatG: 17 },
];

/** kcal implied by the macros — 4/4/9 per gram, the standard Atwater factors. */
export function kcalFromMacros(m: MealOption): number {
  return m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
}
