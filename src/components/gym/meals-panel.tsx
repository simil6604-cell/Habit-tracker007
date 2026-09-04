import { createMeal, deleteMeal } from "@/lib/nutrition/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";

type Meal = { id: string; type: string; description: string; date: Date };

export function MealsPanel({ meals }: { meals: Meal[] }) {
  return (
    <div className="flex flex-col gap-3">
      <form action={createMeal} className="flex flex-wrap gap-2">
        <select name="type" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
          <option value="BREAKFAST">Breakfast</option>
          <option value="LUNCH">Lunch</option>
          <option value="DINNER">Dinner</option>
          <option value="SNACK">Snack</option>
        </select>
        <input name="description" required placeholder="What did you eat?" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <Button type="submit" size="sm" variant="secondary">Log meal</Button>
      </form>
      <p className="text-xs text-muted">
        No calorie targets or crash diets here — just balanced energy for school, gym and football.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {meals.length === 0 && <p className="py-2 text-sm text-muted">No meals logged yet.</p>}
        {meals.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge>{m.type}</Badge>
              <span>{m.description}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{format(m.date, "MMM d")}</span>
              <form action={deleteMeal.bind(null, m.id)}>
                <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
