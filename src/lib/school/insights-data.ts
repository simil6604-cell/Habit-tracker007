import { prisma } from "@/lib/db/prisma";
import { buildInsights, FORECAST_DAYS, type SchoolInsights } from "./insights";

/**
 * Loads exactly what the Insights panel needs, and nothing more.
 *
 * Study sessions are limited to the window the panel can actually talk about:
 * the streak walks back day by day and the totals cover it, so pulling a year
 * of rows to add up two numbers would be work nobody sees. Flashcards come
 * whole because every one of them lands in a memory bucket.
 */
export async function getSchoolInsights(userId: string, now: Date = new Date()): Promise<SchoolInsights> {
  const STREAK_WINDOW_DAYS = 120;
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - STREAK_WINDOW_DAYS);

  const [cards, sessions, subjects] = await Promise.all([
    prisma.flashcard.findMany({
      where: { userId },
      select: { dueDate: true, interval: true, repetitions: true, lastResult: true, subjectId: true },
    }),
    prisma.studySession.findMany({
      where: { userId, start: { gte: since } },
      select: { start: true, end: true, completed: true },
    }),
    prisma.subject.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  return buildInsights({
    cards,
    sessions,
    deckNames: new Map(subjects.map((s) => [s.id, s.name])),
    now,
  });
}

export { FORECAST_DAYS };
