import { format } from "date-fns";
import { toggleTrainingCompleted, deleteTraining } from "@/lib/football/actions";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

type Drill = { name: string; minutes: number };
type Training = {
  id: string;
  title: string;
  date: Date | null;
  durationMin: number;
  focus: string;
  drills: string;
  isTeamSession: boolean;
  completed: boolean;
};

export function TrainingList({ trainings }: { trainings: Training[] }) {
  if (trainings.length === 0) {
    return <p className="text-sm text-muted">No training sessions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {trainings.map((t) => {
        let drills: Drill[] = [];
        try {
          drills = JSON.parse(t.drills);
        } catch {}
        return (
          <li key={t.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {t.isTeamSession ? "👥" : "🎯"} {t.title}
                </p>
                <p className="text-xs text-muted">
                  {t.date ? format(t.date, "EEE, MMM d · HH:mm") : "Unscheduled"} · {t.durationMin} min · {t.focus}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleTrainingCompleted.bind(null, t.id)}>
                  <button type="submit">
                    <Badge variant={t.completed ? "success" : "default"}>{t.completed ? "Completed" : "Mark done"}</Badge>
                  </button>
                </form>
                <form action={deleteTraining.bind(null, t.id)}>
                  <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                </form>
              </div>
            </div>
            {drills.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                {drills.map((d, i) => (
                  <li key={i} className="rounded-full bg-surface-muted px-2.5 py-1">{d.minutes} min {d.name}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
