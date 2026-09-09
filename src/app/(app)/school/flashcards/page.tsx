import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createFlashcard, deleteFlashcard, generateFlashcardsFromWeakTopics } from "@/lib/school/flashcard-actions";
import { reviewBucket } from "@/lib/school/srs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashcardReview } from "@/components/school/flashcard-review";
import { Trash2, Sparkles } from "lucide-react";

export default async function FlashcardsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [cards, subjects] = await Promise.all([
    prisma.flashcard.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
    prisma.subject.findMany({ where: { userId } }),
  ]);

  const due = cards.filter((c) => new Date(c.dueDate) <= new Date());
  const buckets = { NEEDS_REVIEW: 0, DUE_TODAY: 0, MASTERED: 0 };
  for (const c of cards) buckets[reviewBucket(c.dueDate, c.interval)]++;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
      <p className="mt-1 text-muted">Spaced repetition keeps what you&apos;ve learned from fading.</p>

      <div className="mt-4 flex gap-2">
        <Badge variant="danger">🔴 Need review: {buckets.NEEDS_REVIEW}</Badge>
        <Badge variant="warning">🟡 Due today: {buckets.DUE_TODAY}</Badge>
        <Badge variant="success">🟢 Mastered: {buckets.MASTERED}</Badge>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardContent>
          <FlashcardReview cards={due.map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic }))} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>All cards</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <form action={createFlashcard} className="flex flex-1 flex-wrap gap-2">
              <input name="front" required placeholder="Question / front" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input name="back" required placeholder="Answer / back" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <select name="subjectId" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm">
                <option value="">Subject…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="secondary">Add card</Button>
            </form>
            <form action={generateFlashcardsFromWeakTopics}>
              <Button type="submit" size="sm" variant="outline"><Sparkles size={14} />Generate from weak topics</Button>
            </form>
          </div>

          <ul className="flex flex-col divide-y divide-border">
            {cards.length === 0 && <p className="py-2 text-sm text-muted">No flashcards yet.</p>}
            {cards.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{c.front}</p>
                  <p className="text-xs text-muted">{c.topic ?? "General"}</p>
                </div>
                <form action={deleteFlashcard.bind(null, c.id)}>
                  <button type="submit" className="text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
