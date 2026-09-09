"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toggleTrainingCompleted, deleteTraining, updateTrainingDiary, attachDrillVideo } from "@/lib/football/actions";
import { generateTrainingDiaryTip } from "@/lib/football/diary-assistant";
import { DRILL_VIDEOS } from "@/lib/data/football";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VideoReference } from "@/components/shared/video-reference";
import { Trash2, NotebookPen } from "lucide-react";

type Drill = { name: string; minutes: number; cueText?: string; videoUrl?: string };
type Training = {
  id: string;
  title: string;
  date: Date | null;
  durationMin: number;
  focus: string;
  drills: string;
  isTeamSession: boolean;
  completed: boolean;
  wentWell: string | null;
  toImprove: string | null;
};

export function TrainingList({ trainings }: { trainings: Training[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

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
        const tip = generateTrainingDiaryTip({ toImprove: t.toImprove, completed: t.completed, focus: t.focus });

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
                <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="text-muted hover:text-accent" title="Training diary">
                  <NotebookPen size={14} />
                </button>
                <form action={deleteTraining.bind(null, t.id)}>
                  <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                </form>
              </div>
            </div>

            {drills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {drills.map((d, i) => (
                  <div key={i} className="rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs text-muted">
                    <span>{d.minutes} min {d.name}</span>
                    {d.cueText && <p className="mt-0.5">💡 {d.cueText}</p>}
                    {d.videoUrl ? (
                      <div className="mt-1">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Your saved reference</p>
                        <VideoReference url={d.videoUrl} />
                      </div>
                    ) : DRILL_VIDEOS[d.name] ? (
                      <div className="mt-1">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Example drill video</p>
                        <VideoReference url={DRILL_VIDEOS[d.name]} />
                      </div>
                    ) : null}
                    {!d.videoUrl && (
                      <form action={attachDrillVideo.bind(null, t.id, i)} className="mt-1 flex gap-1">
                        <input name="videoUrl" placeholder="Save your own link…" className="w-32 rounded border border-border bg-surface px-1.5 py-1 text-xs" />
                        <button type="submit" className="text-accent">Save</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(t.wentWell || t.toImprove) && (
              <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted">
                {t.wentWell && <p>✅ Went well: {t.wentWell}</p>}
                {t.toImprove && <p>🎯 To improve: {t.toImprove}</p>}
              </div>
            )}
            {tip && <p className="mt-1.5 rounded-lg bg-surface-muted p-2 text-xs">🤖 {tip}</p>}

            {expanded === t.id && (
              <form action={updateTrainingDiary.bind(null, t.id)} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <input name="wentWell" defaultValue={t.wentWell ?? ""} placeholder="What went well?" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
                <input name="toImprove" defaultValue={t.toImprove ?? ""} placeholder="What to improve?" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
                <Button type="submit" size="sm" variant="secondary" className="self-start">Save diary</Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
