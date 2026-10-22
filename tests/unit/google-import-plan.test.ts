import { describe, expect, it } from "vitest";
import {
  externalIdFor,
  IMPORT_SOURCE,
  matchSubject,
  planImport,
  statusFor,
  type ExistingHomework,
} from "@/lib/google/import-plan";
import type { ClassroomCourse, ClassroomSubmission, ClassroomWork } from "@/lib/google/classroom";

const NOW = new Date("2026-05-10T12:00:00Z");
const course: ClassroomCourse = { id: "c1", name: "Chemistry", section: "10b", link: "https://classroom.google.com/c/c1" };
const subjects = [
  { id: "s-chem", name: "Chemistry" },
  { id: "s-maths", name: "Maths" },
  { id: "s-fmaths", name: "Further Maths" },
];

function work(over: Partial<ClassroomWork> = {}): ClassroomWork {
  return {
    id: "w1",
    courseId: "c1",
    title: "Mole ratios worksheet",
    description: "Questions 1 to 8",
    due: new Date("2026-05-15T23:59:00Z"),
    maxPoints: 20,
    link: "https://classroom.google.com/c/c1/a/w1",
    workType: "ASSIGNMENT",
    ...over,
  };
}

const plan = (over: Partial<Parameters<typeof planImport>[0]> = {}) =>
  planImport({ courses: [course], work: [work()], submissions: [], subjects, existing: [], now: NOW, ...over });

describe("matchSubject", () => {
  it("matches a subject whatever the capitals", () => {
    // SQLite's own = is case-sensitive, which is why this is done here.
    expect(matchSubject({ ...course, name: "chemistry" }, subjects)?.id).toBe("s-chem");
  });

  it("matches a subject inside a longer course name", () => {
    expect(matchSubject({ ...course, name: "IGCSE Chemistry 2026" }, subjects)?.id).toBe("s-chem");
  });

  it("prefers the longer subject name when both fit", () => {
    // "Further Maths 12" contains "Maths" too; filing it under Maths would be
    // wrong and the student would never find it.
    expect(matchSubject({ ...course, name: "Further Maths 12", section: null }, subjects)?.id).toBe("s-fmaths");
  });

  it("matches a two-letter subject, which only the exact pass can do", () => {
    // PE and RE are real subject names, and they are deliberately excluded
    // from the loose "contained in the course name" pass — two letters match
    // inside far too many words. The exact compare is what catches them, and
    // it has to ignore case because teachers name courses however they like.
    const short = [{ id: "s-pe", name: "PE" }];
    expect(matchSubject({ ...course, name: "pe", section: null }, short)?.id).toBe("s-pe");
    expect(matchSubject({ ...course, name: "PE", section: null }, short)?.id).toBe("s-pe");
  });

  it("leaves it unfiled rather than guessing", () => {
    expect(matchSubject({ ...course, name: "Form time", section: null }, subjects)).toBeNull();
  });
});

describe("statusFor", () => {
  const due = new Date("2026-05-15T23:59:00Z");
  const sub = (state: string): ClassroomSubmission => ({ courseWorkId: "w1", state, late: false, grade: null });

  it("counts handed in as done", () => {
    expect(statusFor(sub("TURNED_IN"), due, NOW)).toBe("DONE");
    expect(statusFor(sub("RETURNED"), due, NOW)).toBe("DONE");
  });

  it("counts a passed deadline with nothing handed in as missed", () => {
    expect(statusFor(sub("CREATED"), due, new Date("2026-05-16T08:00:00Z"))).toBe("MISSED");
  });

  it("never drags back something you marked done yourself", () => {
    // Classroom knows nothing about work done but not uploaded. A sync that
    // reset this would overwrite the student's own answer every time.
    expect(statusFor(sub("CREATED"), due, new Date("2026-05-16T08:00:00Z"), "DONE")).toBe("DONE");
    expect(statusFor(undefined, due, NOW, "DONE")).toBe("DONE");
  });

  it("is pending before the deadline", () => {
    expect(statusFor(undefined, due, NOW)).toBe("PENDING");
  });
});

describe("planImport", () => {
  it("creates a row for work it has not seen", () => {
    const result = plan();
    expect(result.create).toHaveLength(1);
    expect(result.update).toHaveLength(0);
    expect(result.create[0]).toMatchObject({
      externalId: "gc:c1:w1",
      subjectId: "s-chem",
      title: "Mole ratios worksheet",
      description: "Questions 1 to 8",
      status: "PENDING",
      maxPoints: 20,
      link: "https://classroom.google.com/c/c1/a/w1",
    });
  });

  it("updates rather than duplicates on the second sync", () => {
    // The whole reason the external id exists. A second sync that created
    // again would double every assignment, every time.
    const existing: ExistingHomework[] = [
      { id: "h1", externalId: "gc:c1:w1", source: IMPORT_SOURCE, status: "PENDING" },
    ];
    const result = plan({ existing });
    expect(result.create).toHaveLength(0);
    expect(result.update).toEqual([
      { id: "h1", data: expect.objectContaining({ title: "Mole ratios worksheet" }) },
    ]);
  });

  it("carries the grade over once it is marked", () => {
    const submissions: ClassroomSubmission[] = [
      { courseWorkId: "w1", state: "RETURNED", late: false, grade: 17 },
    ];
    const result = plan({ submissions });
    expect(result.create[0]).toMatchObject({ grade: 17, maxPoints: 20, status: "DONE" });
  });

  it("never touches a row the student typed in themselves", () => {
    const existing: ExistingHomework[] = [
      { id: "h1", externalId: "gc:c1:w1", source: "MANUAL", status: "PENDING" },
    ];
    const result = plan({ existing });
    expect(result.create).toHaveLength(0);
    expect(result.update).toHaveLength(0);
  });

  it("leaves out work with no deadline, and says how many", () => {
    const result = plan({ work: [work({ due: null })] });
    expect(result.create).toHaveLength(0);
    expect(result.skippedNoDueDate).toBe(1);
  });

  it("leaves out last term's work, and says how many", () => {
    const result = plan({ work: [work({ due: new Date("2026-01-04T23:59:00Z") })] });
    expect(result.create).toHaveLength(0);
    expect(result.skippedTooOld).toBe(1);
  });

  it("keeps the course name on the work when no subject matches", () => {
    const result = plan({ subjects: [{ id: "s-bio", name: "Biology" }] });
    expect(result.create[0].subjectId).toBeNull();
    // Otherwise it reads as "Mole ratios worksheet" with no clue which class.
    expect(result.create[0].description).toBe("From Chemistry (10b)\n\nQuestions 1 to 8");
  });

  it("does not grow the description on every sync", () => {
    const first = plan({ subjects: [] }).create[0].description;
    const second = plan({ subjects: [] }).create[0].description;
    expect(second).toBe(first);
  });

  it("ignores work from a course that was not returned", () => {
    const result = plan({ work: [work({ courseId: "other" })] });
    expect(result.create).toHaveLength(0);
  });

  it("namespaces the id so another import can never collide with it", () => {
    expect(externalIdFor("c1", "w1")).toBe("gc:c1:w1");
  });
});
