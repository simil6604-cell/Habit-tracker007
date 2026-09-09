"use client";

import { useRef, useState } from "react";
import { addExercise, deleteExercise, deleteWorkout } from "@/lib/gym/actions";
import { Button } from "@/components/ui/button";
import { WorkoutLogForm } from "./workout-log-form";
import { VideoReference } from "@/components/shared/video-reference";
import { EXERCISE_LIBRARY } from "@/lib/data/exercise-library";
import { Trash2, ChevronDown } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EXERCISE_DATALIST_ID = "exercise-library-options";

type Exercise = {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number | null;
  cueText: string | null;
  videoUrl: string | null;
};

function equipmentFor(name: string) {
  return EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === name.toLowerCase())?.equipment ?? "💪";
}

export function WorkoutPlanCard({
  workout,
}: {
  workout: { id: string; name: string; dayOfWeek: number | null; exercises: Exercise[] };
}) {
  const [open, setOpen] = useState(false);
  const cueRef = useRef<HTMLInputElement>(null);

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (cueRef.current?.value) return;
    const match = EXERCISE_LIBRARY.find((ex) => ex.name.toLowerCase() === e.target.value.toLowerCase());
    if (match && cueRef.current) cueRef.current.value = match.cue;
  }

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

      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {workout.exercises.map((ex) => (
          <li key={ex.id} className="border-b border-border/60 pb-2 last:border-0">
            <div className="flex items-start justify-between text-muted">
              <span>
                {equipmentFor(ex.name)} {ex.name} — {ex.targetSets} × {ex.targetReps}
                {ex.targetWeight ? ` @ ${ex.targetWeight}kg` : ""}
              </span>
              <form action={deleteExercise.bind(null, ex.id)}>
                <button type="submit" className="hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </form>
            </div>
            {ex.cueText && <p className="mt-1 text-xs text-muted">💡 {ex.cueText}</p>}
            {ex.videoUrl && (
              <div className="mt-1.5">
                <VideoReference url={ex.videoUrl} />
              </div>
            )}
          </li>
        ))}
        {workout.exercises.length === 0 && <li className="text-muted">No exercises yet.</li>}
      </ul>

      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          <datalist id={EXERCISE_DATALIST_ID}>
            {EXERCISE_LIBRARY.map((ex) => (
              <option key={ex.name} value={ex.name} />
            ))}
          </datalist>
          <form action={addExercise} className="flex flex-wrap gap-2">
            <input type="hidden" name="workoutId" value={workout.id} />
            <input
              name="name"
              required
              placeholder="Exercise (start typing for suggestions)"
              list={EXERCISE_DATALIST_ID}
              onChange={onNameChange}
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <input name="targetSets" type="number" defaultValue={3} className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="targetReps" type="number" defaultValue={10} className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input name="targetWeight" type="number" step="0.5" placeholder="kg" className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
            <input ref={cueRef} name="cueText" placeholder="Form cue (autofills from suggestions)" className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm sm:w-64" />
            <input name="videoUrl" placeholder="Paste a video link to save (optional)" className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm sm:flex-1" />
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
