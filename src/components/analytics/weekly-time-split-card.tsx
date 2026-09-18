"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchWeeklyTimeSplit } from "@/lib/analytics/actions";
import { WeeklyTimeSplitChart } from "@/components/charts/weekly-time-split-chart-client";

type Entry = { name: string; minutes: number };

export function WeeklyTimeSplitCard({
  initialWeekOffset,
  initialWeekLabel,
  initialData,
}: {
  initialWeekOffset: number;
  initialWeekLabel: string;
  initialData: Entry[];
}) {
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset);
  const [weekLabel, setWeekLabel] = useState(initialWeekLabel);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  function go(delta: number) {
    const next = weekOffset + delta;
    if (next < 0) return;
    startTransition(async () => {
      const result = await fetchWeeklyTimeSplit(next);
      setWeekOffset(result.weekOffset);
      setWeekLabel(result.weekLabel);
      setData(result.data);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(1)}
          disabled={isPending}
          aria-label="Previous week"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[9rem] text-center text-sm font-medium">{weekLabel}</span>
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={isPending || weekOffset === 0}
          aria-label="Next week"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No completed study sessions, workouts or trainings logged that week.
        </p>
      ) : (
        <>
          <WeeklyTimeSplitChart data={data} />
          <p className="text-xs text-muted">
            Based on completed study sessions, workouts and training sessions logged that week — not a target,
            just where the time went.
          </p>
        </>
      )}
    </div>
  );
}
