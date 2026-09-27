/**
 * The numbers behind the Insights panel on the school page.
 *
 * Every function here is pure and every one of them can say "not measured".
 * That matters more than it sounds: a learning dashboard's whole job is to be
 * believed, and the fastest way to lose that is to print 0% for something
 * nobody has done yet. A card nobody has ever opened is not a card you got
 * wrong, and a week with no session is not a week of zero minutes studied —
 * it is a week the app knows nothing about, and it should say so.
 *
 * What this app can honestly measure, and what it cannot:
 *
 *  - Due now, memory strength, and the next fortnight come from the flashcard
 *    rows themselves. Solid.
 *  - Recall comes from `lastResult`, which stores only the MOST RECENT answer
 *    per card. So it is "how many cards you got right the last time you saw
 *    them", not a true accuracy rate over history — there is no review log to
 *    compute one from. It is labelled as the former everywhere it appears.
 *  - There is no per-review timestamp anywhere in the schema, so a genuine
 *    review streak cannot be computed. What is shown instead is a STUDY
 *    streak, from study blocks actually ticked off, under that name. Calling
 *    it a review streak would have been a guess wearing a number's clothes.
 */

export const STRONG_INTERVAL_DAYS = 21;
export const GETTING_THERE_INTERVAL_DAYS = 7;
export const FORECAST_DAYS = 14;

export type InsightCard = {
  dueDate: Date;
  interval: number;
  repetitions: number;
  lastResult: string | null;
  subjectId: string | null;
};

export type MemoryBuckets = {
  neverOpened: number;
  justStarted: number;
  gettingThere: number;
  strong: number;
  total: number;
};

/**
 * How well each card is actually held, by how far out the scheduler has
 * pushed it.
 *
 * Keyed on repetitions first: a card can carry a long default interval while
 * never having been answered, and counting that as progress would show a bar
 * full of "strong" on a deck nobody has opened.
 */
export function memoryBuckets(cards: InsightCard[]): MemoryBuckets {
  const buckets = { neverOpened: 0, justStarted: 0, gettingThere: 0, strong: 0, total: cards.length };
  for (const card of cards) {
    if (card.repetitions === 0) buckets.neverOpened++;
    else if (card.interval >= STRONG_INTERVAL_DAYS) buckets.strong++;
    else if (card.interval >= GETTING_THERE_INTERVAL_DAYS) buckets.gettingThere++;
    else buckets.justStarted++;
  }
  return buckets;
}

export function dueNow(cards: InsightCard[], now: Date): InsightCard[] {
  return cards.filter((card) => card.dueDate.getTime() <= now.getTime());
}

/** yyyy-mm-dd in local time — the zone the rest of the app counts days in. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ForecastDay = { key: string; date: Date; count: number };

/**
 * How many cards fall due on each of the next `days` days.
 *
 * Anything already overdue is folded into today rather than dropped: those
 * cards are the ones most in need of attention, and a forecast that quietly
 * ignored them would show an empty week to someone with fifty cards waiting.
 */
export function dueForecast(cards: InsightCard[], now: Date, days: number = FORECAST_DAYS): ForecastDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const forecast: ForecastDay[] = [];
  const index = new Map<string, ForecastDay>();

  for (let i = 0; i < days; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const entry = { key: dayKey(date), date, count: 0 };
    forecast.push(entry);
    index.set(entry.key, entry);
  }

  const todayEntry = forecast[0];
  for (const card of cards) {
    if (card.dueDate.getTime() < start.getTime()) {
      todayEntry.count++;
      continue;
    }
    const entry = index.get(dayKey(card.dueDate));
    if (entry) entry.count++;
  }
  return forecast;
}

export type Recall = { measured: false } | { measured: true; pct: number; right: number; answered: number };

const RIGHT_RESULTS = new Set(["GOOD", "EASY"]);

/**
 * The share of answered cards whose last answer was right.
 *
 * Returns `measured: false` rather than 0 when nothing has been answered,
 * because those are completely different facts and one of them is demoralising
 * and untrue.
 */
export function recall(cards: InsightCard[]): Recall {
  const answered = cards.filter((card) => card.lastResult !== null);
  if (answered.length === 0) return { measured: false };
  const right = answered.filter((card) => RIGHT_RESULTS.has(card.lastResult!)).length;
  return { measured: true, pct: Math.round((right / answered.length) * 100), right, answered: answered.length };
}

export type SessionRow = { start: Date; end: Date; completed: boolean };

/** Minutes and count from study blocks that were actually ticked off. */
export function studyTime(sessions: SessionRow[]): { minutes: number; sessions: number } {
  const done = sessions.filter((s) => s.completed);
  const minutes = done.reduce((total, s) => total + Math.max(0, Math.round((s.end.getTime() - s.start.getTime()) / 60000)), 0);
  return { minutes, sessions: done.length };
}

/**
 * Days in a row, ending today or yesterday, with at least one completed block.
 *
 * Yesterday counts as still alive on purpose: at nine in the morning you have
 * not broken a streak, you simply have not studied yet today, and resetting it
 * to zero overnight punishes people for the time of day they opened the app.
 */
export function studyStreak(sessions: SessionRow[], now: Date): number {
  const days = new Set(sessions.filter((s) => s.completed).map((s) => dayKey(s.start)));
  if (days.size === 0) return 0;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let cursor = today;
  if (!days.has(dayKey(cursor))) {
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (!days.has(dayKey(yesterday))) return 0;
    cursor = yesterday;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

export type InsightsInput = {
  cards: InsightCard[];
  sessions: SessionRow[];
  /** Subjects that have at least one card, so "deck" means something real. */
  deckNames: Map<string, string>;
  now: Date;
};

export type NextAction = { title: string; detail: string; href: string; icon: string };

export type SchoolInsights = {
  total: number;
  due: number;
  buckets: MemoryBuckets;
  recall: Recall;
  study: { minutes: number; sessions: number };
  streak: number;
  forecast: ForecastDay[];
  heaviestDay: ForecastDay | null;
  stand: string[];
  next: NextAction[];
};

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/** The short, plain sentences under "Where you stand". */
export function whereYouStand(input: InsightsInput, parts: Pick<SchoolInsights, "due" | "buckets" | "recall" | "study" | "streak">): string[] {
  const lines: string[] = [];
  const { due, buckets, recall: rec, study, streak } = parts;

  // No cards is a statement about cards, not a reason to go quiet about
  // everything else. Someone can have a week of study blocks and no deck at
  // all, and returning here would have told them nothing about either.
  if (buckets.total === 0) {
    lines.push("You have no flashcards yet, so there is nothing to review.");
  }

  if (buckets.total > 0 && due > 0) {
    const unseen = Math.min(due, buckets.neverOpened);
    lines.push(
      unseen === due
        ? `${due} ${plural(due, "card is", "cards are")} waiting that you have never opened.`
        : `${due} ${plural(due, "card is", "cards are")} due for review.`
    );
  } else if (buckets.total > 0) {
    lines.push("Nothing is due right now — everything is scheduled ahead.");
  }

  if (buckets.total > 0) {
    lines.push(
      rec.measured
        ? `You got ${rec.right} of ${rec.answered} right the last time you saw them.`
        : "No card has been answered yet, so your recall is not measured."
    );

    lines.push(
      buckets.strong > 0
        ? `${buckets.strong} ${plural(buckets.strong, "card is", "cards are")} holding — not asked for again for ${STRONG_INTERVAL_DAYS} days or more.`
        : `No card is strong yet. A card turns strong once it is not asked for again for ${STRONG_INTERVAL_DAYS} days.`
    );
  }

  lines.push(
    study.sessions > 0
      ? `${study.minutes} ${plural(study.minutes, "minute", "minutes")} logged across ${study.sessions} ${plural(study.sessions, "session", "sessions")} you ticked off.`
      : "No study block has been ticked off, so your study time is not counted yet."
  );

  if (streak > 0) lines.push(`You have studied on ${streak} ${plural(streak, "day", "days")} in a row.`);

  return lines;
}

/** The one or two things actually worth doing next, in order of cheapness. */
export function doThisNext(parts: Pick<SchoolInsights, "due" | "buckets" | "study">, deckNames: Map<string, string>, unopenedDeck: string | null): NextAction[] {
  const actions: NextAction[] = [];

  if (parts.due > 0) {
    actions.push({
      title: `Clear the ${parts.due} ${plural(parts.due, "card", "cards")} that are due`,
      detail: "Overdue cards are the cheapest thing to fix",
      href: "/school/flashcards",
      icon: "🎯",
    });
  }

  if (unopenedDeck) {
    actions.push({
      title: `Open ${unopenedDeck} for the first time`,
      detail: `${parts.buckets.neverOpened} ${plural(parts.buckets.neverOpened, "card is", "cards are")} sitting unseen`,
      href: "/school/flashcards",
      icon: "📗",
    });
  }

  if (parts.buckets.total === 0) {
    actions.push({
      title: "Make your first flashcards",
      detail: "They can come straight from the topics you are weakest on",
      href: "/school/flashcards",
      icon: "✏️",
    });
  }

  if (parts.study.sessions === 0) {
    actions.push({
      title: "Write a study block and tick it off",
      detail: "That is what turns your logged study time into a real number",
      href: "/school/planner",
      icon: "🗓️",
    });
  }

  // Two is the limit on purpose: a list of "next steps" long enough to need
  // scrolling is a backlog, and a backlog is the thing this panel exists to
  // cut through.
  return actions.slice(0, 2);
}

export function buildInsights(input: InsightsInput): SchoolInsights {
  const { cards, sessions, now, deckNames } = input;

  const buckets = memoryBuckets(cards);
  const due = dueNow(cards, now).length;
  const rec = recall(cards);
  const study = studyTime(sessions);
  const streak = studyStreak(sessions, now);
  const forecast = dueForecast(cards, now);

  const heaviestDay = forecast.reduce<ForecastDay | null>(
    (worst, day) => (day.count > 0 && (!worst || day.count > worst.count) ? day : worst),
    null
  );

  // The deck with the most never-opened cards, so "open this one" names a real
  // subject instead of telling someone to go and look around.
  const unopenedBySubject = new Map<string, number>();
  for (const card of cards) {
    if (card.repetitions !== 0 || !card.subjectId) continue;
    unopenedBySubject.set(card.subjectId, (unopenedBySubject.get(card.subjectId) ?? 0) + 1);
  }
  let unopenedDeck: string | null = null;
  let worst = 0;
  for (const [subjectId, count] of unopenedBySubject) {
    const name = deckNames.get(subjectId);
    if (name && count > worst) {
      worst = count;
      unopenedDeck = name;
    }
  }

  const parts = { due, buckets, recall: rec, study, streak };
  return {
    total: cards.length,
    due,
    buckets,
    recall: rec,
    study,
    streak,
    forecast,
    heaviestDay,
    stand: whereYouStand(input, parts),
    next: doThisNext({ due, buckets, study }, deckNames, unopenedDeck),
  };
}
