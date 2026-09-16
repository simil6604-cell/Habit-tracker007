import type { MealType } from "@/lib/gym/nutrition-summary";

/**
 * The meal you are most likely logging right now.
 *
 * The four sections are collapsed so the page stays a readable overview, but
 * that hid the entry field behind a tap that wasn't obviously an entry field —
 * which reads as "the app won't let me write my own meal". Opening the one
 * that matches the clock puts a text box in front of you when you arrive,
 * without unfolding all four and burying the overview.
 *
 * Boundaries are ordinary mealtimes, not nutrition advice.
 */
export function currentMealType(hour: number): MealType {
  if (hour >= 5 && hour < 11) return "BREAKFAST";
  if (hour >= 11 && hour < 15) return "LUNCH";
  if (hour >= 15 && hour < 18) return "SNACK";
  return "DINNER"; // evening, and the small hours after it
}
