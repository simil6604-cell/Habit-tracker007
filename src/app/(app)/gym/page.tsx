import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createWorkout } from "@/lib/gym/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkoutPlanCard } from "@/components/gym/workout-plan-card";
import { MealsByTypePanel } from "@/components/gym/meals-panel";
import { NutritionBalanceCard } from "@/components/gym/nutrition-balance-card";
import { WaterTrackerCard } from "@/components/gym/water-tracker-card";
import { PhysiqueGoalCard } from "@/components/gym/physique-goal-card";
import { GoalsPanel } from "@/components/shared/goals-panel";
import { GYM_GOALS } from "@/lib/data/football";
import { getNutritionSummary } from "@/lib/gym/nutrition-summary";
import { DomainHero } from "@/components/layout/domain-hero";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function GymPage() {
  const session = await auth();
  const userId = session!.user.id;
  const todayIdx = (new Date().getDay() + 6) % 7;

  const workouts = await prisma.workout.findMany({
    where: { userId },
    include: { exercises: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  const todayWorkout = workouts.find((w) => w.dayOfWeek === todayIdx);

  const [meals, goals, nutritionSummary, user] = await Promise.all([
    prisma.meal.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 10 }),
    prisma.goal.findMany({ where: { userId, category: "GYM" }, orderBy: { createdAt: "asc" } }),
    getNutritionSummary(userId),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <DomainHero
        domain="gym"
        emoji="🏋️"
        title="Gym"
        subtitle="Plans, logging and progress — built for consistency, not extremes."
        actions={
          <>
            <Link href="/gym/scanner"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">📷 Scan a product</Button></Link>
            <Link href="/gym/history"><Button className="bg-white text-orange-700 hover:opacity-90">History & progress</Button></Link>
          </>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Today — {DAY_LABELS[todayIdx]}</CardTitle>
        </CardHeader>
        <CardContent>
          {todayWorkout ? (
            <p className="text-sm">
              Scheduled: <span className="font-medium">{todayWorkout.name}</span> ({todayWorkout.exercises.length} exercises)
            </p>
          ) : (
            <p className="text-sm text-muted">No workout scheduled for today. Rest day, or add one below.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Workout Plans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={createWorkout} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="e.g. Upper Body" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <select name="dayOfWeek" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="">No fixed day</option>
              {DAY_LABELS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">Add plan</Button>
          </form>

          {workouts.length === 0 ? (
            <p className="text-sm text-muted">No workout plans yet — create your first one above.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {workouts.map((w) => (
                <WorkoutPlanCard key={w.id} workout={w} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
          <CardContent>
            <GoalsPanel goals={goals} category="GYM" path="/gym" suggestions={GYM_GOALS} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Meals</CardTitle>
            <Link href="/gym/meal-plan"><Button size="sm" variant="outline">Weekly meal plan</Button></Link>
          </CardHeader>
          <CardContent>
            <MealsByTypePanel meals={meals} breakdown={nutritionSummary.mealTypeBreakdown} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Calorie Balance Today</CardTitle></CardHeader>
          <CardContent>
            <NutritionBalanceCard summary={nutritionSummary} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Water</CardTitle></CardHeader>
          <CardContent>
            <WaterTrackerCard waterTodayMl={nutritionSummary.waterTodayMl} dailyWaterGoalMl={nutritionSummary.dailyWaterGoalMl} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader><CardTitle>Physique Goal</CardTitle></CardHeader>
          <CardContent>
            <PhysiqueGoalCard currentWeightKg={user?.weightKg ?? null} targetWeightKg={user?.targetWeightKg ?? null} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
