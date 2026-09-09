"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type AssessmentAnswer = { id: string; label: string; value: number; subjectId?: string };

export async function submitAssessment(category: "SCHOOL" | "GYM" | "FOOTBALL", formData: FormData) {
  const userId = await requireUserId();

  const raw = formData.get("answers");
  if (typeof raw !== "string") return;
  const answers: AssessmentAnswer[] = JSON.parse(raw);
  if (answers.length === 0) return;

  // Each answer is 1-5 -> scale to 0-100.
  const overallScore = Math.round((answers.reduce((sum, a) => sum + a.value, 0) / (answers.length * 5)) * 100);

  await prisma.assessment.create({
    data: { userId, category, answers: JSON.stringify(answers), overallScore },
  });

  if (category === "SCHOOL") {
    for (const a of answers) {
      if (!a.subjectId) continue;
      await prisma.subject.update({
        where: { id: a.subjectId },
        data: { baselineConfidence: Math.round((a.value / 5) * 100) },
      });
    }
  }

  revalidatePath("/assessment");
  revalidatePath("/");
  redirect("/assessment");
}
