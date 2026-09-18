import type { FullDayPlan } from "@/lib/gym/meal-plan";
import { Badge } from "@/components/ui/badge";

const SLOT_EMOJI: Record<string, string> = {
  Breakfast: "🌅",
  Lunch: "🍽️",
  Snack: "🥤",
  "Second snack": "🥤",
  Dinner: "🌙",
};

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: color }} />{" "}
      {label} {grams}g
    </span>
  );
}

export function DayPlanCard({ plan }: { plan: FullDayPlan }) {
  const { totals, proteinVsGoal, proteinGoalG } = plan;
  const onTarget = Math.abs(proteinVsGoal) <= 10;

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{plan.day}</h3>
        <Badge variant={onTarget ? "success" : "warning"}>
          {totals.proteinG}g protein
          {proteinVsGoal === 0
            ? " — exactly on goal"
            : proteinVsGoal > 0
              ? ` — ${proteinVsGoal}g over ${proteinGoalG}g`
              : ` — ${-proteinVsGoal}g short of ${proteinGoalG}g`}
        </Badge>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {plan.meals.map((m) => (
          <li key={m.slot} className="rounded-xl bg-surface-muted px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm">
                <span className="text-muted">{SLOT_EMOJI[m.slot]} {m.slot}</span> · {m.name}
              </p>
              <p className="text-xs font-medium">{m.kcal} kcal</p>
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
              <Macro label="P" grams={m.proteinG} color="var(--cat-gym)" />
              <Macro label="C" grams={m.carbsG} color="var(--cat-school)" />
              <Macro label="F" grams={m.fatG} color="var(--cat-exam)" />
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-sm">
        <span className="font-medium">Day total</span>
        <span className="flex flex-wrap gap-x-3 text-xs text-muted">
          <Macro label="P" grams={totals.proteinG} color="var(--cat-gym)" />
          <Macro label="C" grams={totals.carbsG} color="var(--cat-school)" />
          <Macro label="F" grams={totals.fatG} color="var(--cat-exam)" />
        </span>
        <span className="font-medium">{totals.kcal} kcal</span>
      </div>
    </div>
  );
}
