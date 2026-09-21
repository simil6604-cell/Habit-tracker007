import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateFullDayPlans } from "@/lib/gym/meal-plan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DayPlanCard } from "@/components/gym/day-plan-card";

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

  const days = generateFullDayPlans(variant, proteinGoalG);
  const avgKcal = Math.round(days.reduce((s, d) => s + d.totals.kcal, 0) / days.length);
  const avgProtein = Math.round(days.reduce((s, d) => s + d.totals.proteinG, 0) / days.length);
  const avgCarbs = Math.round(days.reduce((s, d) => s + d.totals.carbsG, 0) / days.length);
  const avgFat = Math.round(days.reduce((s, d) => s + d.totals.fatG, 0) / days.length);
  const daysOnTarget = days.filter((d) => Math.abs(d.proteinVsGoal) <= 10).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Example days</h1>
          <p className="mt-1 text-muted">
            Five full days, breakfast through dinner, built around your {proteinGoalG}g protein goal.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/gym"><Button variant="outline">Back to Gym</Button></Link>
          <Link href={`/gym/meal-plan?variant=${variant + 1}`}><Button variant="secondary">Regenerate</Button></Link>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>How these days are built</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{avgProtein}g</p>
              <p className="text-xs text-muted">avg protein/day (goal {proteinGoalG}g)</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{avgKcal}</p>
              <p className="text-xs text-muted">
                avg kcal/day{calorieGoal ? ` (goal ${calorieGoal})` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{avgCarbs}g / {avgFat}g</p>
              <p className="text-xs text-muted">avg carbs / fat per day</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-semibold">{daysOnTarget}/{days.length}</p>
              <p className="text-xs text-muted">days within 10g of the goal</p>
            </div>
          </div>

          <p className="text-sm text-muted">
            Breakfast and a balanced lunch/dinner pair are set first, then up to two snacks are picked as whichever
            listed combination lands the day closest to {proteinGoalG}g. If a day is still more than 10g short, one of
            its main meals is swapped for a bigger one rather than piling on another snack. Every gram comes from a
            listed portion — nothing is scaled or invented to make the number work — and any day that still lands
            short or over says so on its badge.
          </p>
          {!calorieGoal && (
            <p className="text-sm text-muted">
              No daily calorie goal set — <Link href="/settings" className="text-accent">set one in Settings</Link> to
              see how these days compare to a calorie target too.
            </p>
          )}
          <p className="text-xs text-muted">
            Widely-published approximate values for typical portions, not a measured or personalised nutrition plan.
            Swap any meal for something you actually have and adjust portions to your own needs — and log what you
            really ate on the Gym page, where you can also photograph a meal and have the AI estimate it.
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {days.map((d) => (
          <DayPlanCard key={d.day} plan={d} />
        ))}
      </div>
    </div>
  );
}
