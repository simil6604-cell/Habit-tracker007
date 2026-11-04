import Link from "next/link";
import { addMonths, format, isToday, startOfDay, subMonths } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createTask } from "@/lib/tasks/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskItem } from "@/components/tasks/task-item";
import { PlanMonthTable } from "@/components/tasks/plan-month-table";
import { PlanItemRow } from "@/components/tasks/plan-item-row";
import { getPlanMonth } from "@/lib/plan/plan-data";
import { KIND_META, DOMAIN_META } from "@/lib/plan/plan";
import {
  countStates,
  dayKey,
  groupByDay,
  indexChecks,
  itemsOn,
  monthParam,
  parseDay,
  parseMonth,
  planState,
} from "@/lib/plan/plan";

export const metadata = { title: "Tasks" };

/**
 * Everything you have to do, from all three parts of your life at once.
 *
 * Homework and exams live under School, the workout under Gym, training and
 * matches under Football. Each of those is a good place to plan one and a bad
 * place to answer "what do I actually have to do this week" — which means
 * opening three pages and holding the answer in your head.
 *
 * Nothing is copied here. Each row still belongs to the page that owns it and
 * links back to it; what this page adds is the one thing none of them can
 * have on its own — the whole week in one place, and a record of what
 * actually happened.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = startOfDay(new Date());
  const month = parseMonth(first("month"), today);
  const selectedDay = parseDay(first("day"));

  const [{ items, checks, unscheduled }, tasks] = await Promise.all([
    getPlanMonth(userId, month),
    prisma.task.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] }),
  ]);

  const checkIndex = indexChecks(checks);
  const counts = countStates(items, checkIndex);
  const days = groupByDay(selectedDay ? itemsOn(items, selectedDay) : items);

  // Tasks with no date at all never reach the month view — there is no day to
  // put them on. They are still things you wrote down, so they keep their own
  // list rather than disappearing.
  const undated = tasks.filter((task) => task.dueDate === null && task.status !== "DONE");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <p className="mt-1 text-muted">
        School, gym and football in one list — what it is, what it takes, and whether it happened.
      </p>

      <Card className="mt-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{format(month, "MMMM yyyy")}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Link
              href={`/tasks?month=${monthParam(subMonths(month, 1))}`}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent/50"
            >
              ← {format(subMonths(month, 1), "MMM")}
            </Link>
            <Link
              href={`/tasks?month=${monthParam(today)}`}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent/50"
            >
              This month
            </Link>
            <Link
              href={`/tasks?month=${monthParam(addMonths(month, 1))}`}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent/50"
            >
              {format(addMonths(month, 1), "MMM")} →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <PlanMonthTable month={month} items={items} checks={checkIndex} selected={selectedDay} today={today} />
          <p className="mt-3 text-xs text-muted" data-testid="plan-counts">
            {counts.total === 0
              ? "Nothing on this month yet — homework, workouts, training and matches all land here on their own."
              : `${counts.total} this month · ${counts.done} done · ${counts.missed} missed · ${counts.open} still open`}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {selectedDay ? format(selectedDay, "EEEE d MMMM") : `Everything in ${format(month, "MMMM")}`}
          </CardTitle>
          {selectedDay && (
            <Link
              href={`/tasks?month=${monthParam(month)}`}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-accent/50"
            >
              Show the whole month
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <p className="py-2 text-sm text-muted">
              {selectedDay ? "Nothing on this day." : "Nothing on this month."}
            </p>
          ) : (
            <div className="flex flex-col gap-5" data-testid="plan-days">
              {days.map((day) => (
                <section key={dayKey(day.date)} id={`day-${dayKey(day.date)}`} className="scroll-mt-20">
                  <h3 className="text-sm font-semibold">
                    {format(day.date, "EEEE d MMMM")}
                    {isToday(day.date) && <span className="ml-2 text-xs text-accent">today</span>}
                  </h3>
                  <ul className="mt-1 flex flex-col divide-y divide-border">
                    {day.items.map((item) => (
                      <PlanItemRow
                        key={`${item.sourceKey}-${dayKey(item.date)}`}
                        item={item}
                        state={planState(item, checkIndex)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Add a task</CardTitle></CardHeader>
        <CardContent>
          <form action={createTask} className="flex flex-wrap gap-2">
            <input name="title" required placeholder="Task title" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <select name="category" aria-label="Category" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="GENERAL">General</option>
              <option value="SCHOOL">School</option>
              <option value="GYM">Gym</option>
              <option value="FOOTBALL">Football</option>
            </select>
            <select name="priority" aria-label="Priority" defaultValue="MEDIUM" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <input name="dueDate" type="date" aria-label="Due date" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
            <input name="estimatedMin" type="number" placeholder="Minutes" aria-label="Minutes" className="w-24 rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
            <Button type="submit" size="sm" variant="secondary">Add</Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            A task with a date joins the month above. One without stays in the list below until you give it one.
          </p>
        </CardContent>
      </Card>

      {(undated.length > 0 || unscheduled.length > 0) && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Not on a day yet ({undated.length + unscheduled.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="pb-2 text-xs text-muted">
              Real work with no day on it, so there is nowhere in the month to put it. Give it one where it
              lives and it joins the table above.
            </p>
            {unscheduled.length > 0 && (
              <ul className="flex flex-col divide-y divide-border" data-testid="plan-unscheduled">
                {unscheduled.map((plan) => {
                  const meta = KIND_META[plan.kind];
                  const domain = DOMAIN_META[meta.domain];
                  return (
                    <li
                      key={plan.sourceKey}
                      data-testid={`plan-unscheduled-${plan.sourceKey}`}
                      className="flex flex-col gap-1 border-l-2 py-3 pl-3"
                      style={{ borderLeftColor: domain.color }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden>{meta.emoji}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                          style={{ background: `color-mix(in oklab, ${domain.color} 25%, transparent)` }}
                        >
                          {meta.label}
                        </span>
                        {plan.context && <span className="text-xs text-muted">{plan.context}</span>}
                      </div>
                      <p className="text-sm font-medium">{plan.title}</p>
                      <ul className="flex flex-col gap-0.5">
                        {plan.detail.slice(0, 4).map((line, index) => (
                          <li key={`${line.label}-${index}`} className="flex flex-wrap gap-x-2 text-xs text-muted">
                            <span>{line.label}</span>
                            {line.value && <span className="tabular-nums">{line.value}</span>}
                          </li>
                        ))}
                      </ul>
                      <Link href={plan.href} className="text-xs text-accent underline-offset-2 hover:underline">
                        Give it a day in {domain.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {undated.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {undated.map((task) => <TaskItem key={task.id} task={task} />)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
