"use client";

import { useEffect, useState, useTransition } from "react";
import { AIProse } from "@/components/shared/ai-message";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getClassRecordings,
  saveClassRecording,
  deleteClassRecording,
  generateClassQuiz,
  gradeClassQuiz,
  type ClassRecordingEntry,
} from "@/lib/school/class-recording-actions";

export function ClassRecorderPanel({ topicId }: { topicId: string }) {
  // The transcript is editable — you can fix a misheard word, or type/paste a
  // lesson you didn't record — so dictation appends into local state rather
  // than the box being driven by the recogniser.
  const [transcript, setTranscript] = useState("");
  const mic = useSpeechRecognition({
    onFinal: (chunk) => setTranscript((t) => (t ? `${t} ${chunk}` : chunk).trim()),
  });

  const [recordings, setRecordings] = useState<ClassRecordingEntry[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [quiz, setQuiz] = useState<string[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizPending, startQuizTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => setRecordings(await getClassRecordings(topicId)));
  }, [topicId]);

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const res = await saveClassRecording(topicId, transcript);
      if ("error" in res) {
        setSaveError(res.error);
      } else {
        setRecordings(res);
        setTranscript("");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => setRecordings(await deleteClassRecording(topicId, id)));
  }

  function startQuiz() {
    setQuizFeedback(null);
    setQuizError(null);
    startQuizTransition(async () => {
      const res = await generateClassQuiz(topicId, transcript);
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
      setQuizFeedback(await gradeClassQuiz(topicId, transcript, payload));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted">🎙️ Record class → summary + quiz</p>

      <div className="flex items-center gap-2">
        {mic.supported ? (
          mic.listening ? (
            <Button type="button" size="sm" variant="danger" onClick={mic.stop}>
              ⏹ Stop recording
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={mic.start}>
              🎙️ Start recording
            </Button>
          )
        ) : (
          <p className="text-xs text-muted">
            This browser doesn&apos;t support live speech-to-text — type or paste what was covered below instead.
          </p>
        )}
        {mic.listening && <span className="text-xs text-danger">● Listening…</span>}
      </div>
      {mic.error && <p className="text-xs text-danger">{mic.error}</p>}

      <textarea
        value={transcript + (mic.interim ? ` ${mic.interim}` : "")}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Live transcript appears here while recording — or type/paste what the teacher explained"
        rows={4}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending || !transcript.trim()} onClick={save}>
          Save transcript
        </Button>
        <Button size="sm" variant="outline" disabled={quizPending || !transcript.trim()} onClick={startQuiz}>
          {quizPending ? "Generating…" : "🧠 Quiz me on this"}
        </Button>
      </div>
      {saveError && <p className="text-xs text-danger">{saveError}</p>}

      {quiz && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
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
      {quizError && <p className="text-xs text-danger">{quizError}</p>}
      {quizFeedback && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <AIProse text={quizFeedback} />
        </div>
      )}

      {recordings === null ? (
        <p className="text-xs text-muted">Loading past recordings…</p>
      ) : (
        recordings.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Past recordings</p>
            <ul className="flex flex-col gap-2">
              {recordings.map((r) => (
                <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{format(r.createdAt, "MMM d, HH:mm")}</span>
                    <button onClick={() => remove(r.id)} className="text-muted hover:text-danger">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {r.summary ? (
                    <div className="mt-1"><AIProse text={r.summary} /></div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No AI summary yet — connect a real AI in Settings for one.</p>
                  )}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs text-accent">View transcript</summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{r.transcript}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
