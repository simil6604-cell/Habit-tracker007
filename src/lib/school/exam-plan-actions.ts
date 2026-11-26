"use server";

import { revalidatePath } from "next/cache";
import { format, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { serverFailureMessage } from "@/lib/utils/action-error";
import { buildExamPlan } from "./exam-plan-build";
import { clampMinutes } from "./exam-plan";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type CreatePlanResult = { planId?: string; error?: string };

/** What an edit or a removal hands back: nothing, or a line to put on screen. */
export type ActionResult = { error?: string };

/** The same limits the plan was written under — see exam-plan.ts. */
const MAX_FOCUS = 120;
const MAX_DETAIL = 400;

/**
 * The planner's button, over the same builder the school AI uses.
 *
 * The work itself lives in exam-plan-build.ts, because the tutor can be
 * asked for a plan in the chat and must do exactly the same thing.
 *
 * It returns its failures rather than throwing them. An action that throws
 * takes the whole page down with it — the School page, which is to say the
 * chat, the exams and the homework list, replaced by "This page didn't
 * load" because a button did not work. Reported exactly that way, and
 * reproduced: an expired session is enough to do it, and a phone left open
 * overnight is an expired session.
 */
export async function createExamPlan(examId: string, brief?: string): Promise<CreatePlanResult> {
  try {
    const userId = await requireUserId();
    const result = await buildExamPlan(userId, { examId, brief });
    if (!result.ok) return { error: result.error };

    revalidatePath("/school");
    revalidatePath("/school/planner");
    return { planId: result.plan.planId };
  } catch (err) {
    return { error: serverFailureMessage(err, "The plan") };
  }
}

export async function toggleExamPlanDay(planId: string, dayId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const day = await prisma.examPlanDay.findFirst({ where: { id: dayId, planId, plan: { userId } } });
    if (!day) return {};
    await prisma.examPlanDay.update({ where: { id: day.id }, data: { done: !day.done } });
    revalidatePath(`/school/plan/${planId}`);
    return {};
  } catch (err) {
    return { error: serverFailureMessage(err, "Ticking that day off") };
  }
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

/**
 * Fixes what a day actually says.
 *
 * A plan is written by an AI from what it knew at the time, and the person
 * following it knows more: the topic was covered in class after all, the
 * two hours it asked for are not there on a Thursday, the wording is in the
 * wrong language. Until now the page was read-only — every day as written,
 * for ever — and a plan you cannot correct is one you stop opening.
 *
 * Only this account's plans, and only the fields that are text and time:
 * the date stays, because the run-up is a shape (rest days, review last)
 * rather than a bag of rows, and moving one day is how it quietly stops
 * being that shape.
 */
export async function updateExamPlanDay(
  planId: string,
  dayId: string,
  input: { focus: string; detail: string; minutes: number }
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const day = await prisma.examPlanDay.findFirst({
      where: { id: dayId, planId, plan: { userId } },
      select: { id: true },
    });
    if (!day) return { error: "That day is not on this plan any more." };

    const focus = input.focus.trim().slice(0, MAX_FOCUS);
    if (!focus) return { error: "A day needs something on it. Delete it instead if there is nothing to do." };

    await prisma.examPlanDay.update({
      where: { id: day.id },
      data: {
        focus,
        detail: input.detail.trim().slice(0, MAX_DETAIL) || null,
        // The same floor and ceiling the plan was built with, so an edited
        // day cannot become 9,000 minutes of revision.
        minutes: clampMinutes(input.minutes),
      },
    });
    revalidatePath(`/school/plan/${planId}`);
    return {};
  } catch (err) {
    return { error: serverFailureMessage(err, "That change") };
  }
}

/** Takes one day off the plan. The rest of the run-up is untouched. */
export async function deleteExamPlanDay(planId: string, dayId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const day = await prisma.examPlanDay.findFirst({
      where: { id: dayId, planId, plan: { userId } },
      select: { id: true },
    });
    if (!day) return {};
    await prisma.examPlanDay.delete({ where: { id: day.id } });
    revalidatePath(`/school/plan/${planId}`);
    return {};
  } catch (err) {
    return { error: serverFailureMessage(err, "Removing that day") };
  }
}

/**
 * Deletes the plan itself, days, readings and all.
 *
 * Next to Archive rather than instead of it, because they are different
 * things and only one of them is reversible in spirit: archiving keeps what
 * you did, deleting is for a plan that should never have existed. The page
 * asks twice before calling this.
 */
export async function deleteExamPlan(planId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    // Scoped to the account in the delete itself: an id alone reaches
    // nothing, and a plan belonging to someone else matches no rows.
    const removed = await prisma.examPlan.deleteMany({ where: { id: planId, userId } });
    if (removed.count === 0) return { error: "That plan is not there any more." };
    revalidatePath("/school");
    revalidatePath("/school/planner");
    return {};
  } catch (err) {
    return { error: serverFailureMessage(err, "Deleting the plan") };
  }
}

/**
 * Puts the plan away without losing it: it leaves the live list, and what
 * was ticked off stays on it. The reversible half of the pair with
 * deleteExamPlan above.
 */
export async function archiveExamPlan(planId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const done = await prisma.examPlan.updateMany({
      where: { id: planId, userId },
      data: { archivedAt: new Date() },
    });
    if (done.count === 0) return { error: "That plan is not there any more." };
    revalidatePath("/school");
    revalidatePath(`/school/plan/${planId}`);
    return {};
  } catch (err) {
    return { error: serverFailureMessage(err, "Archiving the plan") };
  }
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
