import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { overallScore, type DomainPart } from "./score-math";

export type DomainScores = {
  school: number;
  gym: number;
  football: number;
  recovery: number;
  /** Null when no domain is set up yet — see score-math. */
  overall: number | null;
  /** Which of them, for callers that average or compare domains. */
  inUse: { school: boolean; gym: boolean; football: boolean };
};

/** Falls back to the latest baseline self-assessment when there's not enough real activity yet. */
async function getBaselineScore(userId: string, category: "SCHOOL" | "GYM" | "FOOTBALL"): Promise<number | null> {
  const latest = await prisma.assessment.findFirst({ where: { userId, category }, orderBy: { createdAt: "desc" } });
  return latest?.overallScore ?? null;
}

/**
 * School score blends: average subject progress, homework completion rate
 * (last 14 days), and exam-readiness (topics tagged HIGH exam relevance with
 * low progress pull the score down as an exam approaches).
 */
async function computeSchoolScore(userId: string): Promise<DomainPart> {
  const subjects = await prisma.subject.findMany({
    where: { userId },
    include: { topics: true },
  });
  if (subjects.length === 0) {
    // No subjects: school counts only if they at least sat the baseline.
    const baseline = await getBaselineScore(userId, "SCHOOL");
    return { score: baseline ?? 0, inUse: baseline !== null };
  }

  const topics = subjects.flatMap((s) => s.topics);
  let avgProgress: number;
  if (topics.length) {
    avgProgress = topics.reduce((sum, t) => sum + t.progressPct, 0) / topics.length;
  } else {
    const confidences = subjects.map((s) => s.baselineConfidence).filter((v): v is number => v !== null);
    avgProgress = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : (await getBaselineScore(userId, "SCHOOL")) ?? 50;
  }

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

  return { score: Math.round(avgProgress * 0.4 + homeworkRate * 0.3 + examReadiness * 0.3), inUse: true };
}

async function computeGymScore(userId: string): Promise<DomainPart> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const [plannedWorkouts, sessions] = await Promise.all([
    prisma.workout.count({ where: { userId } }),
    prisma.workoutSession.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
    }),
  ]);

  if (plannedWorkouts === 0 && sessions.length === 0) {
    const baseline = await getBaselineScore(userId, "GYM");
    return { score: baseline ?? 0, inUse: baseline !== null };
  }

  const targetPerWeek = Math.max(plannedWorkouts, 3);
  const completed = sessions.filter((s) => s.completed).length;
  const consistency = Math.min(100, (completed / targetPerWeek) * 100);

  // In use, whatever it scored: a planned week with nothing done yet is 0,
  // and that 0 is the whole point of the number.
  return { score: Math.round(consistency), inUse: true };
}

async function computeFootballScore(userId: string): Promise<DomainPart> {
  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    include: { trainings: true },
  });
  if (!profile) {
    const baseline = await getBaselineScore(userId, "FOOTBALL");
    return { score: baseline ?? 0, inUse: baseline !== null };
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const trainingsThisWeek = profile.trainings.filter((t) => {
    if (!t.date) return false;
    return isWithinInterval(t.date, { start: weekStart, end: weekEnd });
  });

  if (trainingsThisWeek.length === 0) {
    if (profile.trainings.length) return { score: 40, inUse: true };
    const baseline = await getBaselineScore(userId, "FOOTBALL");
    // A profile with no training at all still counts: it was set up.
    return { score: baseline ?? 0, inUse: true };
  }

  const completed = trainingsThisWeek.filter((t) => t.completed).length;
  return { score: Math.round((completed / trainingsThisWeek.length) * 100), inUse: true };
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

  const domains = [school, gym, football];
  return {
    school: school.score,
    gym: gym.score,
    football: football.score,
    recovery,
    overall: overallScore(domains, recovery),
    inUse: { school: school.inUse, gym: gym.inUse, football: football.inUse },
  };
}

export async function getTodayWindow() {
  const now = new Date();
  return { start: startOfDay(now), end: endOfDay(now) };
}
