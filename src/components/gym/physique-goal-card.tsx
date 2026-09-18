import Link from "next/link";
import { logBodyWeight } from "@/lib/gym/actions";
import { Button } from "@/components/ui/button";

export function PhysiqueGoalCard({
  currentWeightKg,
  targetWeightKg,
}: {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
}) {
  const delta = currentWeightKg != null && targetWeightKg != null ? currentWeightKg - targetWeightKg : null;

  return (
    <div className="flex flex-col gap-3">
      <form action={logBodyWeight} className="flex flex-wrap items-center gap-2">
        <input
          name="weightKg"
          type="number"
          step="0.1"
          min={20}
          max={250}
          placeholder="Log today's weight (kg)"
          defaultValue={currentWeightKg ?? undefined}
          className="w-44 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">Log weight</Button>
      </form>

      {targetWeightKg == null ? (
        <p className="text-xs text-muted">
          <Link href="/settings" className="text-accent">Set a target weight in Settings</Link> to track progress toward it here.
        </p>
      ) : delta == null ? (
        <p className="text-xs text-muted">Log your current weight above to see the gap to your target.</p>
      ) : Math.abs(delta) < 0.3 ? (
        <p className="text-sm font-medium text-success">🎯 You&apos;re at your target weight.</p>
      ) : (
        <p className="text-sm">
          <span className="font-semibold">{Math.abs(delta).toFixed(1)} kg</span> {delta > 0 ? "to lose" : "to gain"} to reach your
          target of {targetWeightKg} kg.
        </p>
      )}
      <p className="text-xs text-muted">Not a medical target — just the number you set yourself. See the full trend in History &amp; progress.</p>
    </div>
  );
}
