"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createExamPlan, type PlannableExam } from "@/lib/school/exam-plan-actions";

/**
 * Turning "I have so much to do" into a plan with dates on it.
 *
 * It sits in the School AI because that is where the sentence gets typed. The
 * chat can talk about revision all day; this is the button that turns the talk
 * into days you can tick off and a line you can watch.
 */
export function ExamPlanBuilder({ exams }: { exams: PlannableExam[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [examId, setExamId] = useState(exams.find((e) => !e.hasPlan)?.id ?? exams[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (exams.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-xs text-muted">
        Add an exam with a date under <strong>School</strong> and a full day-by-day plan up to it can be built here.
      </p>
    );
  }

  const chosen = exams.find((e) => e.id === examId);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="open-plan-builder">
        <CalendarClock size={14} /> Build a plan up to an exam
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-3" data-testid="plan-builder">
      <label className="text-xs font-medium text-muted">Which exam?</label>
      <select
        value={examId}
        onChange={(e) => setExamId(e.target.value)}
        data-testid="plan-exam-select"
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
      >
        {exams.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.title}
            {exam.subjectName ? ` · ${exam.subjectName}` : ""} · {exam.dateLabel}
            {exam.hasPlan ? " (already planned)" : ""}
          </option>
        ))}
      </select>

      <label className="mt-1 text-xs font-medium text-muted">Anything it should know? (optional)</label>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={2}
        placeholder="e.g. I'm behind on organic chemistry and I have football Tue and Thu"
        data-testid="plan-brief"
        className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
      />

      {chosen?.hasPlan && (
        <p className="text-xs text-muted">There is already a plan for this one — building again just opens it.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || !examId}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createExamPlan(examId, brief);
              if (result.error) {
                setError(result.error);
                return;
              }
              if (result.planId) router.push(`/school/plan/${result.planId}`);
            });
          }}
        >
          {pending ? "Building the plan…" : "Build it"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
