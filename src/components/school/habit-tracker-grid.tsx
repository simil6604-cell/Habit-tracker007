import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleSchoolHabitLog, deleteSchoolHabit } from "@/lib/school/habit-actions";
import type { HabitRow, HabitTrackerWeek, DailyStat, HabitStat } from "@/lib/school/habit-tracker";

export function HabitTrackerGrid({
  habits,
  weeks,
  doneSet,
  dailyStats,
  habitStats,
}: {
  habits: HabitRow[];
  weeks: HabitTrackerWeek[];
  doneSet: Set<string>;
  dailyStats: DailyStat[];
  habitStats: HabitStat[];
}) {
  const allDays = weeks.flatMap((w) => w.days);
  const statByHabit = new Map(habitStats.map((s) => [s.habitId, s]));

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface" />
            {weeks.map((w) => (
              <th key={w.label} colSpan={7} className="border-b border-border pb-1 text-center font-medium text-muted">
                {w.label}
              </th>
            ))}
            <th className="pb-1 text-center font-medium text-muted">Rate</th>
          </tr>
          <tr>
            <th className="sticky left-0 z-10 bg-surface" />
            {allDays.map((d) => (
              <th key={d.dateKey} className="w-7 pb-0.5 text-center font-normal text-muted">
                {format(d.date, "EEEEE")}
              </th>
            ))}
            <th />
          </tr>
          <tr>
            <th className="sticky left-0 z-10 bg-surface pb-2 text-left font-medium">Habit</th>
            {allDays.map((d) => (
              <th key={d.dateKey} className="w-7 pb-2 text-center font-normal text-muted">
                {format(d.date, "d")}
              </th>
            ))}
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => {
            const stat = statByHabit.get(h.id);
            return (
              <tr key={h.id} className="border-t border-border">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span>{h.emoji ?? "•"}</span>
                    <span>{h.name}</span>
                    <form action={deleteSchoolHabit.bind(null, h.id)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        <Trash2 size={12} />
                      </button>
                    </form>
                  </div>
                </td>
                {allDays.map((d) => {
                  const checked = doneSet.has(`${h.id}|${d.dateKey}`);
                  return (
                    <td key={d.dateKey} className="p-0.5 text-center">
                      <form action={toggleSchoolHabitLog.bind(null, h.id, d.dateKey)}>
                        <button
                          type="submit"
                          disabled={d.isFuture}
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded border text-[10px]",
                            checked ? "border-cat-school bg-cat-school text-white" : "border-border",
                            d.isFuture && "opacity-30"
                          )}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      </form>
                    </td>
                  );
                })}
                <td className="pl-2 text-right text-muted">{stat ? `${stat.pct}%` : "–"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <td className="sticky left-0 z-10 bg-surface pt-2 font-medium">Done</td>
            {dailyStats.map((s) => (
              <td key={s.dateKey} className="pt-2 text-center text-muted">
                {s.totalCount > 0 ? `${s.pct}%` : "–"}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
