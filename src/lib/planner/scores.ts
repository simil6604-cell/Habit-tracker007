import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

export type DomainScores = {
  school: number;
  gym: number;
  football: number;
  recovery: number;
  overall: number;
};

/**
 * School score blends: average subject progress, homework completion rate
 * (last 14 days), and exam-readiness (topics tagged HIGH exam relevance with
 * low progress pull the score down as an exam approaches).
 */
async function computeSchoolScore(userId: string): Promise<number> {
  const subjects = await prisma.subject.findMany({
    where: { userId },
    include: { topics: true },
  });
  if (subjects.length === 0) return 0;

  const topics = subjects.flatMap((s) => s.topics);
  const avgProgress = topics.length
    ? topics.reduce((sum, t) => sum + t.progressPct, 0) / topics.length
    : 50;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const homework = await prisma.homework.findMany({
    where: { userId, createdAt: { gte: since } },
  });
  const homeworkRate = homework.length
    ? (homework.filter((h) => h.status === "DONE").length / homework.length) * 100
    : 100;

  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingExams = await prisma.exam.findMany({
    where: { userId, date: { gte: now, lte: soon } },
    include: { subject: { include: { topics: true } } },
  });
  let examReadiness = 100;
  if (upcomingExams.length) {
    const readiness = upcomingExams.map((exam) => {
      const t = exam.subject?.topics ?? [];
      if (!t.length) return 60;
      return t.reduce((sum, x) => sum + x.progressPct, 0) / t.length;
    });
    examReadiness = readiness.reduce((a, b) => a + b, 0) / readiness.length;
  }

  return Math.round(avgProgress * 0.4 + homeworkRate * 0.3 + examReadiness * 0.3);
}

async function computeGymScore(userId: string): Promise<number> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const [plannedWorkouts, sessions] = await Promise.all([
    prisma.workout.count({ where: { userId } }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
    }),
  ]);

  if (plannedWorkouts === 0 && sessions.length === 0) return 0;

  const targetPerWeek = Math.max(plannedWorkouts, 3);
  const completed = sessions.filter((s) => s.completed).length;
  const consistency = Math.min(100, (completed / targetPerWeek) * 100);

  return Math.round(consistency);
}

async function computeFootballScore(userId: string): Promise<number> {
  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    include: { trainings: true },
  });
  if (!profile) return 0;

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const trainingsThisWeek = profile.trainings.filter((t) => {
    if (!t.date) return false;
    return isWithinInterval(t.date, { start: weekStart, end: weekEnd });
  });

  if (trainingsThisWeek.length === 0) return profile.trainings.length ? 40 : 0;

  const completed = trainingsThisWeek.filter((t) => t.completed).length;
  return Math.round((completed / trainingsThisWeek.length) * 100);
}

async function computeRecoveryScore(userId: string): Promise<number> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const events = await prisma.calendarEvent.findMany({
    where: { userId, start: { gte: weekStart, lte: weekEnd } },
  });

  const busyDays = new Set(
    events
      .filter((e) => ["SCHOOL", "STUDY", "GYM", "FOOTBALL", "EXAM"].includes(e.category))
      .map((e) => e.start.toDateString())
  );
  const recoveryEvents = events.filter((e) => e.category === "RECOVERY").length;

  // Baseline recovery score decreases with very busy weeks, increases with
  // explicit recovery time blocked out.
  const base = Math.max(40, 100 - busyDays.size * 8);
  return Math.round(Math.min(100, base + recoveryEvents * 10));
}

export async function computeDomainScores(userId: string): Promise<DomainScores> {
  const [school, gym, football, recovery] = await Promise.all([
    computeSchoolScore(userId),
    computeGymScore(userId),
    computeFootballScore(userId),
    computeRecoveryScore(userId),
  ]);

  const active = [school, gym, football].filter((v) => v > 0);
  const overall = active.length
    ? Math.round((active.reduce((a, b) => a + b, 0) / active.length) * 0.85 + recovery * 0.15)
    : Math.round(recovery * 0.15);

  return { school, gym, football, recovery, overall };
}

export async function getTodayWindow() {
  const now = new Date();
  return { start: startOfDay(now), end: endOfDay(now) };
}
