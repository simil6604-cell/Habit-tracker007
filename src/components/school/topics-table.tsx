"use client";

import { useTransition } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { updateTopicProgress, deleteTopic } from "@/lib/school/actions";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";

type Topic = {
  id: string;
  name: string;
  progressPct: number;
  priority: string;
  examRelevance: string;
  plannedMinutes: number;
  actualMinutes: number;
  nextReview: Date | null;
  weaknessNote: string | null;
};

function statusEmoji(pct: number) {
  if (pct >= 80) return "✅";
  if (pct >= 50) return "🟡";
  return "🔴";
}

export function TopicsTable({ subjectId, topics }: { subjectId: string; topics: Topic[] }) {
  const [, startTransition] = useTransition();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-3">Topic</th>
            <th className="py-2 pr-3">Progress</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3">Exam relevance</th>
            <th className="py-2 pr-3">Time (planned/actual)</th>
            <th className="py-2 pr-3">Next review</th>
            <th className="py-2 pr-3">Weakness</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id} className="border-b border-border/60 align-middle">
              <td className="py-2.5 pr-3 font-medium">
                {statusEmoji(t.progressPct)} {t.name}
              </td>
              <td className="w-40 py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <ProgressBar value={t.progressPct} className="w-24" colorClassName="bg-cat-school" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={t.progressPct}
                    className="w-16 accent-[var(--accent)]"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      startTransition(() => updateTopicProgress(t.id, subjectId, v));
                    }}
                  />
                </div>
              </td>
              <td className="py-2.5 pr-3">
                <Badge variant={t.priority === "HIGH" ? "danger" : t.priority === "LOW" ? "default" : "warning"}>{t.priority}</Badge>
              </td>
              <td className="py-2.5 pr-3">
                <Badge variant={t.examRelevance === "HIGH" ? "danger" : "default"}>{t.examRelevance}</Badge>
              </td>
              <td className="py-2.5 pr-3 text-xs text-muted">
                {t.plannedMinutes}m / {t.actualMinutes}m
              </td>
              <td className="py-2.5 pr-3 text-xs text-muted">{t.nextReview ? format(t.nextReview, "MMM d") : "—"}</td>
              <td className="py-2.5 pr-3 text-xs text-muted">{t.weaknessNote ?? "—"}</td>
              <td className="py-2.5 text-right">
                <form action={deleteTopic.bind(null, t.id, subjectId)}>
                  <button type="submit" className="text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {topics.length === 0 && (
            <tr>
              <td colSpan={8} className="py-4 text-center text-sm text-muted">
                No topics yet — add your syllabus topics below to track progress.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
