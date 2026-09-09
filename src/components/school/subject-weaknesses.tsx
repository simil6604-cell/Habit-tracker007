"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getSubjectWeaknesses } from "@/lib/school/learning-actions";

export function SubjectWeaknesses({ subjectId }: { subjectId: string }) {
  const [response, setResponse] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setResponse(await getSubjectWeaknesses(subjectId)))}
      >
        Show my weaknesses
      </Button>
      {response && <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-muted p-3 text-sm">{response}</p>}
    </div>
  );
}
