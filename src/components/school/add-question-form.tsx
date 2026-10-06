"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { addPaperQuestion, type PaperFormState } from "@/lib/school/marked-paper-actions";
import { MAX_ANSWER, MAX_EXAMINER_NOTE, MAX_QUESTION } from "@/lib/school/marked-paper";
import { Button } from "@/components/ui/button";

const FIELD = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/**
 * One question and what you wrote for it.
 *
 * Both halves are required, and that is the feature rather than a nuisance:
 * most marks lost at this level go to answering a different question from the
 * one asked, and nothing can see that from the answer alone.
 */
export function AddQuestionForm({ paperId }: { paperId: string }) {
  const [state, formAction, pending] = useActionState<PaperFormState, FormData>(addPaperQuestion, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<PaperFormState>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (!state.ok) return;
    formRef.current?.reset();
    const first = formRef.current?.elements.namedItem("prompt");
    if (first instanceof HTMLTextAreaElement) first.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3" data-testid="add-question">
      <input type="hidden" name="paperId" value={paperId} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">The question, as it was printed</span>
        <textarea
          name="prompt"
          required
          rows={2}
          maxLength={MAX_QUESTION}
          placeholder="Evaluate the likely impact of a minimum wage on unemployment. [12]"
          aria-label="The question"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">What you wrote</span>
        <textarea
          name="answer"
          required
          rows={4}
          maxLength={MAX_ANSWER}
          placeholder="As close to what you actually put down as you can remember."
          aria-label="What you wrote"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">What the marker said (optional)</span>
        <textarea
          name="examinerNote"
          rows={2}
          maxLength={MAX_EXAMINER_NOTE}
          placeholder="One side only — no evaluation."
          aria-label="Marker's comment"
          className={FIELD}
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Marks (optional)</span>
          <span className="flex items-center gap-1.5">
            <input name="marksScored" inputMode="numeric" placeholder="3" aria-label="Marks scored" className={`w-16 ${FIELD}`} />
            <span className="text-xs text-muted">of</span>
            <input name="marksTotal" inputMode="numeric" placeholder="12" aria-label="Marks available" className={`w-16 ${FIELD}`} />
          </span>
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="mb-0.5">
          <Plus size={14} /> {pending ? "Adding…" : "Add question"}
        </Button>
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
    </form>
  );
}
