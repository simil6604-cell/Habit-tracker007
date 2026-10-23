"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { ChevronDown, Mic, Square, Trash2 } from "lucide-react";
import { AIProse } from "@/components/shared/ai-message";
import { SafeRender } from "@/components/shared/safe-render";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import {
  appendChunk,
  DRAFT_KEY,
  formatClock,
  formatLength,
  lessonLabel,
  MAX_TRANSCRIPT_CHARS,
  wordCount,
} from "@/lib/school/lesson-notes";
import {
  deleteLesson,
  getLessons,
  makeNotesForLesson,
  saveLesson,
  type LessonEntry,
} from "@/lib/school/class-recording-actions";

type Draft = { transcript: string; startedAt: number; seconds: number; subjectId: string; title: string };

/**
 * Recording a lesson as it happens.
 *
 * Asked for against the Dictate button: dictation fills the box you were
 * going to type in, which is right for a question and wrong for a lesson —
 * forty minutes of teaching does not belong in an input field, and nothing is
 * kept if you navigate away. This keeps listening, shows what it has heard,
 * saves it, and hands it to the AI for notes.
 *
 * The draft in localStorage is the part that matters most. A recording exists
 * only in this tab until Stop is pressed, and a phone that locks, a tab that
 * is discarded, or a stray reload would otherwise take a whole lesson with
 * it. It is written as the lesson runs and offered back on the next visit.
 */
export function LessonRecorder({ subjects }: { subjects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [lessons, setLessons] = useState<LessonEntry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  const mic = useSpeechRecognition({
    onFinal: (chunk) => setTranscript((t) => appendChunk(t, chunk).slice(0, MAX_TRANSCRIPT_CHARS)),
  });

  const listening = mic.listening;

  // The clock only runs while it is actually listening, so a pause to answer
  // the door does not inflate how long the lesson is recorded as.
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [listening]);

  const readDraft = (): Draft | null => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Draft;
      return typeof parsed?.transcript === "string" && parsed.transcript.trim() ? parsed : null;
    } catch {
      // Private windows, blocked site data, a half-written value: no draft.
      return null;
    }
  };

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do; the draft is only ever an extra safety net.
    }
  }, []);

  useEffect(() => {
    const draft = readDraft();
    if (draft) setRecovered(draft);
  }, []);

  // Written on every change rather than on a timer: the moment that loses a
  // lesson is unpredictable, and this is a few kilobytes.
  useEffect(() => {
    if (!transcript.trim()) return;
    try {
      const draft: Draft = { transcript, startedAt: Date.now(), seconds, subjectId, title };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or unavailable — the recording itself is unaffected.
    }
  }, [transcript, seconds, subjectId, title]);

  const loadLessons = useCallback(() => {
    startTransition(async () => setLessons(await getLessons()));
  }, []);

  useEffect(() => {
    if (open && lessons === null) loadLessons();
  }, [open, lessons, loadLessons]);

  function stopAndSave() {
    mic.stop();
    const text = transcript.trim();
    if (!text) return;
    setProblem(null);
    startTransition(async () => {
      const result = await saveLesson({
        transcript: text,
        subjectId: subjectId || null,
        title: title || null,
        recordedSeconds: seconds || null,
      });
      if ("error" in result) {
        setProblem(result.error);
        return;
      }
      // Only once the server has it. Clearing the draft on the way in would
      // lose the lesson if the save failed.
      clearDraft();
      setLessons(result.lessons);
      setTranscript("");
      setTitle("");
      setSeconds(0);
      mic.reset();
      setProblem(result.problem);
    });
  }

  const words = wordCount(transcript);

  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-3" data-testid="lesson-recorder">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
        data-testid="lesson-recorder-toggle"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Mic className="h-4 w-4 text-accent" />
          Record a lesson
          {listening && <span className="text-xs text-danger">● {formatClock(seconds)}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted">
            Leave this open while the teacher explains. It keeps listening, writes down what it hears, and afterwards
            makes notes you can ask about. Your phone has to stay awake and on this page — if the screen locks, the
            browser stops listening.
          </p>

          {recovered && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs" data-testid="lesson-draft">
              <p className="font-medium">There is an unsaved lesson from {format(recovered.startedAt, "MMM d, HH:mm")}.</p>
              <p className="mt-1 text-muted">{wordCount(recovered.transcript)} words were recorded but never saved.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  data-testid="lesson-draft-restore"
                  onClick={() => {
                    setTranscript(recovered.transcript);
                    setSeconds(recovered.seconds ?? 0);
                    setSubjectId(recovered.subjectId ?? "");
                    setTitle(recovered.title ?? "");
                    setRecovered(null);
                  }}
                >
                  Bring it back
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    clearDraft();
                    setRecovered(null);
                  }}
                >
                  Discard it
                </Button>
              </div>
            </div>
          )}

          {!mic.supported ? (
            <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted">
              This browser cannot listen — speech-to-text needs Chrome, Edge or Safari. You can still paste what was
              covered into the box below and have notes made from it.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {listening ? (
                <Button size="sm" variant="danger" onClick={stopAndSave} disabled={pending} data-testid="lesson-stop">
                  <Square className="mr-1 h-3.5 w-3.5" />
                  {pending ? "Saving…" : "Stop and save"}
                </Button>
              ) : (
                <Button size="sm" onClick={mic.start} disabled={pending} data-testid="lesson-start">
                  <Mic className="mr-1 h-3.5 w-3.5" />
                  {transcript ? "Carry on recording" : "Start recording"}
                </Button>
              )}
              {transcript && !listening && (
                <Button size="sm" variant="outline" onClick={stopAndSave} disabled={pending} data-testid="lesson-save">
                  {pending ? "Saving…" : "Save and make notes"}
                </Button>
              )}
              <span className="text-xs text-muted" data-testid="lesson-meter">
                {formatClock(seconds)} · {words} {words === 1 ? "word" : "words"}
              </span>
            </div>
          )}

          {mic.error && <p className="text-xs text-danger">{mic.error}</p>}

          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this lesson? (optional)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              data-testid="lesson-title"
            />
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              data-testid="lesson-subject"
            >
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={transcript + (mic.interim ? ` ${mic.interim}` : "")}
            onChange={(e) => setTranscript(e.target.value.slice(0, MAX_TRANSCRIPT_CHARS))}
            rows={transcript ? 6 : 3}
            placeholder="What is heard appears here. You can fix a misheard word, or paste a lesson you didn't record."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            data-testid="lesson-transcript"
          />

          {problem && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs" data-testid="lesson-problem">
              {problem}
            </p>
          )}

          {lessons && lessons.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted">Lessons you have recorded</p>
              {lessons.map((lesson) => {
                const length = formatLength(lesson.recordedSeconds);
                return (
                  <div key={lesson.id} className="rounded-lg border border-border bg-surface p-3" data-testid="lesson-row">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{lessonLabel(lesson)}</p>
                        <p className="text-xs text-muted">
                          {format(lesson.createdAt, "MMM d, HH:mm")}
                          {length ? ` · ${length}` : ""} · {wordCount(lesson.transcript)} words
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete this lesson"
                        onClick={() => startTransition(async () => setLessons(await deleteLesson(lesson.id)))}
                        className="text-muted hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {lesson.notes ? (
                      <div className="mt-2">
                        <SafeRender>
                          <AIProse text={lesson.notes} />
                        </SafeRender>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-muted">Saved, but no notes were made from it yet.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await makeNotesForLesson(lesson.id);
                              if ("error" in result) setProblem(result.error);
                              else {
                                setLessons(result.lessons);
                                setProblem(result.problem);
                              }
                            })
                          }
                        >
                          Make notes now
                        </Button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpanded((e) => (e === lesson.id ? null : lesson.id))}
                      className="mt-2 text-xs text-accent underline"
                    >
                      {expanded === lesson.id ? "Hide what was said" : "Show what was said"}
                    </button>
                    {expanded === lesson.id && (
                      <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-muted">
                        {lesson.transcript}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted">
                Ask the chat above about any of these — it can see the notes from your recent lessons.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
