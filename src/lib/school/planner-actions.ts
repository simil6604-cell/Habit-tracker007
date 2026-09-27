"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseBlockInput } from "./planner-entry";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type PlannerFormState = { error?: string; ok?: boolean } | undefined;

/**
 * A study block the person wrote themselves.
 *
 * Stored as a StudySession with aiGenerated false, which is the same row the
 * generated plan commits — so a hand-written block counts towards logged study
 * time exactly like an accepted suggestion, instead of living in a second
 * parallel place that analytics would have to learn about.
 *
 * The paired calendar event carries sourceId, so deleting the block can find
 * and remove its event rather than leaving an orphan behind.
 */
export async function addStudyBlock(_prev: PlannerFormState, formData: FormData): Promise<PlannerFormState> {
  const userId = await requireUserId();

  const parsed = parseBlockInput({
    title: formData.get("title"),
    date: formData.get("date"),
    time: formData.get("time"),
    minutes: formData.get("minutes"),
    subjectId: formData.get("subjectId"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const { title, subjectId, start, end } = parsed.value;

  // A subject id arrives from a <select> the browser can rewrite, so it is
  // checked against this account before it is stored rather than trusted.
  let ownedSubjectId: string | null = null;
  if (subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } });
    if (!subject) return { error: "That subject is not one of yours." };
    ownedSubjectId = subject.id;
  }

  const created = await prisma.studySession.create({
    data: { userId, subjectId: ownedSubjectId, topicLabel: title, start, end, aiGenerated: false },
  });

  await prisma.calendarEvent.create({
    data: {
      userId,
      title,
      category: "STUDY",
      start,
      end,
      sourceType: "StudySession",
      sourceId: created.id,
    },
  });

  revalidatePath("/school/planner");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteStudyBlock(id: string) {
  const userId = await requireUserId();

  const owned = await prisma.studySession.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return;

  await prisma.calendarEvent.deleteMany({ where: { userId, sourceType: "StudySession", sourceId: owned.id } });
  await prisma.studySession.delete({ where: { id: owned.id } });

  revalidatePath("/school/planner");
  revalidatePath("/calendar");
}

/**
 * Mark a block done, or undo that.
 *
 * Worth having rather than assuming a block that has passed was studied:
 * analytics counts completed sessions only, and a planner that counted
 * everything you wrote down would report study time you never did.
 */
export async function toggleStudyBlockDone(id: string) {
  const userId = await requireUserId();

  const owned = await prisma.studySession.findFirst({ where: { id, userId }, select: { id: true, completed: true } });
  if (!owned) return;

  await prisma.studySession.update({ where: { id: owned.id }, data: { completed: !owned.completed } });

  revalidatePath("/school/planner");
  revalidatePath("/school");
  revalidatePath("/analytics");
}
