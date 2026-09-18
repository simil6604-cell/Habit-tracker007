import { logWorkoutSession } from "@/lib/gym/actions";
import { Button } from "@/components/ui/button";

type Exercise = { id: string; name: string; targetSets: number; targetReps: number; targetWeight: number | null };

export function WorkoutLogForm({ workoutId, exercises }: { workoutId: string; exercises: Exercise[] }) {
  return (
    <form action={logWorkoutSession} className="flex flex-col gap-4">
      <input type="hidden" name="workoutId" value={workoutId} />

      {exercises.map((ex) => (
        <div key={ex.id} className="rounded-xl border border-border p-3">
          <p className="mb-2 text-sm font-medium">
            {ex.name} <span className="text-xs text-muted">({ex.targetSets} × {ex.targetReps}{ex.targetWeight ? ` @ ${ex.targetWeight}kg` : ""})</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: ex.targetSets }, (_, i) => i + 1).map((setNumber) => (
              <div key={setNumber} className="flex items-center gap-2 text-xs">
                <span className="w-10 text-muted">Set {setNumber}</span>
                <input
                  name={`reps-${ex.id}-${setNumber}`}
                  type="number"
                  min={0}
                  placeholder={`${ex.targetReps} reps`}
                  defaultValue={ex.targetReps}
                  className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
                />
                <input
                  name={`weight-${ex.id}-${setNumber}`}
                  type="number"
                  step="0.5"
                  min={0}
                  placeholder="kg"
                  defaultValue={ex.targetWeight ?? undefined}
                  className="w-20 rounded-lg border border-border bg-surface px-2 py-1"
                />
                <span className="text-muted">kg</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="completed" defaultChecked /> Completed
        </label>
        <select name="difficulty" defaultValue="MODERATE" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm">
          <option value="EASY">Easy</option>
          <option value="MODERATE">Moderate</option>
          <option value="HARD">Hard</option>
        </select>
        <input name="durationMin" type="number" placeholder="Duration (min)" className="w-36 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
      </div>
      <input name="notes" placeholder="Notes (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="wentWell" placeholder="What went well?" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <input name="toImprove" placeholder="What to improve next time?" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
      </div>

      <Button type="submit" size="sm">Save workout</Button>
    </form>
  );
}
