import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateWeeklyMealPlan } from "@/lib/gym/meal-plan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant: variantParam } = await searchParams;
  const variant = Number(variantParam ?? 0) || 0;

  const session = await auth();
  const userId = session!.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const proteinGoalG = user.dailyProteinGoalG;
  const calorieGoal = user.dailyCalorieGoal;

  const plan = generateWeeklyMealPlan(variant);
  const weekKcal = plan.reduce((sum, d) => sum + d.totalKcal, 0);
  const weekProtein = plan.reduce((sum, d) => sum + d.totalProteinG, 0);
  const avgDayKcal = Math.round(weekKcal / plan.length);
  const avgDayProtein = Math.round(weekProtein / plan.length);

  // Lunch + dinner is treated as roughly two-thirds of the day's food —
  // breakfast and snacks (logged separately on the Gym page) make up the rest.
  const targetProteinLunchDinner = Math.round(proteinGoalG * 0.65);
  const targetKcalLunchDinner = calorieGoal ? Math.round(calorieGoal * 0.55) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly Meal Plan</h1>
          <p className="mt-1 text-muted">Lunch & dinner ideas for Monday–Friday, built to keep protein and calories steady day to day.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/gym"><Button variant="outline">Back to Gym</Button></Link>
          <Link href={`/gym/meal-plan?variant=${variant + 1}`}><Button variant="secondary">Regenerate</Button></Link>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Your goals</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm">
            Protein goal: <span className="font-medium">{proteinGoalG}g/day</span> — this plan aims for about{" "}
            <span className="font-medium">{targetProteinLunchDinner}g</span> from lunch + dinner combined, leaving
            the rest for breakfast and snacks.
          </p>
          {calorieGoal ? (
            <p className="mt-1 text-sm">
              Calorie goal: <span className="font-medium">{calorieGoal} kcal/day</span> — lunch + dinner target is
              roughly <span className="font-medium">{targetKcalLunchDinner} kcal</span>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              No daily calorie goal set — <Link href="/settings" className="text-accent">set one in Settings</Link>{" "}
              to also see how this plan compares to a calorie target.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            These are widely-published approximate values for typical portions, not a measured or personalized
            nutrition plan — swap any meal for something you actually have, and adjust portions to your own needs.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Week overview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{avgDayKcal}</p>
              <p className="text-xs text-muted">avg kcal/day (lunch+dinner)</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{avgDayProtein}g</p>
              <p className="text-xs text-muted">avg protein/day (lunch+dinner)</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{weekKcal.toLocaleString()}</p>
              <p className="text-xs text-muted">total kcal this week</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{weekProtein}g</p>
              <p className="text-xs text-muted">total protein this week</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Monday – Friday</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3">Lunch</th>
                <th className="py-2 pr-3">Dinner</th>
                <th className="py-2 pr-3 text-right">Day total</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((d) => (
                <tr key={d.day} className="border-b border-border align-top">
                  <td className="py-3 pr-3 font-medium">{d.day}</td>
                  <td className="py-3 pr-3">
                    <p>{d.lunch.name}</p>
                    <p className="text-xs text-muted">{d.lunch.kcal} kcal · {d.lunch.proteinG}g protein</p>
                  </td>
                  <td className="py-3 pr-3">
                    <p>{d.dinner.name}</p>
                    <p className="text-xs text-muted">{d.dinner.kcal} kcal · {d.dinner.proteinG}g protein</p>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <p className="font-medium">{d.totalKcal} kcal</p>
                    <p className="text-xs text-muted">{d.totalProteinG}g protein</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
