import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { SubjectQuizPanel } from "@/components/school/subject-quiz-panel";

export default async function SubjectQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const subject = await prisma.subject.findFirst({
    where: { id, userId },
    include: { topics: true },
  });
  if (!subject) notFound();

  const cards = await prisma.flashcard.findMany({
    where: { userId, subjectId: subject.id },
    orderBy: { dueDate: "asc" },
  });
  const now = new Date();
  const dueCards = cards.filter((c) => c.dueDate <= now);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🧠 {subject.name} Quiz</h1>
          <p className="mt-1 text-muted">Flashcard practice and an exam-style quiz for this subject.</p>
        </div>
        <Link href={`/school/subjects/${subject.id}`}>
          <Button variant="outline">Back to {subject.name}</Button>
        </Link>
      </div>

      <SubjectQuizPanel
        subjectId={subject.id}
        subjectName={subject.name}
        dueCards={dueCards.map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic }))}
        allCards={cards.map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic }))}
        hasTopics={subject.topics.length > 0}
      />
    </div>
  );
}
