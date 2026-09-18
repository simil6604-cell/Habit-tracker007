"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateDayPlan } from "./schedule-generator";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function commitDayPlan(dateIso: string) {
  const userId = await requireUserId();
  const date = new Date(dateIso);
  const plan = await generateDayPlan(userId, date);

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
