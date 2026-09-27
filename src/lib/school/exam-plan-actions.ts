"use server";

import { revalidatePath } from "next/cache";
import { format, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import {
  fallbackPlan,
  parsePlan,
  planDates,
  planPrompt,
  type PlanDay,
  type WeakTopic,
} from "./exam-plan";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type CreatePlanResult = { planId?: string; error?: string };

/**
 * Builds the run-up to one exam and stores it.
 *
 * The AI writes the days when a key is configured; without one, the rule-based
 * plan runs on the student's own topics and weakest-first ordering. Either way
 * a full plan comes back — "no AI, no plan" would make the feature a wrapper
 * around a key rather than a thing the app does.
 */
export async function createExamPlan(examId: string, brief?: string): Promise<CreatePlanResult> {
  const userId = await requireUserId();

  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    include: { subject: { include: { topics: true } } },
  });
  if (!exam) return { error: "That exam isn't on your list." };

  const dates = planDates(new Date(), exam.date);
  if (dates.length === 0) {
    return { error: "That exam is today or in the past — there are no days left to plan." };
  }

  const existing = await prisma.examPlan.findFirst({ where: { userId, examId, archivedAt: null } });
  if (existing) return { planId: existing.id };

  const subjectName = exam.subject?.name ?? "This subject";
  const topics: WeakTopic[] = (exam.subject?.topics ?? [])
    .map((t) => ({ name: t.name, progressPct: t.progressPct }))
    .sort((a, b) => a.progressPct - b.progressPct)
    .slice(0, 20);

  const trimmedBrief = (brief ?? "").trim().slice(0, 500) || null;
  const base = fallbackPlan(dates, topics, subjectName);
  let days: PlanDay[] = base;

  if (isRealAIConfigured) {
    try {
      const school = await prisma.school.findUnique({ where: { userId } });
      const system = buildAcademicSystemPrompt(school?.educationSystem, exam.subject);
      const reply = await getAIProvider().generate(
        planPrompt(subjectName, exam.title, exam.date, dates, topics, trimmedBrief),
        { system, maxTokens: 4000 }
      );
      days = parsePlan(reply, dates, base);
    } catch {
      // A plan built from their own topics beats no plan and an error message.
      days = base;
    }
  }

  const plan = await prisma.examPlan.create({
    data: {
      userId,
      examId: exam.id,
      subjectId: exam.subjectId,
      title: exam.title,
      examDate: exam.date,
      brief: trimmedBrief,
      days: {
        create: days.map((day) => ({
          date: startOfDay(day.date),
          focus: day.focus,
          detail: day.detail ?? null,
          minutes: day.minutes,
        })),
      },
    },
  });

  revalidatePath("/school");
  revalidatePath("/school");
  return { planId: plan.id };
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
