"use client";

import { useSafeTransition } from "@/lib/hooks/use-safe-transition";
import { useState } from "react";
import { format, isSameDay, isBefore, startOfDay } from "date-fns";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageActions } from "@/components/shared/message-actions";
import { clientFailureMessage } from "@/lib/utils/action-error";
import { MAX_MINUTES, MIN_MINUTES } from "@/lib/school/exam-plan";
import {
  deleteExamPlanDay,
  toggleExamPlanDay,
  updateExamPlanDay,
} from "@/lib/school/exam-plan-actions";

export type PlanDayRow = { id: string; date: Date; focus: string; detail: string | null; minutes: number; done: boolean };

/**
 * The run-up, one row per planned day.
 *
 * A day that has passed without being ticked is marked as missed rather than
 * left looking like the future. The point of a plan you can see is knowing
 * where you actually are, and a row that quietly stays neutral forever hides
 * exactly the thing worth noticing.
 *
 * Every row can now be corrected or removed. It was read-only, which sounds
 * harmless and is not: the plan is written by an AI from what it knew at the
 * time, and the person following it always knows more — the topic was
 * covered in class after all, two hours on a Thursday do not exist, the
 * wording is in the wrong language. Reported in one line: "in diesem Bereich
 * kann ich nichts bearbeiten oder löschen".
 *
 * A client component because an open editor is state. Ticking a day still
 * goes through the same server action it always did.
 */
export function ExamPlanDays({ planId, days }: { planId: string; days: PlanDayRow[] }) {
  const today = startOfDay(new Date());
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useSafeTransition();

  /** Runs one of the day actions and never lets a failure reach the page. */
  const run = (work: () => Promise<{ error?: string }>, done?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await work();
        if (result.error) setError(result.error);
        else done?.();
      } catch {
        // The call never came back. Without this the rejection reaches the
        // error boundary and the whole plan page is replaced by "This page
        // didn't load" — over one tap on a bin.
        setError(clientFailureMessage("That change"));
      }
    });

  return (
    <>
      {error && (
        <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <ol className="flex flex-col gap-2" data-testid="exam-plan-days">
        {days.map((day) => {
          const isToday = isSameDay(day.date, today);
          const missed = !day.done && isBefore(startOfDay(day.date), today);
          const key = format(day.date, "yyyy-MM-dd");

          if (editing === day.id) {
            return (
              <li key={day.id}>
                <form
                  data-testid={`edit-plan-day-form-${key}`}
                  className="flex flex-col gap-2 rounded-xl border border-accent bg-surface-muted p-3"
                  action={(formData: FormData) =>
                    run(
                      () =>
                        updateExamPlanDay(planId, day.id, {
                          focus: String(formData.get("focus") ?? ""),
                          detail: String(formData.get("detail") ?? ""),
                          minutes: Number(formData.get("minutes") ?? day.minutes),
                        }),
                      () => setEditing(null)
                    )
                  }
                >
                  <span className="text-xs font-medium text-muted">{format(day.date, "EEEE d MMMM")}</span>
                  <input
                    name="focus"
                    defaultValue={day.focus}
                    maxLength={120}
                    aria-label="What this day is for"
                    className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
                  />
                  <textarea
                    name="detail"
                    defaultValue={day.detail ?? ""}
                    rows={3}
                    maxLength={400}
                    aria-label="What to actually do"
                    className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Minutes
                    <input
                      name="minutes"
                      type="number"
                      defaultValue={day.minutes}
                      min={MIN_MINUTES}
                      max={MAX_MINUTES}
                      aria-label="How many minutes"
                      className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      data-testid={`save-plan-day-${key}`}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
                    >
                      {pending ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </li>
            );
          }

          return (
            <li key={day.id}>
              <div
                className={cn(
                  "rounded-xl border transition",
                  day.done
                    ? "border-cat-school/40 bg-cat-school/5"
                    : isToday
                      ? "border-cat-school"
                      : missed
                        ? "border-danger/40"
                        : "border-border hover:border-cat-school/40"
                )}
              >
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => toggleExamPlanDay(planId, day.id))}
                  data-testid={`plan-day-${key}`}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left disabled:opacity-60"
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

                {/* Outside the tick button, not inside it: a button inside a
                    button is invalid, and on a phone it is a tick you meant
                    to be a delete. */}
                <div className="flex items-center justify-end gap-3 px-3 pb-2 text-xs text-muted">
                  <MessageActions
                    kind="plan-day"
                    idSuffix={key}
                    disabled={pending}
                    editLabel={`Edit ${format(day.date, "EEE d MMM")}`}
                    deleteLabel={`Remove ${format(day.date, "EEE d MMM")} from the plan`}
                    onEdit={() => {
                      setError(null);
                      setEditing(day.id);
                    }}
                    onDelete={() => run(() => deleteExamPlanDay(planId, day.id))}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
