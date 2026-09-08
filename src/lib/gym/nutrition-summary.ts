import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay } from "date-fns";

export type NutritionSummary = {
  consumedToday: number;
  burnedToday: number;
  dailyCalorieGoal: number | null;
  remaining: number | null;
};

export async function getNutritionSummary(userId: string): Promise<NutritionSummary> {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());

  const [meals, sessions, user] = await Promise.all([
    prisma.meal.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const consumedToday = meals.reduce((sum, m) => sum + (m.kcal ?? 0), 0);
  const burnedToday = sessions.reduce((sum, s) => sum + (s.caloriesBurned ?? 0), 0);
  const dailyCalorieGoal = user?.dailyCalorieGoal ?? null;
  const remaining = dailyCalorieGoal !== null ? dailyCalorieGoal + burnedToday - consumedToday : null;

  return { consumedToday, burnedToday, dailyCalorieGoal, remaining };
}
