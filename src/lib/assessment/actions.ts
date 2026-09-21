"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type AssessmentAnswer = { id: string; label: string; value: number; subjectId?: string };

/**
 * The answers arrive as a JSON blob from a hidden field, which means every
 * field in it — the subject ids included — is whatever the browser sent. It is
 * therefore parsed rather than cast: a malformed blob used to throw out of the
 * action as an unhandled error, a value outside 1-5 skewed the score, and the
 * subject id was written to without asking whose subject it was.
 */
const answerSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().max(500).optional().default(""),
  value: z.number().int().min(1).max(5),
  subjectId: z.string().min(1).max(200).optional(),
});

export async function submitAssessment(category: "SCHOOL" | "GYM" | "FOOTBALL", formData: FormData) {
  const userId = await requireUserId();

  const raw = formData.get("answers");
  if (typeof raw !== "string") return;

  let unvalidated: unknown;
  try {
    unvalidated = JSON.parse(raw);
  } catch {
    return;
  }

  const parsed = z.array(answerSchema).min(1).max(100).safeParse(unvalidated);
  if (!parsed.success) return;
  const answers: AssessmentAnswer[] = parsed.data;

  // Each answer is 1-5 -> scale to 0-100.
  const overallScore = Math.round((answers.reduce((sum, a) => sum + a.value, 0) / (answers.length * 5)) * 100);

  await prisma.assessment.create({
    data: { userId, category, answers: JSON.stringify(answers), overallScore },
  });

  if (category === "SCHOOL") {
    for (const a of answers) {
      if (!a.subjectId) continue;
      // updateMany, not update: the id came from the browser, so the write has
      // to carry the owner. An id that isn't this user's updates nothing.
      await prisma.subject.updateMany({
        where: { id: a.subjectId, userId },
        data: { baselineConfidence: Math.round((a.value / 5) * 100) },
      });
    }
  }

  revalidatePath("/assessment");
  revalidatePath("/");
  redirect("/assessment");
}
