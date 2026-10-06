"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deletePaperQuestion } from "@/lib/school/marked-paper-actions";
import { commandWord } from "@/lib/school/marked-paper";
import { Badge } from "@/components/ui/badge";

export type QuestionRow = {
  id: string;
  position: number;
  prompt: string;
  answer: string;
  marksScored: number | null;
  marksTotal: number | null;
  examinerNote: string | null;
  analysis: string | null;
};

type Parsed = { asked: string; understood: string; gap: string; better: string };

/**
 * The analysis is stored as JSON on the question, so a row written by an older
 * version — or by nothing at all — has to come back as nothing rather than as
 * a crash on a page about the work someone did.
 */
function readAnalysis(raw: string | null): Parsed | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Parsed>;
    const asked = typeof data.asked === "string" ? data.asked : "";
    const understood = typeof data.understood === "string" ? data.understood : "";
    const gap = typeof data.gap === "string" ? data.gap : "";
    const better = typeof data.better === "string" ? data.better : "";
    if (!asked && !understood && !gap && !better) return null;
    return { asked, understood, gap, better };
  } catch {
    return null;
  }
}

const SECTIONS: { key: keyof Parsed; label: string }[] = [
  { key: "asked", label: "What it was asking" },
  { key: "understood", label: "What your answer took it to mean" },
  { key: "gap", label: "The gap" },
  { key: "better", label: "How to say it instead" },
];

export function PaperQuestionList({ paperId, questions }: { paperId: string; questions: QuestionRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted">
        No questions yet. Add the ones that cost you marks — you do not have to type the whole paper in.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="paper-questions">
      {questions.map((q) => {
        const parsed = readAnalysis(q.analysis);
        const cw = commandWord(q.prompt);
        const expanded = open === q.id;

        return (
          <li key={q.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-start gap-2">
              <span className="text-xs font-medium text-muted">Q{q.position}</span>
              {cw && <Badge variant="default">{cw}</Badge>}
              {q.marksScored !== null && q.marksTotal !== null && (
                <span className="text-xs text-muted">{q.marksScored}/{q.marksTotal}</span>
              )}
              <form action={deletePaperQuestion} className="ml-auto">
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="paperId" value={paperId} />
                <button type="submit" aria-label={`Remove question ${q.position}`} className="text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </form>
            </div>

            <p className="mt-2 whitespace-pre-line text-sm font-medium">{q.prompt}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{q.answer}</p>
            {q.examinerNote && (
              <p className="mt-1 whitespace-pre-line text-xs text-muted">Marker: {q.examinerNote}</p>
            )}

            {parsed ? (
              <>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : q.id)}
                  className="mt-2 text-xs text-accent underline-offset-2 hover:underline"
                  data-testid={`toggle-analysis-${q.position}`}
                >
                  {expanded ? "Hide what went wrong" : "What went wrong here →"}
                </button>
                {expanded && (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface-muted p-3" data-testid={`analysis-${q.position}`}>
                    {SECTIONS.map(({ key, label }) =>
                      parsed[key] ? (
                        <div key={key}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                          <p className="mt-0.5 whitespace-pre-line text-sm">{parsed[key]}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">Not analysed yet.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
