import { Flame, Trash2 } from "lucide-react";
import { deleteSchoolHabit } from "@/lib/school/habit-actions";
import type { HabitStat } from "@/lib/school/habit-tracker";

/**
 * The analysis under the cards: how often each habit actually happens, and how
 * long the current run is.
 *
 * The success rate answers "am I keeping this up"; the streak answers "can I
 * afford to skip tonight". They are different questions and a tracker that
 * only shows one of them is missing half the reason to look.
 */
export function HabitAnalysis({ stats, trackedDays }: { stats: HabitStat[]; trackedDays: number }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="habit-analysis">
      {stats.map((stat) => (
        <li key={stat.habitId} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-sm font-semibold" data-testid={`habit-rate-${stat.habitId}`}>
            {stat.pct}%
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">
                {stat.emoji ? `${stat.emoji} ` : ""}
                {stat.name}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {stat.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-cat-school" title="Days in a row">
                    <Flame size={11} /> {stat.streak}
                  </span>
                )}
                <span>
                  {stat.doneCount}/{trackedDays}
                </span>
                <form action={deleteSchoolHabit.bind(null, stat.habitId)}>
                  <button type="submit" title={`Delete "${stat.name}"`} className="text-muted hover:text-danger">
                    <Trash2 size={12} />
                  </button>
                </form>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-cat-school" style={{ width: `${stat.pct}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
