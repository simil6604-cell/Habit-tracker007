"use server";

import { revalidatePath } from "next/cache";
import { format, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { buildExamPlan } from "./exam-plan-build";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type CreatePlanResult = { planId?: string; error?: string };

/**
 * The planner's button, over the same builder the school AI uses.
 *
 * The work itself lives in exam-plan-build.ts, because the tutor can be
 * asked for a plan in the chat and must do exactly the same thing.
 */
export async function createExamPlan(examId: string, brief?: string): Promise<CreatePlanResult> {
  const userId = await requireUserId();
  const result = await buildExamPlan(userId, { examId, brief });
  if (!result.ok) return { error: result.error };

  revalidatePath("/school");
  revalidatePath("/school/planner");
  return { planId: result.plan.planId };
}

export async function toggleExamPlanDay(planId: string, dayId: string): Promise<void> {
  const userId = await requireUserId();
  const day = await prisma.examPlanDay.findFirst({ where: { id: dayId, planId, plan: { userId } } });
  if (!day) return;
  await prisma.examPlanDay.update({ where: { id: day.id }, data: { done: !day.done } });
  revalidatePath(`/school/plan/${planId}`);
}

/**
 * Today's reading of how ready this exam feels.
 *
 * One per day, replaced if you rate it again — the point is a line you can
 * read, not a log of every time you changed your mind this evening.
 */
export async function recordReadiness(planId: string, readiness: number, note?: string): Promise<void> {
  const userId = await requireUserId();
  const plan = await prisma.examPlan.findFirst({ where: { id: planId, userId } });
  if (!plan) return;

  const value = Math.round(readiness);
  if (!Number.isFinite(value) || value < 1 || value > 5) return;

  const date = startOfDay(new Date());
  const trimmed = (note ?? "").trim().slice(0, 300) || null;
  await prisma.examPlanCheckIn.upsert({
    where: { planId_date: { planId: plan.id, date } },
    create: { planId: plan.id, date, readiness: value, note: trimmed },
    update: { readiness: value, note: trimmed },
  });
  revalidatePath(`/school/plan/${planId}`);
}

export async function archiveExamPlan(planId: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.examPlan.updateMany({ where: { id: planId, userId }, data: { archivedAt: new Date() } });
  revalidatePath("/school");
  revalidatePath(`/school/plan/${planId}`);
}

export type PlannableExam = { id: string; title: string; subjectName: string | null; dateLabel: string; hasPlan: boolean };

/** The exams a plan can still be built for — today's and past ones have no run-up left. */
export async function getPlannableExams(): Promise<PlannableExam[]> {
  const userId = await requireUserId();
  const today = startOfDay(new Date());

  const [exams, plans] = await Promise.all([
    prisma.exam.findMany({
      where: { userId, date: { gt: today } },
      include: { subject: true },
      orderBy: { date: "asc" },
      take: 12,
    }),
    prisma.examPlan.findMany({ where: { userId, archivedAt: null }, select: { examId: true } }),
  ]);

  const planned = new Set(plans.map((p) => p.examId).filter((id): id is string => Boolean(id)));
  return exams.map((exam) => ({
    id: exam.id,
    title: exam.title,
    subjectName: exam.subject?.name ?? null,
    dateLabel: format(exam.date, "EEE d MMM"),
    hasPlan: planned.has(exam.id),
  }));
}
