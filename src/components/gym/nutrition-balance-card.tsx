import Link from "next/link";
import type { NutritionSummary } from "@/lib/gym/nutrition-summary";

export function NutritionBalanceCard({ summary }: { summary: NutritionSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border p-3 text-center">
        <p className="text-xl font-semibold">{summary.consumedToday}</p>
        <p className="text-xs text-muted">kcal eaten today</p>
      </div>
      <div className="rounded-xl border border-border p-3 text-center">
        <p className="text-xl font-semibold">{summary.burnedToday}</p>
        <p className="text-xs text-muted">kcal burned (workouts)</p>
      </div>
      {summary.dailyCalorieGoal !== null ? (
        <>
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="text-xl font-semibold">{summary.dailyCalorieGoal}</p>
            <p className="text-xs text-muted">your daily goal</p>
          </div>
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="text-xl font-semibold">{summary.remaining}</p>
            <p className="text-xs text-muted">kcal remaining</p>
          </div>
        </>
      ) : (
        <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
          <Link href="/settings" className="text-accent">Set a daily goal in Settings</Link>&nbsp;to see what&apos;s left today.
        </div>
      )}
    </div>
  );
}
