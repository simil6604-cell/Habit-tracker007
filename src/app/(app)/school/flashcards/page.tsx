import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createFlashcard, deleteFlashcard, generateFlashcardsFromWeakTopics } from "@/lib/school/flashcard-actions";
import { reviewBucket } from "@/lib/school/srs";
import { detectProvider, flashcardDecks } from "@/lib/school/revision-links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashcardReview } from "@/components/school/flashcard-review";
import { GenerateFromConfusionsButton } from "@/components/school/generate-from-confusions-button";
import { Trash2, Sparkles, Layers, ExternalLink } from "lucide-react";

export default async function FlashcardsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [cards, subjects, revisionLinks] = await Promise.all([
    prisma.flashcard.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
    prisma.subject.findMany({ where: { userId } }),
    // Newest first, because bestLink takes the first match within a tier.
    prisma.revisionLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, url: true, kind: true, subjectId: true, topicId: true },
    }),
  ]);

  const decks = flashcardDecks(revisionLinks);

  const due = cards.filter((c) => new Date(c.dueDate) <= new Date());
  const buckets = { NEEDS_REVIEW: 0, DUE_TODAY: 0, MASTERED: 0 };
  for (const c of cards) buckets[reviewBucket(c.dueDate, c.interval)]++;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
      <p className="mt-1 text-muted">
        Spaced repetition keeps what you&apos;ve learned from fading. Cards can come from your weakest topics, or
        straight from the questions you marked &ldquo;I didn&apos;t get this&rdquo; in a topic&apos;s tutor chat.
      </p>

      <div className="mt-4 flex gap-2">
        <Badge variant="danger">🔴 Need review: {buckets.NEEDS_REVIEW}</Badge>
        <Badge variant="warning">🟡 Due today: {buckets.DUE_TODAY}</Badge>
        <Badge variant="success">🟢 Mastered: {buckets.MASTERED}</Badge>
      </div>

      {/*
        The decks you keep elsewhere, on the page about flashcards — because
        this is where you come when you want to test yourself, and having to
        remember that your real deck lives on another site is the friction
        that stops you doing it.
      */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Your saved decks</CardTitle>
        </CardHeader>
        <CardContent>
          {decks.length === 0 ? (
            <p className="text-sm text-muted">
              No deck saved yet. Open the deck in your own account, copy the address, and paste it under{" "}
              <Link href="/school#revision-sources" className="underline">
                Where you revise from
              </Link>{" "}
              — it then opens from here, from the tutor, and from the subject itself.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" data-testid="carousel-decks">
              {decks.map((deck) => (
                <li key={deck.id}>
                  <a
                    href={deck.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-accent"
                  >
                    <Layers size={14} className="text-muted" />
                    {deck.title}
                    <span className="font-normal text-muted">{detectProvider(deck.url) ?? ""}</span>
                    <ExternalLink size={12} className="text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
              <Button type="submit" size="sm" variant="outline"><Sparkles size={14} />From weak topics</Button>
            </form>
            <GenerateFromConfusionsButton />
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
