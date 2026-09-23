import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleSchoolHabitLog } from "@/lib/school/habit-actions";
import type { HabitDay } from "@/lib/school/habit-tracker";

/**
 * A week of days, each its own checklist with its own score at the bottom.
 *
 * Every tick is a form post rather than client state: a checklist you tap on
 * your phone and then close has to have actually saved, and an optimistic
 * checkbox that silently lost its write is the one failure this screen cannot
 * afford.
 */
export function HabitDayCards({ days }: { days: HabitDay[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="habit-day-cards">
      {days.map((day) => (
        <DayCard key={day.dateKey} day={day} />
      ))}
    </div>
  );
}

function DayCard({ day }: { day: HabitDay }) {
  return (
    <div
      data-testid={`habit-card-${day.dateKey}`}
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-3",
        day.isToday ? "border-cat-school ring-1 ring-cat-school/40" : "border-border",
        day.isFuture && "opacity-60"
      )}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <span className="text-sm font-semibold">
          {day.weekdayLabel}
          {day.isToday && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cat-school">Today</span>}
        </span>
        <span className="text-xs text-muted">{day.dateLabel}</span>
      </div>

      <ul className="flex flex-1 flex-col gap-1 py-2">
        {day.checks.map((check) => (
          <li key={check.habitId}>
            <form action={toggleSchoolHabitLog.bind(null, check.habitId, day.dateKey)}>
              <button
                type="submit"
                disabled={day.isFuture}
                title={day.isFuture ? "Not yet — this day hasn't happened" : check.name}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition",
                  day.isFuture ? "cursor-not-allowed" : "hover:bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    check.done ? "border-cat-school bg-cat-school text-white" : "border-border"
                  )}
                  aria-hidden
                >
                  {check.done && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={cn(check.done && "text-muted line-through")}>
                  {check.emoji ? `${check.emoji} ` : ""}
                  {check.name}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="border-t border-border pt-2">
        {day.isFuture || day.totalCount === 0 ? (
          // A day that hasn't happened is not 0% — showing it as one makes
          // every Monday look like the week already collapsed.
          <p className="text-xs text-muted">{day.isFuture ? "Not yet" : "No habits yet"}</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">
                {day.doneCount} of {day.totalCount}
              </span>
              <span className="text-sm font-semibold" data-testid={`habit-pct-${day.dateKey}`}>
                {day.pct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-cat-school" style={{ width: `${day.pct}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
