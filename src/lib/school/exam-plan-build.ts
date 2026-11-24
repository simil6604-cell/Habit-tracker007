import { startOfDay } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import { fallbackPlan, parsePlan, planDates, planPrompt, type PlanDay, type WeakTopic } from "./exam-plan";

/**
 * Building the run-up to one exam, away from the form that used to own it.
 *
 * It moved here so the school AI can build one too. Asked in the chat —
 * "mach mir einen Lernplan für die Bio-Prüfung" — exactly the same work has
 * to happen as when the button on the planner is pressed, and two copies of
 * it would have drifted the first time either changed. The same move the
 * podcast made, for the same reason.
 *
 * Not a "use server" file: a tool is not a server action, and this is
 * called from one. The user id is an argument here and comes from the
 * session at every call site, never from anything a model wrote.
 */

export type BuiltPlan = {
  planId: string;
  title: string;
  examDate: Date;
  dayCount: number;
  subjectName: string | null;
  /** True when a plan for this exam was already there and was handed back as it is. */
  alreadyExisted: boolean;
};

export type BuildPlanResult = { ok: true; plan: BuiltPlan } | { ok: false; error: string };

/**
 * Builds the run-up to one exam and stores it.
 *
 * The AI writes the days when a key is configured; without one, the
 * rule-based plan runs on the student's own topics and weakest-first
 * ordering. Either way a full plan comes back — "no AI, no plan" would make
 * the feature a wrapper around a key rather than a thing the app does.
 */
export async function buildExamPlan(
  userId: string,
  options: { examId: string; brief?: string | null }
): Promise<BuildPlanResult> {
  // Scoped to the account here, at the call site, where it can be read —
  // an exam id on its own reaches nothing.
  const exam = await prisma.exam.findFirst({
    where: { id: options.examId, userId },
    include: { subject: { include: { topics: true } } },
  });
  if (!exam) return { ok: false, error: "That exam isn't on your list." };

  const dates = planDates(new Date(), exam.date);
  if (dates.length === 0) {
    return { ok: false, error: "That exam is today or in the past — there are no days left to plan." };
  }

  const subjectName = exam.subject?.name ?? null;

  const existing = await prisma.examPlan.findFirst({
    where: { userId, examId: exam.id, archivedAt: null },
    select: { id: true, _count: { select: { days: true } } },
  });
  if (existing) {
    return {
      ok: true,
      plan: {
        planId: existing.id,
        title: exam.title,
        examDate: exam.date,
        dayCount: existing._count.days,
        subjectName,
        alreadyExisted: true,
      },
    };
  }

  const topics: WeakTopic[] = (exam.subject?.topics ?? [])
    .map((t) => ({ name: t.name, progressPct: t.progressPct }))
    .sort((a, b) => a.progressPct - b.progressPct)
    .slice(0, 20);

  const trimmedBrief = (options.brief ?? "").trim().slice(0, 500) || null;
  const base = fallbackPlan(dates, topics, subjectName ?? "This subject");
  let days: PlanDay[] = base;

  if (isRealAIConfigured) {
    try {
      const school = await prisma.school.findUnique({ where: { userId } });
      const system = buildAcademicSystemPrompt(school?.educationSystem, exam.subject);
      const reply = await getAIProvider().generate(
        planPrompt(subjectName ?? "This subject", exam.title, exam.date, dates, topics, trimmedBrief),
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

  return {
    ok: true,
    plan: {
      planId: plan.id,
      title: exam.title,
      examDate: exam.date,
      dayCount: days.length,
      subjectName,
      alreadyExisted: false,
    },
  };
}
