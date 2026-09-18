import { prisma } from "@/lib/db/prisma";
import { startOfWeek, addDays, format, startOfDay, isAfter } from "date-fns";

export type HabitTrackerDay = { dateKey: string; date: Date; isFuture: boolean };
export type HabitTrackerWeek = { label: string; days: HabitTrackerDay[] };
export type HabitRow = { id: string; name: string; emoji: string | null };
export type DailyStat = { dateKey: string; label: string; doneCount: number; totalCount: number; pct: number };
export type HabitStat = { habitId: string; doneCount: number; trackedDays: number; pct: number };

export type HabitTrackerData = {
  habits: HabitRow[];
  weeks: HabitTrackerWeek[];
  doneSet: Set<string>; // `${habitId}|${dateKey}`
  dailyStats: DailyStat[];
  habitStats: HabitStat[];
};

const WEEKS_SHOWN = 4;

function dateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export async function getHabitTrackerData(userId: string): Promise<HabitTrackerData> {
  const today = startOfDay(new Date());
  const firstWeekStart = startOfWeek(addDays(today, -7 * (WEEKS_SHOWN - 1)), { weekStartsOn: 1 });
  const totalDays = WEEKS_SHOWN * 7;
  const allDays: Date[] = Array.from({ length: totalDays }, (_, i) => addDays(firstWeekStart, i));
  const rangeEnd = allDays[allDays.length - 1];

  const habits = await prisma.schoolHabit.findMany({ where: { userId }, orderBy: { order: "asc" } });

  const logs = habits.length
    ? await prisma.schoolHabitLog.findMany({
        where: { habitId: { in: habits.map((h) => h.id) }, date: { gte: firstWeekStart, lte: rangeEnd } },
      })
    : [];

  const doneSet = new Set(logs.map((l) => `${l.habitId}|${dateKey(l.date)}`));

  const weeks: HabitTrackerWeek[] = [];
  for (let w = 0; w < WEEKS_SHOWN; w++) {
    const days = allDays.slice(w * 7, w * 7 + 7).map((d) => ({
      dateKey: dateKey(d),
      date: d,
      isFuture: isAfter(d, today),
    }));
    weeks.push({ label: `Week ${w + 1}`, days });
  }

  const dailyStats: DailyStat[] = allDays.map((d) => {
    const key = dateKey(d);
    const future = isAfter(d, today);
    const totalCount = habits.length;
    const doneCount = future ? 0 : habits.reduce((sum, h) => sum + (doneSet.has(`${h.id}|${key}`) ? 1 : 0), 0);
    const pct = !future && totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    return { dateKey: key, label: format(d, "MMM d"), doneCount, totalCount, pct };
  });

  const trackedDays = allDays.filter((d) => !isAfter(d, today)).length;
  const habitStats: HabitStat[] = habits.map((h) => {
    const doneCount = allDays.filter((d) => !isAfter(d, today) && doneSet.has(`${h.id}|${dateKey(d)}`)).length;
    return { habitId: h.id, doneCount, trackedDays, pct: trackedDays > 0 ? Math.round((doneCount / trackedDays) * 100) : 0 };
  });

  return {
    habits: habits.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji })),
    weeks,
    doneSet,
    dailyStats,
    habitStats,
  };
}
