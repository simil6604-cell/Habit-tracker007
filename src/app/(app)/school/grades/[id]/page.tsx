import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Trash2 } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { deleteMarkedPaper } from "@/lib/school/marked-paper-actions";
import { markPercent, paperMarks, weakestQuestions } from "@/lib/school/marked-paper";
import { AddQuestionForm } from "@/components/school/add-question-form";
import { PaperQuestionList } from "@/components/school/paper-question-list";
import { AnalysePaperButton } from "@/components/school/analyse-paper-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function MarkedPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session!.user.id;
  const { id } = await params;

  // Scoped to this account in the query itself: somebody else's paper is not
  // found rather than forbidden, which says nothing about whether it exists.
  const paper = await prisma.markedPaper.findFirst({
    where: { id, userId },
    include: {
      subject: { select: { name: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!paper) notFound();

  const marks = paperMarks({ scored: paper.marksScored, total: paper.marksTotal }, paper.questions);
  const pct = markPercent(marks);
  const weakest = weakestQuestions(
    paper.questions.map((q) => ({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      answer: q.answer,
      marksScored: q.marksScored,
      marksTotal: q.marksTotal,
      examinerNote: q.examinerNote,
    })),
    3
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/school/grades" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> All marked work
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{paper.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {[
              paper.subject?.name ?? paper.subjectLabel,
              paper.satOn ? format(paper.satOn, "d MMM yyyy") : null,
              marks.scored !== null && marks.total !== null
                ? `${marks.scored}/${marks.total}${pct === null ? "" : ` · ${pct}%`}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No details yet"}
          </p>
        </div>
        <form action={deleteMarkedPaper}>
          <input type="hidden" name="id" value={paper.id} />
          <button
            type="submit"
            aria-label={`Delete ${paper.title}`}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
          >
            <Trash2 size={14} /> Delete
          </button>
        </form>
      </div>

      {(paper.gradeAwarded || paper.gradeTarget) && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="grade-gap">
          {paper.gradeAwarded && (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted">Got</span> <Badge>{paper.gradeAwarded}</Badge>
            </span>
          )}
          {paper.gradeAwarded && paper.gradeTarget && <span className="text-muted">→</span>}
          {paper.gradeTarget && (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="text-xs text-muted">Going for</span> <Badge variant="success">{paper.gradeTarget}</Badge>
            </span>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle>What the AI makes of it</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AnalysePaperButton
            paperId={paper.id}
            questionCount={paper.questions.length}
            analysedAt={paper.analysedAt}
          />
          {paper.analysis && (
            <div className="whitespace-pre-line rounded-xl bg-surface-muted p-3 text-sm" data-testid="paper-analysis">
              {paper.analysis}
            </div>
          )}
        </CardContent>
      </Card>

      {weakest.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Where the marks went</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm" data-testid="weakest-questions">
              {weakest.map((q) => (
                <li key={q.id} className="flex items-baseline gap-2">
                  <span className="text-xs text-muted">Q{q.position}</span>
                  <span className="min-w-0 flex-1 truncate">{q.prompt}</span>
                  <span className="shrink-0 text-xs text-muted">
                    lost {q.marksTotal! - q.marksScored!} of {q.marksTotal}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>Questions</CardTitle></CardHeader>
        <CardContent>
          <PaperQuestionList paperId={paper.id} questions={paper.questions} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Add a question</CardTitle></CardHeader>
        <CardContent>
          <AddQuestionForm paperId={paper.id} />
        </CardContent>
      </Card>
    </div>
  );
}
