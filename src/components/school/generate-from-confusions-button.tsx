"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFlashcardsFromConfusions } from "@/lib/school/flashcard-actions";

/**
 * Reports what actually happened rather than silently doing nothing: this can
 * legitimately create no cards (nothing marked yet, no AI connected, or every
 * confusion already has one), and each of those needs saying out loud.
 */
export function GenerateFromConfusionsButton() {
  const [result, setResult] = useState<{ created: number; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await generateFlashcardsFromConfusions()))}
      >
        <Sparkles size={14} />
        {pending ? "Making cards…" : "From what I didn't understand"}
      </Button>
      {result && (
        <p className={`text-xs ${result.created > 0 ? "text-success" : "text-muted"}`}>{result.message}</p>
      )}
    </div>
  );
}
