import { prisma } from "@/lib/db/prisma";
import { addDays, isWithinInterval, startOfDay, setHours, setMinutes } from "date-fns";

export type CalendarItem = {
  id: string;
  date: Date;
  time?: string;
  title: string;
  category: "SCHOOL" | "STUDY" | "GYM" | "FOOTBALL" | "EXAM" | "TASK" | "RECOVERY";
};

function withTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return setMinutes(setHours(startOfDay(day), h), m);
}

export async function getCalendarItems(userId: string, rangeStart: Date, rangeEnd: Date): Promise<CalendarItem[]> {
  const items: CalendarItem[] = [];

  const [slots, homework, exams, studySessions, workoutSessions, trainings, matches, tasks, events] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { userId, isFree: false }, include: { subject: true } }),
    prisma.homework.findMany({ where: { userId, dueDate: { gte: rangeStart, lte: rangeEnd } }, include: { subject: true } }),
    prisma.exam.findMany({ where: { userId, date: { gte: rangeStart, lte: rangeEnd } }, include: { subject: true } }),
    prisma.studySession.findMany({ where: { userId, start: { gte: rangeStart, lte: rangeEnd } }, include: { subject: true } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: rangeStart, lte: rangeEnd } }, include: { workout: true } }),
    prisma.footballTraining.findMany({ where: { profile: { userId }, date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.footballMatch.findMany({ where: { profile: { userId }, date: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.task.findMany({ where: { userId, dueDate: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.calendarEvent.findMany({ where: { userId, start: { gte: rangeStart, lte: rangeEnd } } }),
  ]);

  // Project recurring timetable slots onto every matching weekday in range.
  let cursor = startOfDay(rangeStart);
  while (cursor <= rangeEnd) {
    const dow = (cursor.getDay() + 6) % 7;
    for (const s of slots.filter((s) => s.dayOfWeek === dow)) {
      items.push({
        id: `slot-${s.id}-${cursor.toISOString()}`,
        date: withTime(cursor, s.startTime),
        time: s.startTime,
        title: s.subject?.name ?? s.label ?? "Lesson",
        category: "SCHOOL",
      });
    }
    cursor = addDays(cursor, 1);
  }

  for (const h of homework) items.push({ id: `hw-${h.id}`, date: h.dueDate, title: `📓 ${h.title}`, category: "SCHOOL" });
  for (const e of exams) items.push({ id: `exam-${e.id}`, date: e.date, time: e.date.toTimeString().slice(0, 5), title: `📝 ${e.title}`, category: "EXAM" });
  for (const s of studySessions) items.push({ id: `study-${s.id}`, date: s.start, time: s.start.toTimeString().slice(0, 5), title: s.topicLabel ?? s.subject?.name ?? "Study", category: "STUDY" });
  for (const w of workoutSessions) items.push({ id: `gym-${w.id}`, date: w.date, time: w.date.toTimeString().slice(0, 5), title: w.workout?.name ?? "Workout", category: "GYM" });
  for (const t of trainings) if (t.date) items.push({ id: `train-${t.id}`, date: t.date, time: t.date.toTimeString().slice(0, 5), title: t.title, category: "FOOTBALL" });
  for (const m of matches) items.push({ id: `match-${m.id}`, date: m.date, time: m.date.toTimeString().slice(0, 5), title: `Match vs ${m.opponent}`, category: "FOOTBALL" });
  for (const t of tasks) if (t.dueDate) items.push({ id: `task-${t.id}`, date: t.dueDate, title: `✅ ${t.title}`, category: "TASK" });
  for (const ev of events) {
    if (!["STUDY", "RECOVERY"].includes(ev.category)) continue;
    items.push({ id: `ev-${ev.id}`, date: ev.start, time: ev.start.toTimeString().slice(0, 5), title: ev.title, category: ev.category as CalendarItem["category"] });
  }

  return items
    .filter((i) => isWithinInterval(i.date, { start: rangeStart, end: rangeEnd }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
