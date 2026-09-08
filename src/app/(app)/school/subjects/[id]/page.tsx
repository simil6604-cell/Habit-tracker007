import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { addTopic, deleteSubject, toggleExamSubject } from "@/lib/school/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopicsTable } from "@/components/school/topics-table";
import { SubjectWeaknesses } from "@/components/school/subject-weaknesses";

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const subject = await prisma.subject.findFirst({
    where: { id, userId },
    include: { topics: { orderBy: { name: "asc" } } },
  });
  if (!subject) notFound();

  const avgProgress = subject.topics.length
    ? Math.round(subject.topics.reduce((a, t) => a + t.progressPct, 0) / subject.topics.length)
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: subject.color }} />
          <h1 className="text-2xl font-semibold tracking-tight">{subject.name}</h1>
          {subject.isExamSubject && <Badge variant="warning">Exam subject</Badge>}
        </div>
        <div className="flex gap-2">
          <Link href={`/school/subjects/${subject.id}/quiz`}>
            <Button variant="secondary" size="sm">🧠 Quiz</Button>
          </Link>
          <form action={toggleExamSubject.bind(null, subject.id)}>
            <Button type="submit" variant="outline" size="sm">
              {subject.isExamSubject ? "Unmark exam subject" : "Mark as exam subject"}
            </Button>
          </form>
          <form action={deleteSubject.bind(null, subject.id)}>
            <Button type="submit" variant="outline" size="sm">Delete subject</Button>
          </form>
        </div>
      </div>
      {(subject.teacher || subject.room) && (
        <p className="mt-1 text-sm text-muted">
          {subject.teacher} {subject.room ? `· Room ${subject.room}` : ""}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>AI Learning Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <SubjectWeaknesses subjectId={subject.id} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Overall Progress</CardTitle>
          <span className="text-lg font-semibold">{avgProgress}%</span>
        </CardHeader>
        <CardContent>
          <ProgressBar value={avgProgress} size="lg" colorClassName="bg-cat-school" />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Topics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TopicsTable subjectId={subject.id} topics={subject.topics} />

          <form action={addTopic} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">Topic name</label>
              <input name="name" required placeholder="e.g. Algebra" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Priority</label>
              <select name="priority" defaultValue="MEDIUM" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Exam relevance</label>
              <select name="examRelevance" defaultValue="MEDIUM" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <Button type="submit" size="sm" variant="secondary">Add topic</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
