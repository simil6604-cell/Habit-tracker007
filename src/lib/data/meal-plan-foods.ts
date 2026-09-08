// Ready-made lunch/dinner combos (protein source + carb side + vegetables),
// with widely-published approximate kcal/protein for the described portion.
// A starting point to rotate through — swap anything for what you actually
// have, and adjust portions to taste. Never a strict, enforced diet.
export type MealOption = { name: string; kcal: number; proteinG: number };

export const MEAL_OPTIONS: MealOption[] = [
  { name: "Grilled chicken breast, rice & steamed broccoli", kcal: 610, proteinG: 58 },
  { name: "Baked salmon, sweet potato & green beans", kcal: 606, proteinG: 45 },
  { name: "Lean beef stir-fry with rice & mixed vegetables", kcal: 615, proteinG: 50 },
  { name: "Turkey breast, quinoa & side salad", kcal: 585, proteinG: 63 },
  { name: "Tofu & vegetable stir-fry with rice", kcal: 520, proteinG: 28 },
  { name: "Tuna pasta salad with mixed greens", kcal: 560, proteinG: 44 },
  { name: "Shrimp stir-fry with rice noodles & vegetables", kcal: 540, proteinG: 40 },
  { name: "Cottage cheese bowl with quinoa, cucumber & tomato", kcal: 480, proteinG: 42 },
  { name: "Lentil & vegetable curry with rice", kcal: 560, proteinG: 33 },
  { name: "Egg & vegetable fried rice", kcal: 520, proteinG: 30 },
  { name: "Grilled chicken wrap with side salad", kcal: 550, proteinG: 48 },
  { name: "Baked cod, couscous & roasted vegetables", kcal: 480, proteinG: 42 },
  { name: "Chickpea & vegetable stew with couscous", kcal: 540, proteinG: 26 },
  { name: "Turkey meatballs with pasta & tomato sauce", kcal: 620, proteinG: 46 },
  { name: "Steak, potatoes & green beans", kcal: 640, proteinG: 52 },
  { name: "Chicken & quinoa bowl with Greek yogurt dressing", kcal: 560, proteinG: 52 },
];
