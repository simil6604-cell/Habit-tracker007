import { describe, it, expect } from "vitest";
import {
  YEAR12_SUBJECTS,
  YEAR12_TIMETABLE,
  lessonCounts,
  type Year12Slot,
} from "@/lib/school/year12-timetable";

/**
 * This week is typed-in data, and typed-in data is where a quiet mistake
 * lives: one slot given to the wrong subject, one period missing, one day
 * silently a row short. The counts are checked against what the student
 * actually takes so a slip shows up here rather than in their week.
 */
describe("the Year 12 week", () => {
  const counts = lessonCounts();

  it("holds the five lessons a week of each of the three main subjects", () => {
    expect(counts.German).toBe(5);
    expect(counts.English).toBe(5);
    expect(counts.Economics).toBe(5);
  });

  it("holds EPQ once, on Wednesday", () => {
    expect(counts.EPQ).toBe(1);
    const epq = YEAR12_TIMETABLE.filter((s) => s.subject === "EPQ");
    expect(epq).toHaveLength(1);
    expect(epq[0].dayOfWeek).toBe(2);
  });

  it("never places Maths, because it runs with Year 11", () => {
    expect(YEAR12_TIMETABLE.some((s) => s.subject === "Maths")).toBe(false);
    const labelled = YEAR12_TIMETABLE.filter((s) => s.label?.includes("Maths"));
    expect(labelled.length).toBeGreaterThan(0);
    // and every one of them is free time, not a lesson
    for (const slot of labelled) expect(slot.periodType).toBe("FREE");
  });

  it("still asks for Maths as a subject, so work can hang off it", () => {
    expect(YEAR12_SUBJECTS).toContain("Maths");
  });

  it("covers every one of the six periods on all five days", () => {
    for (let day = 0; day <= 4; day += 1) {
      const periods = YEAR12_TIMETABLE.filter((s) => s.dayOfWeek === day).map((s) => s.periodName);
      for (const p of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
        expect(periods, `day ${day} is missing ${p}`).toContain(p);
      }
      // and the fixed furniture of a school day
      for (const p of ["AM Reg", "Break", "Lunch", "PM Reg"]) {
        expect(periods, `day ${day} is missing ${p}`).toContain(p);
      }
    }
  });

  it("never puts two things in the same period on the same day", () => {
    const seen = new Set<string>();
    for (const slot of YEAR12_TIMETABLE) {
      const key = `${slot.dayOfWeek}-${slot.periodName}`;
      expect(seen.has(key), `${key} appears twice`).toBe(false);
      seen.add(key);
    }
  });

  it("runs the after-school clubs on Tuesday and Thursday only", () => {
    const clubs = YEAR12_TIMETABLE.filter((s) => s.periodType === "CLUB");
    expect(clubs.map((s) => s.dayOfWeek).sort()).toEqual([1, 3]);
  });

  it("names something in every slot, so nothing shows up blank", () => {
    for (const slot of YEAR12_TIMETABLE) {
      expect(slot.subject ?? slot.label, JSON.stringify(slot)).toBeTruthy();
    }
  });

  it("only uses subjects the import creates", () => {
    const named = new Set(YEAR12_TIMETABLE.map((s) => s.subject).filter(Boolean));
    for (const name of named) expect(YEAR12_SUBJECTS).toContain(name as never);
  });

  it("counts whatever week it is handed, not only the built-in one", () => {
    const made: Year12Slot[] = [
      { dayOfWeek: 0, startTime: "08:40", endTime: "09:35", periodName: "P1", periodType: "LESSON", subject: "Art" },
      { dayOfWeek: 1, startTime: "08:40", endTime: "09:35", periodName: "P1", periodType: "LESSON", subject: "Art" },
    ];
    expect(lessonCounts(made)).toEqual({ Art: 2 });
  });
});
