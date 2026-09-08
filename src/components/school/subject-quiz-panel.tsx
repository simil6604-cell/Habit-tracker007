"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashcardReview } from "@/components/school/flashcard-review";
import { SubjectExamQuiz } from "@/components/school/subject-exam-quiz";

type FlashcardData = { id: string; front: string; back: string; topic: string | null };

export function SubjectQuizPanel({
  subjectId,
  subjectName,
  dueCards,
  allCards,
  hasTopics,
}: {
  subjectId: string;
  subjectName: string;
  dueCards: FlashcardData[];
  allCards: FlashcardData[];
  hasTopics: boolean;
}) {
  const [mode, setMode] = useState<"due" | "all">(dueCards.length > 0 ? "due" : "all");

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Flashcard practice</CardTitle>
          {allCards.length > 0 && (
            <div className="flex gap-1 rounded-lg bg-surface-muted p-1 text-xs">
              <button
                onClick={() => setMode("due")}
                className={`rounded-md px-2 py-1 ${mode === "due" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
              >
                Due ({dueCards.length})
              </button>
              <button
                onClick={() => setMode("all")}
                className={`rounded-md px-2 py-1 ${mode === "all" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
              >
                All ({allCards.length})
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {allCards.length === 0 ? (
            <p className="text-sm text-muted">
              No flashcards for {subjectName} yet — add some on the{" "}
              <Link href="/school/flashcards" className="text-accent">Flashcards</Link> page.
            </p>
          ) : (
            <FlashcardReview key={mode} cards={mode === "due" ? dueCards : allCards} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exam quiz</CardTitle>
        </CardHeader>
        <CardContent>
          {hasTopics ? (
            <SubjectExamQuiz subjectId={subjectId} />
          ) : (
            <p className="text-sm text-muted">Add some topics to {subjectName} first so the quiz has something to cover.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
