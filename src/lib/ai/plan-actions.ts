"use server";

import { revalidatePath } from "next/cache";
import { addDays, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateDayPlan } from "./schedule-generator";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * Write the generated study blocks for one day into the real calendar.
 *
 * Idempotent on purpose: the button can be pressed twice, the page can be
 * reopened, and the plan can be regenerated after a timetable change. Each of
 * those used to add a second copy of every block — two identical study
 * sessions at the same time, which the day then counted twice.
 *
 * Only this app's own generated blocks for that day are cleared. Anything
 * typed by hand is left exactly where it is.
 */
export async function commitDayPlan(dateIso: string) {
  const userId = await requireUserId();
  const date = new Date(dateIso);
  const plan = await generateDayPlan(userId, date);

  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const window = { gte: dayStart, lt: dayEnd };

  const previous = await prisma.studySession.findMany({
    where: { userId, aiGenerated: true, start: window },
    select: { start: true, end: true },
  });
  if (previous.length > 0) {
    await prisma.studySession.deleteMany({ where: { userId, aiGenerated: true, start: window } });
    await prisma.calendarEvent.deleteMany({
      where: { userId, category: "STUDY", sourceType: "StudySession", start: window },
    });
  }

  for (const block of plan.blocks) {
    if (block.category !== "STUDY") continue;
    await prisma.studySession.create({
      data: {
        userId,
        subjectId: block.subjectId,
        topicLabel: block.label,
        start: block.start,
        end: block.end,
        aiGenerated: true,
      },
    });
    await prisma.calendarEvent.create({
      data: {
        userId,
        title: block.label,
        category: "STUDY",
        start: block.start,
        end: block.end,
        sourceType: "StudySession",
      },
    });
  }

  revalidatePath("/school/planner");
  revalidatePath("/calendar");
}
