import { prisma } from "@/lib/db/prisma";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import { daysUntilLabel } from "@/lib/planner/days-until";

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
  "When they send photos, work from what is actually in them. Read the question, the diagram, their handwriting, the mark allocation. Say plainly which parts you cannot read rather than guessing at them — a misread digit turns a correct method into a wrong answer. When several photos arrive together, treat them as one thing: pages of the same paper, or one question and their working.",
  "When they photograph their own attempt, mark it: what earned marks, what didn't, and the specific fix. Never inflate it — an answer called right here is a mark lost in the real exam.",
  "When a simple diagram would genuinely make something clearer — a labeled shape, a graph, a cell/circuit/process diagram, a number line — include exactly one in your reply as a fenced code block starting with ```svg and ending with ```. Keep it simple: a `viewBox=\"0 0 320 220\"`, basic shapes only (rect, circle, ellipse, line, polyline, polygon, path, text), clear <text> labels, no more than ~40 elements, no external references, no scripts. Most replies won't need one.",
  "This chat has no LaTeX/MathJax renderer — never use $, $$, \\( \\), or other LaTeX math delimiters; they'd show up as literal text. Write formulas in plain text, e.g. \"a^2 + b^2 = c^2\", or with real Unicode symbols (², √, ×, ÷, ≤, π).",
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
export async function buildSchoolContextBlock(userId: string, now: Date = new Date()): Promise<string> {
  const [subjects, exams, weakTopics, confusions] = await Promise.all([
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
  ]);

  const lines: string[] = [];

  if (subjects.length > 0) {
    lines.push(
      "Subjects this student takes (with the level each is sat at):",
      ...subjects.map((s) => `- ${s.name}${s.level ? ` — ${s.level.replace(/_/g, " ").toLowerCase()}` : ""}`)
    );
  }

  if (exams.length > 0) {
    lines.push(
      "",
      "Exams coming up:",
      ...exams.map((e) => `- ${e.title}${e.subject ? ` (${e.subject.name})` : ""} — ${daysUntilLabel(e.date, now)}`)
    );
  }

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
