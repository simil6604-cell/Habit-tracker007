import Link from "next/link";
import { format, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DOMAIN_META,
  KIND_META,
  dayKey,
  itemsOn,
  monthParam,
  monthWeeks,
  planState,
  type PlanCheckRow,
  type PlanItem,
} from "@/lib/plan/plan";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * The month as a table of dates, the way a wall calendar is.
 *
 * Asked for with a picture of one. The list underneath says what each day
 * holds; this says where the days are — which week the match falls in, how
 * many free evenings there are before the exam. That is a shape question, and
 * a list cannot answer a shape question.
 *
 * Each day shows its things by name rather than as coloured dots. A dot tells
 * you something is on and makes you tap to find out what, which on the one
 * screen meant to answer "what is this week like" is the whole question
 * unanswered.
 */
export function PlanMonthTable({
  month,
  items,
  checks,
  selected,
  today,
}: {
  month: Date;
  items: PlanItem[];
  checks: Map<string, PlanCheckRow>;
  selected: Date | null;
  today: Date;
}) {
  const weeks = monthWeeks(month);

  return (
    <div>
      {/* No minimum width and no sideways scroll: a month table you have to
          drag to see Saturday and Sunday is a month table that cannot answer
          the question it exists for. The names shrink instead — and below
          640px they give way to a dot per thing, because four truncated
          characters of "Push Day" say less than the colour does. */}
      <table className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1" data-testid="plan-month-table">
        <caption className="sr-only">{format(month, "MMMM yyyy")}, one cell per day</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" className="pb-1 text-center text-[11px] font-medium text-muted">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={dayKey(week[0])}>
              {week.map((day) => {
                const dayItems = itemsOn(items, day);
                const outside = !isSameMonth(day, month);
                return (
                  <td key={dayKey(day)} className="align-top">
                    <Link
                      href={`/tasks?month=${monthParam(month)}&day=${dayKey(day)}#day-${dayKey(day)}`}
                      data-testid={`plan-day-${dayKey(day)}`}
                      aria-current={selected && isSameDay(day, selected) ? "date" : undefined}
                      className={cn(
                        "flex h-full min-h-[3rem] flex-col gap-1 rounded-lg border p-1 transition sm:min-h-[4.5rem] sm:p-1.5",
                        outside ? "border-border/40 opacity-50" : "border-border hover:border-accent/50",
                        isSameDay(day, today) && "border-accent",
                        selected && isSameDay(day, selected) && "bg-accent/10"
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] font-medium tabular-nums",
                          isSameDay(day, today) && "text-accent"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {/* A phone: one dot per thing, in its domain's colour. */}
                      <span className="flex flex-wrap gap-0.5 sm:hidden">
                        {dayItems.slice(0, 4).map((item) => {
                          const state = planState(item, checks).status;
                          return (
                            <span
                              key={`${item.sourceKey}-${dayKey(item.date)}`}
                              className={cn("h-1.5 w-1.5 rounded-full", state === "DONE" && "opacity-40")}
                              style={{
                                background: DOMAIN_META[KIND_META[item.kind].domain].color,
                                outline: state === "MISSED" ? "1px solid var(--danger)" : undefined,
                              }}
                            />
                          );
                        })}
                      </span>
                      {/* Anything wider: the things by name. A dot tells you
                          something is on and makes you tap to find out what,
                          which leaves the question unanswered. */}
                      <span className="hidden flex-col gap-0.5 sm:flex">
                        {dayItems.slice(0, 3).map((item) => {
                          const state = planState(item, checks).status;
                          return (
                            <span
                              key={`${item.sourceKey}-${dayKey(item.date)}`}
                              className={cn(
                                "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                                state === "DONE" && "line-through opacity-60",
                                state === "MISSED" && "opacity-80"
                              )}
                              style={{
                                background: `color-mix(in oklab, ${DOMAIN_META[KIND_META[item.kind].domain].color} 22%, transparent)`,
                              }}
                              title={item.title}
                            >
                              {state === "MISSED" ? "⚠ " : ""}
                              {item.title}
                            </span>
                          );
                        })}
                        {dayItems.length > 3 && (
                          <span className="px-1 text-[10px] text-muted">+{dayItems.length - 3} more</span>
                        )}
                      </span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
