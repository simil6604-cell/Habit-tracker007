import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What actually gets read out, and in which voice.
 *
 * Two things are worth pinning here, and neither is visible from the page.
 *
 * The first is that "read me my notes" and "teach me this" are two
 * different jobs and must not quietly become one. A reading that picks two
 * or three highlights is the thing it was asked not to be — the point is
 * that listening replaces reading, so anything skipped is something that
 * still has to be read.
 *
 * The second is which material an episode can see. A lesson recorded from
 * the school AI is filed under the subject and no topic, and everything
 * here used to reach recordings only through topics — so the longest notes
 * this app holds were the one thing an episode could not read out.
 *
 * Prisma and the provider are mocked: what is being tested is which prompt
 * is built from which rows, not that a database can store a string.
 */

type Row = Record<string, unknown>;

const asked: { prompt: string; context: Record<string, unknown> }[] = [];
const createdEpisodes: Row[] = [];
const recordingQueries: unknown[] = [];

let subjectRow: Row | null = null;
let flashcardRows: Row[] = [];
let lessonRows: Row[] = [];

vi.mock("@/lib/ai/provider", () => ({
  isRealAIConfigured: true,
  getAIProvider: () => ({
    name: "stub",
    generate: async (prompt: string, context: Record<string, unknown>) => {
      asked.push({ prompt, context });
      return [
        "A: Right — what does your note on osmosis actually say?",
        "B: Water moves towards the salt, I always want to say.",
        "A: Right instinct, wrong words. Down the water potential gradient.",
        "A: And that is the one you flagged, so it is worth saying twice.",
      ].join("\n");
    },
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subject: { findFirst: vi.fn(async () => subjectRow) },
    flashcard: { findMany: vi.fn(async () => flashcardRows) },
    classRecording: {
      findMany: vi.fn(async ({ where }: { where: unknown }) => {
        recordingQueries.push(where);
        return lessonRows;
      }),
    },
    user: { findUnique: vi.fn(async () => ({ aiExpression: "WARM" })) },
    podcastEpisode: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        createdEpisodes.push(data);
        return { id: "ep-1", ...data };
      }),
    },
  },
}));

const { writeEpisode } = await import("@/lib/school/podcast-episode");

beforeEach(() => {
  asked.length = 0;
  createdEpisodes.length = 0;
  recordingQueries.length = 0;
  subjectRow = {
    id: "sub-bio",
    name: "Biology",
    level: "IGCSE",
    topics: [
      {
        id: "top-osm",
        name: "Osmosis",
        progressPct: 30,
        learningLog: [{ type: "CONFUSED", content: "which way the water goes" }],
        notePhotos: [{ summary: "Water potential gradient, drawn as arrows" }],
        classRecordings: [],
      },
    ],
  };
  flashcardRows = [{ front: "What is osmosis?", back: "Water moving down its potential gradient" }];
  lessonRows = [];
});

describe("which kind of episode gets written", () => {
  it("reads one voice when asked to read, and writes two when asked to teach", async () => {
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "READING" });
    const reading = asked[0];
    expect(reading.context.system).toContain("ONE VOICE");
    expect(reading.context.system).toContain("Listening has to replace reading it");
    expect(reading.prompt).toContain("One voice throughout");
    // The instruction that makes it a reading rather than a lesson: the
    // whole of their material, in their order, nothing dropped.
    expect(reading.prompt).toContain("leave nothing meaningful out");

    asked.length = 0;
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "CONVERSATION" });
    expect(asked[0].context.system).toContain("TWO VOICES");
    expect(asked[0].prompt).toContain("turns between A and B");
  });

  it("stores which kind it was, so the list can say", async () => {
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 3, style: "READING" });
    expect(createdEpisodes[0].style).toBe("READING");
    expect(createdEpisodes[0].userId).toBe("user-1");
    expect(createdEpisodes[0].title).toBe("Biology: your notes, read out");
  });

  it("falls back to the two-voice kind rather than refusing a style it does not know", async () => {
    const result = await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 3, style: "AUDIOBOOK" });
    expect(result.ok).toBe(true);
    expect(createdEpisodes[0].style).toBe("CONVERSATION");
  });

  it("reads them what they asked about when they named something", async () => {
    await writeEpisode("user-1", {
      subjectId: "sub-bio",
      minutes: 5,
      style: "READING",
      focus: "why cells burst in pure water",
    });
    expect(asked[0].prompt).toContain("why cells burst in pure water");
    // Not in their notes is not a reason to come back with less: that is
    // exactly the "what I still want to know" case.
    expect(asked[0].prompt).toContain("explain it yourself");
    expect(createdEpisodes[0].title).toBe("Biology: why cells burst in pure water");
  });
});

describe("the material an episode can see", () => {
  it("reads out a lesson that was never filed under a topic", async () => {
    lessonRows = [{ title: "Double period on enzymes", summary: "Lock and key, denaturing above 40 degrees" }];
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "READING" });

    expect(asked[0].prompt).toContain("Lock and key, denaturing above 40 degrees");
    expect(asked[0].prompt).toContain("Double period on enzymes");
  });

  it("asks only for this account's lessons, and only the unfiled ones", async () => {
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "READING" });
    // An id alone must never be enough to read a row, and a lesson already
    // filed under a topic is read through that topic — twice over would be
    // read out twice.
    expect(recordingQueries[0]).toMatchObject({ userId: "user-1", subjectId: "sub-bio", topicId: null });
  });

  it("leaves a lesson with no notes on it out rather than reading a blank", async () => {
    lessonRows = [{ title: "Nothing came back", summary: null }];
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "READING" });
    expect(asked[0].prompt).not.toContain("Nothing came back");
  });

  it("still reads their notes, their flashcards and what they flagged", async () => {
    await writeEpisode("user-1", { subjectId: "sub-bio", minutes: 5, style: "READING" });
    const prompt = asked[0].prompt;
    expect(prompt).toContain("Water potential gradient, drawn as arrows");
    expect(prompt).toContain("What is osmosis?");
    expect(prompt).toContain("(did not understand) which way the water goes");
  });
});
