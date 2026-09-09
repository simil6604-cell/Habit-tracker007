"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generateSubjectQuiz, gradeSubjectQuiz } from "@/lib/school/subject-quiz-actions";

export function SubjectExamQuiz({ subjectId }: { subjectId: string }) {
  const [quiz, setQuiz] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setFeedback(null);
    setError(null);
    startTransition(async () => {
      const res = await generateSubjectQuiz(subjectId);
      if ("error" in res) {
        setError(res.error);
        setQuiz(null);
      } else {
        setQuiz(res.questions);
        setAnswers(res.questions.map(() => ""));
      }
    });
  }

  function submit() {
    if (!quiz) return;
    startTransition(async () => {
      const payload = quiz.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
      setFeedback(await gradeSubjectQuiz(subjectId, payload));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Six exam-style questions spanning this subject&apos;s topics, weighted toward your weakest ones — real
        AI-graded when a real AI is connected.
      </p>
      {!quiz ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={start} className="self-start">
          {pending ? "Generating…" : "📝 Start exam quiz"}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          {quiz.map((q, i) => (
            <div key={i} className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {i + 1}. {q}
              </p>
              <input
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((a) => a.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder="Your answer"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={submit}>
              {pending ? "Checking…" : "Check my answers"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setQuiz(null);
                setFeedback(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {feedback && <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">{feedback}</p>}
    </div>
  );
}
