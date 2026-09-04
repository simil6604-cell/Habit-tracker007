"use client";

import { useState, useTransition } from "react";
import { reviewFlashcard } from "@/lib/school/flashcard-actions";
import { Button } from "@/components/ui/button";

type Card = { id: string; front: string; back: string; topic: string | null };

export function FlashcardReview({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (cards.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Nothing due right now. Great job staying on top of reviews 🎉</p>;
  }

  const card = cards[Math.min(index, cards.length - 1)];

  function next(result: Parameters<typeof reviewFlashcard>[1]) {
    startTransition(() => reviewFlashcard(card.id, result));
    setRevealed(false);
    setIndex((i) => Math.min(i + 1, cards.length - 1));
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted">{Math.min(index + 1, cards.length)} / {cards.length} due</p>
      <button
        onClick={() => setRevealed((r) => !r)}
        className="flex min-h-[160px] w-full max-w-md flex-col items-center justify-center rounded-2xl border border-border bg-surface-muted p-6 text-center transition hover:shadow-md"
      >
        {card.topic && <span className="mb-2 text-xs text-muted">{card.topic}</span>}
        <p className="text-lg font-medium">{revealed ? card.back : card.front}</p>
        {!revealed && <p className="mt-3 text-xs text-muted">Tap to reveal answer</p>}
      </button>

      {revealed && (
        <div className="grid w-full max-w-md grid-cols-4 gap-2">
          <Button variant="danger" size="sm" disabled={pending} onClick={() => next("AGAIN")}>Again</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => next("HARD")}>Hard</Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => next("GOOD")}>Good</Button>
          <Button variant="primary" size="sm" disabled={pending} onClick={() => next("EASY")}>Easy</Button>
        </div>
      )}
    </div>
  );
}
