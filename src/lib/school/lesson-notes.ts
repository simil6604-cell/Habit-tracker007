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

/**
 * What the student pressing "Mark" leaves behind in the transcript.
 *
 * A lesson goes past at the speed it goes past. The moment you realise you
 * did not follow something is the moment you cannot stop and write it down,
 * and afterwards a transcript is forty minutes of undifferentiated speech
 * with no way to find that moment again. One button puts a flag in the
 * stream, and the notes are told what it means.
 *
 * Plain ASCII in square brackets so it survives being read back, stored,
 * and sent to a model, and so it is obvious in the raw transcript.
 */
export const TRANSCRIPT_MARK = "[MARK]";

/** Drops a flag at the point the lesson has reached. */
export function markTranscript(transcript: string): string {
  const before = transcript.trimEnd();
  return before ? `${before} ${TRANSCRIPT_MARK} ` : `${TRANSCRIPT_MARK} `;
}

/** How many flags are in a transcript — for telling someone it worked. */
export function countMarks(transcript: string): number {
  return transcript.split(TRANSCRIPT_MARK).length - 1;
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

Turn it into notes this student can revise from. Be thorough: this transcript is the only record of the lesson, and anything you leave out is gone. Long notes are fine — a full lesson should produce full notes.

- Keep what was taught, in detail: every idea, definition, method, worked example, result, and the reasoning the teacher gave for it. Keep the numbers, the units, the formulas, the names, the dates and the specific examples — those are the first things to disappear from a summary and the first things needed in an exam.
- Follow the order the lesson went in, so it can be read against the transcript.
- The student is in that room and talks too. Keep THEIR questions and what was answered, and anything they worked out loud — those are the parts they most need back, and a summary of "the teacher's content" throws them away. Write a question as a question, with the answer under it.
- ${TRANSCRIPT_MARK} is the student pressing a button during the lesson to flag the moment. Whatever is around each flag matters to them: give every one its own entry under "Flagged in the lesson", quoting enough of what was being said to find it again, and say plainly if what was being said there is too garbled to tell.
- Keep anything that was SET or ANNOUNCED — homework, deadlines, tests, what to bring or prepare, pages to read. Said out loud in class is often the only place these exist, so they get their own section, with the exact wording where you have it.
- Leave out what is not school: the register, chat between students, discipline, equipment faff, anything off-topic.
- Where a passage is too garbled to be sure of, say so and quote the garbled words, rather than guessing what was meant. A confident wrong definition is worse than a gap. Mishearings of technical words are constant — where the real word is obvious from the subject, use it and say which word you corrected.
- Do not add anything that is not in the transcript. No background knowledge, no filling in what the teacher "probably" said next.

Lay it out as: one line saying what the lesson was about, then the key points, then any worked examples, then the student's own questions and the answers, then anything flagged, then what was set or announced, then what is worth revising first. Leave out any of those sections that the lesson has nothing for.

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
