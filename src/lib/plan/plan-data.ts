import { addDays, endOfMonth, isWithinInterval, startOfDay, startOfMonth } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { PlanCheckRow, PlanItem, PlanStatus, PlanUnscheduledItem } from "./plan";

/**
 * Everything this account has to do in one month, from all five places it is
 * written down.
 *
 * The weekly ones — a gym workout with a day of the week, a football session
 * the team has every Tuesday — are projected onto each matching day in the
 * month. They are plans, not events: the row says "Tuesdays", and the list
 * has to say which Tuesdays.
 */

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Midnight is how "no time was given" is stored, so it is not shown as 00:00. */
function clockOrNull(date: Date): string | null {
  return date.getHours() === 0 && date.getMinutes() === 0 ? null : clock(date);
}

type Drill = { name?: unknown; minutes?: unknown; cueText?: unknown };

/** The drills column is JSON written by this app; a bad parse is not a crash. */
function readDrills(raw: string): { name: string; minutes: number | null }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((drill: Drill) => ({
        name: typeof drill?.name === "string" ? drill.name : "",
        minutes: typeof drill?.minutes === "number" ? drill.minutes : null,
      }))
      .filter((drill) => drill.name !== "");
  } catch {
    return [];
  }
}

function workoutDetail(exercises: { name: string; targetSets: number; targetReps: number; targetWeight: number | null }[]) {
  return exercises.map((exercise) => ({
    label: exercise.name,
    value: `${exercise.targetSets} × ${exercise.targetReps}${
      exercise.targetWeight ? ` @ ${exercise.targetWeight} kg` : ""
    }`,
  }));
}

function trainingDetail(training: { durationMin: number; drills: string }) {
  return [
    { label: "Length", value: `${training.durationMin} min` },
    ...readDrills(training.drills).map((drill) => ({
      label: drill.name,
      value: drill.minutes ? `${drill.minutes} min` : undefined,
    })),
  ];
}

export async function getPlanMonth(
  userId: string,
  month: Date
): Promise<{ items: PlanItem[]; checks: PlanCheckRow[]; unscheduled: PlanUnscheduledItem[] }> {
  const from = startOfMonth(month);
  const to = endOfMonth(month);

  const [homework, exams, workouts, trainings, matches, tasks, checks] = await Promise.all([
    prisma.homework.findMany({
      where: { userId, dueDate: { gte: from, lte: to } },
      include: { subject: { select: { name: true } } },
    }),
    prisma.exam.findMany({
      where: { userId, date: { gte: from, lte: to } },
      include: { subject: { select: { name: true } } },
    }),
    prisma.workout.findMany({
      where: { userId },
      include: { exercises: { orderBy: { order: "asc" } } },
    }),
    prisma.footballTraining.findMany({ where: { profile: { userId } } }),
    prisma.footballMatch.findMany({ where: { profile: { userId }, date: { gte: from, lte: to } } }),
    prisma.task.findMany({ where: { userId, dueDate: { gte: from, lte: to } } }),
    prisma.planCheck.findMany({ where: { userId, date: { gte: from, lte: to } } }),
  ]);

  const items: PlanItem[] = [];

  for (const hw of homework) {
    items.push({
      sourceKey: `homework:${hw.id}`,
      kind: "HOMEWORK",
      date: startOfDay(hw.dueDate),
      time: clockOrNull(hw.dueDate),
      title: hw.title,
      context: hw.subject?.name ?? null,
      detail: hw.description ? [{ label: hw.description }] : [],
      href: "/school#homework",
      nativeStatus: hw.status === "DONE" ? "DONE" : hw.status === "MISSED" ? "MISSED" : null,
    });
  }

  for (const exam of exams) {
    items.push({
      sourceKey: `exam:${exam.id}`,
      kind: "EXAM",
      date: startOfDay(exam.date),
      time: clockOrNull(exam.date),
      title: exam.title,
      context: exam.subject?.name ?? null,
      // An exam is not homework: what matters beside it is how much it counts
      // and what you told yourself to revise.
      detail: [
        { label: "Weight", value: exam.weight.toLowerCase() },
        ...(exam.notes ? [{ label: exam.notes }] : []),
      ],
      href: "/school#homework",
      // An exam is never "done": you sat it or you did not, and that is what
      // the tick means here.
      nativeStatus: null,
    });
  }

  // A workout is a plan for a weekday, so it lands on every one of those in
  // the month. Without a day it is not scheduled at all, and a list of
  // things to do is the wrong place for it.
  const weeklyWorkouts = workouts.filter((workout) => workout.dayOfWeek !== null);
  const weeklyTrainings = trainings.filter((training) => training.date === null && training.dayOfWeek !== null);

  /**
   * A standing plan did not exist before it was made.
   *
   * Projecting it backwards puts it on every matching weekday of every
   * month in the past, and the tracker scores each of those as a day you
   * did not do it — a wall of failure for weeks that happened before the
   * plan was written down.
   */
  const startedBy = (createdAt: Date, day: Date) => startOfDay(createdAt) <= startOfDay(day);

  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const dow = (day.getDay() + 6) % 7;
    for (const workout of weeklyWorkouts) {
      if (workout.dayOfWeek !== dow || !startedBy(workout.createdAt, day)) continue;
      items.push({
        sourceKey: `workout:${workout.id}`,
        kind: "WORKOUT",
        date: new Date(day),
        time: null,
        title: workout.name,
        context: null,
        detail: workoutDetail(workout.exercises),
        href: "/gym",
        nativeStatus: null,
      });
    }
    for (const training of weeklyTrainings) {
      if (training.dayOfWeek !== dow || !startedBy(training.createdAt, day)) continue;
      items.push({
        sourceKey: `training:${training.id}`,
        kind: "TRAINING",
        date: new Date(day),
        time: null,
        title: training.title,
        context: training.focus,
        detail: trainingDetail(training),
        href: "/football",
        // A weekly session repeats, so the flag on the row would mark every
        // week at once. Only the one-off sessions below can use it.
        nativeStatus: null,
      });
    }
  }

  for (const training of trainings) {
    if (!training.date || !isWithinInterval(training.date, { start: from, end: to })) continue;
    items.push({
      sourceKey: `training:${training.id}`,
      kind: "TRAINING",
      date: startOfDay(training.date),
      time: clockOrNull(training.date),
      title: training.title,
      context: training.focus,
      detail: trainingDetail(training),
      href: "/football",
      nativeStatus: training.completed ? "DONE" : null,
    });
  }

  for (const match of matches) {
    items.push({
      sourceKey: `match:${match.id}`,
      kind: "MATCH",
      date: startOfDay(match.date),
      time: clockOrNull(match.date),
      title: `vs ${match.opponent}`,
      context: match.isHome ? "Home" : "Away",
      detail: [
        ...(match.location ? [{ label: "Where", value: match.location }] : []),
        ...(match.notes ? [{ label: match.notes }] : []),
      ],
      href: "/football",
      nativeStatus: match.scoreFor !== null && match.scoreAgainst !== null ? "DONE" : null,
    });
  }

  for (const task of tasks) {
    if (!task.dueDate) continue;
    items.push({
      sourceKey: `task:${task.id}`,
      kind: "TASK",
      date: startOfDay(task.dueDate),
      time: clockOrNull(task.dueDate),
      title: task.title,
      context: task.subjectLabel ?? null,
      detail: [
        ...(task.description ? [{ label: task.description }] : []),
        ...(task.estimatedMin ? [{ label: "About", value: `${task.estimatedMin} min` }] : []),
      ],
      href: "/tasks",
      nativeStatus: task.status === "DONE" ? "DONE" : task.status === "MISSED" ? "MISSED" : null,
    });
  }

  // Plans with no day at all. The generator makes individual football
  // sessions without one, and a workout can be added without picking a
  // weekday — both are real work this page would otherwise never mention.
  const unscheduled: PlanUnscheduledItem[] = [
    ...workouts
      .filter((workout) => workout.dayOfWeek === null)
      .map((workout) => ({
        sourceKey: `workout:${workout.id}`,
        kind: "WORKOUT" as const,
        title: workout.name,
        context: null,
        detail: workoutDetail(workout.exercises),
        href: "/gym",
      })),
    ...trainings
      .filter((training) => training.date === null && training.dayOfWeek === null)
      .map((training) => ({
        sourceKey: `training:${training.id}`,
        kind: "TRAINING" as const,
        title: training.title,
        context: training.focus,
        detail: trainingDetail(training),
        href: "/football",
      })),
  ];

  return {
    items,
    unscheduled,
    checks: checks.map((check) => ({
      sourceKey: check.sourceKey,
      date: check.date,
      status: check.status,
      note: check.note,
      atTime: check.atTime,
    })),
  };
}

/** The same thing a tick writes, for the places that need it elsewhere. */
export type { PlanStatus };
