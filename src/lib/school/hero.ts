import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { daysUntilLabel } from "@/lib/planner/days-until";
import { dateKey } from "./habit-tracker";
import type { DailyChecklistResult } from "@/lib/planner/day-review";

/**
 * What the top of the School page leads with.
 *
 * It used to be a coloured banner with the app's own name on it and four
 * buttons — the same thing every day, whatever was actually going on. This is
 * the opposite: one number for what's left today, the single next thing to do,
 * and the week behind it. Every value here comes from the student's own rows;
 * nothing is filled in to make the screen look busier than their week is.
 */

export type WeekMark = { dateKey: string; weekday: string; pct: number | null; isToday: boolean };

export type StartHere = { title: string; detail: string | null; href: string };

export type SchoolHeroData = {
  doneToday: number;
  totalToday: number;
  startHere: StartHere | null;
  flashcardsDue: number;
  subjectCount: number;
  topicCount: number;
  week: WeekMark[];
  streak: number;
};

/** The meter's fill. Nothing due is a full ring, not an empty one — there is nothing left to do. */
export function donePct(done: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export type HeroCopy = {
  eyebrow: string;
  headline: string;
  accentLine: string;
  subtitle: string;
  cta: { label: string; href: string };
};

/**
 * The words above the ring, chosen by what the data actually says.
 *
 * Four states, because "Timetable, subjects, homework and exams — all in one
 * place" was true on day one and every day after, which is another way of
 * saying it told you nothing.
 */
export function heroCopy(data: SchoolHeroData): HeroCopy {
  const left = Math.max(0, data.totalToday - data.doneToday);

  if (data.subjectCount === 0) {
    return {
      eyebrow: "Getting started",
      headline: "Nothing in here yet.",
      accentLine: "Add your first subject.",
      subtitle: "Once a subject is in, its topics, homework and exams all hang off it — and this page starts filling itself in.",
      cta: { label: "Ask your School AI", href: "/school/ai" },
    };
  }

  if (data.totalToday === 0) {
    return {
      eyebrow: "Today",
      headline: "Nothing is due today.",
      accentLine: "Good day to get ahead.",
      subtitle: "No homework, tasks or exams on today's list. Revising something now is time you won't have to find later.",
      cta:
        data.flashcardsDue > 0
          ? { label: `Review ${data.flashcardsDue} flashcard${data.flashcardsDue === 1 ? "" : "s"}`, href: "/school/flashcards" }
          : { label: "Ask your School AI", href: "/school/ai" },
    };
  }

  if (left === 0) {
    return {
      eyebrow: "Today",
      headline: "Today's list is done.",
      accentLine: "All of it.",
      subtitle: `${data.totalToday} thing${data.totalToday === 1 ? "" : "s"} due today, ${data.totalToday === 1 ? "and it is" : "and they are all"} ticked off.`,
      cta:
        data.flashcardsDue > 0
          ? { label: `Review ${data.flashcardsDue} flashcard${data.flashcardsDue === 1 ? "" : "s"}`, href: "/school/flashcards" }
          : { label: "Ask your School AI", href: "/school/ai" },
    };
  }

  return {
    eyebrow: "Today",
    headline: `${left} thing${left === 1 ? "" : "s"} left today.`,
    accentLine: data.startHere ? "Start with this one." : "Pick one and start.",
    subtitle: "The list below suggests a real time for anything not done yet — a free period today, or after training.",
    cta:
      data.flashcardsDue > 0
        ? { label: `Review ${data.flashcardsDue} flashcard${data.flashcardsDue === 1 ? "" : "s"}`, href: "/school/flashcards" }
        : { label: "Ask your School AI", href: "/school/ai" },
  };
}

const WEEK_DAYS = 7;

/** The last seven days, oldest first, so the strip reads left to right into today. */
export function weekMarks(
  completionByDate: Map<string, number>,
  today: Date = new Date()
): WeekMark[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const date = subDays(startOfDay(today), WEEK_DAYS - 1 - i);
    const key = dateKey(date);
    return {
      dateKey: key,
      weekday: format(date, "EEEEE"),
      pct: completionByDate.get(key) ?? null,
      isToday: i === WEEK_DAYS - 1,
    };
  });
}

/**
 * Each day's habit completion, for the days that had habits to complete.
 *
 * A day before the first habit existed has no percentage — not a zero one.
 * Adding a habit today would otherwise paint the six days behind it as a week
 * of failure, about a habit that didn't exist yet. Once habits exist, a day
 * with no ticks really is a zero and is shown as one.
 */
export function weekCompletion(
  doneByDate: Map<string, number>,
  habitCount: number,
  trackedFrom: Date | null,
  today: Date = new Date()
): Map<string, number> {
  const completion = new Map<string, number>();
  if (habitCount <= 0 || !trackedFrom) return completion;

  const from = startOfDay(trackedFrom);
  for (const mark of weekMarks(new Map(), today)) {
    if (new Date(`${mark.dateKey}T00:00:00`) < from) continue;
    const done = doneByDate.get(mark.dateKey) ?? 0;
    completion.set(mark.dateKey, Math.round((done / habitCount) * 100));
  }
  return completion;
}

export async function getSchoolHeroData(
  userId: string,
  checklist: DailyChecklistResult,
  now: Date = new Date()
): Promise<SchoolHeroData> {
  const weekStart = subDays(startOfDay(now), WEEK_DAYS - 1);

  const [flashcardsDue, subjectCount, topicCount, habits, nextExam] = await Promise.all([
    prisma.flashcard.count({ where: { userId, dueDate: { lte: endOfDay(now) } } }),
    prisma.subject.count({ where: { userId } }),
    prisma.topic.count({ where: { subject: { userId } } }),
    prisma.schoolHabit.findMany({ where: { userId }, select: { id: true, createdAt: true } }),
    prisma.exam.findFirst({
      where: { userId, date: { gte: startOfDay(now) } },
      include: { subject: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const doneByDate = new Map<string, number>();
  if (habits.length > 0) {
    const logs = await prisma.schoolHabitLog.findMany({
      where: { habitId: { in: habits.map((h) => h.id) }, date: { gte: weekStart, lte: endOfDay(now) } },
    });
    for (const log of logs) {
      const key = dateKey(log.date);
      doneByDate.set(key, (doneByDate.get(key) ?? 0) + 1);
    }
  }

  const trackedFrom = habits.length
    ? habits.reduce((earliest, h) => (h.createdAt < earliest ? h.createdAt : earliest), habits[0].createdAt)
    : null;
  const completionByDate = weekCompletion(doneByDate, habits.length, trackedFrom, now);

  const firstUndone = checklist.items.find((item) => !item.done);
  const startHere: StartHere | null = firstUndone
    ? {
        title: firstUndone.title,
        detail: firstUndone.subjectName ?? firstUndone.suggestion ?? null,
        href: firstUndone.kind === "TASK" ? "/tasks" : "/school",
      }
    : nextExam
      ? {
          title: nextExam.title,
          detail: `${nextExam.subject ? `${nextExam.subject.name} · ` : ""}${daysUntilLabel(nextExam.date, now)}`,
          href: "/school/planner",
        }
      : null;

  return {
    doneToday: checklist.completedCount,
    totalToday: checklist.totalCount,
    startHere,
    flashcardsDue,
    subjectCount,
    topicCount,
    week: weekMarks(completionByDate, now),
    streak: currentHabitStreak(completionByDate, now),
  };
}

/** Days in a row, counting back, on which every habit was ticked. */
export function currentHabitStreak(completionByDate: Map<string, number>, today: Date = new Date()): number {
  if (completionByDate.size === 0) return 0;
  let streak = 0;
  // Today still being open shouldn't break a run — it's the evening, not a miss.
  let cursor = completionByDate.get(dateKey(startOfDay(today))) === 100 ? startOfDay(today) : subDays(startOfDay(today), 1);
  while (completionByDate.get(dateKey(cursor)) === 100) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }
  return streak;
}
