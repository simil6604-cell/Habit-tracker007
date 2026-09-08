import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createWorkout } from "@/lib/gym/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkoutPlanCard } from "@/components/gym/workout-plan-card";
import { MealsPanel } from "@/components/gym/meals-panel";
import { NutritionBalanceCard } from "@/components/gym/nutrition-balance-card";
import { GoalsPanel } from "@/components/shared/goals-panel";
import { GYM_GOALS } from "@/lib/data/football";
import { getNutritionSummary } from "@/lib/gym/nutrition-summary";

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

  const [meals, goals, nutritionSummary] = await Promise.all([
    prisma.meal.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 10 }),
    prisma.goal.findMany({ where: { userId, category: "GYM" }, orderBy: { createdAt: "asc" } }),
    getNutritionSummary(userId),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🏋️ Gym</h1>
          <p className="mt-1 text-muted">Plans, logging and progress — built for consistency, not extremes.</p>
        </div>
        <Link href="/gym/history"><Button variant="outline">History & progress</Button></Link>
      </div>

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
          <CardHeader><CardTitle>Meals</CardTitle></CardHeader>
          <CardContent>
            <MealsPanel meals={meals} totalToday={nutritionSummary.consumedToday} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Calorie Balance Today</CardTitle></CardHeader>
        <CardContent>
          <NutritionBalanceCard summary={nutritionSummary} />
        </CardContent>
      </Card>
    </div>
  );
}
