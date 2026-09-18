import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay } from "date-fns";

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

// How a daily calorie goal is split across meal types — a common, widely
// published rule of thumb, not anything measured about the user. Used only
// to give each meal type a target; the app never invents the goal itself.
const MEAL_TYPE_SHARE: Record<MealType, number> = {
  BREAKFAST: 0.3,
  LUNCH: 0.4,
  DINNER: 0.25,
  SNACK: 0.05,
};

export type MealTypeSummary = {
  type: MealType;
  consumedKcal: number;
  targetKcal: number | null;
  lastDescription: string | null;
};

export type NutritionSummary = {
  consumedToday: number;
  burnedToday: number;
  dailyCalorieGoal: number | null;
  remaining: number | null;

  proteinToday: number;
  dailyProteinGoalG: number;
  proteinRemaining: number;

  carbsToday: number;
  dailyCarbsGoalG: number;

  fatToday: number;
  dailyFatGoalG: number;

  mealTypeBreakdown: MealTypeSummary[];

  waterTodayMl: number;
  dailyWaterGoalMl: number;
};

export async function getNutritionSummary(userId: string): Promise<NutritionSummary> {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());

  const [meals, sessions, waterLogs, user] = await Promise.all([
    prisma.meal.findMany({ where: { userId, date: { gte: start, lte: end } }, orderBy: { date: "desc" } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.waterLog.findMany({ where: { userId, loggedAt: { gte: start, lte: end } } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const consumedToday = meals.reduce((sum, m) => sum + (m.kcal ?? 0), 0);
  const burnedToday = sessions.reduce((sum, s) => sum + (s.caloriesBurned ?? 0), 0);
  const dailyCalorieGoal = user?.dailyCalorieGoal ?? null;
  const remaining = dailyCalorieGoal !== null ? dailyCalorieGoal + burnedToday - consumedToday : null;

  const proteinToday = meals.reduce((sum, m) => sum + (m.proteinG ?? 0), 0);
  const dailyProteinGoalG = user?.dailyProteinGoalG ?? 150;
  const proteinRemaining = Math.max(0, dailyProteinGoalG - proteinToday);

  const carbsToday = meals.reduce((sum, m) => sum + (m.carbsG ?? 0), 0);
  const dailyCarbsGoalG = user?.dailyCarbsGoalG ?? 250;

  const fatToday = meals.reduce((sum, m) => sum + (m.fatG ?? 0), 0);
  const dailyFatGoalG = user?.dailyFatGoalG ?? 70;

  const mealTypeBreakdown: MealTypeSummary[] = (["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as MealType[]).map((type) => {
    const typeMeals = meals.filter((m) => m.type === type);
    return {
      type,
      consumedKcal: typeMeals.reduce((sum, m) => sum + (m.kcal ?? 0), 0),
      targetKcal: dailyCalorieGoal !== null ? Math.round(dailyCalorieGoal * MEAL_TYPE_SHARE[type]) : null,
      lastDescription: typeMeals[0]?.description ?? null,
    };
  });

  const waterTodayMl = waterLogs.reduce((sum, w) => sum + w.amountMl, 0);
  const dailyWaterGoalMl = user?.dailyWaterGoalMl ?? 2000;

  return {
    consumedToday,
    burnedToday,
    dailyCalorieGoal,
    remaining,
    proteinToday,
    dailyProteinGoalG,
    proteinRemaining,
    carbsToday,
    dailyCarbsGoalG,
    fatToday,
    dailyFatGoalG,
    mealTypeBreakdown,
    waterTodayMl,
    dailyWaterGoalMl,
  };
}
