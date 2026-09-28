import { prisma } from "@/lib/db/prisma";
import { getSchoolAIMessages } from "./school-ai-actions";
import { getPlannableExams } from "./exam-plan-actions";
import type { StoredLink } from "./revision-links";

export type SchoolAISectionData = {
  messages: Awaited<ReturnType<typeof getSchoolAIMessages>>;
  exams: Awaited<ReturnType<typeof getPlannableExams>>;
  livePlans: { id: string; title: string }[];
  /** For the "still not sure?" row under the chat. */
  links: StoredLink[];
};

/**
 * Everything the school-AI section on /school needs, in one round trip.
 *
 * Its own module rather than inline in the page, because the page already
 * assembles nine other queries and this is the part most likely to grow.
 */
export async function getSchoolAISectionData(userId: string): Promise<SchoolAISectionData> {
  const [messages, exams, livePlans, links] = await Promise.all([
    getSchoolAIMessages(),
    getPlannableExams(),
    prisma.examPlan.findMany({
      where: { userId, archivedAt: null },
      orderBy: { examDate: "asc" },
      take: 4,
      select: { id: true, title: true },
    }),
    // Newest first, because bestLink takes the first match within a tier.
    prisma.revisionLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, url: true, kind: true, subjectId: true, topicId: true },
    }),
  ]);
  return { messages, exams, livePlans, links };
}
