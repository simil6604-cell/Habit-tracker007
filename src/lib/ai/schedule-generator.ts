import { prisma } from "@/lib/db/prisma";
import { addDays, addMinutes, differenceInCalendarDays, format, setHours, setMinutes, startOfDay } from "date-fns";

export type PlannedBlock = {
  start: Date;
  end: Date;
  label: string;
  category: "STUDY" | "RECOVERY";
  subjectId?: string;
  reason: string;
};

export type DayPlanResult = {
  blocks: PlannedBlock[];
  totalCommittedMinutes: number; // school + gym + football + study, for overload check
  overloaded: boolean;
  reasons: string[];
};

const STUDY_BLOCK_MIN = 40;
const BREAK_MIN = 10;
const EVENING_START_HOUR = 16;
const EVENING_END_HOUR = 21.5;
const DAILY_OVERLOAD_MINUTES = 6.5 * 60; // school + gym + football + study combined

function at(date: Date, hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return setMinutes(setHours(startOfDay(date), h), m);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generates a realistic, explainable study plan for one day by looking at
 * real stored data: upcoming exams, weak topics, and that day's existing
 * commitments (school, gym, football). Pure rule-based logic — this is the
 * engine behind the "why" explanations the AI Coach shows.
 */
export async function generateDayPlan(userId: string, date: Date): Promise<DayPlanResult> {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const dayOfWeek = (date.getDay() + 6) % 7; // Monday=0

  const [timetableSlots, workoutSessions, footballTrainings, footballMatches, exams] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { userId, dayOfWeek, isFree: false } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: dayStart, lt: dayEnd } } }),
    prisma.footballTraining.findMany({ where: { profile: { userId }, date: { gte: dayStart, lt: dayEnd } } }),
    prisma.footballMatch.findMany({ where: { profile: { userId }, date: { gte: dayStart, lt: dayEnd } } }),
    prisma.exam.findMany({
      where: { userId, date: { gte: date, lte: addDays(date, 10) } },
      include: { subject: { include: { topics: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const schoolMinutes = timetableSlots.length * 55; // rough estimate per lesson slot
  const gymMinutes = workoutSessions.length * 60;
  const footballMinutes =
    footballTrainings.reduce((sum, t) => sum + t.durationMin, 0) + footballMatches.length * 90;

  const busyBlocks: { start: Date; end: Date }[] = [];
  for (const s of workoutSessions) busyBlocks.push({ start: s.date, end: addMinutes(s.date, 60) });
  for (const t of footballTrainings) {
    if (t.date) busyBlocks.push({ start: t.date, end: addMinutes(t.date, t.durationMin) });
  }
  for (const m of footballMatches) busyBlocks.push({ start: m.date, end: addMinutes(m.date, 90) });

  // Rank topics to study: weakest topics of the nearest, highest-relevance exams first.
  const candidates: { subjectId: string; subjectName: string; topicName: string; progress: number; examDate: Date; relevance: string }[] = [];
  for (const exam of exams) {
    const topics = exam.subject?.topics ?? [];
    for (const t of topics.filter((t) => t.progressPct < 85)) {
      candidates.push({
        subjectId: exam.subjectId!,
        subjectName: exam.subject!.name,
        topicName: t.name,
        progress: t.progressPct,
        examDate: exam.date,
        relevance: t.examRelevance,
      });
    }
  }
  candidates.sort((a, b) => {
    const daysA = differenceInCalendarDays(a.examDate, date);
    const daysB = differenceInCalendarDays(b.examDate, date);
    if (daysA !== daysB) return daysA - daysB;
    const relScore = (r: string) => (r === "HIGH" ? 0 : r === "MEDIUM" ? 1 : 2);
    if (relScore(a.relevance) !== relScore(b.relevance)) return relScore(a.relevance) - relScore(b.relevance);
    return a.progress - b.progress;
  });

  // Reduce study budget on days already busy with gym/football to protect recovery.
  const alreadyBusyMinutes = gymMinutes + footballMinutes;
  let studyBudgetMinutes = alreadyBusyMinutes > 90 ? 80 : 140;
  if (candidates.length === 0) studyBudgetMinutes = 0;

  const blocks: PlannedBlock[] = [];
  let cursor = at(date, EVENING_START_HOUR);
  const endOfWindow = at(date, EVENING_END_HOUR);
  let usedMinutes = 0;
  let ci = 0;

  while (usedMinutes < studyBudgetMinutes && cursor < endOfWindow && ci < candidates.length) {
    const blockEnd = addMinutes(cursor, STUDY_BLOCK_MIN);
    const clash = busyBlocks.some((b) => overlaps(cursor, blockEnd, b.start, b.end));
    if (clash) {
      cursor = addMinutes(cursor, 15);
      continue;
    }
    const c = candidates[ci];
    const daysUntil = differenceInCalendarDays(c.examDate, date);
    blocks.push({
      start: cursor,
      end: blockEnd,
      label: `${c.subjectName} – ${c.topicName}`,
      category: "STUDY",
      subjectId: c.subjectId,
      reason: `${c.subjectName} exam in ${daysUntil} day${daysUntil === 1 ? "" : "s"}; "${c.topicName}" is at ${c.progress}% and marked ${c.relevance.toLowerCase()} exam relevance.`,
    });
    usedMinutes += STUDY_BLOCK_MIN;
    cursor = addMinutes(blockEnd, BREAK_MIN);
    if (cursor < endOfWindow) {
      blocks.push({ start: addMinutes(blockEnd, 0), end: cursor, label: "Break", category: "RECOVERY", reason: "Short recovery break between study blocks." });
    }
    ci++;
  }

  const totalCommittedMinutes = schoolMinutes + gymMinutes + footballMinutes + usedMinutes;
  const overloaded = totalCommittedMinutes > DAILY_OVERLOAD_MINUTES;

  const reasons: string[] = [];
  if (schoolMinutes) reasons.push(`${format(date, "EEEE")} has ~${(schoolMinutes / 60).toFixed(1)}h of school.`);
  if (gymMinutes) reasons.push(`${gymMinutes / 60}h gym session planned.`);
  if (footballMinutes) reasons.push(`${(footballMinutes / 60).toFixed(1)}h football training/match.`);
  if (usedMinutes) reasons.push(`${usedMinutes / 60}h of focused study allocated to your weakest, most exam-relevant topics.`);
  if (overloaded) reasons.push("Total commitments exceed a healthy daily load — consider moving something to a lighter day.");

  return { blocks, totalCommittedMinutes, overloaded, reasons };
}
