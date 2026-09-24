import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { MAX_WEEKS_BACK, TREND_DAYS, getHabitTrackerData, parseWeekOffset } from "@/lib/school/habit-tracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddHabitForm } from "@/components/school/add-habit-form";
import { HabitDayCards } from "@/components/school/habit-day-cards";
import { HabitAnalysis } from "@/components/school/habit-analysis";
import { HabitTrendChart } from "@/components/charts/habit-trend-chart";

export default async function SchoolHabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekOffset = parseWeekOffset(week);

  const session = await auth();
  const userId = session!.user.id;
  const data = await getHabitTrackerData(userId, weekOffset);

  const olderHref = `/school/habits?week=${Math.min(weekOffset + 1, MAX_WEEKS_BACK)}`;
  const newerHref = weekOffset <= 1 ? "/school/habits" : `/school/habits?week=${weekOffset - 1}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habit Tracker</h1>
          <p className="mt-1 text-muted">
            One checklist per day. Tick things off as you do them; the analysis underneath shows how it&apos;s actually
            going.
          </p>
        </div>
        <Link href="/school">
          <Button variant="outline">Back to School</Button>
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add a habit</CardTitle>
        </CardHeader>
        <CardContent>
          <AddHabitForm />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {data.weekLabel}
            {data.habits.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted" data-testid="week-done-pct">
                {data.weekDonePct}% done
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Link href={olderHref} aria-label="Previous week">
              <Button variant="outline" size="sm" disabled={weekOffset >= MAX_WEEKS_BACK}>
                <ChevronLeft size={14} />
              </Button>
            </Link>
            <Link href={newerHref} aria-label="Next week" className={data.isCurrentWeek ? "pointer-events-none" : ""}>
              <Button variant="outline" size="sm" disabled={data.isCurrentWeek}>
                <ChevronRight size={14} />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {data.habits.length === 0 ? (
            <p className="text-sm text-muted">Add a habit above to start tracking.</p>
          ) : (
            <HabitDayCards days={data.days} />
          )}
        </CardContent>
      </Card>

      {data.habits.length > 0 && (
        <>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Daily completion — last {TREND_DAYS} days</CardTitle>
            </CardHeader>
            <CardContent>
              <HabitTrendChart data={data.trend.map((t) => ({ label: t.label, pct: t.pct }))} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>How each habit is going</CardTitle>
            </CardHeader>
            <CardContent>
              <HabitAnalysis stats={data.habitStats} trackedDays={TREND_DAYS} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
