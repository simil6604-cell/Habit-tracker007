import Link from "next/link";
import type { NutritionSummary } from "@/lib/gym/nutrition-summary";

export function NutritionBalanceCard({ summary }: { summary: NutritionSummary }) {
  const proteinPct = Math.min(100, Math.round((summary.proteinToday / summary.dailyProteinGoalG) * 100));

  return (
    <div className="flex flex-col gap-4">
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

      <div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Protein today</span>
          <span>{summary.proteinToday}g / {summary.dailyProteinGoalG}g goal</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-[var(--cat-gym)]" style={{ width: `${proteinPct}%` }} />
        </div>
        {summary.proteinRemaining > 0 ? (
          <p className="mt-1 text-xs text-muted">{summary.proteinRemaining}g protein still to go today.</p>
        ) : (
          <p className="mt-1 text-xs text-muted">Protein goal hit for today. 💪</p>
        )}
      </div>
    </div>
  );
}
