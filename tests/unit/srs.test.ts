import { describe, expect, it } from "vitest";
import { reviewBucket, schedule, type ReviewResult } from "@/lib/school/srs";

const fresh = { interval: 1, easeFactor: 2.5, repetitions: 0 };
const daysFromNow = (d: Date) => Math.round((d.getTime() - Date.now()) / 86_400_000);

describe("schedule", () => {
  it("sends a card you got wrong back to tomorrow and resets its streak", () => {
    const next = schedule({ interval: 30, easeFactor: 2.5, repetitions: 5 }, "AGAIN");
    expect(next.interval).toBe(1);
    expect(next.repetitions).toBe(0);
    expect(daysFromNow(next.dueDate)).toBe(1);
  });

  it("walks a new card out through the standard 1 then 6 day steps", () => {
    const first = schedule(fresh, "GOOD");
    expect(first.interval).toBe(1);
    const second = schedule(first, "GOOD");
    expect(second.interval).toBe(6);
  });

  it("stretches the gap by the ease factor from the third review on", () => {
    const third = schedule({ interval: 6, easeFactor: 2.5, repetitions: 2 }, "GOOD");
    expect(third.interval).toBe(Math.round(6 * third.easeFactor));
    expect(third.interval).toBeGreaterThan(6);
  });

  it("rewards an easy card with a larger ease factor than a hard one", () => {
    const easy = schedule(fresh, "EASY");
    const hard = schedule(fresh, "HARD");
    expect(easy.easeFactor).toBeGreaterThan(hard.easeFactor);
  });

  it("never lets the ease factor fall below the floor, however often you miss", () => {
    let card = { interval: 10, easeFactor: 2.5, repetitions: 3 };
    for (let i = 0; i < 20; i++) card = schedule(card, "AGAIN");
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("always schedules the next review for the interval it just decided", () => {
    for (const result of ["AGAIN", "HARD", "GOOD", "EASY"] as ReviewResult[]) {
      const next = schedule({ interval: 4, easeFactor: 2.5, repetitions: 3 }, result);
      expect(daysFromNow(next.dueDate)).toBe(next.interval);
    }
  });
});

describe("reviewBucket", () => {
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

  it("calls an overdue card one that needs review", () => {
    expect(reviewBucket(inDays(-1), 10)).toBe("NEEDS_REVIEW");
  });

  it("calls a card due later today due today", () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 30, 0, 0);
    expect(reviewBucket(endOfToday, 3)).toBe("DUE_TODAY");
  });

  it("only calls a card mastered once its gap has grown past three weeks", () => {
    expect(reviewBucket(inDays(30), 21)).toBe("MASTERED");
    expect(reviewBucket(inDays(30), 20)).toBe("DUE_TODAY");
  });
});
