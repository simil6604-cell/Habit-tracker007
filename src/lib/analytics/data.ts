import { prisma } from "@/lib/db/prisma";
import { subWeeks, startOfWeek, format } from "date-fns";
import { computeDomainScores } from "@/lib/planner/scores";

export async function getAnalyticsData(userId: string) {
  const [scores, subjects, homework, gymSessions, footballTrainings, footballMatches, goals] = await Promise.all([
    computeDomainScores(userId),
    prisma.subject.findMany({ where: { userId }, include: { topics: true } }),
    prisma.homework.findMany({ where: { userId } }),
    prisma.workoutSession.findMany({ where: { userId } }),
    prisma.footballTraining.findMany({ where: { profile: { userId } } }),
    prisma.footballMatch.findMany({ where: { profile: { userId } } }),
    prisma.goal.findMany({ where: { userId } }),
  ]);

  const subjectProgress = subjects.map((s) => ({
    name: s.name,
    progress: s.topics.length ? Math.round(s.topics.reduce((a, t) => a + t.progressPct, 0) / s.topics.length) : 0,
  }));

  const totalStudyMinutes = subjects.reduce((sum, s) => sum + s.topics.reduce((a, t) => a + t.actualMinutes, 0), 0);
  const homeworkDone = homework.filter((h) => h.status === "DONE").length;
  const homeworkRate = homework.length ? Math.round((homeworkDone / homework.length) * 100) : 100;

  const weeks = Array.from({ length: 8 }, (_, i) => startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 }));
  const consistencyData = weeks.map((weekStart) => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = gymSessions.filter((s) => s.completed && s.date >= weekStart && s.date < weekEnd).length;
    return { week: format(weekStart, "MMM d"), sessions: count };
  });

  const trainingsCompleted = footballTrainings.filter((t) => t.completed).length;
  const matchesPlayed = footballMatches.filter((m) => m.scoreFor !== null).length;
  const matchesWon = footballMatches.filter((m) => (m.scoreFor ?? 0) > (m.scoreAgainst ?? 0)).length;

  const footballConsistencyData = weeks.map((weekStart) => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = footballTrainings.filter((t) => t.completed && t.date && t.date >= weekStart && t.date < weekEnd).length;
    return { week: format(weekStart, "MMM d"), sessions: count };
  });

  const focusCounts = new Map<string, number>();
  for (const t of footballTrainings) {
    focusCounts.set(t.focus, (focusCounts.get(t.focus) ?? 0) + 1);
  }
  const focusDistribution = Array.from(focusCounts.entries())
    .map(([focus, count]) => ({ focus, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const domainValues = [scores.school, scores.gym, scores.football].filter((v) => v > 0);
  const mean = domainValues.length ? domainValues.reduce((a, b) => a + b, 0) / domainValues.length : 0;
  const variance = domainValues.length ? domainValues.reduce((a, b) => a + (b - mean) ** 2, 0) / domainValues.length : 0;
  const balance = domainValues.length ? Math.round(Math.max(0, 100 - Math.sqrt(variance))) : 0;

  const consistency = Math.round(
    (consistencyData.slice(-4).reduce((a, d) => a + d.sessions, 0) / Math.max(1, 4 * 3)) * 100
  );

  return {
    scores,
    balance,
    consistency: Math.min(100, consistency),
    subjectProgress,
    totalStudyMinutes,
    homeworkRate,
    consistencyData,
    trainingsCompleted,
    trainingsTotal: footballTrainings.length,
    matchesPlayed,
    matchesWon,
    footballConsistencyData,
    focusDistribution,
    goals,
  };
}
