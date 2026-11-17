import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { speechDirection } from "@/lib/ai/expression";
import {
  describeSource,
  episodeLength,
  episodeStyle,
  episodeTitle,
  parseScript,
  type EpisodeStyle,
  type PodcastSource,
} from "./podcast";

// Re-exported because both the form action and the chat tool import them
// from here, and the lengths are now a pure fact that lives with the rest
// of them.
export { EPISODE_LENGTHS, DEFAULT_LENGTH, episodeLength, EPISODE_STYLES, DEFAULT_STYLE, episodeStyle } from "./podcast";

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

/**
 * What makes an episode worth finishing.
 *
 * The first version asked for "a short audio lesson", and that is what it
 * got: one voice reading facts in a flat line for five minutes. Nobody
 * finishes that, and an episode nobody finishes teaches nothing — which is
 * the whole point of it existing.
 *
 * So it is written as two people talking. A explains; B is the listener in
 * the room, asking what you would ask, getting it wrong in the way people
 * get it wrong, and being corrected. Everything known about remembering
 * things while your hands are busy is in here: a question before the
 * answer, the answer a beat later, the same idea coming back twice more
 * before the end, and concrete pictures rather than definitions.
 *
 * The rules about markdown are not style: every asterisk and every "1."
 * is read out as a word by a synthesiser and wrecks an episode.
 */
const SYSTEM = `You are writing an episode of a study podcast for one student, to be read aloud by a speech synthesiser. It is made from their own material — their topics, their flashcards, the things they wrote down as not understood.

They listen to it with their hands busy: walking to school, at the gym, kicking a ball around. They are not taking notes and cannot rewind easily. Everything below follows from that.

TWO VOICES. Write it as a conversation between two people, and tag every line:

A: the one who explains. Warm, quick, knows the subject cold, talks like a good teacher who has given up on being formal.
B: the listener's voice in the room. Asks the obvious question, asks the embarrassing question, says the thing most people wrongly assume so A can correct it, and says "wait, go back" when something went past too fast.

Every single line starts with "A: " or "B: " and nothing else. No names, no stage directions, no sound effects, no "[intro music]".

HOW IT HAS TO SOUND

- Real spoken language. Contractions, short sentences, uneven rhythm. Read a line back in your head: if nobody would say it out loud, rewrite it.
- No markdown of any kind: no asterisks, no hashes, no bullet points, no numbered lists, no headings. Every one of those is read out as a word.
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%". "H two O", not "H2O". "x squared plus two x", not "x^2+2x".
- B interrupts. A does not deliver a paragraph without B coming in.
- Keep it moving. No line longer than about three sentences.

HOW IT HAS TO TEACH — this is what makes it stick while they are moving

- Open with a hook in the first fifteen seconds: a question they cannot answer yet, a result that sounds wrong, or the mistake that costs marks in this exact topic. Never open with "in this episode we will cover".
- Ask before you tell. A poses the question, B has a go, and only then does A give the answer — "so, what happens to total revenue if they drop the price... go on... right, it depends, and the thing it depends on is the one we just named."
- Give every abstract thing a picture: something physical, something they could see on a pitch or in a gym or in a shop. Then name it properly.
- Say the common mistake out loud and why it is tempting. The wrong answer has to be in the episode or it stays in their head.
- Bring each main idea back a second and a third time, later, in different words. Spacing inside one episode is most of what survives the walk home.
- Where they flagged something as not understood, that is the heart of the episode: spend the most time there, and say why it trips people up.
- Close with the two or three things to remember, said as A would say them to someone already walking away — short, blunt, in their own words.

WHAT IS TRUE

- Their own material is what the episode is about. Use their topics, their flashcards, the things they got wrong.
- Where their material is thin on something the episode needs, teach it yourself, properly, pitched at the level they are sitting — you are their tutor and that is your job. Do not pad, do not invent what THEY did or said, and do not quote any textbook, past paper or revision site: every word of the subject matter is yours.
- Never invent a fact, a date, a formula or an exam board requirement you are not sure of. A gap said out loud is better than a confident wrong answer learned by heart.

Give the script and nothing else — no title line, no notes, no episode number.`

/**
 * The other kind: their own notes, read back to them.
 *
 * Asked for in plain words — "in podcast musst du nur notizen
 * zusammenfassung oder was ich noch wissen möchte vorlesen so dass ich nur
 * zuhören muss als dass ich es lese". That is not the teaching episode with
 * the voices turned down. It is a different job: everything that is written
 * down, gone through in order, said out loud, so that listening genuinely
 * replaces reading it.
 *
 * So the rules invert. The conversation picks two or three ideas and digs;
 * this one covers what is there and leaves nothing out, because something
 * skipped is something they now have to go back and read. One voice, no
 * performance, no invented second person asking questions — a person
 * reading your notes to you does not role-play.
 *
 * What it is not: a transcript. Notes are written in fragments, and
 * fragments read aloud are unfollowable. Every fragment becomes a sentence.
 */
const READING_SYSTEM = `You are reading one student's own study notes back to them, out loud, to be spoken by a speech synthesiser.

This is not a lesson and not a podcast with guests. They wrote this material down and have not got time to sit and read it, so you are reading it to them while they walk, train or cook. Listening has to replace reading it: when the episode ends there must be nothing left in those notes they still need to go and look at.

ONE VOICE. Never write "A:" or "B:" or any other speaker tag, and never invent a second person asking questions. You are reading to them, directly, as "you".

WHAT GOES IN

- Everything in their material that carries meaning, in the order their notes are in: subject, then topic by topic. Do not pick highlights. A point you skip is a point they have to go back and read.
- Say the name of each topic before you read it, so they know where they are: "Right — cells. Four things in your notes here."
- Where their note is a fragment, say it as a full sentence. Notes are written in shorthand and shorthand read aloud is unfollowable. "mito = ATP" becomes "the mitochondria are where ATP is made".
- Where they wrote that they did not understand something, or asked a question, do not just read the question back at them: answer it, properly, at the level they are sitting. That is the one place where you teach.
- Their flashcards: say the question, leave a beat by moving to a new sentence, then say the answer. They can answer in their head while walking.
- If their material is thin on something that the notes clearly need to make sense, fill it in yourself and say plainly that this part was not in their notes.

HOW IT HAS TO SOUND

- Spoken, not written. Short sentences, contractions, a human reading to someone they know. Never read out a heading, a bullet or a date stamp.
- No markdown of any kind: no asterisks, no hashes, no bullet points, no numbered lists, no headings. Every one of those is read out as a word by the synthesiser.
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%". "H two O", not "H2O". "x squared plus two x", not "x^2+2x".
- Signpost as you go, because they cannot see the page: "that is the second of three", "last one on enzymes, then we move on".
- No hook, no cliffhanger, no "in this episode we will cover". Start with what it is — "your Biology notes, four topics, about eight minutes" — and then start reading.
- Close by naming the two or three things in there that they marked as not understood, and nothing else.

WHAT IS TRUE

- Their material is the episode. Do not invent what they wrote, what they did, or what their teacher said.
- Never invent a fact, a date, a formula or an exam board requirement you are not sure of, and do not quote a textbook, a past paper or a revision site: where you explain something, the words are yours.

Give the script and nothing else — no title line, no notes, no episode number.`

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

  /*
   * The lessons that never got filed.
   *
   * A lesson recorded from the school AI is filed under the subject and no
   * topic — there is no building a topic tree in the first minute of a
   * lesson. Everything here used to reach recordings only through topics,
   * so those lessons, which are the longest and most detailed notes this
   * app holds, were the one thing an episode could not see. That is
   * survivable for the teaching episode and fatal for "read me my notes".
   */
  const lessons = (
    await prisma.classRecording.findMany({
      where: { userId, subjectId: subject.id, topicId: null },
      select: { title: true, summary: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    })
  ).filter((lesson) => lesson.summary);

  return { subject, flashcards, lessons };
}

export type WrittenEpisode = {
  id: string;
  title: string;
  seconds: number;
  subjectName: string;
  style: EpisodeStyle;
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
  options: { subjectId: string; minutes?: number; focus?: string | null; style?: unknown }
): Promise<EpisodeResult> {
  if (!isRealAIConfigured) {
    return {
      ok: false,
      error:
        "An episode has to be written, and that needs the AI key. Without it there is nothing to read out — add ANTHROPIC_API_KEY and this works.",
    };
  }

  const length = episodeLength(options.minutes);
  const style: EpisodeStyle = episodeStyle(options.style);
  const material = await gatherMaterial(userId, options.subjectId);
  if (!material) return { ok: false, error: "That subject is not there any more." };

  const { subject, flashcards, lessons } = material;
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

  if (lessons.length > 0) {
    lines.push("\nLessons they recorded, not filed under a topic:");
    for (const lesson of lessons) lines.push(`  (${lesson.title || "a lesson"}) ${lesson.summary}`);
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
    lessons: lessons.length,
    confusions: subject.topics.reduce((sum, topic) => sum + topic.learningLog.length, 0),
  };

  const prompt = (
    style === "READING"
      ? [
          `Read for about ${length} minutes — roughly ${length * 140} words.`,
          focus
            ? `They asked for one thing: ${focus}. Read them what their own material says about it, in order, and where their notes do not cover it, explain it yourself at the level they are sitting and say that this part was not in their notes.`
            : "Go through their material topic by topic and leave nothing meaningful out. If there is more here than fits in the time, read the topics they are least far through first and say at the end which ones are left for next time — never thin every topic down to a sentence.",
          "One voice throughout. No speaker tags, no second person, no questions asked back at them except the ones on their own flashcards.",
        ]
      : [
          `Write an episode of about ${length} minutes — roughly ${length * 140} words of dialogue.`,
          focus
            ? `It is about one thing: ${focus}. Stay on it. Use the rest of the material below only where it bears on that, and where their notes have nothing on it, teach it yourself at the level they are sitting rather than making the episode shorter.`
            : "Cover what they have actually been working on. Pick the two or three things that matter most rather than touching everything — an episode that covers one idea properly beats one that lists six.",
          `Aim for roughly ${Math.max(6, length * 4)} turns between A and B, so it keeps moving.`,
        ]
  )
    .concat(["", "Their material:", lines.join("\n")])
    .join("\n");

  // The same dial as the chat: someone who set "full throttle" does not
  // want an episode read to them like the news.
  const listener = await prisma.user.findUnique({ where: { id: userId }, select: { aiExpression: true } });

  let raw: string;
  try {
    // Room for ten minutes of speech and then some: cut off mid-sentence,
    // an episode ends in the middle of a word.
    /*
     * Room to finish.
     *
     * Twenty minutes of speech is around 2,800 words, and thinking tokens
     * come out of this same ceiling — so a fixed limit that was fine for a
     * five-minute episode ends a twenty-minute one in the middle of a
     * sentence. It scales with what was asked for.
     */
    raw = await getAIProvider().generate(prompt, {
      system: `${style === "READING" ? READING_SYSTEM : SYSTEM}\n\n${speechDirection(listener?.aiExpression)}`,
      maxTokens: 4_000 + length * 700,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The episode could not be written." };
  }

  const parsed = parseScript(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const title = episodeTitle(
    focus
      ? `${subject.name}: ${focus}`
      : style === "READING"
        ? `${subject.name}: your notes, read out`
        : `${subject.name}: what you have been working on`,
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
      style,
    },
  });

  return { ok: true, episode: { id: episode.id, title, seconds: parsed.seconds, subjectName: subject.name, style } };
}
