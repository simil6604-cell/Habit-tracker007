import { prisma } from "@/lib/db/prisma";
import { DEFAULT_EXPRESSION } from "@/lib/ai/expression";
import { getSchoolAIMessages } from "./school-ai-actions";
import { getPlannableExams } from "./exam-plan-actions";
import type { StoredLink } from "./revision-links";

export type SchoolAISectionData = {
  messages: Awaited<ReturnType<typeof getSchoolAIMessages>>;
  exams: Awaited<ReturnType<typeof getPlannableExams>>;
  livePlans: { id: string; title: string }[];
  /** For the "still not sure?" row under the chat. */
  links: StoredLink[];
  /** For filing a recorded lesson under a subject. */
  subjects: { id: string; name: string }[];
  /** Who is signed in, so voice mode can greet them by name. */
  userName: string | null;
  /** How much life the voice puts into it — their own setting. */
  expression: string;
};

/**
 * Everything the school-AI section on /school needs, in one round trip.
 *
 * Its own module rather than inline in the page, because the page already
 * assembles nine other queries and this is the part most likely to grow.
 */
export async function getSchoolAISectionData(userId: string): Promise<SchoolAISectionData> {
  const [messages, exams, livePlans, links, subjects, user] = await Promise.all([
    getSchoolAIMessages(),
    getPlannableExams(),
    prisma.examPlan.findMany({
      where: { userId, archivedAt: null },
      orderBy: { examDate: "asc" },
      take: 4,
      select: { id: true, title: true },
    }),
    // Newest first, because bestLink takes the first match within a tier. The
    // subject name rides along: this row has no subject in view, so the chip
    // has to say which subject's deck it is about to open.
    prisma.revisionLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        url: true,
        kind: true,
        subjectId: true,
        topicId: true,
        subject: { select: { name: true } },
      },
    }),
    prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, aiExpression: true } }),
  ]);
  return {
    messages,
    exams,
    livePlans,
    links: links.map(({ subject, ...link }) => ({ ...link, subjectName: subject?.name ?? null })),
    subjects,
    userName: user?.name ?? null,
    expression: user?.aiExpression ?? DEFAULT_EXPRESSION,
  };
}
