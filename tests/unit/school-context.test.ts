import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the tutor is actually told about this student.
 *
 * Written after the tutor had to say this to them: "Zu mir kommt aber nur
 * das hier: deine Fächer, deine Prüfungen, deine Lernpläne und deine
 * Revision-Links. Wann du Unterricht oder Freistunden hast, sehe ich
 * nicht." The timetable was in the app, period by period, and never reached
 * the one part of the app that plans their time — and neither did the plans
 * it had built itself, so asked for a plan twice it would hand back a plan
 * it could not see and could not explain.
 *
 * Prisma is mocked: what is being tested is which rows reach the prompt and
 * how they read, not that a database can return them.
 */

type Row = Record<string, unknown>;

const rows: Record<string, Row[]> = {};
const queries: { model: string; where: unknown }[] = [];

function finder(model: string) {
  return vi.fn(async ({ where }: { where?: unknown } = {}) => {
    queries.push({ model, where });
    return rows[model] ?? [];
  });
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    school: { findUnique: vi.fn(async () => null) },
    subject: { findMany: finder("subject") },
    exam: { findMany: finder("exam") },
    topic: { findMany: finder("topic") },
    learningLogEntry: { findMany: finder("learningLogEntry") },
    revisionLink: { findMany: finder("revisionLink") },
    homework: { findMany: finder("homework") },
    classRecording: { findMany: finder("classRecording") },
    timetableSlot: { findMany: finder("timetableSlot") },
    examPlan: { findMany: finder("examPlan") },
  },
}));

const { buildSchoolContextBlock } = await import("@/lib/school/school-ai");

/** Thursday, mid-morning. */
const NOW = new Date("2026-11-26T10:00:00");

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  queries.length = 0;
  rows.subject = [{ id: "sub-bio", name: "Biology", level: "A_LEVEL", createdAt: NOW }];
});

describe("the timetable reaching the tutor", () => {
  beforeEach(() => {
    rows.timetableSlot = [
      {
        dayOfWeek: 0,
        startTime: "08:45",
        endTime: "09:45",
        periodName: "P1",
        periodType: "LESSON",
        label: null,
        subject: { name: "Biology" },
      },
      {
        dayOfWeek: 0,
        startTime: "09:45",
        endTime: "10:45",
        periodName: "P2",
        periodType: "FREE",
        label: null,
        subject: null,
      },
      {
        dayOfWeek: 3,
        startTime: "14:00",
        endTime: "15:00",
        periodName: "P6",
        periodType: "STUDY",
        label: null,
        subject: null,
      },
    ];
  });

  it("describes the week and names the periods they are free", async () => {
    const block = await buildSchoolContextBlock("user-1", NOW);
    expect(block).toContain("Monday: 08:45 Biology");
    expect(block).toContain("09:45–10:45 (P2)");
    expect(block).toContain("Thursday");
  });

  it("asks only for this account's timetable", async () => {
    await buildSchoolContextBlock("user-1", NOW);
    const asked = queries.find((q) => q.model === "timetableSlot");
    expect(asked?.where).toMatchObject({ userId: "user-1" });
  });

  it("says it cannot see one, rather than planning as if the day were empty", async () => {
    rows.timetableSlot = [];
    const block = await buildSchoolContextBlock("user-1", NOW);
    expect(block).toMatch(/not put their timetable into the app/i);
    expect(block).toMatch(/ask before placing work inside the school day/i);
  });
});

describe("the plans it has already built", () => {
  it("lists them with how far through they are", async () => {
    rows.examPlan = [
      {
        id: "plan-1",
        title: "Biology Paper 3",
        examDate: new Date("2026-12-10T00:00:00"),
        days: [{ done: true }, { done: false }, { done: false }],
      },
    ];
    const block = await buildSchoolContextBlock("user-1", NOW);
    expect(block).toContain("Biology Paper 3");
    expect(block).toContain("1 of 3 days ticked off");
  });

  it("tells it to replace one itself rather than to send the student off to archive it", async () => {
    rows.examPlan = [
      { id: "plan-1", title: "Biology Paper 3", examDate: new Date("2026-12-10T00:00:00"), days: [] },
    ];
    const block = await buildSchoolContextBlock("user-1", NOW);
    expect(block).toMatch(/replace set to true/i);
    expect(block).toMatch(/should not ask them to archive anything by hand/i);
  });

  it("asks only for this account's live plans", async () => {
    await buildSchoolContextBlock("user-1", NOW);
    const asked = queries.find((q) => q.model === "examPlan");
    expect(asked?.where).toMatchObject({ userId: "user-1", archivedAt: null });
  });
});
