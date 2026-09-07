"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitAssessment, type AssessmentAnswer } from "@/lib/assessment/actions";

export type Question = { id: string; label: string; subjectId?: string };

const SCALE = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "A little" },
  { value: 3, label: "Somewhat" },
  { value: 4, label: "Mostly" },
  { value: 5, label: "Very much" },
];

export function AssessmentForm({ category, questions }: { category: "SCHOOL" | "GYM" | "FOOTBALL"; questions: Question[] }) {
  const [values, setValues] = useState<Record<string, number>>({});

  const answers: AssessmentAnswer[] = questions
    .filter((q) => values[q.id])
    .map((q) => ({ id: q.id, label: q.label, value: values[q.id], subjectId: q.subjectId }));

  const complete = answers.length === questions.length;

  return (
    <form action={submitAssessment.bind(null, category)} className="flex flex-col gap-6">
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      {questions.map((q) => (
        <div key={q.id}>
          <p className="mb-2 text-sm font-medium">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {SCALE.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setValues((v) => ({ ...v, [q.id]: s.value }))}
                className={
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition " +
                  (values[q.id] === s.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface text-muted hover:bg-surface-muted")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button type="submit" disabled={!complete} className="self-start">
        See where I stand
      </Button>
    </form>
  );
}
