import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AddPaperForm } from "@/components/school/add-paper-form";
import { markPercent, paperMarks } from "@/lib/school/marked-paper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Marked work" };

export default async function MarkedWorkPage() {
  const session = await auth();
  const userId = session!.user.id;

  const papers = await prisma.markedPaper.findMany({
    where: { userId },
    orderBy: [{ satOn: "desc" }, { createdAt: "desc" }],
    include: {
      subject: { select: { name: true } },
      questions: { select: { marksScored: true, marksTotal: true, analysis: true } },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/school" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to School
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Marked work</h1>
      <p className="mt-1 text-muted">
        A paper that has come back, the grade it came back with, and the grade you are going for. Put the questions and
        what you wrote for them underneath, and the AI reads the gap between what was asked and what you answered.
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Add a paper</CardTitle></CardHeader>
        <CardContent>
          <AddPaperForm />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Your papers</CardTitle></CardHeader>
        <CardContent>
          {papers.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing here yet. The first one to add is the paper you were least happy with — that is where the marks
              are.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border" data-testid="paper-list">
              {papers.map((paper) => {
                const marks = paperMarks(
                  { scored: paper.marksScored, total: paper.marksTotal },
                  paper.questions
                );
                const pct = markPercent(marks);
                const analysed = paper.analysedAt !== null;

                return (
                  <li key={paper.id} className="py-3">
                    <Link href={`/school/grades/${paper.id}`} className="flex items-center gap-3 hover:text-accent">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{paper.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {[
                            paper.subject?.name ?? paper.subjectLabel,
                            paper.satOn ? format(paper.satOn, "d MMM yyyy") : null,
                            marks.scored !== null && marks.total !== null
                              ? `${marks.scored}/${marks.total}${pct === null ? "" : ` · ${pct}%`}`
                              : null,
                            `${paper.questions.length} question${paper.questions.length === 1 ? "" : "s"}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {paper.gradeAwarded && <Badge>{paper.gradeAwarded}</Badge>}
                      {paper.gradeTarget && (
                        <span className="hidden text-xs text-muted sm:inline">→ {paper.gradeTarget}</span>
                      )}
                      {analysed && <Sparkles size={14} className="shrink-0 text-accent" />}
                      <ArrowRight size={14} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
