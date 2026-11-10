import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What happens when Claude asks this app to do something.
 *
 * The tools are the one place where a model's output turns into rows in the
 * student's own database, so the things worth proving are: it writes under
 * the signed-in account and no other, a wrong subject name is handed back as
 * a correctable failure rather than written as null, and a date arrives as
 * the day it was asked for.
 *
 * Prisma is mocked rather than run: these are the tools' own rules, and a
 * real database would only prove that Prisma can insert a row.
 */

type Row = Record<string, unknown>;

const created: Record<string, Row[]> = {};
const updated: { model: string; where: Row; data: Row }[] = [];

let subjects: { id: string; name: string }[] = [];
let topics: { id: string; name: string; progressPct: number }[] = [];
const seen: { model: string; where: unknown }[] = [];

function creator(model: string) {
  return vi.fn(async ({ data }: { data: Row }) => {
    (created[model] ??= []).push(data);
    return { id: `${model}-1`, ...data };
  });
}

/**
 * The episode writer, stubbed.
 *
 * What the tool is responsible for is resolving the subject, passing the
 * focus through and handing back a link that plays the result — not the
 * writing, which has its own module and its own tests.
 */
const written: { userId: string; options: Record<string, unknown> }[] = [];
let episodeResult: unknown = {
  ok: true,
  episode: { id: "ep-1", title: "Economics: elasticity", seconds: 185, subjectName: "Economics" },
};

vi.mock("@/lib/school/podcast-episode", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    writeEpisode: vi.fn(async (userId: string, options: Record<string, unknown>) => {
      written.push({ userId, options });
      return episodeResult;
    }),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subject: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        seen.push({ model: "subject", where });
        return subjects;
      }),
    },
    topic: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        seen.push({ model: "topic", where });
        return topics;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        updated.push({ model: "topic", where, data });
        return { count: 1 };
      }),
    },
    homework: { create: creator("homework") },
    exam: { create: creator("exam") },
    flashcard: { create: creator("flashcard") },
    learningLogEntry: { create: creator("learningLogEntry") },
  },
}));

const { schoolAITools, MAX_CARDS_PER_CALL } = await import("@/lib/school/ai-tools");

function toolSet() {
  const { tools, done } = schoolAITools("user-1");
  const byName = (name: string) => tools.find((t) => t.name === name)!;
  return { byName, done };
}

beforeEach(() => {
  for (const key of Object.keys(created)) delete created[key];
  updated.length = 0;
  seen.length = 0;
  subjects = [
    { id: "sub-bio", name: "Biology" },
    { id: "sub-math", name: "Mathematics" },
  ];
  topics = [{ id: "top-osm", name: "Osmosis", progressPct: 30 }];
});

describe("adding homework", () => {
  it("writes it under the signed-in account, on the day asked for", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("add_homework").run({
      title: "Past paper Q4-Q9",
      subject: "biology",
      due_date: "2026-03-12",
      detail: null,
    });

    expect(outcome.ok).toBe(true);
    const [row] = created.homework;
    expect(row.userId).toBe("user-1");
    expect(row.subjectId).toBe("sub-bio");
    expect(row.title).toBe("Past paper Q4-Q9");
    expect((row.dueDate as Date).getDate()).toBe(12);
    expect((row.dueDate as Date).getMonth()).toBe(2);
    // The description is null rather than the word the model wrote.
    expect(row.description).toBeNull();
    // And the app's own record of it, which is what the chat shows.
    expect(done).toEqual(["Added homework: Past paper Q4-Q9 (Biology), due Thu 12 Mar"]);
  });

  it("writes nothing when the subject is one this student doesn't take", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("add_homework").run({
      title: "Essay",
      subject: "Fysics",
      due_date: "2026-03-12",
      detail: null,
    });

    expect(outcome.ok).toBe(false);
    // Handed back as a correctable failure, naming the real subjects, so the
    // model can ask again rather than filing it under nothing.
    expect(outcome.message).toContain("Biology, Mathematics");
    expect(created.homework).toBeUndefined();
    expect(done).toEqual([]);
  });

  it("files it under no subject when the model says it cannot tell", async () => {
    const { byName } = toolSet();
    const outcome = await byName("add_homework").run({
      title: "Reading",
      subject: null,
      due_date: "2026-03-12",
      detail: "Chapter 4",
    });
    expect(outcome.ok).toBe(true);
    expect(created.homework[0].subjectId).toBeNull();
    expect(created.homework[0].description).toBe("Chapter 4");
  });

  it("refuses a date that isn't one, rather than storing today", async () => {
    const { byName } = toolSet();
    const outcome = await byName("add_homework").run({
      title: "Essay",
      subject: null,
      due_date: "next Friday",
      detail: null,
    });
    expect(outcome.ok).toBe(false);
    expect(created.homework).toBeUndefined();
  });

  it("asks only about this account's subjects", async () => {
    const { byName } = toolSet();
    await byName("add_homework").run({ title: "x", subject: "bio", due_date: "2026-03-12", detail: null });
    expect(seen[0]).toEqual({ model: "subject", where: { userId: "user-1" } });
  });
});

describe("adding an exam", () => {
  it("stores it with its notes and says the plan can now be built", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("add_exam").run({
      title: "Biology Paper 2",
      subject: "Biology",
      date: "2026-06-02",
      notes: "Transport in plants",
    });
    expect(outcome.ok).toBe(true);
    expect(created.exam[0]).toMatchObject({ userId: "user-1", subjectId: "sub-bio", notes: "Transport in plants" });
    expect(done[0]).toContain("Added exam: Biology Paper 2");
  });
});

describe("making flashcards", () => {
  it("writes one row per card, under this account", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("make_flashcards").run({
      subject: "Biology",
      topic: "Osmosis",
      cards: [
        { front: "What is osmosis?", back: "Water moving down a water-potential gradient." },
        { front: "Through what?", back: "A partially permeable membrane." },
      ],
    });

    expect(outcome.ok).toBe(true);
    expect(created.flashcard).toHaveLength(2);
    expect(created.flashcard.every((row) => row.userId === "user-1")).toBe(true);
    expect(created.flashcard[0]).toMatchObject({ subjectId: "sub-bio", topic: "Osmosis" });
    expect(done[0]).toBe("Made 2 flashcards on Biology · Osmosis");
  });

  it("drops a half-written card and refuses a batch of nothing but those", async () => {
    const { byName } = toolSet();
    const half = await byName("make_flashcards").run({
      subject: null,
      topic: null,
      cards: [{ front: "Only a front" }, { front: "A", back: "B" }],
    });
    expect(half.ok).toBe(true);
    expect(created.flashcard).toHaveLength(1);

    const none = await byName("make_flashcards").run({ subject: null, topic: null, cards: [{ back: "B" }] });
    expect(none.ok).toBe(false);
  });

  it("will not write more than its own limit in one call", async () => {
    const { byName } = toolSet();
    await byName("make_flashcards").run({
      subject: null,
      topic: null,
      cards: Array.from({ length: 60 }, (_, i) => ({ front: `q${i}`, back: `a${i}` })),
    });
    expect(created.flashcard).toHaveLength(MAX_CARDS_PER_CALL);
  });
});

describe("logging a confusion", () => {
  it("files it against the topic, through the subject it was proven under", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("log_confusion").run({
      subject: "Biology",
      topic: "osmosis",
      what: "I don't get which way the water goes.",
    });

    expect(outcome.ok).toBe(true);
    expect(created.learningLogEntry[0]).toMatchObject({
      userId: "user-1",
      topicId: "top-osm",
      type: "CONFUSED",
    });
    // The topics were read through the subject, scoped to the account — an
    // id from another account cannot be reached this way.
    expect(seen.find((q) => q.model === "topic")?.where).toEqual({
      subjectId: "sub-bio",
      subject: { userId: "user-1" },
    });
    expect(done[0]).toBe("Logged a gap in Biology · Osmosis");
  });

  it("names the real topics when the one it guessed does not exist", async () => {
    const { byName } = toolSet();
    const outcome = await byName("log_confusion").run({
      subject: "Biology",
      topic: "Mitosis",
      what: "No idea.",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Osmosis");
    expect(created.learningLogEntry).toBeUndefined();
  });
});

describe("rating a topic", () => {
  it("moves the percentage and says where it moved from", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("rate_topic").run({
      subject: "Biology",
      topic: "Osmosis",
      percent: 70,
      why: "Explained it back unprompted.",
    });

    expect(outcome.ok).toBe(true);
    expect(updated[0].where).toEqual({ id: "top-osm", subject: { userId: "user-1" } });
    expect(updated[0].data).toEqual({ progressPct: 70, weaknessNote: "Explained it back unprompted." });
    expect(done[0]).toBe("Biology · Osmosis: 30% → 70%");
  });

  it("refuses a percentage that is not one, which is the only destructive write here", async () => {
    const { byName } = toolSet();
    for (const percent of [-5, 140, "lots", null]) {
      const outcome = await byName("rate_topic").run({ subject: "Biology", topic: "Osmosis", percent, why: null });
      expect(outcome.ok, String(percent)).toBe(false);
    }
    expect(updated).toHaveLength(0);
  });

  it("rounds a fraction rather than refusing it", async () => {
    const { byName } = toolSet();
    await byName("rate_topic").run({ subject: "Biology", topic: "Osmosis", percent: 64.6, why: null });
    expect(updated[0].data.progressPct).toBe(65);
  });
});

describe("making a podcast", () => {
  beforeEach(() => {
    written.length = 0;
    episodeResult = {
      ok: true,
      episode: { id: "ep-1", title: "Economics: elasticity", seconds: 185, subjectName: "Economics" },
    };
    subjects = [{ id: "sub-eco", name: "Economics" }];
  });

  it("writes it for the subject they named, about the thing they named", async () => {
    const { byName, done } = toolSet();
    const outcome = await byName("make_podcast").run({
      subject: "economics",
      about: "price elasticity of demand",
      minutes: 3,
    });

    expect(outcome.ok).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0].userId).toBe("user-1");
    expect(written[0].options).toMatchObject({
      subjectId: "sub-eco",
      minutes: 3,
      focus: "price elasticity of demand",
    });
  });

  it("hands back a link that plays it, not directions to go and find it", async () => {
    const { byName, done } = toolSet();
    await byName("make_podcast").run({ subject: "Economics", about: null, minutes: 3 });

    // The chat renders this as a real link: the path is in this app, it
    // names the episode, and the fragment makes the browser scroll to it.
    expect(done[0]).toBe("[▶ Listen: Economics: elasticity (3 min)](/school/podcast?play=ep-1#ep-ep-1)");
  });

  it("passes a failure to write it back as a failure, not as a link to nothing", async () => {
    episodeResult = { ok: false, error: "That subject is not there any more." };
    const { byName, done } = toolSet();
    const outcome = await byName("make_podcast").run({ subject: "Economics", about: null, minutes: 5 });
    expect(outcome.ok).toBe(false);
    expect(done).toEqual([]);
  });

  it("does not write one for a subject this student does not take", async () => {
    const { byName } = toolSet();
    const outcome = await byName("make_podcast").run({ subject: "Astrophysics", about: null, minutes: 3 });
    expect(outcome.ok).toBe(false);
    expect(written).toHaveLength(0);
  });
});

describe("the account scope, read off the source", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "..", "src", "lib", "school", "ai-tools.ts"),
    "utf8"
  );

  it("writes under the signed-in user in every query, with no argument for it", () => {
    // The static half of the same promise the tests above make case by case:
    // every query here names userId, and no tool takes a user id as an
    // argument — so there is nothing for a model to point at someone else.
    const queries = source.match(/prisma\.\w+\.\w+\(\{[\s\S]*?\n {8}\}\)/g) ?? [];
    expect(queries.length).toBeGreaterThanOrEqual(6);
    for (const query of queries) expect(query).toMatch(/userId/);
    expect(source).not.toMatch(/readString\(input, "user/);
    expect(source).not.toMatch(/user_id/);
  });

  it("deletes nothing", () => {
    // The worst a confused model can do here is add a row the student can
    // remove themselves.
    expect(source).not.toMatch(/prisma\.\w+\.delete/);
  });
});
