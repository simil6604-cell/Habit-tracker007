import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/**
 * One list for everything you have to do — school, gym and football together.
 *
 * Until now each lived on its own page: homework under School, the workout
 * under Gym, training and matches under Football. That is a fine place to
 * PLAN one and a useless place to answer "what do I actually have to do this
 * week", which is the only question that matters on a Wednesday evening.
 *
 * Everything here is pure: what an item is, which day it belongs to, what
 * state it is in, and how a month is laid out as a table. The page does the
 * fetching and the writing.
 */

export type PlanDomain = "SCHOOL" | "GYM" | "FOOTBALL" | "GENERAL";

export type PlanKind = "HOMEWORK" | "EXAM" | "WORKOUT" | "TRAINING" | "MATCH" | "TASK";

export const KIND_META: Record<PlanKind, { label: string; emoji: string; domain: PlanDomain }> = {
  // "Homework" and "Exam" are kept apart on purpose: they are both school and
  // they are not the same thing at all, and a list that calls both "School"
  // hides the difference that decides what you do tonight.
  HOMEWORK: { label: "Homework", emoji: "📓", domain: "SCHOOL" },
  EXAM: { label: "Exam", emoji: "📝", domain: "SCHOOL" },
  WORKOUT: { label: "Workout", emoji: "🏋️", domain: "GYM" },
  TRAINING: { label: "Training", emoji: "⚽", domain: "FOOTBALL" },
  MATCH: { label: "Match", emoji: "🏟️", domain: "FOOTBALL" },
  TASK: { label: "Task", emoji: "✅", domain: "GENERAL" },
};

export const DOMAIN_META: Record<PlanDomain, { label: string; color: string }> = {
  SCHOOL: { label: "School", color: "var(--cat-school)" },
  GYM: { label: "Gym", color: "var(--cat-gym)" },
  FOOTBALL: { label: "Football", color: "var(--cat-football)" },
  GENERAL: { label: "Other", color: "var(--cat-task)" },
};

/** A line of the "what exactly" — an exercise, a drill, where to be. */
export type PlanDetail = { label: string; value?: string };

export type PlanItem = {
  /**
   * What this is, independent of the day: "homework:abc", "workout:def".
   * A weekly workout keeps one key across every week it falls on; the day
   * makes it unique.
   */
  sourceKey: string;
  kind: PlanKind;
  /** Midnight on the day it is planned for. */
  date: Date;
  /** "18:30" when there is a clock time; null when it is just "that day". */
  time: string | null;
  title: string;
  /** The subject, the opponent — the one word that says which one this is. */
  context: string | null;
  /** The detail: the exercises, the drills, where to be. */
  detail: PlanDetail[];
  /** The page that owns it, for changing the thing itself. */
  href: string;
  /**
   * Already marked where it lives — Homework.status, FootballTraining.completed.
   * Read as well as written, so a tick made on the School page shows here.
   */
  nativeStatus: PlanStatus | null;
};

/**
 * A plan with no day on it: a gym workout that was never given a weekday, an
 * individual football session the generator makes without one.
 *
 * It has no place in a month of dates, and dropping it would mean the page
 * quietly knows about work it never mentions — so it gets its own list,
 * saying plainly that a day is what it is missing.
 */
export type PlanUnscheduledItem = {
  sourceKey: string;
  kind: PlanKind;
  title: string;
  context: string | null;
  detail: PlanDetail[];
  href: string;
};

export type PlanStatus = "DONE" | "MISSED";

export type PlanCheckRow = {
  sourceKey: string;
  date: Date;
  status: string;
  note: string | null;
  atTime: string | null;
};

export function domainOf(item: PlanItem): PlanDomain {
  return KIND_META[item.kind].domain;
}

/** The day half of a check's identity, in the one format that sorts right. */
export function dayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Identifies one thing on one day — a weekly workout is a new one each week. */
export function checkKey(sourceKey: string, date: Date): string {
  return `${sourceKey}@${dayKey(date)}`;
}

export function indexChecks(rows: PlanCheckRow[]): Map<string, PlanCheckRow> {
  const map = new Map<string, PlanCheckRow>();
  for (const row of rows) map.set(checkKey(row.sourceKey, row.date), row);
  return map;
}

export type PlanState = {
  status: PlanStatus | "OPEN";
  note: string | null;
  atTime: string | null;
};

/**
 * What state an item is in on a given day.
 *
 * The check wins over the thing's own status, because the check is the more
 * recent statement: someone who ticks homework here and then unticks it here
 * means the second one. When there is no check, the thing's own status still
 * counts — otherwise homework ticked off on the School page would sit in this
 * list looking undone.
 */
export function planState(item: PlanItem, checks: Map<string, PlanCheckRow>): PlanState {
  const check = checks.get(checkKey(item.sourceKey, item.date));
  if (check && (check.status === "DONE" || check.status === "MISSED")) {
    return { status: check.status, note: check.note, atTime: check.atTime };
  }
  return { status: item.nativeStatus ?? "OPEN", note: check?.note ?? null, atTime: check?.atTime ?? null };
}

export type PlanDay = { date: Date; items: PlanItem[] };

/**
 * The items of a month, one group per day that has any.
 *
 * Empty days are left out of the list — a page of "nothing on" headings is
 * scrolling for no reason. The table above it shows the whole month, blanks
 * included, which is where an empty day is worth seeing.
 */
export function groupByDay(items: PlanItem[]): PlanDay[] {
  const days = new Map<string, PlanDay>();
  for (const item of items) {
    const key = dayKey(item.date);
    const day = days.get(key);
    if (day) day.items.push(item);
    else days.set(key, { date: startOfDay(item.date), items: [item] });
  }
  return [...days.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((day) => ({ ...day, items: sortWithinDay(day.items) }));
}

/**
 * Within a day: anything with a clock time first, in time order, then the
 * rest. A match at 14:00 and "hand in the essay" are not comparable, and
 * putting the untimed ones at 00:00 would float them above the whole day.
 */
export function sortWithinDay(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.title.localeCompare(b.title, "de");
  });
}

/**
 * The month as a table: whole weeks, Monday to Sunday, including the days of
 * the neighbouring months that fill the first and last row.
 */
export function monthGrid(month: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
}

/** The same days, cut into rows of seven, which is what a table needs. */
export function monthWeeks(month: Date): Date[][] {
  const days = monthGrid(month);
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function itemsOn(items: PlanItem[], day: Date): PlanItem[] {
  return sortWithinDay(items.filter((item) => isSameDay(item.date, day)));
}

export type PlanCounts = { total: number; done: number; missed: number; open: number };

export function countStates(items: PlanItem[], checks: Map<string, PlanCheckRow>): PlanCounts {
  const counts: PlanCounts = { total: items.length, done: 0, missed: 0, open: 0 };
  for (const item of items) {
    const state = planState(item, checks).status;
    if (state === "DONE") counts.done++;
    else if (state === "MISSED") counts.missed++;
    else counts.open++;
  }
  return counts;
}

/** `?month=2026-11`, refused rather than guessed when it is not that. */
export function parseMonth(raw: string | undefined, today: Date): Date {
  if (!raw) return startOfMonth(today);
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return startOfMonth(today);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11 || year < 2000 || year > 2100) return startOfMonth(today);
  return new Date(year, monthIndex, 1);
}

export function monthParam(month: Date): string {
  return format(month, "yyyy-MM");
}

/** `?day=2026-11-18`, and null when there is no valid one. */
export function parseDay(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

export const PLAN_STATUSES: PlanStatus[] = ["DONE", "MISSED"];

export function isPlanStatus(value: unknown): value is PlanStatus {
  return value === "DONE" || value === "MISSED";
}

export const MAX_PLAN_NOTE = 500;
export const MAX_PLAN_TIME = 40;
