import { prisma } from "@/lib/db/prisma";
import { subWeeks, startOfWeek, endOfWeek, format } from "date-fns";
import { computeDomainScores } from "@/lib/planner/scores";
import { shortSubjectNames } from "./subject-labels";

export type WeeklyTimeSplitEntry = { name: string; minutes: number };

/**
 * Real minutes spent this week (or `weekOffset` weeks ago) in each domain —
 * completed study sessions for School, workout duration for Gym, completed
 * training duration for Football. Never a target, never estimated.
 */
export async function getWeeklyTimeSplit(userId: string, weekOffset = 0) {
  const anchor = subWeeks(new Date(), weekOffset);
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  const [studySessions, gymSessions, footballTrainings] = await Promise.all([
    prisma.studySession.findMany({ where: { userId, completed: true, start: { gte: weekStart, lte: weekEnd } } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: weekStart, lte: weekEnd } } }),
    prisma.footballTraining.findMany({
      where: { profile: { userId }, completed: true, date: { gte: weekStart, lte: weekEnd } },
    }),
  ]);

  const schoolMinutes = studySessions.reduce(
    (sum, s) => sum + Math.max(0, (s.end.getTime() - s.start.getTime()) / 60000),
    0
  );
  const gymMinutes = gymSessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
  const footballMinutes = footballTrainings.reduce((sum, t) => sum + (t.durationMin ?? 0), 0);

  const data: WeeklyTimeSplitEntry[] = [
    { name: "School", minutes: Math.round(schoolMinutes) },
    { name: "Gym", minutes: Math.round(gymMinutes) },
    { name: "Football", minutes: Math.round(footballMinutes) },
  ].filter((d) => d.minutes > 0);

  const weekLabel = weekOffset === 0 ? "This week" : `Week of ${format(weekStart, "MMM d")}`;

  return { weekOffset, weekLabel, data };
}

export async function getAnalyticsData(userId: string) {
  const [scores, subjects, homework, gymSessions, footballTrainings, footballMatches, goals, weeklyTimeSplit] = await Promise.all([
    computeDomainScores(userId),
    prisma.subject.findMany({ where: { userId }, include: { topics: true } }),
    prisma.homework.findMany({ where: { userId } }),
    prisma.workoutSession.findMany({ where: { userId } }),
    prisma.footballTraining.findMany({ where: { profile: { userId } } }),
    prisma.footballMatch.findMany({ where: { profile: { userId } } }),
    prisma.goal.findMany({ where: { userId } }),
    getWeeklyTimeSplit(userId, 0),
  ]);

  // Axis labels are the subject, not the paper: "German — First Language"
  // wraps to three lines and says nothing you did not already know. Shortened
  // as a list rather than one at a time, so a cut that would merge two
  // subjects is refused for exactly the rows that would collide.
  const shortNames = shortSubjectNames(subjects.map((s) => s.name));
  const subjectProgress = subjects.map((s, i) => ({
    name: shortNames[i],
    fullName: s.name,
    progress: s.topics.length ? Math.round(s.topics.reduce((a, t) => a + t.progressPct, 0) / s.topics.length) : 0,
    topicCount: s.topics.length,
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

  /**
   * Where the time has actually gone, over everything ever logged.
   *
   * The week-by-week donut answers "this week"; on a quiet week it is
   * correctly empty, which is honest and also the reason the page looked like
   * it had no chart at all. This one answers "overall" and stays useful.
   *
   * Study time comes from completed sessions, the same rule the weekly split
   * uses — planned-but-unticked blocks are not time you spent.
   */
  const [allStudy, allGym, allFootball] = await Promise.all([
    prisma.studySession.findMany({ where: { userId, completed: true }, select: { start: true, end: true } }),
    prisma.workoutSession.findMany({ where: { userId, completed: true }, select: { durationMin: true } }),
    prisma.footballTraining.findMany({ where: { profile: { userId }, completed: true }, select: { durationMin: true } }),
  ]);

  const effortSplit = [
    {
      name: "School",
      minutes: Math.round(
        allStudy.reduce((sum, s) => sum + Math.max(0, (s.end.getTime() - s.start.getTime()) / 60000), 0)
      ),
    },
    { name: "Gym", minutes: allGym.reduce((sum, s) => sum + (s.durationMin ?? 0), 0) },
    { name: "Football", minutes: allFootball.reduce((sum, t) => sum + (t.durationMin ?? 0), 0) },
  ].filter((entry) => entry.minutes > 0);

  const domainValues = [scores.school, scores.gym, scores.football].filter((v) => v > 0);
  const mean = domainValues.length ? domainValues.reduce((a, b) => a + b, 0) / domainValues.length : 0;
  const variance = domainValues.length ? domainValues.reduce((a, b) => a + (b - mean) ** 2, 0) / domainValues.length : 0;
  const balance = domainValues.length ? Math.round(Math.max(0, 100 - Math.sqrt(variance))) : 0;

  const consistency = Math.round(
    (consistencyData.slice(-4).reduce((a, d) => a + d.sessions, 0) / Math.max(1, 4 * 3)) * 100
  );

  return {
    scores,
    weeklyTimeSplit,
    balance,
    consistency: Math.min(100, consistency),
    subjectProgress,
    effortSplit,
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
