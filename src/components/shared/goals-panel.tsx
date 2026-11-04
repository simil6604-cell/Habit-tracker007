import { createGoal, deleteGoal } from "@/lib/goals/actions";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Goal = { id: string; title: string; progressPct: number };

/**
 * Your goals, in your words.
 *
 * The field used to carry a <datalist> of five stock gym goals. On a phone
 * that drops a list over the keyboard as soon as you type, so a box meant for
 * anything at all looked like a menu of five things — and the five were in
 * English, which is not the language most of these get written in.
 *
 * Nothing is offered now. A goal is a sentence somebody means; the app has no
 * business finishing it for them.
 */
export function GoalsPanel({
  goals,
  category,
  path,
}: {
  goals: Goal[];
  category: string;
  path: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action={createGoal} className="flex flex-wrap gap-2">
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="redirectPath" value={path} />
        <input
          name="title"
          required
          autoComplete="off"
          placeholder="Write your own goal…"
          aria-label="New goal"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">Add goal</Button>
      </form>

      {goals.length === 0 ? (
        <p className="text-sm text-muted">No goals set yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* The goal gets its own line and the bar sits under it, rather
                  than the two sharing one. Cut at a fixed width, a goal you
                  wrote yourself loses the end of the sentence — which is
                  usually the part that means something. */}
              <span className="w-full text-sm">{g.title}</span>
              <ProgressBar value={g.progressPct} className="flex-1" />
              <span className="w-10 shrink-0 text-right text-xs text-muted">{g.progressPct}%</span>
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
