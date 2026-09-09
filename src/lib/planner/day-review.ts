import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay, format } from "date-fns";

export type ChecklistItem = {
  id: string;
  rawId: string;
  kind: "HOMEWORK" | "TASK" | "EXAM";
  title: string;
  subjectName?: string;
  done: boolean;
  suggestion?: string;
};

export type PeriodToday = {
  periodName: string | null;
  startTime: string;
  endTime: string;
  periodType: string;
  subjectName: string | null;
};

export type DailyChecklistResult = {
  dayLabel: string;
  periodsToday: PeriodToday[];
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Builds today's "did I do everything" checklist, and for anything not yet
 * done, suggests a concrete time using the real timetable (a free/Study
 * period later today) or, failing that, after today's gym/football
 * training — rather than a generic "do it sometime today".
 */
export async function getTodaySchoolChecklist(userId: string): Promise<DailyChecklistResult> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const dayOfWeek = (now.getDay() + 6) % 7;
  const currentTime = nowHHMM();

  const [slotsToday, homeworkDueToday, tasksDueToday, examsToday, gymToday, footballToday] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { userId, dayOfWeek },
      include: { subject: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.homework.findMany({ where: { userId, dueDate: { gte: dayStart, lte: dayEnd } }, include: { subject: true } }),
    prisma.task.findMany({ where: { userId, dueDate: { gte: dayStart, lte: dayEnd } } }),
    prisma.exam.findMany({ where: { userId, date: { gte: dayStart, lte: dayEnd } }, include: { subject: true } }),
    prisma.workoutSession.findFirst({ where: { userId, date: { gte: dayStart, lte: dayEnd } } }),
    prisma.footballTraining.findFirst({ where: { profile: { userId }, date: { gte: dayStart, lte: dayEnd } } }),
  ]);

  // The next free/study period today, after the current time.
  const upcomingFreeSlot = slotsToday
    .filter((s) => ["STUDY", "FREE"].includes(s.periodType) && s.startTime > currentTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  function suggestionFor(): string | undefined {
    if (upcomingFreeSlot) {
      return `Do it during ${upcomingFreeSlot.periodName || "your"} ${upcomingFreeSlot.periodType === "STUDY" ? "Study period" : "free period"} (${upcomingFreeSlot.startTime}–${upcomingFreeSlot.endTime}).`;
    }
    if (footballToday?.date && footballToday.date > now) {
      return `Do it after football training tonight (starts ${format(footballToday.date, "HH:mm")}).`;
    }
    if (gymToday?.date && gymToday.date > now) {
      return `Do it after your gym session tonight (starts ${format(gymToday.date, "HH:mm")}).`;
    }
    return "No free period left today — fit it in this evening before bed.";
  }

  const items: ChecklistItem[] = [];

  for (const h of homeworkDueToday) {
    items.push({
      id: `hw-${h.id}`,
      rawId: h.id,
      kind: "HOMEWORK",
      title: h.title,
      subjectName: h.subject?.name,
      done: h.status === "DONE",
      suggestion: h.status === "DONE" ? undefined : suggestionFor(),
    });
  }
  for (const t of tasksDueToday) {
    items.push({
      id: `task-${t.id}`,
      rawId: t.id,
      kind: "TASK",
      title: t.title,
      done: t.status === "DONE",
      suggestion: t.status === "DONE" ? undefined : suggestionFor(),
    });
  }
  for (const e of examsToday) {
    items.push({ id: `exam-${e.id}`, rawId: e.id, kind: "EXAM", title: e.title, subjectName: e.subject?.name, done: e.date < now });
  }

  return {
    dayLabel: format(now, "EEEE"),
    periodsToday: slotsToday.map((s) => ({
      periodName: s.periodName,
      startTime: s.startTime,
      endTime: s.endTime,
      periodType: s.periodType,
      subjectName: s.subject?.name ?? s.label,
    })),
    items,
    completedCount: items.filter((i) => i.done).length,
    totalCount: items.length,
  };
}
