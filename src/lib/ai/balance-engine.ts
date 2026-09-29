import { prisma } from "@/lib/db/prisma";
import { addDays, format } from "date-fns";
import { generateDayPlan } from "./schedule-generator";

/**
 * Scans the next 7 days of real, stored commitments (school, gym, football,
 * generated study blocks) and raises a BALANCE_WARNING recommendation for
 * any day that looks overloaded, always with the concrete reasons attached.
 */
export async function runWeeklyBalanceCheck(userId: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const plans = await Promise.all(days.map((d) => generateDayPlan(userId, d)));

  const created: string[] = [];
  const loadByDay = days.map((d, i) => ({ day: d, minutes: plans[i].totalCommittedMinutes, overloaded: plans[i].overloaded, reasons: plans[i].reasons }));

  for (const entry of loadByDay) {
    if (!entry.overloaded) continue;

    // The lightest OTHER day. Taking the lightest of all seven meant that in
    // a week where the lightest day is itself overloaded, the advice read
    // "move some study time to Tuesday" on Tuesday — and proposedChange
    // carried the same day on both sides.
    const lighter = loadByDay
      .filter((other) => other !== entry && other.minutes < entry.minutes)
      .sort((a, b) => a.minutes - b.minutes)[0];

    const existing = await prisma.aIRecommendation.findFirst({
      where: {
        userId,
        type: "BALANCE_WARNING",
        status: "PENDING",
        title: { contains: format(entry.day, "EEEE, MMM d") },
      },
    });
    if (existing) continue;

    const hours = (entry.minutes / 60).toFixed(1);
    const load = `Your plan for ${format(entry.day, "EEEE")} adds up to about ${hours}h of school, training and study combined.`;
    const rec = await prisma.aIRecommendation.create({
      data: {
        userId,
        type: "BALANCE_WARNING",
        title: `⚠️ ${format(entry.day, "EEEE, MMM d")} is too demanding`,
        message: lighter
          ? `${load} Consider moving some study time to ${format(lighter.day, "EEEE")}, which is lighter.`
          : `${load} Every other day this week is at least as full, so this one needs something dropped rather than moved.`,
        reasoning: JSON.stringify(entry.reasons),
        proposedChange: JSON.stringify(
          lighter ? { fromDay: entry.day.toISOString(), toDay: lighter.day.toISOString() } : { fromDay: entry.day.toISOString() }
        ),
        status: "PENDING",
      },
    });
    created.push(rec.id);
  }

  if (created.length === 0) {
    // Written with status "INFO", so looking for "PENDING" never found the
    // one from last time: a fresh "✅ Your week looks balanced" was inserted
    // on every check until the panel was nothing else.
    const hasAnyPendingInfo = await prisma.aIRecommendation.findFirst({
      where: { userId, type: "INFO", status: "INFO" },
    });
    if (!hasAnyPendingInfo) {
      await prisma.aIRecommendation.create({
        data: {
          userId,
          type: "INFO",
          title: "✅ Your week looks balanced",
          message: "No day this week exceeds a healthy combined load of school, gym, football and study.",
          reasoning: JSON.stringify(loadByDay.map((e) => `${format(e.day, "EEE")}: ~${(e.minutes / 60).toFixed(1)}h committed`)),
          status: "INFO",
        },
      });
    }
  }

  return created;
}

export async function acceptRecommendation(id: string, userId: string) {
  await prisma.aIRecommendation.updateMany({ where: { id, userId }, data: { status: "ACCEPTED" } });
}

export async function declineRecommendation(id: string, userId: string) {
  await prisma.aIRecommendation.updateMany({ where: { id, userId }, data: { status: "DECLINED" } });
}
