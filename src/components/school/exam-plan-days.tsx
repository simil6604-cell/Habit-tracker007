import { format, isSameDay, isBefore, startOfDay } from "date-fns";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleExamPlanDay } from "@/lib/school/exam-plan-actions";

export type PlanDayRow = { id: string; date: Date; focus: string; detail: string | null; minutes: number; done: boolean };

/**
 * The run-up, one row per planned day.
 *
 * A day that has passed without being ticked is marked as missed rather than
 * left looking like the future. The point of a plan you can see is knowing
 * where you actually are, and a row that quietly stays neutral forever hides
 * exactly the thing worth noticing.
 */
export function ExamPlanDays({ planId, days }: { planId: string; days: PlanDayRow[] }) {
  const today = startOfDay(new Date());

  return (
    <ol className="flex flex-col gap-2" data-testid="exam-plan-days">
      {days.map((day) => {
        const isToday = isSameDay(day.date, today);
        const missed = !day.done && isBefore(startOfDay(day.date), today);

        return (
          <li key={day.id}>
            <form action={toggleExamPlanDay.bind(null, planId, day.id)}>
              <button
                type="submit"
                data-testid={`plan-day-${format(day.date, "yyyy-MM-dd")}`}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  day.done
                    ? "border-cat-school/40 bg-cat-school/5"
                    : isToday
                      ? "border-cat-school"
                      : missed
                        ? "border-danger/40"
                        : "border-border hover:border-cat-school/40"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    day.done ? "border-cat-school bg-cat-school text-white" : "border-border"
                  )}
                >
                  {day.done && <Check size={12} strokeWidth={3} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-muted">{format(day.date, "EEE d MMM")}</span>
                    {isToday && <span className="text-[10px] font-semibold uppercase tracking-wide text-cat-school">Today</span>}
                    {missed && <span className="text-[10px] font-semibold uppercase tracking-wide text-danger">Missed</span>}
                    <span className="text-[10px] text-muted">{day.minutes} min</span>
                  </span>
                  <span className={cn("block text-sm font-medium", day.done && "text-muted line-through")}>
                    {day.focus}
                  </span>
                  {day.detail && <span className="block text-xs text-muted">{day.detail}</span>}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ol>
  );
}
