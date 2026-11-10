import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { describeSource, episodeTitle, parseScript, type PodcastSource } from "./podcast";

/**
 * Writing one episode, away from the form that used to own it.
 *
 * It moved here so the tutor can make an episode too. Asked in the chat —
 * "mach mir einen Podcast über Elastizität" — the same work has to happen as
 * when the button on the podcast page is pressed, and two copies of it would
 * have drifted the first time either changed.
 *
 * Not a "use server" file: a tool is not a server action, and this is called
 * from one.
 */

/** The lengths offered, in minutes. Anything else is read as the middle one. */
export const EPISODE_LENGTHS = [3, 5, 10] as const;
export const DEFAULT_LENGTH = 5;

export function episodeLength(raw: unknown): number {
  const minutes = Number(raw);
  return (EPISODE_LENGTHS as readonly number[]).includes(minutes) ? minutes : DEFAULT_LENGTH;
}

/**
 * Written to be heard, not read.
 *
 * The rules are the ones that went wrong by hand: a synthesiser reads an
 * asterisk out as the word, a heading as a sentence fragment, and "1." as
 * "one full stop". And there is nobody to ask a question of, so the
 * conversational closing the voice tutor uses is wrong here — this is a
 * person talking you through something on the bus.
 */
const SYSTEM = `You are writing a short audio lesson for one student, to be read aloud by a speech synthesiser. It is made from their own material — their topics, their flashcards, the things they wrote down as not understood.

Write it the way a good teacher talks when there is no board:

- Plain spoken prose. No markdown at all: no asterisks, no hashes, no bullet points, no numbered lists, no headings. Every one of those is read out as a word and ruins it.
- Open by saying what this episode covers, in one sentence.
- Then work through it. Short sentences, varied length, the way someone actually speaks. Signpost with words — "first", "the thing to watch out for here", "so, putting that together".
- Use their own material. Where they flagged something as not understood, spend the most time there and say why it trips people up.
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%".
- Close by naming the two or three things to remember.
- Only what is in the material below. Do not invent syllabus content, exam questions or facts they have not recorded. If there is little to go on, make a short honest episode about that little rather than padding it.
- Write it in the language the material is in.

Give the script and nothing else — no title line, no notes, no stage directions.`;

/** Everything this account has recorded for one subject, as plain text. */
async function gatherMaterial(userId: string, subjectId: string) {
  // Scoped to the account at the call site, which is where it can be read —
  // and where the test that walks these queries looks for it.
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: {
      id: true,
      name: true,
      level: true,
      topics: {
        select: {
          id: true,
          name: true,
          progressPct: true,
          learningLog: { select: { type: true, content: true }, take: 20, orderBy: { createdAt: "desc" } },
          notePhotos: { select: { summary: true }, take: 10, orderBy: { createdAt: "desc" } },
          classRecordings: { select: { summary: true }, take: 5, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!subject) return null;

  const flashcards = await prisma.flashcard.findMany({
    where: { userId, subjectId: subject.id },
    select: { front: true, back: true },
    take: 40,
    orderBy: { createdAt: "desc" },
  });

  return { subject, flashcards };
}

export type WrittenEpisode = {
  id: string;
  title: string;
  seconds: number;
  subjectName: string;
};

export type EpisodeResult = { ok: true; episode: WrittenEpisode } | { ok: false; error: string };

/**
 * Makes an episode and stores it.
 *
 * `focus` is what the chat adds: asked for a podcast about elasticity, the
 * episode is about elasticity rather than about everything in Economics.
 * Left out, it covers the subject as before.
 */
export async function writeEpisode(
  userId: string,
  options: { subjectId: string; minutes?: number; focus?: string | null }
): Promise<EpisodeResult> {
  if (!isRealAIConfigured) {
    return {
      ok: false,
      error:
        "An episode has to be written, and that needs the AI key. Without it there is nothing to read out — add ANTHROPIC_API_KEY and this works.",
    };
  }

  const length = episodeLength(options.minutes);
  const material = await gatherMaterial(userId, options.subjectId);
  if (!material) return { ok: false, error: "That subject is not there any more." };

  const { subject, flashcards } = material;
  const focus = options.focus?.trim() || null;
  const lines: string[] = [`Subject: ${subject.name}${subject.level ? ` (${subject.level})` : ""}`];

  for (const topic of subject.topics) {
    lines.push(`\nTopic: ${topic.name} — ${topic.progressPct}% through it`);
    for (const entry of topic.learningLog) {
      const label =
        entry.type === "CONFUSED" ? "did not understand" : entry.type === "QUESTION" ? "asked" : "understood";
      lines.push(`  (${label}) ${entry.content}`);
    }
    for (const note of topic.notePhotos) if (note.summary) lines.push(`  (from their notes) ${note.summary}`);
    for (const rec of topic.classRecordings) if (rec.summary) lines.push(`  (from a lesson) ${rec.summary}`);
  }

  if (flashcards.length > 0) {
    lines.push("\nTheir flashcards:");
    for (const card of flashcards) lines.push(`  Q: ${card.front} / A: ${card.back}`);
  }

  const source: PodcastSource = {
    subjectId: subject.id,
    subjectName: subject.name,
    topics: subject.topics.map((topic) => topic.name),
    flashcards: flashcards.length,
    notes: subject.topics.reduce((sum, topic) => sum + topic.notePhotos.length, 0),
    confusions: subject.topics.reduce((sum, topic) => sum + topic.learningLog.length, 0),
  };

  const prompt = [
    `Write an audio lesson of about ${length} minutes — roughly ${length * 140} words.`,
    focus
      ? `It is about one thing: ${focus}. Stay on it. Use the rest of the material below only where it bears on that, and if there is nothing recorded about it, teach it properly from the syllabus this student is on and say in one line that it is not yet in their notes.`
      : "Cover what they have actually been working on.",
    "",
    "Their material:",
    lines.join("\n"),
  ].join("\n");

  let raw: string;
  try {
    // Room for ten minutes of speech and then some: cut off mid-sentence,
    // an episode ends in the middle of a word.
    raw = await getAIProvider().generate(prompt, { system: SYSTEM, maxTokens: 6000 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The episode could not be written." };
  }

  const parsed = parseScript(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const title = episodeTitle(
    focus ? `${subject.name}: ${focus}` : `${subject.name}: what you have been working on`,
    `${subject.name} — ${length} minutes`
  );

  const episode = await prisma.podcastEpisode.create({
    data: {
      userId,
      subjectId: subject.id,
      title,
      source: describeSource(source),
      script: parsed.script,
      seconds: parsed.seconds,
    },
  });

  return { ok: true, episode: { id: episode.id, title, seconds: parsed.seconds, subjectName: subject.name } };
}
