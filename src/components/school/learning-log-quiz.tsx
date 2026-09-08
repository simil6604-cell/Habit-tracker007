"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getLearningLog,
  addLearningLogEntry,
  deleteLearningLogEntry,
  type LogEntry,
  type LogEntryType,
} from "@/lib/school/learning-log-actions";
import { generateTopicQuiz, gradeTopicQuiz } from "@/lib/school/quiz-actions";

const SECTIONS: { type: LogEntryType; label: string; placeholder: string }[] = [
  { type: "UNDERSTOOD", label: "✅ What I understand", placeholder: "e.g. how to factorise a quadratic" },
  { type: "CONFUSED", label: "❓ What I didn't understand", placeholder: "e.g. completing the square" },
  { type: "QUESTION", label: "💬 Questions I have", placeholder: "e.g. why does the formula work?" },
];

export function LearningLogAndQuiz({ topicId }: { topicId: string }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Record<LogEntryType, string>>({ UNDERSTOOD: "", CONFUSED: "", QUESTION: "" });
  const [pending, startTransition] = useTransition();

  const [quiz, setQuiz] = useState<string[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizPending, startQuizTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => setEntries(await getLearningLog(topicId)));
  }, [topicId]);

  function addEntry(type: LogEntryType) {
    const content = drafts[type];
    if (!content.trim()) return;
    startTransition(async () => {
      const updated = await addLearningLogEntry(topicId, type, content);
      setEntries(updated);
      setDrafts((d) => ({ ...d, [type]: "" }));
    });
  }

  function removeEntry(entryId: string) {
    startTransition(async () => setEntries(await deleteLearningLogEntry(topicId, entryId)));
  }

  function startQuiz() {
    setQuizFeedback(null);
    setQuizError(null);
    startQuizTransition(async () => {
      const res = await generateTopicQuiz(topicId);
      if ("error" in res) {
        setQuizError(res.error);
        setQuiz(null);
      } else {
        setQuiz(res.questions);
        setQuizAnswers(res.questions.map(() => ""));
      }
    });
  }

  function submitQuiz() {
    if (!quiz) return;
    startQuizTransition(async () => {
      const payload = quiz.map((q, i) => ({ question: q, answer: quizAnswers[i] ?? "" }));
      setQuizFeedback(await gradeTopicQuiz(topicId, payload));
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-muted p-4">
      <p className="text-xs font-medium text-muted">Learning log for this topic</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.type} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <p className="text-xs font-medium">{s.label}</p>
            <ul className="flex flex-col gap-1">
              {entries === null && <li className="text-xs text-muted">Loading…</li>}
              {entries?.filter((e) => e.type === s.type).map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-1 text-xs text-muted">
                  <span>{e.content}</span>
                  <button onClick={() => removeEntry(e.id)} className="shrink-0 hover:text-danger">
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
              {entries !== null && entries.filter((e) => e.type === s.type).length === 0 && (
                <li className="text-xs text-muted">Nothing logged yet.</li>
              )}
            </ul>
            <div className="flex gap-1">
              <input
                value={drafts[s.type]}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.type]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEntry(s.type);
                  }
                }}
                placeholder={s.placeholder}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs"
              />
              <button
                onClick={() => addEntry(s.type)}
                disabled={pending}
                className="rounded-md bg-surface-muted px-2 text-xs hover:bg-border"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        {!quiz ? (
          <Button size="sm" variant="secondary" disabled={quizPending} onClick={startQuiz}>
            {quizPending ? "Generating…" : "🧠 Quiz me on this topic"}
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            {quiz.map((q, i) => (
              <div key={i} className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {i + 1}. {q}
                </p>
                <input
                  value={quizAnswers[i] ?? ""}
                  onChange={(e) => setQuizAnswers((a) => a.map((v, idx) => (idx === i ? e.target.value : v)))}
                  placeholder="Your answer"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" disabled={quizPending} onClick={submitQuiz}>
                {quizPending ? "Checking…" : "Check my answers"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={quizPending}
                onClick={() => {
                  setQuiz(null);
                  setQuizFeedback(null);
                  setQuizError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {quizError && <p className="mt-2 text-xs text-danger">{quizError}</p>}
        {quizFeedback && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">{quizFeedback}</p>
        )}
      </div>
    </div>
  );
}
