import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { getHabitTrackerData } from "@/lib/school/habit-tracker";
import { createSchoolHabit } from "@/lib/school/habit-actions";
import { HABIT_SUGGESTIONS } from "@/lib/data/school-habits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HabitTrackerGrid } from "@/components/school/habit-tracker-grid";
import { HabitTrendChart } from "@/components/charts/habit-trend-chart";

export default async function SchoolHabitsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const data = await getHabitTrackerData(userId);
  const chartData = data.dailyStats.map((s) => ({ label: s.label, pct: s.pct }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habit Tracker</h1>
          <p className="mt-1 text-muted">Your own recurring school habits, checked off day by day — last 4 weeks at a glance.</p>
        </div>
        <Link href="/school"><Button variant="outline">Back to School</Button></Link>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Add a habit</CardTitle></CardHeader>
        <CardContent>
          <form action={createSchoolHabit} className="flex flex-wrap gap-2">
            <input
              name="emoji"
              placeholder="📘"
              maxLength={4}
              className="w-16 rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm"
            />
            <input
              name="name"
              required
              list="habit-suggestions"
              placeholder="e.g. Reviewed today's lessons"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <datalist id="habit-suggestions">
              {HABIT_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Button type="submit" size="sm" variant="secondary">Add habit</Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Fully your own — pick anything worth tracking daily for school. Nothing here is preset or graded for you.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Last 4 weeks</CardTitle></CardHeader>
        <CardContent>
          {data.habits.length === 0 ? (
            <p className="text-sm text-muted">Add a habit above to start tracking.</p>
          ) : (
            <HabitTrackerGrid
              habits={data.habits}
              weeks={data.weeks}
              doneSet={data.doneSet}
              dailyStats={data.dailyStats}
              habitStats={data.habitStats}
            />
          )}
        </CardContent>
      </Card>

      {data.habits.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Daily completion trend</CardTitle></CardHeader>
          <CardContent><HabitTrendChart data={chartData} /></CardContent>
        </Card>
      )}
    </div>
  );
}
