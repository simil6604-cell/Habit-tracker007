import { prisma } from "@/lib/db/prisma";
import { timetablePrompt } from "./timetable-context";
import { MAX_REVISION_LINKS, revisionLinksPrompt } from "./revision-links";
import { linksForPrompt, setupPrompt, subjectSetup } from "./revision-setup";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import { daysAgoLabel, daysUntilLabel, dueLabel } from "@/lib/planner/days-until";
import { parseImagePaths } from "./school-ai-photos";

/**
 * The school-only assistant.
 *
 * The AI Coach on /coach answers across school, gym and football, which is
 * what makes it useful for planning a week and what makes it the wrong thing
 * to sit next to with a past paper: it splits its attention three ways, and
 * its prompt is about balancing a schedule. This one only ever does school,
 * so every word of its instructions can be about Cambridge IGCSE and A Level
 * — the command words, the assessment objectives, what an examiner rewards —
 * and it can be handed a stack of photos of one question without wondering
 * whether it was asked about training load.
 *
 * It shares the academic prompt with the per-topic tutor, so a level set once
 * in School settings means the same thing everywhere.
 */

/** How many past turns to replay — a real conversation without an unbounded prompt. */
export const HISTORY_TURNS = 16;

/**
 * Written for this app. Nothing here reproduces Cambridge's material or any
 * revision site's notes: it describes how to teach, and the assistant writes
 * every word of the subject matter itself.
 */
export const SCHOOL_AI_STYLE_PROMPT = [
  "You are this student's own school tutor, and school is all you do. Stay on schoolwork: subject content, exam technique, revision planning, marking their attempts. If they ask about gym, football or their week as a whole, answer in one line that the AI Coach on the Coach page handles all three together, and come back to school.",
  "This is a live back-and-forth, like a tutor sitting next to them — not one-shot Q&A. Respond to what they just said, refer back to earlier turns, and ask a short question of your own when it tells you what to explain next.",
  "You can do things in this app, not just talk about them. Your tools: add_homework, add_exam, make_flashcards, log_confusion, rate_topic, make_podcast, make_study_plan, archive_study_plan. Use them as part of answering — when they mention a test with a date, work that has been set, something they do not understand, or when cards would make what you just explained stick. Say in one short line what you did; never say you added something without calling the tool, and never add a second copy of something already listed below. If they are only wondering aloud (\"should I make cards for this?\"), answer the question rather than acting on it.",
  "Asked for a podcast — \"kannst du mir einen Podcast über Elastizität machen\", \"something to listen to on the bus\", anything about hearing it rather than reading it — use make_podcast and then say in one line that it is ready and that the link under your reply plays it. Never write the script into the chat: it is written to be heard, and a wall of spoken prose on screen is the thing they were trying to avoid. One episode per request.",
  "Files they send may be PDFs as well as photos — a past paper, a mark scheme, a worksheet, lesson slides. Read the actual pages: the question numbering, the mark allocations, the diagrams, and the mark scheme's wording where there is one. When they send their own attempt alongside a mark scheme, mark it against that scheme and quote the part you marked it on.",
  "When they send photos, work from what is actually in them. Read the question, the diagram, their handwriting, the mark allocation. Say plainly which parts you cannot read rather than guessing at them — a misread digit turns a correct method into a wrong answer. When several photos arrive together, treat them as one thing: pages of the same paper, or one question and their working.",
  "When they photograph their own attempt, mark it: what earned marks, what didn't, and the specific fix. Never inflate it — an answer called right here is a mark lost in the real exam.",
  "When a simple diagram would genuinely make something clearer — a labeled shape, a graph, a cell/circuit/process diagram, a number line — include exactly one in your reply as a fenced code block starting with ```svg and ending with ```. Keep it simple: a `viewBox=\"0 0 320 220\"`, basic shapes only (rect, circle, ellipse, line, polyline, polygon, path, text), clear <text> labels, no more than ~40 elements, no external references, no scripts. Most replies won't need one.",
  "This chat has no LaTeX/MathJax renderer — never use $, $$, \\( \\), or other LaTeX math delimiters; they'd show up as literal text. Write formulas in plain text, e.g. \"a^2 + b^2 = c^2\", or with real Unicode symbols (², √, ×, ÷, ≤, π).",
  "Never hand a job back to the student that you can do yourself. If a plan has to be archived before a new one can be built, archive it — with make_study_plan's replace, or archive_study_plan — and then build it. Telling them to go and tap something you have a tool for is the one thing this assistant must not do; they said so in exactly those words. Where you genuinely cannot do it, say what you cannot see or reach and why, in one line, rather than describing steps for them to carry out.",
  "Asked for a study plan, a revision plan, a Lernplan or a timetable for an exam — or told they are behind or have too much to do — use make_study_plan. It builds a real plan in the app: every day from now to the paper, with what to do on each, which they tick off, plus a daily one-to-five reading of how ready it feels so they can see whether it is actually improving. Pass their own words through as the brief, because that is what makes it their plan rather than a generic one. If the exam is not on their list yet, call add_exam first and then this. Never write a day-by-day plan out in the chat instead: it would be a wall of text they cannot tick off, that the app knows nothing about, and that is gone the moment the conversation scrolls. Say in one line that it is ready, what the first day or two is, and that the link under your reply opens it. Asked to redo, change, lengthen or translate a plan that already exists, call it again with replace true — the old one is archived for them and the new one takes its place. Asked for several at once, do them one after another in the same turn.",
  "You can see their timetable, below, when they have put one in. Use it: work goes in their free and study periods and in the evening, never in a period where the timetable says they are in a lesson, and the plan you write should name the period it is meant for when it falls inside the school day. If there is no timetable in what you can see, say so and ask rather than inventing free time they do not have.",
  "Keep replies focused and conversational, not a wall of text — this is a dialogue.",
].join("\n");

export const NO_REAL_AI_MESSAGE =
  "Your school AI needs a connected AI service — set ANTHROPIC_API_KEY where your app's environment variables are set, then check it under Settings → AI connection. Until then this page can store what you write, but it can't answer you.";

/** Only topics the student is actually behind on are worth spending prompt on. */
const WEAK_TOPIC_MAX_PROGRESS = 60;
const MAX_WEAK_TOPICS = 12;
const MAX_EXAMS = 8;

/**
 * What the assistant knows about this student before they say anything: which
 * subjects at which level, what is coming up, and where they are weak.
 *
 * Without it every conversation starts from nothing and the first three turns
 * go on establishing facts the app already holds.
 */
/**
 * How many saved links are described to the model.
 *
 * Capped because the prompt is rebuilt on every message and a list of sixty
 * URLs crowds out the student's actual question.
 */
const MAX_REVISION_LINKS_IN_PROMPT = 16;

/**
 * How much homework the model is told about.
 *
 * Homework was missing from this block entirely, which only became visible
 * when Google Classroom started filling the table: the student could ask "what
 * should I do about this week's work?" and the tutor, which could see their
 * exams and their weak topics, had no idea any work had been set.
 *
 * Capped and near-term only, for the same reason as the links above — a term's
 * worth of assignments would crowd out the actual question.
 */
const MAX_HOMEWORK_IN_PROMPT = 12;

/**
 * How many recorded lessons the tutor is told about, and how much of each.
 *
 * The notes, never the transcript. An hour of speech-to-text is tens of
 * thousands of characters of half-sentences; three of them would fill the
 * whole prompt and crowd out the question being asked. The notes are the part
 * that was already distilled, and they are what someone means when they ask
 * "what did we do in chemistry on Tuesday".
 */
const MAX_LESSONS_IN_PROMPT = 4;

/**
 * How many live study plans the tutor is told about.
 *
 * One per exam, so this is "the exams with a run-up already built". More
 * than a term's worth would be a list nobody is working through.
 */
const MAX_PLANS_IN_PROMPT = 10;
const MAX_LESSON_NOTE_CHARS = 1_200;
const HOMEWORK_LOOKAHEAD_DAYS = 21;

export async function buildSchoolContextBlock(userId: string, now: Date = new Date()): Promise<string> {
  const horizon = new Date(now.getTime() + HOMEWORK_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const [subjects, exams, weakTopics, confusions, revisionLinks, homework, lessons, slots, plans] = await Promise.all([
    prisma.subject.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.exam.findMany({
      where: { userId, date: { gte: now } },
      include: { subject: true },
      orderBy: { date: "asc" },
      take: MAX_EXAMS,
    }),
    prisma.topic.findMany({
      where: { subject: { userId }, progressPct: { lte: WEAK_TOPIC_MAX_PROGRESS } },
      include: { subject: true },
      orderBy: { progressPct: "asc" },
      take: MAX_WEAK_TOPICS,
    }),
    prisma.learningLogEntry.findMany({
      where: { userId, type: "CONFUSED" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    // All of them, not just the ones that fit in the prompt: which subject is
    // still missing a link is decided from the whole set, and the total is
    // capped at MAX_REVISION_LINKS on the way in.
    prisma.revisionLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: MAX_REVISION_LINKS,
      select: {
        id: true,
        title: true,
        url: true,
        kind: true,
        subjectId: true,
        topicId: true,
        subject: { select: { name: true } },
        topic: { select: { name: true } },
      },
    }),
    // Still open, and either due soon or already overdue. Work that is done
    // is not what the tutor needs to reason about.
    prisma.homework.findMany({
      where: { userId, status: { not: "DONE" }, dueDate: { lte: horizon } },
      include: { subject: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: MAX_HOMEWORK_IN_PROMPT,
    }),
    // Lessons the student recorded. Only the ones that have notes: a bare
    // transcript is not something to reason from, and an unsummarised one
    // means the AI was unreachable when it was saved.
    prisma.classRecording.findMany({
      where: { userId, summary: { not: null } },
      include: { subject: { select: { name: true } }, topic: { select: { subject: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: MAX_LESSONS_IN_PROMPT,
    }),
    // The timetable. Without it the tutor plans work into periods the
    // student is sitting in a lesson, and has to ask when they are free
    // every single time it is asked to plan anything.
    prisma.timetableSlot.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        periodName: true,
        periodType: true,
        label: true,
        subject: { select: { name: true } },
      },
    }),
    // The plans that already exist. The tutor could build one and then had
    // no idea it had: asked again it would build nothing (one per exam) and
    // be unable to say why.
    prisma.examPlan.findMany({
      where: { userId, archivedAt: null },
      orderBy: { examDate: "asc" },
      take: MAX_PLANS_IN_PROMPT,
      select: {
        id: true,
        title: true,
        examDate: true,
        days: { select: { done: true, date: true } },
      },
    }),
  ]);

  const lines: string[] = [];

  if (subjects.length > 0) {
    lines.push(
      "Subjects this student takes (with the level each is sat at):",
      ...subjects.map((s) => `- ${s.name}${s.level ? ` — ${s.level.replace(/_/g, " ").toLowerCase()}` : ""}`)
    );
  }

  if (lessons.length > 0) {
    lines.push("", "Lessons this student recorded, newest first — your notes on each:");
    for (const lesson of lessons) {
      const subject = lesson.subject?.name ?? lesson.topic?.subject.name ?? null;
      const when = daysAgoLabel(lesson.createdAt, now);
      const heading = [lesson.title?.trim(), subject].filter(Boolean).join(" · ") || "Lesson";
      const notes = (lesson.summary ?? "").trim();
      lines.push(
        `- ${heading} (${when}):`,
        notes.length > MAX_LESSON_NOTE_CHARS
          ? `${notes.slice(0, MAX_LESSON_NOTE_CHARS)}… (notes continue; the full recording is saved in the app)`
          : notes
      );
    }
    lines.push(
      "These are notes you wrote from a live recording of the lesson, so they may contain mishearings. Answer from them when asked what was covered, and say when something is not in them rather than filling it in."
    );
  }

  if (homework.length > 0) {
    lines.push(
      "",
      "Work that is set and not done yet:",
      ...homework.map((h) => {
        const subject = h.subject ? ` (${h.subject.name})` : "";
        const marked =
          h.grade !== null && h.maxPoints !== null ? ` — marked ${h.grade} out of ${h.maxPoints}` : "";
        // dueLabel rather than the countdown: this list deliberately includes
        // work whose deadline has passed, and the countdown floors at today.
        return `- ${h.title}${subject} — ${dueLabel(h.dueDate, now)}${marked}`;
      }),
      "You may refer to any of these directly. They are this student's real assignments, not examples."
    );
  }

  if (exams.length > 0) {
    lines.push(
      "",
      "Exams coming up:",
      ...exams.map((e) => `- ${e.title}${e.subject ? ` (${e.subject.name})` : ""} — ${daysUntilLabel(e.date, now)}`)
    );
  }

  if (plans.length > 0) {
    lines.push(
      "",
      "Study plans already built and still live (one per exam):",
      ...plans.map((plan) => {
        const done = plan.days.filter((day) => day.done).length;
        return `- ${plan.title} — ${daysUntilLabel(plan.examDate, now)}, ${done} of ${plan.days.length} days ticked off`;
      }),
      "Asked for a plan for one of these, you get this one back rather than a second. To replace it, build it again with replace set to true, which archives this one first — you can do that yourself and should not ask them to archive anything by hand."
    );
  }

  const timetable = timetablePrompt(
    slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      periodName: slot.periodName,
      periodType: slot.periodType,
      label: slot.label,
      subjectName: slot.subject?.name ?? null,
    })),
    now
  );
  lines.push(
    "",
    timetable ??
      "This student has not put their timetable into the app, so you do not know when they have lessons or free periods. Ask before placing work inside the school day rather than guessing at it — they can add it under School → Timetable, or photograph it there."
  );

  // Which link fills which slot is decided over ALL of them, while only a
  // capped list is described to the model. So the chosen ones go first:
  // otherwise, past sixteen links, the tutor could be told a subject is set up
  // and to name its deck, with that deck missing from everything it can see.
  const setup = subjectSetup(
    subjects.map((s) => ({ id: s.id, name: s.name })),
    revisionLinks
  );
  const describedLinks = linksForPrompt(revisionLinks, setup, MAX_REVISION_LINKS_IN_PROMPT);

  // Always included, even when empty: the empty version is what stops the
  // model inventing a Carousel deck that does not exist.
  lines.push(
    "",
    revisionLinksPrompt(
      describedLinks.map((link) => ({
        title: link.title,
        url: link.url,
        kind: link.kind,
        subjectName: link.subject?.name ?? null,
        topicName: link.topic?.name ?? null,
      }))
    )
  );

  // The half of setting this up that the app cannot do itself. It does not
  // know the address of this student's Biology page — those sites were never
  // opened from here — so the tutor is told which subject is missing which
  // half and asks for it, once, when it is relevant.
  const gaps = setupPrompt(setup);
  if (gaps) lines.push("", gaps);

  if (weakTopics.length > 0) {
    lines.push(
      "",
      "Topics they rate themselves weakest on:",
      ...weakTopics.map((t) => `- ${t.subject.name}: ${t.name} (${t.progressPct}%)`)
    );
  }

  if (confusions.length > 0) {
    lines.push(
      "",
      "Questions they have marked as still not understood:",
      ...confusions.map((c) => `- ${c.content}`)
    );
  }

  if (lines.length === 0) {
    return "This student hasn't added any subjects, exams or topics to the app yet — ask what they're studying rather than assuming.";
  }

  return [
    "Here is what the app knows about this student. Use it to pitch and prioritise; don't recite it back at them.",
    ...lines,
  ].join("\n");
}

/** The full system prompt: academic level, the school-only style, then their own data. */
export async function buildSchoolAISystemPrompt(userId: string, now: Date = new Date()): Promise<string> {
  const [school, context] = await Promise.all([
    prisma.school.findUnique({ where: { userId } }),
    buildSchoolContextBlock(userId, now),
  ]);

  return [
    buildAcademicSystemPrompt(school?.educationSystem, null, { teaching: true }),
    SCHOOL_AI_STYLE_PROMPT,
    context,
  ].join("\n\n");
}

export type SchoolAITurn = { role: "USER" | "ASSISTANT"; content: string; photoCount: number };

/**
 * The user-facing prompt: the conversation so far, then this turn.
 *
 * Past photos aren't re-sent — only the current turn's images ride along with
 * the request — so the history says how many there were. Without that the
 * assistant reads "look at this" with nothing attached and says the student
 * forgot to send anything, about a photo it was shown four turns ago.
 */
/**
 * The conversation as turns, for the Messages API to read as a conversation.
 *
 * Photos from earlier turns are named rather than re-sent: a student working
 * through a past paper sends six pictures, and attaching all of them again
 * on every message afterwards costs more on each turn than the whole rest of
 * the conversation. The note is enough for "the one in the second photo".
 */
/**
 * How much an edited question may hold.
 *
 * Shared with the AI Coach, which lets a message be edited the same way —
 * see lib/ai/chat-limits.ts. Re-exported here because the school panel and
 * its tests have always imported it from this module.
 */
export { MAX_EDIT_CHARS } from "@/lib/ai/chat-limits";

/**
 * The app's own voice, recognised in a message already stored.
 *
 * The flag is the real answer, but it only exists from the deploy that added
 * the column onwards: every failure written before that is on record as an
 * ordinary reply, and the conversation most full of them is the one being
 * had when this shipped. So the wording is recognised too — these are
 * sentences this app writes, in api-key.ts and above, never ones a tutor
 * produces, and only ever stored under the ASSISTANT role, which nothing but
 * this app writes.
 *
 * Checked with `includes` rather than from the front, because a note about a
 * photo that would not fit is prepended to the reply before it is stored.
 */
const APP_FAILURE_WORDING = [
  "The AI could not answer:",
  "Couldn't reach the AI service right now",
  NO_REAL_AI_MESSAGE,
];

function isAppFailureNotice(message: StoredChatMessage): boolean {
  if (message.role !== "ASSISTANT") return false;
  if (message.failed) return true;
  return (
    APP_FAILURE_WORDING.some((wording) => message.content.includes(wording)) ||
    message.content.trimStart().startsWith("The AI key ")
  );
}

/** One stored chat message, as the database hands it back. */
export type StoredChatMessage = { role: string; content: string; imagePaths: string | null; failed: boolean };

/**
 * The conversation as the tutor should see it.
 *
 * Everything the student asked and everything the tutor answered — and
 * nothing the app said on its own behalf. When a call fails, the reason goes
 * into the chat as a message, because a question that produces silence is
 * worse than one that produces "the account has run out of credit". But it is
 * the app talking, not the tutor, and sent back as context it becomes a tutor
 * who announced it cannot help: still on record as its last word once the
 * credit is back, and apologising for an account the student has already
 * topped up.
 *
 * The student's own question stays, because they did ask it, and the gap
 * where the answer should be is handled where the turns are built.
 */
export function chatContextTurns(history: StoredChatMessage[]): SchoolAITurn[] {
  return history
    .filter((message) => !isAppFailureNotice(message))
    .map((message) => ({
      role: message.role as "USER" | "ASSISTANT",
      content: message.content,
      photoCount: parseImagePaths(message.imagePaths).length,
    }));
}

export function buildSchoolAITurns(history: SchoolAITurn[]): { role: "user" | "assistant"; content: string }[] {
  const turns = history
    .slice(-HISTORY_TURNS)
    .map((turn) => {
      const photos =
        turn.photoCount > 0
          ? `[sent ${turn.photoCount} photo${turn.photoCount === 1 ? "" : "s"}] `
          : "";
      return {
        role: turn.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: `${photos}${turn.content}`.trim(),
      };
    })
    .filter((turn) => turn.content !== "");

  /*
   * Two turns of the same role in a row, joined into one.
   *
   * The API refuses the whole request if the roles do not alternate — a flat
   * 400, "roles must alternate between user and assistant" — and the student
   * would see their next question fail for a reason that has nothing to do
   * with it. Two things here can leave a run of two: a turn dropped above for
   * carrying no text at all, and an answer left out because it was the app
   * reporting a failure rather than the tutor answering. Both are gaps in the
   * middle of a real conversation, so the questions either side of one are
   * joined rather than one of them being thrown away.
   */
  return turns.reduce<{ role: "user" | "assistant"; content: string }[]>((kept, turn) => {
    const previous = kept[kept.length - 1];
    if (previous && previous.role === turn.role) {
      previous.content = `${previous.content}\n\n${turn.content}`;
      return kept;
    }
    kept.push({ ...turn });
    return kept;
  }, []);
}

/**
 * What this message says, on its own — the turns above carry the rest.
 *
 * Photos and PDFs are named separately because they are not the same thing
 * to read: "three pages attached" sent for a PDF had the tutor looking for
 * an image that was not there and telling the student their file had failed
 * to send.
 */
export function buildSchoolAIMessage(message: string, photoCount: number, documentCount = 0): string {
  const parts: string[] = [];
  if (photoCount > 0) parts.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
  if (documentCount > 0) parts.push(`${documentCount} PDF${documentCount === 1 ? "" : "s"}`);
  const attached =
    parts.length > 0
      ? `\n[${parts.join(" and ")} attached to this message — they are the files above.]`
      : "";
  return `${message}${attached}`;
}

export function buildSchoolAIPrompt(history: SchoolAITurn[], message: string, photoCount: number): string {
  const past = history
    .slice(-HISTORY_TURNS)
    .map((t) => {
      const who = t.role === "USER" ? "Student" : "Tutor";
      const photos = t.photoCount > 0 ? ` [sent ${t.photoCount} photo${t.photoCount === 1 ? "" : "s"}]` : "";
      return `${who}${photos}: ${t.content}`;
    })
    .join("\n\n");

  const attached =
    photoCount > 0
      ? `\n[${photoCount} photo${photoCount === 1 ? "" : "s"} attached to this message — they are the images above.]`
      : "";

  return [past ? `Conversation so far:\n${past}\n` : "", `Student: ${message}${attached}`].filter(Boolean).join("\n");
}
