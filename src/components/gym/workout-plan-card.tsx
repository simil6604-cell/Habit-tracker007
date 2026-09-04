"use client";

import { useState } from "react";
import { addExercise, deleteExercise, deleteWorkout } from "@/lib/gym/actions";
import { Button } from "@/components/ui/button";
import { WorkoutLogForm } from "./workout-log-form";
import { Trash2, ChevronDown } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Exercise = { id: string; name: string; targetSets: number; targetReps: number; targetWeight: number | null };

export function WorkoutPlanCard({
  workout,
}: {
  workout: { id: string; name: string; dayOfWeek: number | null; exercises: Exercise[] };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{workout.name}</p>
          {workout.dayOfWeek !== null && <p className="text-xs text-muted">{DAY_LABELS[workout.dayOfWeek]}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form action={deleteWorkout.bind(null, workout.id)}>
            <button type="submit" className="text-muted hover:text-danger">
              <Trash2 size={14} />
            </button>
          </form>
          <button onClick={() => setOpen((o) => !o)} className="text-muted">
            <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
          </button>
        </div>
      </div>

      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {workout.exercises.map((ex) => (
          <li key={ex.id} className="flex items-center justify-between text-muted">
            <span>
              {ex.name} — {ex.targetSets} × {ex.targetReps}
              {ex.targetWeight ? ` @ ${ex.targetWeight}kg` : ""}
            </span>
            <form action={deleteExercise.bind(null, ex.id)}>
              <button type="submit" className="hover:text-danger">
                <Trash2 size={12} />
              </button>
            </form>
          </li>
        ))}
        {workout.exercises.length === 0 && <li className="text-muted">No exercises yet.</li>}
      </ul>

      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <form action={addExercise} className="flex flex-wrap gap-2">
            <input type="hidden" name="workoutId" value={workout.id} />
            <input name="name" required placeholder="Exercise" className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="targetSets" type="number" defaultValue={3} className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="targetReps" type="number" defaultValue={10} className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="targetWeight" type="number" step="0.5" placeholder="kg" className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <Button type="submit" size="sm" variant="secondary">Add</Button>
          </form>

          {workout.exercises.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Log this workout</p>
              <WorkoutLogForm workoutId={workout.id} exercises={workout.exercises} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
