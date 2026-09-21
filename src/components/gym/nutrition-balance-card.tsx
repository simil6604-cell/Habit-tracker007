"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { NutritionSummary } from "@/lib/gym/nutrition-summary";

// Recharts assigns clipPath ids from a module-level counter that can differ
// between the server render and the client render, causing a hydration
// mismatch that makes React discard and remount this whole tree (dropping
// any interaction — e.g. a water-glass tap — that lands during the remount).
// Rendering the gauge client-only avoids the mismatch entirely.
const CalorieGaugeChart = dynamic(
  () => import("@/components/charts/calorie-gauge-chart").then((m) => m.CalorieGaugeChart),
  { ssr: false, loading: () => <div style={{ width: 220, height: 140 }} /> },
);

const MACROS = [
  { key: "carbsToday", goalKey: "dailyCarbsGoalG", label: "Carbs", color: "var(--cat-school)" },
  { key: "proteinToday", goalKey: "dailyProteinGoalG", label: "Protein", color: "var(--cat-gym)" },
  { key: "fatToday", goalKey: "dailyFatGoalG", label: "Fat", color: "var(--cat-exam)" },
] as const;

export function NutritionBalanceCard({ summary }: { summary: NutritionSummary }) {
  const goalSet = summary.dailyCalorieGoal !== null;
  const pct = goalSet ? Math.round((summary.consumedToday / summary.dailyCalorieGoal!) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {goalSet ? (
        <div className="flex items-center justify-around gap-2">
          <div className="text-center">
            <p className="text-lg font-semibold">{summary.consumedToday}</p>
            <p className="text-xs text-muted">Eaten</p>
          </div>
          <CalorieGaugeChart
            pct={pct}
            centerValue={String(Math.max(0, summary.remaining ?? 0))}
            centerLabel="kcal left"
          />
          <div className="text-center">
            <p className="text-lg font-semibold">{summary.burnedToday}</p>
            <p className="text-xs text-muted">Burned</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="text-xl font-semibold">{summary.consumedToday}</p>
            <p className="text-xs text-muted">kcal eaten today</p>
          </div>
          <div className="rounded-xl border border-border p-3 text-center">
            <p className="text-xl font-semibold">{summary.burnedToday}</p>
            <p className="text-xs text-muted">kcal burned (workouts)</p>
          </div>
          <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">
            <Link href="/settings" className="text-accent">Set a daily goal in Settings</Link>&nbsp;to see the gauge and what&apos;s left today.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {MACROS.map((m) => {
          const value = summary[m.key];
          const goal = summary[m.goalKey];
          const macroPct = Math.min(100, Math.round((value / goal) * 100));
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{m.label}</span>
                <span>{value}g / {goal}g</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full" style={{ width: `${macroPct}%`, backgroundColor: m.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
