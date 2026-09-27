import { describe, it, expect } from "vitest";
import {
  buildInsights,
  dueForecast,
  dueNow,
  memoryBuckets,
  recall,
  studyStreak,
  studyTime,
  STRONG_INTERVAL_DAYS,
  type InsightCard,
  type SessionRow,
} from "@/lib/school/insights";

const NOW = new Date(2026, 8, 27, 14, 0, 0); // Sun 27 Sep 2026, local

function card(over: Partial<InsightCard> = {}): InsightCard {
  return { dueDate: NOW, interval: 1, repetitions: 0, lastResult: null, subjectId: null, ...over };
}

function session(dayOffset: number, minutes: number, completed = true): SessionRow {
  const start = new Date(2026, 8, 27 + dayOffset, 17, 0, 0);
  return { start, end: new Date(start.getTime() + minutes * 60_000), completed };
}

describe("memoryBuckets", () => {
  it("counts a never-answered card as never opened, whatever its interval says", () => {
    // A card can carry a long interval while having been answered zero times.
    // Counting that as "strong" would show a full bar on a deck nobody opened,
    // which is the single most misleading thing this panel could do.
    const buckets = memoryBuckets([card({ repetitions: 0, interval: 90 })]);
    expect(buckets.neverOpened).toBe(1);
    expect(buckets.strong).toBe(0);
  });

  it("separates just started, getting there and strong by interval", () => {
    const buckets = memoryBuckets([
      card({ repetitions: 1, interval: 1 }),
      card({ repetitions: 2, interval: 6 }),
      card({ repetitions: 3, interval: 7 }),
      card({ repetitions: 4, interval: 20 }),
      card({ repetitions: 5, interval: STRONG_INTERVAL_DAYS }),
      card({ repetitions: 6, interval: 90 }),
    ]);
    expect(buckets).toEqual({ neverOpened: 0, justStarted: 2, gettingThere: 2, strong: 2, total: 6 });
  });

  it("adds up to the number of cards, always", () => {
    const cards = [card(), card({ repetitions: 1, interval: 3 }), card({ repetitions: 9, interval: 40 })];
    const b = memoryBuckets(cards);
    expect(b.neverOpened + b.justStarted + b.gettingThere + b.strong).toBe(b.total);
    expect(b.total).toBe(cards.length);
  });
});

describe("dueNow", () => {
  it("counts a card due exactly now, and not one due later", () => {
    const cards = [
      card({ dueDate: new Date(NOW.getTime() - 1) }),
      card({ dueDate: NOW }),
      card({ dueDate: new Date(NOW.getTime() + 1) }),
    ];
    expect(dueNow(cards, NOW)).toHaveLength(2);
  });
});

describe("dueForecast", () => {
  it("gives one entry per day, starting today", () => {
    const days = dueForecast([], NOW, 14);
    expect(days).toHaveLength(14);
    expect(days[0].date.getDate()).toBe(27);
    expect(days[13].date.getDate()).toBe(10); // rolls into October
  });

  it("folds anything already overdue into today rather than dropping it", () => {
    // These are the cards that most need attention. A forecast that ignored
    // them would show an empty fortnight to someone with a pile waiting.
    const overdue = [
      card({ dueDate: new Date(2026, 8, 1) }),
      card({ dueDate: new Date(2026, 7, 15) }),
    ];
    const days = dueForecast(overdue, NOW, 14);
    expect(days[0].count).toBe(2);
    expect(days.slice(1).every((d) => d.count === 0)).toBe(true);
  });

  it("puts a card on its own day, by local date rather than by hour", () => {
    const days = dueForecast([card({ dueDate: new Date(2026, 8, 30, 23, 30) })], NOW, 14);
    expect(days[3].count).toBe(1);
    expect(days[3].date.getDate()).toBe(30);
  });

  it("ignores a card due beyond the window instead of piling it on the last day", () => {
    const days = dueForecast([card({ dueDate: new Date(2026, 10, 1) })], NOW, 14);
    expect(days.every((d) => d.count === 0)).toBe(true);
  });
});

describe("recall", () => {
  it("is not measured when nothing has been answered", () => {
    // Not 0%. Nobody got anything wrong — nobody has answered at all.
    expect(recall([card(), card()])).toEqual({ measured: false });
  });

  it("counts GOOD and EASY as right, AGAIN and HARD as not", () => {
    const cards = [
      card({ lastResult: "GOOD" }),
      card({ lastResult: "EASY" }),
      card({ lastResult: "HARD" }),
      card({ lastResult: "AGAIN" }),
    ];
    expect(recall(cards)).toEqual({ measured: true, pct: 50, right: 2, answered: 4 });
  });

  it("ignores unanswered cards rather than counting them as wrong", () => {
    const cards = [card({ lastResult: "GOOD" }), card(), card(), card()];
    const result = recall(cards);
    expect(result).toEqual({ measured: true, pct: 100, right: 1, answered: 1 });
  });
});

describe("studyTime", () => {
  it("counts only blocks that were ticked off", () => {
    expect(studyTime([session(0, 45), session(0, 30, false)])).toEqual({ minutes: 45, sessions: 1 });
  });

  it("is zero sessions, not zero minutes of nothing, when none is done", () => {
    expect(studyTime([session(0, 45, false)])).toEqual({ minutes: 0, sessions: 0 });
  });
});

describe("studyStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(studyStreak([session(0, 30), session(-1, 30), session(-2, 30)], NOW)).toBe(3);
  });

  it("survives a today that has not happened yet", () => {
    // At nine in the morning you have not broken a streak; you have not
    // studied yet. Resetting here would punish the time of day.
    expect(studyStreak([session(-1, 30), session(-2, 30)], NOW)).toBe(2);
  });

  it("is broken by a missed day before yesterday", () => {
    expect(studyStreak([session(-1, 30), session(-3, 30)], NOW)).toBe(1);
  });

  it("is zero when the last session was two days ago or more", () => {
    expect(studyStreak([session(-2, 30), session(-3, 30)], NOW)).toBe(0);
  });

  it("counts a day once, however many blocks it holds", () => {
    expect(studyStreak([session(0, 30), session(0, 45), session(0, 20)], NOW)).toBe(1);
  });

  it("ignores blocks that were never ticked off", () => {
    expect(studyStreak([session(0, 30, false)], NOW)).toBe(0);
  });
});

describe("buildInsights", () => {
  const deckNames = new Map([["subj_chem", "Chemistry"], ["subj_bio", "Biology"]]);

  it("says plainly that there is nothing to measure, rather than printing zeros", () => {
    const insights = buildInsights({ cards: [], sessions: [], deckNames, now: NOW });
    expect(insights.stand[0]).toMatch(/no flashcards yet/i);
    expect(insights.recall.measured).toBe(false);
    expect(insights.next.some((a) => /first flashcards/i.test(a.title))).toBe(true);
  });

  it("names the deck with the most unseen cards, instead of saying 'a deck'", () => {
    const insights = buildInsights({
      cards: [
        card({ subjectId: "subj_bio" }),
        card({ subjectId: "subj_chem" }),
        card({ subjectId: "subj_chem" }),
        card({ subjectId: "subj_chem" }),
      ],
      sessions: [],
      deckNames,
      now: NOW,
    });
    expect(insights.next.some((a) => a.title.includes("Chemistry"))).toBe(true);
    expect(insights.next.some((a) => a.title.includes("Biology"))).toBe(false);
  });

  it("puts clearing due cards before anything else", () => {
    const insights = buildInsights({
      cards: [card({ dueDate: new Date(2026, 8, 1) }), card({ dueDate: new Date(2026, 8, 2) })],
      sessions: [],
      deckNames,
      now: NOW,
    });
    expect(insights.next[0].title).toMatch(/Clear the 2 cards/);
  });

  it("never offers more than two next steps", () => {
    // The state chosen here is one that generates THREE candidates: cards are
    // due, a named deck has never been opened, and no study block has been
    // ticked off. An empty account produces exactly two on its own, so testing
    // the cap there says nothing — the cap can be deleted and that test stays
    // green, which is how this one was written the first time.
    const insights = buildInsights({
      cards: [
        card({ dueDate: new Date(2026, 8, 1), subjectId: "subj_chem" }),
        card({ dueDate: new Date(2026, 8, 2), subjectId: "subj_chem" }),
      ],
      sessions: [],
      deckNames,
      now: NOW,
    });
    expect(insights.next.length).toBe(2);
    expect(insights.next[0].title).toMatch(/Clear the 2 cards/);
    expect(insights.next[1].title).toMatch(/Chemistry/);
  });

  it("reports the heaviest day of the fortnight, and nothing when it is empty", () => {
    const busy = buildInsights({
      cards: [card({ dueDate: new Date(2026, 8, 29) }), card({ dueDate: new Date(2026, 8, 29) }), card({ dueDate: new Date(2026, 9, 2) })],
      sessions: [],
      deckNames,
      now: NOW,
    });
    expect(busy.heaviestDay?.date.getDate()).toBe(29);
    expect(busy.heaviestDay?.count).toBe(2);

    const quiet = buildInsights({ cards: [], sessions: [], deckNames, now: NOW });
    expect(quiet.heaviestDay).toBeNull();
  });

  it("does not claim study time for blocks that were only planned", () => {
    const insights = buildInsights({ cards: [], sessions: [session(0, 90, false)], deckNames, now: NOW });
    expect(insights.study).toEqual({ minutes: 0, sessions: 0 });
    expect(insights.stand.some((line) => /not counted yet/i.test(line))).toBe(true);
  });

  it("says singular things in the singular", () => {
    const insights = buildInsights({
      cards: [card({ dueDate: new Date(2026, 8, 1) })],
      sessions: [session(0, 1)],
      deckNames,
      now: NOW,
    });
    expect(insights.stand.join(" ")).toMatch(/1 card is/);
    expect(insights.stand.join(" ")).not.toMatch(/1 cards/);
    expect(insights.stand.join(" ")).toMatch(/1 minute\b/);
    expect(insights.stand.join(" ")).toMatch(/1 session\b/);
    expect(insights.stand.join(" ")).toMatch(/1 day in a row/);
  });
});
