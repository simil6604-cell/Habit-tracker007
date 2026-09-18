import Link from "next/link";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type PlannedWorkout = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  exercises: { id: string }[];
};

/**
 * The training split as a week — "Monday chest, Wednesday push/pull" — rather
 * than a flat list of plans where the shape of the week is invisible.
 */
export function WeeklySplitCard({ workouts, todayIdx }: { workouts: PlannedWorkout[]; todayIdx: number }) {
  const unscheduled = workouts.filter((w) => w.dayOfWeek === null);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {DAY_LABELS.map((label, i) => {
          const dayWorkouts = workouts.filter((w) => w.dayOfWeek === i);
          const isToday = i === todayIdx;
          return (
            <div
              key={label}
              className={`min-w-0 rounded-xl border p-2.5 ${
                isToday ? "border-accent bg-accent/10" : "border-border bg-surface-muted"
              }`}
            >
              <p className={`mb-1.5 text-xs font-semibold ${isToday ? "text-accent" : "text-muted"}`}>
                {label}
                {isToday && " · today"}
              </p>

              {dayWorkouts.length === 0 ? (
                <p className="text-xs text-muted/60">Rest</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {dayWorkouts.map((w) => (
                    <div key={w.id} className="rounded-lg bg-surface px-2 py-1.5">
                      <p className="truncate text-xs font-medium">{w.name}</p>
                      <p className="text-[10px] text-muted">
                        {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <p className="text-xs text-muted">
          Not on a day yet: {unscheduled.map((w) => w.name).join(", ")} — give them a day below so they show up in
          your week.
        </p>
      )}

      {workouts.length === 0 && (
        <p className="text-sm text-muted">
          No workout plans yet. Add one below with a day — e.g. &ldquo;Chest &amp; Triceps&rdquo; on Monday,
          &ldquo;Pull&rdquo; on Wednesday — and your split appears here.
        </p>
      )}

      <Link href="/gym/history" className="text-xs font-medium text-accent hover:underline">
        See training history →
      </Link>
    </div>
  );
}
