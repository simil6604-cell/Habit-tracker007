import { createGoal, deleteGoal } from "@/lib/goals/actions";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Goal = { id: string; title: string; progressPct: number };

export function GoalsPanel({
  goals,
  category,
  path,
  suggestions = [],
}: {
  goals: Goal[];
  category: string;
  path: string;
  suggestions?: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action={createGoal} className="flex flex-wrap gap-2">
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="redirectPath" value={path} />
        <input
          name="title"
          required
          list={`goal-suggestions-${category}`}
          placeholder="New goal"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <datalist id={`goal-suggestions-${category}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button type="submit" size="sm" variant="secondary">Add goal</Button>
      </form>

      {goals.length === 0 ? (
        <p className="text-sm text-muted">No goals set yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm">{g.title}</span>
              <ProgressBar value={g.progressPct} className="flex-1" />
              <span className="w-10 text-right text-xs text-muted">{g.progressPct}%</span>
              <form action={deleteGoal.bind(null, g.id, path)}>
                <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
