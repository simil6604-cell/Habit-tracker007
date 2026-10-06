"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import { schemaErrorMessage } from "@/lib/config/schema-check";
import {
  cleanGrade,
  cleanOneLine,
  cleanMultiline,
  parseMarks,
  MAX_PAPER_TITLE,
  MAX_QUESTION,
  MAX_ANSWER,
  MAX_EXAMINER_NOTE,
  MAX_QUESTIONS_PER_PAPER,
  type QuestionInput,
} from "./marked-paper";
import { buildAnalysisPrompt, parseAnalysisReply } from "./paper-analysis";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type PaperFormState = { ok: boolean; error?: string; id?: string } | null;

function revalidatePaper(id?: string) {
  revalidatePath("/school/grades");
  if (id) revalidatePath(`/school/grades/${id}`);
}

/** A date input's `yyyy-mm-dd`, as a local date — or null. */
function parseDay(raw: unknown): Date | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export async function addMarkedPaper(_prev: PaperFormState, formData: FormData): Promise<PaperFormState> {
  const userId = await requireUserId();

  const title = cleanOneLine(formData.get("title"), MAX_PAPER_TITLE);
  if (!title) return { ok: false, error: "Give the paper a name — “Economics Paper 1 mock” is plenty." };

  const marks = parseMarks(formData.get("marksScored"), formData.get("marksTotal"));
  if (!marks.ok) return { ok: false, error: marks.error };

  // A subject id arrives from a select the browser can rewrite, so it is
  // checked against this account rather than trusted.
  let subjectId: string | null = null;
  const rawSubject = String(formData.get("subjectId") ?? "").trim();
  if (rawSubject) {
    const subject = await prisma.subject.findFirst({ where: { id: rawSubject, userId }, select: { id: true } });
    if (!subject) return { ok: false, error: "That subject is not one of yours." };
    subjectId = subject.id;
  }

  try {
    const created = await prisma.markedPaper.create({
      data: {
        userId,
        subjectId,
        title,
        satOn: parseDay(formData.get("satOn")),
        gradeAwarded: cleanGrade(formData.get("gradeAwarded")),
        gradeTarget: cleanGrade(formData.get("gradeTarget")),
        marksScored: marks.marks.scored,
        marksTotal: marks.marks.total,
      },
      select: { id: true },
    });
    revalidatePaper(created.id);
    return { ok: true, id: created.id };
  } catch (error) {
    const schema = schemaErrorMessage(error);
    if (schema) return { ok: false, error: schema };
    throw error;
  }
}

export async function addPaperQuestion(_prev: PaperFormState, formData: FormData): Promise<PaperFormState> {
  const userId = await requireUserId();

  const paperId = String(formData.get("paperId") ?? "");
  const paper = await prisma.markedPaper.findFirst({ where: { id: paperId, userId }, select: { id: true } });
  if (!paper) return { ok: false, error: "That paper is not one of yours." };

  const prompt = cleanMultiline(formData.get("prompt"), MAX_QUESTION);
  if (!prompt) return { ok: false, error: "Type the question as it was printed — that is half of what gets analysed." };

  const answer = cleanMultiline(formData.get("answer"), MAX_ANSWER);
  if (!answer) return { ok: false, error: "Type what you wrote for it. Without that there is nothing to look at." };

  const marks = parseMarks(formData.get("marksScored"), formData.get("marksTotal"));
  if (!marks.ok) return { ok: false, error: marks.error };

  const count = await prisma.paperQuestion.count({ where: { paperId: paper.id } });
  if (count >= MAX_QUESTIONS_PER_PAPER) {
    return { ok: false, error: `That is ${MAX_QUESTIONS_PER_PAPER} questions — enough for one paper. Start another one.` };
  }

  await prisma.paperQuestion.create({
    data: {
      paperId: paper.id,
      position: count + 1,
      prompt,
      answer,
      marksScored: marks.marks.scored,
      marksTotal: marks.marks.total,
      examinerNote: cleanMultiline(formData.get("examinerNote"), MAX_EXAMINER_NOTE),
    },
  });

  revalidatePaper(paper.id);
  return { ok: true, id: paper.id };
}

export async function deletePaperQuestion(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Scoped through the paper to this account in the same query: an id from
  // somewhere else matches nothing rather than deleting somebody's work.
  const { count } = await prisma.paperQuestion.deleteMany({ where: { id, paper: { userId } } });
  if (count > 0) revalidatePaper(String(formData.get("paperId") ?? ""));
}

export async function deleteMarkedPaper(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.markedPaper.deleteMany({ where: { id, userId } });
  revalidatePaper();
  // Back to the list. The delete button lives on the paper's own page, so
  // without this you are left looking at a paper that no longer exists — and
  // the next reload is a 404 about your own work.
  redirect("/school/grades");
}

export type AnalyseResult = { ok: true; questions: number } | { ok: false; error: string };

/**
 * Reads the paper and writes the analysis back onto it.
 *
 * Stored rather than streamed to the screen and forgotten: this is something
 * to come back to the night before the next one, and paying for the same
 * answer twice to read it twice would be silly.
 */
export async function analyseMarkedPaper(paperId: string): Promise<AnalyseResult> {
  const userId = await requireUserId();

  const paper = await prisma.markedPaper.findFirst({
    where: { id: paperId, userId },
    include: {
      subject: { select: { name: true, level: true, revisionUrl: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!paper) return { ok: false, error: "That paper is not one of yours." };

  if (paper.questions.length === 0) {
    return {
      ok: false,
      error: "Add at least one question first — the question, and what you wrote for it. That pair is what gets read.",
    };
  }

  if (!isRealAIConfigured) {
    return {
      ok: false,
      error: "Reading a paper needs a real AI — set ANTHROPIC_API_KEY in your host's environment, then try again.",
    };
  }

  const school = await prisma.school.findUnique({ where: { userId }, select: { educationSystem: true } });

  const questions: QuestionInput[] = paper.questions.map((q) => ({
    id: q.id,
    position: q.position,
    prompt: q.prompt,
    answer: q.answer,
    marksScored: q.marksScored,
    marksTotal: q.marksTotal,
    examinerNote: q.examinerNote,
  }));

  const prompt = buildAnalysisPrompt(
    {
      title: paper.title,
      subjectName: paper.subject?.name ?? null,
      gradeAwarded: paper.gradeAwarded,
      gradeTarget: paper.gradeTarget,
      marksScored: paper.marksScored,
      marksTotal: paper.marksTotal,
    },
    questions,
    buildAcademicSystemPrompt(school?.educationSystem, paper.subject, { teaching: true })
  );

  let raw: string;
  try {
    raw = await getAIProvider().generate(prompt, { maxTokens: 4000 });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The AI couldn't read that paper." };
  }

  const parsed = parseAnalysisReply(raw, questions.map((q) => q.id));
  if (!parsed.ok) return parsed;

  const byId = new Map(parsed.analysis.questions.map((q) => [q.questionId, q]));
  await prisma.$transaction([
    prisma.markedPaper.update({
      where: { id: paper.id },
      data: { analysis: parsed.analysis.overall || null, analysedAt: new Date() },
    }),
    ...paper.questions.map((q) => {
      const found = byId.get(q.id);
      // updateMany rather than update, so the row proves it belongs to this
      // account in the same query. The id came from a paper already loaded
      // under this user, but a query that has to be read alongside another one
      // to be safe is exactly the shape that lets the next gap through.
      return prisma.paperQuestion.updateMany({
        where: { id: q.id, paper: { userId } },
        data: {
          analysis: found
            ? JSON.stringify({ asked: found.asked, understood: found.understood, gap: found.gap, better: found.better })
            : null,
        },
      });
    }),
  ]);

  revalidatePaper(paper.id);
  return { ok: true, questions: parsed.analysis.questions.length };
}
