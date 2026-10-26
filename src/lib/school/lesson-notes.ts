/**
 * Recording a lesson while it happens, and turning it into notes.
 *
 * Asked for in these words: it should record everything it hears that is
 * school relevant — the person explaining — save it, make notes of it, and
 * then be something you can ask about.
 *
 * The filtering is deliberately not done to the transcript. Speech-to-text
 * gives one undifferentiated stream, and a live filter that drops "this isn't
 * school" would throw away the half-sentence that turns out to matter, with
 * nothing left to check it against. So everything heard is kept, and the
 * judgement of what mattered happens once, afterwards, where it can be read
 * back against the original.
 */

/** Lessons are long. These keep one runaway session from swamping everything. */
export const MAX_TRANSCRIPT_CHARS = 120_000;
export const DRAFT_KEY = "momentum:lesson-draft:v1";

/**
 * Adding what was just heard to what came before.
 *
 * The recogniser hands over chunks with no spacing and no sense of what came
 * before, so joining them naively gives "the mole isa unit" or a double space
 * every time a chunk happens to end in one. Punctuation is not given a space
 * in front of it either.
 */
export function appendChunk(transcript: string, chunk: string): string {
  const addition = chunk.trim();
  if (!addition) return transcript;
  const before = transcript.trimEnd();
  if (!before) return addition;
  // A chunk starting with punctuation belongs tight against the last word.
  if (/^[,.;:!?]/.test(addition)) return `${before}${addition}`;
  return `${before} ${addition}`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** "12:34" — a running clock, for while it is recording. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "42 min" — a length, for a lesson in a list. */
export function formatLength(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds < 1) return null;
  // Before the rounding, not after it: 30 seconds rounds up to one minute and
  // would claim a lesson lasted longer than it did.
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** What to call a lesson nobody named. */
export function lessonLabel(
  recording: { title: string | null; subjectName: string | null; createdAt: Date },
  now: Date = new Date()
): string {
  if (recording.title?.trim()) return recording.title.trim();
  const sameDay = recording.createdAt.toDateString() === now.toDateString();
  const when = sameDay
    ? "today"
    : recording.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return recording.subjectName ? `${recording.subjectName} lesson, ${when}` : `Lesson, ${when}`;
}

/**
 * The instruction that decides what counts as school relevant.
 *
 * Three things it has to get right, and all three were considered rather than
 * assumed. A lesson transcript is full of talk that is not teaching — the
 * register, the telling-off, the chat before it starts — and notes full of
 * that are useless. But "organisational" is not the same as "irrelevant": the
 * homework set out loud, the test date, the thing to bring next week, are
 * often the only record a student has of them, so those are kept deliberately.
 * And speech-to-text mishears technical words constantly, so a guess at what
 * a garbled line meant is worse than saying it was garbled.
 */
export function buildNotesPrompt({
  transcript,
  subjectName,
  title,
}: {
  transcript: string;
  subjectName?: string | null;
  title?: string | null;
}): string {
  const header = [
    subjectName ? `Subject: ${subjectName}` : null,
    title ? `What the student called it: ${title}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${header ? `${header}\n\n` : ""}Below is a transcript captured live during a lesson by speech-to-text. It is one undifferentiated stream: the teacher explaining, other students, and whatever else was said in the room. It will contain mishearings, especially of technical words and names.

Turn it into notes this student can revise from.

- Keep what was taught: the ideas, definitions, methods, worked examples, results, and the reasoning the teacher gave for them.
- Keep anything that was SET or ANNOUNCED — homework, deadlines, tests, what to bring or prepare, pages to read. Said out loud in class is often the only place these exist, so they get their own section, with the exact wording where you have it.
- Leave out what is not school: the register, chat between students, discipline, equipment faff, anything off-topic.
- Where a passage is too garbled to be sure of, say so and quote the garbled words, rather than guessing what was meant. A confident wrong definition is worse than a gap.
- Do not add anything that is not in the transcript. No background knowledge, no filling in what the teacher "probably" said next.

Lay it out as: one line saying what the lesson was about, then the key points, then any worked example, then what was set or announced, then what is worth revising first. Leave out any of those sections that the lesson has nothing for.

TRANSCRIPT:
${transcript}`;
}

/**
 * Picking the recording back up when the browser drops it mid-lesson.
 *
 * Speech recognition ends its own session constantly — every pause in
 * speech — and the hook reopens it. But a browser that ends sessions in a
 * burst trips the hook's spin guard, and then recording stops for good. In a
 * lesson that is the worst possible moment for a silent stop: the student is
 * watching the teacher, not the screen, and finds out at the end that half
 * the lesson was never heard.
 *
 * So the recorder resumes by itself — but a bounded number of times inside a
 * window, because a browser that genuinely cannot do this (iOS Safari does
 * not really support continuous recognition) must be allowed to fail and say
 * so, rather than being retried forever.
 */
export const AUTO_RESUME_LIMIT = 3;
export const AUTO_RESUME_WINDOW_MS = 120_000;
export const AUTO_RESUME_DELAY_MS = 5_000;

/** The resume attempts still inside the window. */
export function recentResumes(stamps: number[], now: number): number[] {
  return stamps.filter((t) => now - t < AUTO_RESUME_WINDOW_MS);
}

export function shouldAutoResume(stamps: number[], now: number): boolean {
  return recentResumes(stamps, now).length < AUTO_RESUME_LIMIT;
}
