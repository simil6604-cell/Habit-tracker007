import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay } from "date-fns";

export type AgendaItem = {
  id: string;
  title: string;
  time?: string;
  category: "SCHOOL" | "STUDY" | "GYM" | "FOOTBALL" | "EXAM" | "TASK" | "RECOVERY";
  meta?: string;
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export async function getAgendaForDay(userId: string, day: Date): Promise<AgendaItem[]> {
  const start = startOfDay(day);
  const end = endOfDay(day);

  const [homework, exams, sessions, trainings, matches, tasks, events] = await Promise.all([
    prisma.homework.findMany({ where: { userId, dueDate: { gte: start, lte: end } }, include: { subject: true } }),
    prisma.exam.findMany({ where: { userId, date: { gte: start, lte: end } }, include: { subject: true } }),
    prisma.workoutSession.findMany({ where: { userId, date: { gte: start, lte: end } }, include: { workout: true } }),
    prisma.footballTraining.findMany({
      where: { profile: { userId }, date: { gte: start, lte: end } },
    }),
    prisma.footballMatch.findMany({ where: { profile: { userId }, date: { gte: start, lte: end } } }),
    prisma.task.findMany({ where: { userId, dueDate: { gte: start, lte: end }, status: { not: "DONE" } } }),
    prisma.calendarEvent.findMany({ where: { userId, start: { gte: start, lte: end } } }),
  ]);

  const items: AgendaItem[] = [];

  for (const h of homework) {
    items.push({ id: `hw-${h.id}`, title: h.title, category: "SCHOOL", meta: h.subject?.name });
  }
  for (const e of exams) {
    items.push({ id: `exam-${e.id}`, title: e.title, time: fmtTime(e.date), category: "EXAM", meta: e.subject?.name });
  }
  for (const s of sessions) {
    items.push({ id: `gym-${s.id}`, title: s.workout?.name ?? "Workout", time: fmtTime(s.date), category: "GYM" });
  }
  for (const t of trainings) {
    items.push({ id: `foot-${t.id}`, title: t.title, time: t.date ? fmtTime(t.date) : undefined, category: "FOOTBALL" });
  }
  for (const m of matches) {
    items.push({ id: `match-${m.id}`, title: `Match vs ${m.opponent}`, time: fmtTime(m.date), category: "FOOTBALL" });
  }
  for (const t of tasks) {
    items.push({ id: `task-${t.id}`, title: t.title, category: "TASK" });
  }
  for (const ev of events) {
    if (["STUDY", "RECOVERY"].includes(ev.category)) {
      items.push({ id: `ev-${ev.id}`, title: ev.title, time: fmtTime(ev.start), category: ev.category as AgendaItem["category"] });
    }
  }

  return items.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}
