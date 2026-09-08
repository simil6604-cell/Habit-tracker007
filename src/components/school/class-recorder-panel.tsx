"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// The Web Speech API has no official TS DOM typings yet — this is a
// minimal shape covering only what this component uses.
type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function ClassRecorderPanel({ topicId }: { topicId: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, [topicId]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  function startListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setMicError(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-GB";
    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) setTranscript((t) => (t ? `${t} ${finalChunk}` : finalChunk).trim());
      setInterim(interimChunk);
    };
    recognition.onerror = (event) => {
      setMicError(
        event.error === "not-allowed"
          ? "Microphone access was denied — allow it in your browser to record."
          : event.error === "network"
            ? "Couldn't reach the browser's speech service (it needs internet access) — type or paste instead."
            : `Speech recognition stopped (${event.error}).`
      );
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  }

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
        {supported ? (
          listening ? (
            <Button type="button" size="sm" variant="danger" onClick={stopListening}>
              ⏹ Stop recording
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={startListening}>
              🎙️ Start recording
            </Button>
          )
        ) : (
          <p className="text-xs text-muted">
            This browser doesn&apos;t support live speech-to-text — type or paste what was covered below instead.
          </p>
        )}
        {listening && <span className="text-xs text-danger">● Listening…</span>}
      </div>
      {micError && <p className="text-xs text-danger">{micError}</p>}

      <textarea
        value={transcript + (interim ? ` ${interim}` : "")}
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
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">{quizFeedback}</p>
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
                    <p className="mt-1 whitespace-pre-wrap text-sm">{r.summary}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Transcript saved — connect a real AI in Settings for a summary.</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
