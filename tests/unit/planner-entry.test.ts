import { describe, it, expect } from "vitest";
import {
  MAX_BLOCK_MINUTES,
  MAX_TITLE_LENGTH,
  MIN_BLOCK_MINUTES,
  isAnytime,
  parseBlockInput,
  parseClockTime,
  parseLocalDate,
} from "@/lib/school/planner-entry";

const good = { title: "Organic chemistry past paper", date: "2026-10-05", time: "17:30", minutes: "45" };

describe("parseLocalDate", () => {
  it("reads a plain calendar date as local midnight", () => {
    const date = parseLocalDate("2026-10-05")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });

  it("does not shift the day, the way Date's own string parsing does", () => {
    // This assertion is worthless in UTC, and in Europe/Zurich, and in every
    // other zone at or ahead of UTC: there `new Date("2026-10-05")` lands on
    // the 5th too, so the test would pass with the guard deleted. It only says
    // anything in a zone BEHIND UTC, where UTC midnight is still the evening
    // before — so the zone is forced rather than inherited from the machine.
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      // Proof the forcing took effect, and that this is a real hazard: Date's
      // own parsing of the very same string gives the wrong day here.
      expect(new Date("2026-10-05").getDate()).toBe(4);
      expect(parseLocalDate("2026-10-05")!.getDate()).toBe(5);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });

  it("refuses shapes that are not the one this app writes", () => {
    // Every one of these is accepted by `new Date(...)`, which is why the
    // regex is not redundant with parsing.
    expect(parseLocalDate("+002026-10-05")).toBeNull();
    expect(parseLocalDate("2026-9-1")).toBeNull();
    expect(parseLocalDate("2026/10/05")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
    expect(parseLocalDate("tomorrow")).toBeNull();
  });

  it("refuses a date that does not exist, instead of rolling it over", () => {
    // new Date(2026, 1, 31) silently becomes 3 March.
    expect(parseLocalDate("2026-02-31")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
  });
});

describe("parseClockTime", () => {
  it("reads a 24-hour time", () => {
    expect(parseClockTime("07:05")).toEqual({ hours: 7, minutes: 5 });
    expect(parseClockTime("23:59")).toEqual({ hours: 23, minutes: 59 });
    expect(parseClockTime("00:00")).toEqual({ hours: 0, minutes: 0 });
  });

  it("refuses times that are not times", () => {
    expect(parseClockTime("24:00")).toBeNull();
    expect(parseClockTime("12:60")).toBeNull();
    expect(parseClockTime("7:30")).toBeNull();
    expect(parseClockTime("")).toBeNull();
  });
});

describe("parseBlockInput", () => {
  it("builds the block at the time that was typed, in local time", () => {
    const result = parseBlockInput(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.start.getDate()).toBe(5);
    expect(result.value.start.getHours()).toBe(17);
    expect(result.value.start.getMinutes()).toBe(30);
    expect(result.value.end.getTime() - result.value.start.getTime()).toBe(45 * 60_000);
    expect(result.value.title).toBe("Organic chemistry past paper");
  });

  it("takes any words at all — this field is the whole point of the feature", () => {
    const result = parseBlockInput({ ...good, title: "  Mein eigenes Ziel: Kapitel 4 nochmal  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Mein eigenes Ziel: Kapitel 4 nochmal");
  });

  it("refuses an empty or whitespace-only title", () => {
    expect(parseBlockInput({ ...good, title: "" }).ok).toBe(false);
    expect(parseBlockInput({ ...good, title: "   " }).ok).toBe(false);
    expect(parseBlockInput({ ...good, title: undefined }).ok).toBe(false);
  });

  it("refuses a title longer than the column is meant to hold", () => {
    expect(parseBlockInput({ ...good, title: "x".repeat(MAX_TITLE_LENGTH) }).ok).toBe(true);
    expect(parseBlockInput({ ...good, title: "x".repeat(MAX_TITLE_LENGTH + 1) }).ok).toBe(false);
  });

  it("refuses a length outside the range rather than quietly changing it", () => {
    // Clamping would mean planning 8 hours and being given 6 without being
    // told — the app rewriting what you decided.
    expect(parseBlockInput({ ...good, minutes: String(MIN_BLOCK_MINUTES) }).ok).toBe(true);
    expect(parseBlockInput({ ...good, minutes: String(MAX_BLOCK_MINUTES) }).ok).toBe(true);
    expect(parseBlockInput({ ...good, minutes: String(MIN_BLOCK_MINUTES - 1) }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: String(MAX_BLOCK_MINUTES + 1) }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: "0" }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: "-30" }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: "45.5" }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: "abc" }).ok).toBe(false);
    expect(parseBlockInput({ ...good, minutes: "" }).ok).toBe(false);
  });

  it("carries an optional subject through, and treats blank as none", () => {
    const withSubject = parseBlockInput({ ...good, subjectId: "subj_1" });
    expect(withSubject.ok && withSubject.value.subjectId).toBe("subj_1");

    const without = parseBlockInput({ ...good, subjectId: "" });
    expect(without.ok && without.value.subjectId).toBeNull();

    const missing = parseBlockInput(good);
    expect(missing.ok && missing.value.subjectId).toBeNull();
  });

  it("every refusal says what to do about it", () => {
    const refusals = [
      parseBlockInput({ ...good, title: "" }),
      parseBlockInput({ ...good, date: "nope" }),
      parseBlockInput({ ...good, time: "nope" }),
      parseBlockInput({ ...good, minutes: "0" }),
    ];
    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      if (refusal.ok) continue;
      // Not a code, not "invalid input" — a sentence naming the missing thing.
      expect(refusal.error.length).toBeGreaterThan(8);
      expect(refusal.error).not.toMatch(/invalid|error/i);
    }
  });

  it("a block that runs past midnight still ends after it starts", () => {
    const result = parseBlockInput({ ...good, time: "23:30", minutes: "60" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.end.getTime()).toBeGreaterThan(result.value.start.getTime());
    expect(result.value.end.getDate()).toBe(6);
  });
});

describe("a block with no fixed time", () => {
  const base = { title: "Finish the Economics essay", date: "2026-10-05", subjectId: "" };

  it("is written down for the day, with no hour invented for it", () => {
    // The reported problem: the form demanded a clock time and a length, so
    // there was no way to put down a thing to do on a day.
    const result = parseBlockInput({ ...base, time: "", minutes: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.start.getFullYear()).toBe(2026);
    expect(result.value.start.getMonth()).toBe(9);
    expect(result.value.start.getDate()).toBe(5);
    expect(result.value.start.getHours()).toBe(0);
    expect(isAnytime(result.value)).toBe(true);
  });

  it("lands on the day you picked, not the evening before", () => {
    // The same trap parseLocalDate exists for: built field by field, so a
    // machine west of UTC does not file Monday under Sunday.
    const result = parseBlockInput({ ...base, date: "2026-10-05", time: "", minutes: "" });
    expect(result.ok && result.value.start.getDate()).toBe(5);
  });

  it("logs no study time, because none was done by writing it down", () => {
    // Analytics counts end minus start on completed sessions. A block that
    // claimed a duration it never had would report study that never happened.
    const result = parseBlockInput({ ...base, time: "", minutes: "" });
    expect(result.ok && result.value.end.getTime() - result.value.start.getTime()).toBe(0);
  });

  it("treats a missing time field the same as an empty one", () => {
    expect(parseBlockInput({ ...base, time: undefined, minutes: undefined }).ok).toBe(true);
    expect(parseBlockInput({ ...base, time: "   ", minutes: "  " }).ok).toBe(true);
  });

  it("refuses a length with no time to measure it from", () => {
    // Half an answer. Accepting it would silently drop the 45 minutes typed.
    const result = parseBlockInput({ ...base, time: "", minutes: "45" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/start time/i);
  });

  it("still keeps the subject you picked", () => {
    const result = parseBlockInput({ ...base, subjectId: "subj_1", time: "", minutes: "" });
    expect(result.ok && result.value.subjectId).toBe("subj_1");
  });

  it("still refuses a block with nothing written in it", () => {
    expect(parseBlockInput({ ...base, title: "   ", time: "", minutes: "" }).ok).toBe(false);
  });
});

describe("isAnytime", () => {
  it("is true only for a block of no length", () => {
    const day = new Date(2026, 9, 5);
    expect(isAnytime({ start: day, end: new Date(day) })).toBe(true);
    expect(isAnytime({ start: day, end: new Date(day.getTime() + 60_000) })).toBe(false);
  });

  it("cannot collide with a real timed block, which is never that short", () => {
    const timed = parseBlockInput({ title: "x", date: "2026-10-05", time: "17:00", minutes: String(MIN_BLOCK_MINUTES) });
    expect(timed.ok && isAnytime(timed.value)).toBe(false);
  });
});
