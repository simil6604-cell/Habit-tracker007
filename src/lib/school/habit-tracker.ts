import { prisma } from "@/lib/db/prisma";
import { startOfWeek, addDays, format, startOfDay, isAfter, isSameDay } from "date-fns";

/**
 * The habit tracker, as a checklist per day rather than a grid.
 *
 * The grid this replaced put habits down the side and 28 days across the top,
 * which reads as a heat map and works badly for the thing it is actually for:
 * standing there in the evening ticking off what you did today. A day is now a
 * card with its own checklist and its own percentage at the bottom, a week of
 * cards side by side, and the longer-range analysis underneath where it belongs.
 */

export type HabitRow = { id: string; name: string; emoji: string | null };
export type HabitCheck = { habitId: string; name: string; emoji: string | null; done: boolean };

export type HabitDay = {
  dateKey: string;
  weekdayLabel: string; // Mon
  dateLabel: string; // 23 Sep
  isToday: boolean;
  isFuture: boolean;
  checks: HabitCheck[];
  doneCount: number;
  totalCount: number;
  pct: number;
};

export type TrendPoint = { dateKey: string; label: string; pct: number };
export type HabitStat = {
  habitId: string;
  name: string;
  emoji: string | null;
  doneCount: number;
  trackedDays: number;
  pct: number;
  streak: number;
};

export type HabitTrackerData = {
  habits: HabitRow[];
  days: HabitDay[];
  weekLabel: string;
  weekOffset: number;
  isCurrentWeek: boolean;
  weekDonePct: number;
  trend: TrendPoint[];
  habitStats: HabitStat[];
};

/** How far back the analysis underneath the cards looks. */
export const TREND_DAYS = 28;

/** How far back the week arrows will go — a year of history is plenty to scroll. */
export const MAX_WEEKS_BACK = 52;

export function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * A day's percentage.
 *
 * A future day is not 0% — nothing was due yet, and showing it as a failure
 * makes the rest of the week look like a collapse every Monday. It, and a day
 * with no habits at all, have no percentage rather than a zero one.
 */
export function dayPct(doneCount: number, totalCount: number, isFuture: boolean): number | null {
  if (isFuture || totalCount === 0) return null;
  return Math.round((doneCount / totalCount) * 100);
}

/**
 * How many days in a row, counting back, this habit has been done.
 *
 * Today not being ticked yet does not break a streak — it is the evening, not
 * a failure — so the count starts at yesterday in that case. A streak that
 * reset itself every morning would be worse than not having one.
 */
export function currentStreak(habitId: string, done: Set<string>, today: Date): number {
  let streak = 0;
  let cursor = done.has(`${habitId}|${dateKey(today)}`) ? today : addDays(today, -1);
  while (done.has(`${habitId}|${dateKey(cursor)}`)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The seven dates of the week `offset` weeks back from the one containing `today`. */
export function weekDates(today: Date, offset: number): Date[] {
  const monday = startOfWeek(addDays(startOfDay(today), -7 * offset), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "This week", "Last week", or the dates it spans. */
export function weekLabel(dates: Date[], offset: number): string {
  if (offset === 0) return "This week";
  if (offset === 1) return "Last week";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const sameMonth = format(first, "MMM") === format(last, "MMM");
  return sameMonth
    ? `${format(first, "d")}–${format(last, "d MMM")}`
    : `${format(first, "d MMM")} – ${format(last, "d MMM")}`;
}

/** Clamps a week offset from the URL to a real one — ?week=-4 or ?week=banana are not weeks. */
export function parseWeekOffset(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(value)) return 0;
  return Math.min(Math.max(value, 0), MAX_WEEKS_BACK);
}

/**
 * The day a checkbox belongs to, or null.
 *
 * The date comes back from a form post, so it is caller-supplied and reaches a
 * `new Date()` that answers "Invalid Date" rather than throwing — which Prisma
 * then rejects with an error about nothing the student did. And a day that
 * hasn't happened cannot be ticked: the cards disable those checkboxes, but a
 * disabled button in the browser is not a rule, and a habit logged for next
 * Thursday arrives pre-ticked on Thursday.
 */
export function parseHabitDate(dateKey: string, today: Date = startOfDay(new Date())): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (isAfter(startOfDay(date), today)) return null;
  return date;
}

export function buildDays(dates: Date[], habits: HabitRow[], done: Set<string>, today: Date): HabitDay[] {
  return dates.map((date) => {
    const key = dateKey(date);
    const isFuture = isAfter(date, today);
    const checks: HabitCheck[] = habits.map((h) => ({
      habitId: h.id,
      name: h.name,
      emoji: h.emoji,
      done: done.has(`${h.id}|${key}`),
    }));
    const doneCount = checks.filter((c) => c.done).length;
    return {
      dateKey: key,
      weekdayLabel: format(date, "EEE"),
      dateLabel: format(date, "d MMM"),
      isToday: isSameDay(date, today),
      isFuture,
      checks,
      doneCount,
      totalCount: habits.length,
      pct: dayPct(doneCount, habits.length, isFuture) ?? 0,
    };
  });
}

export async function getHabitTrackerData(userId: string, weekOffset = 0): Promise<HabitTrackerData> {
  const today = startOfDay(new Date());
  const dates = weekDates(today, weekOffset);

  // The cards cover the chosen week; the analysis underneath always covers the
  // last four weeks up to today, whichever week you happen to be looking at.
  const trendStart = addDays(today, -(TREND_DAYS - 1));
  const from = dates[0] < trendStart ? dates[0] : trendStart;
  const to = dates[dates.length - 1] > today ? dates[dates.length - 1] : today;

  const habits = await prisma.schoolHabit.findMany({ where: { userId }, orderBy: { order: "asc" } });
  const logs = habits.length
    ? await prisma.schoolHabitLog.findMany({
        where: { habitId: { in: habits.map((h) => h.id) }, date: { gte: from, lte: to } },
      })
    : [];

  const done = new Set(logs.map((l) => `${l.habitId}|${dateKey(l.date)}`));
  const rows: HabitRow[] = habits.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji }));

  const days = buildDays(dates, rows, done, today);
  const counted = days.filter((d) => !d.isFuture && d.totalCount > 0);
  const weekDonePct =
    counted.length > 0 ? Math.round(counted.reduce((sum, d) => sum + d.pct, 0) / counted.length) : 0;

  const trendDates = Array.from({ length: TREND_DAYS }, (_, i) => addDays(trendStart, i));
  const trend: TrendPoint[] = trendDates.map((date) => {
    const key = dateKey(date);
    const doneCount = rows.filter((h) => done.has(`${h.id}|${key}`)).length;
    return { dateKey: key, label: format(date, "MMM d"), pct: dayPct(doneCount, rows.length, false) ?? 0 };
  });

  const habitStats: HabitStat[] = rows.map((h) => {
    const doneCount = trendDates.filter((d) => done.has(`${h.id}|${dateKey(d)}`)).length;
    return {
      habitId: h.id,
      name: h.name,
      emoji: h.emoji,
      doneCount,
      trackedDays: TREND_DAYS,
      pct: Math.round((doneCount / TREND_DAYS) * 100),
      streak: currentStreak(h.id, done, today),
    };
  });

  return {
    habits: rows,
    days,
    weekLabel: weekLabel(dates, weekOffset),
    weekOffset,
    isCurrentWeek: weekOffset === 0,
    weekDonePct,
    trend,
    habitStats,
  };
}
