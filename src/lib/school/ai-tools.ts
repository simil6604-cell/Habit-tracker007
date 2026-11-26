import { prisma } from "@/lib/db/prisma";
import { EPISODE_LENGTHS, writeEpisode } from "./podcast-episode";
import { formatLength, NEW_EPISODE_STYLE } from "./podcast";
import { archiveExamPlans, buildExamPlan } from "./exam-plan-build";
import {
  objectSchema,
  optionalString,
  readDay,
  readBoolean,
  readObjects,
  readString,
  requiredString,
  type ProviderTool,
  type ToolOutcome,
} from "@/lib/ai/tool-use";

/**
 * The things the school tutor can do, as well as say.
 *
 * Every one of these is a function the app already had behind a form. What
 * is new is that Claude can ask for it by name, so "I've got a chemistry
 * test on the 12th and I still don't get titration" becomes an exam in the
 * table, a confusion logged against the topic, and an answer — in one
 * sentence from the student instead of a sentence and then four taps.
 *
 * Two rules hold for all of them, and they are the reason this is safe:
 *
 * 1. The user id is closed over. It comes from the session at the call site
 *    and is written into every query here. There is no argument for it, so
 *    there is nothing for the model to get wrong and nothing for a crafted
 *    reply to point at someone else's row.
 * 2. Nothing is deleted and nothing existing is overwritten with content the
 *    model wrote, apart from a topic's own progress percentage. The worst a
 *    confused model can do is add a row the student can delete.
 *
 * They return a sentence rather than an object: the result goes back to the
 * model as text, so "added, due Friday" is read and used, while a JSON blob
 * would be summarised at best.
 */

/** Per call, so a "make me cards on this chapter" can't write a hundred rows. */
export const MAX_CARDS_PER_CALL = 20;

function ok(message: string): ToolOutcome {
  return { ok: true, message };
}

function failed(message: string): ToolOutcome {
  return { ok: false, message };
}

/**
 * The subject the model named, matched against the ones this student has.
 *
 * Loose on purpose — "maths", "Maths", "Mathematics" and "math" are all the
 * same subject to the person typing, and a tool that only accepts the exact
 * stored string would fail constantly on names the model read off its own
 * context block. The match is done in JS because this app is on SQLite,
 * where Prisma has no case-insensitive mode.
 */
async function findSubject(userId: string, name: string | null) {
  // Scoped to the account here, at the call site, where it can be read.
  const subjects = await prisma.subject.findMany({ where: { userId }, select: { id: true, name: true } });
  if (!name) return { subject: null, subjects };
  const wanted = name.trim().toLowerCase();
  const subject =
    subjects.find((s) => s.name.toLowerCase() === wanted) ??
    subjects.find((s) => s.name.toLowerCase().startsWith(wanted)) ??
    subjects.find((s) => s.name.toLowerCase().includes(wanted) || wanted.includes(s.name.toLowerCase())) ??
    byStem(subjects, wanted);
  return { subject, subjects };
}

/** Letters and digits only: "Mathematics (HL)" and "mathematics" differ by punctuation, not by subject. */
function stem(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * The last resort: two names that start the same way.
 *
 * The comment above has always claimed that "maths", "Maths" and
 * "Mathematics" are the same subject to the person typing. They were not:
 * "maths" is not a prefix of "mathematics" and does not contain it, so
 * every tool answered "No subject called maths" to a student who has one.
 * German makes it worse — "Mathe", "Bio", "Franz" are what anyone here
 * actually types.
 *
 * So four shared letters, and most of the shorter name, counts. Only when
 * exactly one subject qualifies: two that both start "Phys" is a question,
 * not a guess, and the caller already answers it by listing the subjects
 * this student takes.
 */
function byStem(subjects: { id: string; name: string }[], wanted: string): { id: string; name: string } | null {
  const target = stem(wanted);
  if (target.length < 4) return null;
  const close = subjects.filter((s) => {
    const shared = sharedPrefix(stem(s.name), target);
    return shared >= 4 && shared >= Math.min(stem(s.name).length, target.length) * 0.6;
  });
  return close.length === 1 ? close[0] : null;
}

type UpcomingExam = { id: string; title: string; date: Date; subject: { name: string } | null };

/**
 * Which exam they meant, out of the ones still ahead.
 *
 * Shared by the two plan tools, because "the Bio one" has to resolve to the
 * same exam whether the student is asking for a plan or asking for it to be
 * replaced — and a second copy of this matching would be the thing that
 * drifts.
 *
 * Past exams are never candidates: a plan is the days between now and the
 * paper, and a sat exam has none left.
 */
async function findUpcomingExam(
  userId: string,
  named: string | null,
  subject: { id: string; name: string } | null
): Promise<{ exam: UpcomingExam } | { failure: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exams = await prisma.exam.findMany({
    where: { userId, date: { gt: today }, ...(subject ? { subjectId: subject.id } : {}) },
    orderBy: { date: "asc" },
    take: 20,
    select: { id: true, title: true, date: true, subject: { select: { name: true } } },
  });
  if (exams.length === 0) {
    return {
      failure: subject
        ? `No exam coming up in ${subject.name}. Add it with add_exam first — a plan is the days between now and the paper, so it needs the date.`
        : "No exams coming up at all. Add the one they mean with add_exam first — a plan is the days between now and the paper, so it needs the date.",
    };
  }

  // Named or not: a name narrows, and the soonest wins otherwise, which is
  // almost always the one they are worried about.
  if (!named) return { exam: exams[0] };

  const wanted = named.toLowerCase();
  const match =
    exams.find((e) => e.title.toLowerCase() === wanted) ??
    exams.find((e) => e.title.toLowerCase().includes(wanted) || wanted.includes(e.title.toLowerCase())) ??
    exams.find((e) => (e.subject?.name ?? "").toLowerCase().includes(wanted)) ??
    null;
  if (match) return { exam: match };

  const list = exams.map((e) => `${e.title} (${dayLabel(e.date)})`).join(", ");
  return { failure: `No exam called "${named}" coming up. They have: ${list}. Use one of those names, or add it with add_exam.` };
}

function subjectList(subjects: { name: string }[]): string {
  return subjects.length > 0 ? subjects.map((s) => s.name).join(", ") : "none added yet";
}

const DAY = { weekday: "short", day: "numeric", month: "short" } as const;

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", DAY);
}

/**
 * The tool set for one signed-in student, plus a record of what was done.
 *
 * `done` fills up as the loop runs, and the chat shows it under the reply —
 * so an action taken on the student's behalf is visible as something that
 * happened, not just claimed in a sentence. A tutor that says "added that
 * for you" and didn't is worse than one that can't.
 */
export function schoolAITools(userId: string): { tools: ProviderTool[]; done: string[] } {
  const done: string[] = [];

  function record(line: string): void {
    done.push(line);
  }

  const tools: ProviderTool[] = [
    {
      name: "add_homework",
      description:
        "Put a piece of homework or coursework into the student's app, with its due date. Use it when they tell you about work that has been set. Do not use it for an exam or test — add_exam is for those.",
      schema: objectSchema({
        title: requiredString("What the work is, as it would appear in a list, e.g. 'Past paper Q4-Q9' or 'Economics essay: price elasticity'."),
        subject: optionalString("The subject it is for, as the student calls it. Null if you genuinely cannot tell."),
        due_date: requiredString("The day it is due, as YYYY-MM-DD. Work it out from what they said and today's date."),
        detail: optionalString("Anything else worth having on the row — which questions, how long, what the teacher asked for. Null if there is nothing."),
      }),
      async run(input) {
        const title = readString(input, "title", 200);
        const dueDate = readDay(input, "due_date");
        if (!title) return failed("A homework needs a title.");
        if (!dueDate) return failed("The due date has to be a real day, as YYYY-MM-DD.");

        const named = readString(input, "subject", 80);
        const { subject, subjects } = await findSubject(userId, named);
        if (named && !subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}. Try one of those, or send null.`);
        }

        await prisma.homework.create({
          data: {
            userId,
            subjectId: subject?.id ?? null,
            title,
            description: readString(input, "detail", 1_000),
            dueDate,
          },
        });
        const where = subject ? ` (${subject.name})` : "";
        record(`Added homework: ${title}${where}, due ${dayLabel(dueDate)}`);
        return ok(`Added. "${title}"${where} is now in their homework list, due ${dayLabel(dueDate)}.`);
      },
    },
    {
      name: "add_exam",
      description:
        "Put an exam, test or mock into the student's app. Use it as soon as they mention one with a date — it is what the countdown, the revision plan and your own context block all read from.",
      schema: objectSchema({
        title: requiredString("What the exam is, e.g. 'Biology Paper 2' or 'Maths mock'."),
        subject: optionalString("The subject, as the student calls it. Null if you cannot tell."),
        date: requiredString("The day of the exam, as YYYY-MM-DD."),
        notes: optionalString("What it covers, or anything they said about it. Null if nothing."),
      }),
      async run(input) {
        const title = readString(input, "title", 200);
        const date = readDay(input, "date");
        if (!title) return failed("An exam needs a title.");
        if (!date) return failed("The exam date has to be a real day, as YYYY-MM-DD.");

        const named = readString(input, "subject", 80);
        const { subject, subjects } = await findSubject(userId, named);
        if (named && !subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}. Try one of those, or send null.`);
        }

        await prisma.exam.create({
          data: {
            userId,
            subjectId: subject?.id ?? null,
            title,
            date,
            notes: readString(input, "notes", 1_000),
          },
        });
        const where = subject ? ` (${subject.name})` : "";
        record(`Added exam: ${title}${where} on ${dayLabel(date)}`);
        return ok(`Added. "${title}"${where} is on their exam list for ${dayLabel(date)}, and the app can now build a day-by-day plan up to it.`);
      },
    },
    {
      name: "make_flashcards",
      description:
        `Write flashcards into the student's own deck, where the app's spaced repetition will bring them back. Use it when they ask for cards, or when you have just explained something they keep getting wrong and cards would make it stick. Up to ${MAX_CARDS_PER_CALL} at a time. Write real questions and real answers — these are revised from, not read once.`,
      schema: objectSchema({
        subject: optionalString("The subject the cards belong to, as the student calls it. Null for none."),
        topic: optionalString("A short topic label for the cards, e.g. 'Osmosis'. Null for none."),
        cards: {
          type: "array",
          description: `The cards themselves, up to ${MAX_CARDS_PER_CALL}.`,
          items: objectSchema({
            front: requiredString("The question or prompt side."),
            back: requiredString("The answer side. Complete enough to mark yourself against."),
          }),
        },
      }),
      async run(input) {
        const named = readString(input, "subject", 80);
        const { subject, subjects } = await findSubject(userId, named);
        if (named && !subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}. Try one of those, or send null.`);
        }

        const topic = readString(input, "topic", 120);
        const rows = readObjects(input, "cards", MAX_CARDS_PER_CALL)
          .map((card) => ({
            front: readString(card, "front", 600),
            back: readString(card, "back", 2_000),
          }))
          .filter((card): card is { front: string; back: string } => Boolean(card.front && card.back));

        if (rows.length === 0) return failed("No usable cards — each one needs both a front and a back.");

        for (const card of rows) {
          await prisma.flashcard.create({
            data: { userId, subjectId: subject?.id ?? null, topic, front: card.front, back: card.back },
          });
        }
        const where = [subject?.name, topic].filter(Boolean).join(" · ");
        record(`Made ${rows.length} flashcard${rows.length === 1 ? "" : "s"}${where ? ` on ${where}` : ""}`);
        return ok(
          `Written. ${rows.length} card${rows.length === 1 ? "" : "s"}${where ? ` on ${where}` : ""} are in their deck and the first review is due today.`
        );
      },
    },
    {
      name: "log_confusion",
      description:
        "Write down something the student has just told you they do not understand, against the topic it belongs to. The app shows these on the subject page, generates cards from them, and gives them back to you in your own context next time. Use it the moment a gap shows itself, including one you spotted in their marked work.",
      schema: objectSchema({
        subject: requiredString("The subject, as the student calls it."),
        topic: requiredString("The topic within that subject. Use the exact name if you have seen it; otherwise your best guess and the tool will tell you the real ones."),
        what: requiredString("What they do not understand, in their terms, in a sentence or two."),
      }),
      async run(input) {
        const what = readString(input, "what", 1_000);
        const named = readString(input, "subject", 80);
        const wantedTopic = readString(input, "topic", 120);
        if (!what) return failed("Say what it is they do not understand.");
        if (!named || !wantedTopic) return failed("A confusion needs a subject and a topic.");

        const { subject, subjects } = await findSubject(userId, named);
        if (!subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}.`);
        }

        // The subject was just proven to be this user's, and the topics are
        // read through it, so a topic from another account cannot be reached.
        const topics = await prisma.topic.findMany({
          where: { subjectId: subject.id, subject: { userId } },
          select: { id: true, name: true },
        });
        const wanted = wantedTopic.toLowerCase();
        const topic =
          topics.find((t) => t.name.toLowerCase() === wanted) ??
          topics.find((t) => t.name.toLowerCase().includes(wanted) || wanted.includes(t.name.toLowerCase())) ??
          null;
        if (!topic) {
          return failed(
            `${subject.name} has no topic like "${wantedTopic}". Its topics are: ${topics.length > 0 ? topics.map((t) => t.name).join(", ") : "none added yet — tell the student to add the topic first"}.`
          );
        }

        await prisma.learningLogEntry.create({
          data: { userId, topicId: topic.id, type: "CONFUSED", content: what },
        });
        record(`Logged a gap in ${subject.name} · ${topic.name}`);
        return ok(`Logged against ${subject.name} · ${topic.name}. It will show on the subject page and you will see it in your context next time.`);
      },
    },
    {
      name: "rate_topic",
      description:
        "Set how far along a topic is, 0 to 100, after working through it with the student. Use it when the session has genuinely moved them — up when they can now do it unprompted, down when a question showed the stored number is too kind. Be honest: this number drives what the app puts in front of them.",
      schema: objectSchema({
        subject: requiredString("The subject, as the student calls it."),
        topic: requiredString("The topic within that subject."),
        // No `minimum`/`maximum`: strict mode does not take numeric bounds,
        // so the range is stated where the model reads it and checked below.
        percent: {
          type: "integer",
          description: "A whole number from 0 to 100. What they can do unprompted, not what they have been shown once.",
        },
        why: optionalString("One line on what the number is based on, stored as the weakness note. Null for none."),
      }),
      async run(input) {
        const raw = input.percent;
        const percent = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : null;
        if (percent === null || percent < 0 || percent > 100) return failed("The percentage has to be a whole number from 0 to 100.");

        const named = readString(input, "subject", 80);
        const wantedTopic = readString(input, "topic", 120);
        if (!named || !wantedTopic) return failed("Rating a topic needs a subject and a topic.");

        const { subject, subjects } = await findSubject(userId, named);
        if (!subject) return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}.`);

        const topics = await prisma.topic.findMany({
          where: { subjectId: subject.id, subject: { userId } },
          select: { id: true, name: true, progressPct: true },
        });
        const wanted = wantedTopic.toLowerCase();
        const topic =
          topics.find((t) => t.name.toLowerCase() === wanted) ??
          topics.find((t) => t.name.toLowerCase().includes(wanted) || wanted.includes(t.name.toLowerCase())) ??
          null;
        if (!topic) {
          return failed(
            `${subject.name} has no topic like "${wantedTopic}". Its topics are: ${topics.length > 0 ? topics.map((t) => t.name).join(", ") : "none added yet"}.`
          );
        }

        const why = readString(input, "why", 400);
        // Keyed on the row just read, and scoped again through the subject —
        // an id alone is never enough to write to a row here.
        await prisma.topic.updateMany({
          where: { id: topic.id, subject: { userId } },
          data: { progressPct: percent, ...(why ? { weaknessNote: why } : {}) },
        });
        record(`${subject.name} · ${topic.name}: ${topic.progressPct}% → ${percent}%`);
        return ok(`Updated. ${subject.name} · ${topic.name} now reads ${percent}% (it was ${topic.progressPct}%).`);
      },
    },
    {
      name: "make_study_plan",
      description:
        "Build the day-by-day run-up to one of the student's exams and put it in their app, where each day can be ticked off and how ready they feel can be tracked. Use it whenever they ask for a study plan, a revision plan, a Lernplan, or help working out what to do between now and a test. It plans from their own topics, weakest first, with rest days and a review-only last day. The exam has to be on their list first: if the one they mean is not there, call add_exam and then this. One plan per exam: asked again for the same exam you get the existing plan back, unless you set replace.",
      schema: objectSchema({
        exam: optionalString("Which exam, as the student calls it, e.g. 'Biology Paper 2' or 'the maths mock'. Null to use the soonest one coming up, or the soonest in the subject below."),
        subject: optionalString("The subject, as the student calls it. Narrows which exam is meant, and on its own picks the soonest exam in that subject. Null if they did not say."),
        brief: optionalString("What they said about it in their own words — what they are weakest at, how much time they have in the evenings, what the teacher said it covers. This is what makes the plan theirs rather than generic, so pass it through whenever they gave you anything. Null if they said nothing."),
        replace: {
          type: "boolean",
          description:
            "True to throw away the plan this exam already has and build a fresh one; the old one is archived, not deleted, and the days they ticked off stay on it. Set it whenever they ask for the plan to be redone, rebuilt, changed, made longer, made in German, or built around something new — never make them archive anything by hand. False to leave an existing plan alone and simply hand it back.",
        },
      }),
      async run(input) {
        const named = readString(input, "subject", 80);
        const { subject, subjects } = await findSubject(userId, named);
        if (named && !subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}. Try one of those, or send null.`);
        }

        const found = await findUpcomingExam(userId, readString(input, "exam", 120), subject);
        if ("failure" in found) return failed(found.failure);

        const replace = readBoolean(input, "replace");
        const result = await buildExamPlan(userId, {
          examId: found.exam.id,
          brief: readString(input, "brief", 500),
          replace,
        });
        if (!result.ok) return failed(result.error);

        const { plan } = result;
        const where = plan.subjectName ? ` (${plan.subjectName})` : "";
        // A link, not directions: the plan is a page with a day to tick off
        // on it, and a plan nobody opens is a plan nobody follows.
        record(
          `[📅 ${plan.alreadyExisted ? "Your plan" : replace ? "Rebuilt plan" : "New plan"}: ${plan.title} — ${plan.dayCount} day${plan.dayCount === 1 ? "" : "s"} to ${dayLabel(plan.examDate)}](/school/plan/${plan.planId})`
        );
        if (plan.alreadyExisted) {
          return ok(
            `There was already a plan for "${plan.title}"${where} — ${plan.dayCount} days up to ${dayLabel(plan.examDate)} — and replace was not set, so it is unchanged and the link under your reply opens it. If they wanted it redone, call this again with replace true; do not ask them to archive it themselves.`
          );
        }
        return ok(
          `${replace ? "Rebuilt" : "Built"}. "${plan.title}"${where} now has a ${plan.dayCount}-day run-up to ${dayLabel(plan.examDate)}, weakest topics first, with rest days and a review-only last day${replace ? ", and the one it replaced is archived" : ""}. The link under your reply opens it. Tell them it is ready and say what the first day or two is; do not write the whole plan out in the chat.`
        );
      },
    },
    {
      name: "archive_study_plan",
      description:
        "Put a study plan away: it leaves their list of live plans, and the days they ticked off stay on it. Use it when they say they are done with a plan, that it is wrong, or that they want it gone — and when they want several cleared at once. Nothing is deleted. To redo a plan, you do not need this: call make_study_plan with replace instead, which archives the old one and builds the new one in a single step.",
      schema: objectSchema({
        exam: optionalString("Which exam's plan to put away, as the student calls it. Null together with all=false means the plan for the soonest exam coming up."),
        subject: optionalString("The subject, as the student calls it, to pick out which exam is meant. Null if they did not say."),
        all: {
          type: "boolean",
          description:
            "True to put away every live plan at once — use it when they say to clear them all, or to start their planning over. False for just the one named above.",
        },
      }),
      async run(input) {
        if (readBoolean(input, "all")) {
          const { titles } = await archiveExamPlans(userId, { all: true });
          if (titles.length === 0) return ok("There were no live plans to put away, so nothing changed.");
          for (const title of titles) record(`Archived the plan for ${title}`);
          return ok(
            `Put away ${titles.length} plan${titles.length === 1 ? "" : "s"}: ${titles.join(", ")}. Nothing was deleted — the days they had ticked off are still on them. They can build new ones whenever they want.`
          );
        }

        const named = readString(input, "subject", 80);
        const { subject, subjects } = await findSubject(userId, named);
        if (named && !subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}. Try one of those, or send null.`);
        }

        const found = await findUpcomingExam(userId, readString(input, "exam", 120), subject);
        if ("failure" in found) return failed(found.failure);

        const { titles } = await archiveExamPlans(userId, { examId: found.exam.id });
        if (titles.length === 0) {
          return failed(`There is no live plan for "${found.exam.title}", so there was nothing to put away.`);
        }
        for (const title of titles) record(`Archived the plan for ${title}`);
        return ok(
          `Put away the plan for "${found.exam.title}". Nothing was deleted — the days they had ticked off are still on it — and a new plan for that exam can be built now.`
        );
      },
    },
    {
      name: "make_podcast",
      description:
        `Write an audio episode from this student's own material and put it in their podcast page, where it can be played out loud. Use it whenever they ask for a podcast, for something to listen to, for their notes to be read to them, or for any way to revise without reading — on the bus, on a walk, when they are tired of looking at a screen. One subject per episode, and a topic if they named one. Lengths: ${EPISODE_LENGTHS.join(", ")} minutes. It takes a moment to write, so say in your reply that it is ready and that the link below plays it.`,
      schema: objectSchema({
        subject: requiredString("The subject the episode is about, as the student calls it."),
        about: optionalString("The one thing the episode should be about, e.g. 'price elasticity of demand'. Null to cover what they have been working on across the subject."),
        minutes: {
          type: "integer",
          description: `How long, in minutes: ${EPISODE_LENGTHS.join(", ")}. Pick 5 unless they said how long they have. Long ones are for a session at the gym or a training; short ones for a walk.`,
        },
        style: optionalString(
          "Which kind. READING: one voice reading their own notes back to them, topic by topic, leaving nothing out — this is the default, and what they mean by 'read me my notes', 'summarise my notes', 'I want to listen instead of reading', or naming something they still want to know. CONVERSATION: two voices teaching it, one explaining and one asking what they would ask — only when they ask to have something explained, taught or made interesting rather than read. Null means READING."
        ),
      }),
      async run(input) {
        const named = readString(input, "subject", 80);
        if (!named) return failed("Which subject is the episode about?");

        const { subject, subjects } = await findSubject(userId, named);
        if (!subject) {
          return failed(`No subject called "${named}". This student takes: ${subjectList(subjects)}.`);
        }

        const result = await writeEpisode(userId, {
          subjectId: subject.id,
          minutes: Number(input.minutes),
          focus: readString(input, "about", 200),
          style: readString(input, "style", 20) ?? NEW_EPISODE_STYLE,
        });
        if (!result.ok) return failed(result.error);

        const { episode } = result;
        // A link, not a sentence saying where to go: this is the one place
        // in the app where something was made that has to be played, and
        // telling someone to navigate to it is how it never gets listened to.
        record(
          `[▶ Listen: ${episode.title} (${formatLength(episode.seconds)})](/school/podcast?play=${episode.id}#ep-${episode.id})`
        );
        return ok(
          `Written. "${episode.title}" is ${formatLength(episode.seconds)} long, ${
            episode.style === "READING" ? "their own notes read out by one voice" : "two voices talking it through"
          }, and is on their podcast page — the link under your reply plays it. Tell them it is ready; do not write the script out in the chat.`
        );
      },
    },
  ];

  return { tools, done };
}
