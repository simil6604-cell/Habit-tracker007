"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addMarkedPaper, type PaperFormState } from "@/lib/school/marked-paper-actions";
import { MAX_GRADE, MAX_PAPER_TITLE } from "@/lib/school/marked-paper";
import { Button } from "@/components/ui/button";

const FIELD = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/**
 * Starting a paper: what it was, what it came back as, what you want.
 *
 * The grade boxes take whatever your marker wrote — A*, 5.5, 62%. Offering a
 * fixed list would be wrong for most papers in a school that marks in more
 * than one scale, and would quietly turn "the grade I got" into "the nearest
 * grade this app knows about".
 */
export function AddPaperForm({ subjects }: { subjects: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<PaperFormState, FormData>(addMarkedPaper, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const handled = useRef<PaperFormState>(null);

  // Once per save. Keyed on the state object, which is new for every submit —
  // the same mistake caught in the league-links panel, where an effect that
  // also ran on an unrelated re-render emptied a field that had just been
  // filled.
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (!state.ok || !state.id) return;
    formRef.current?.reset();
    // Straight into the paper: the next thing to do is always add a question,
    // and it lives on the other page.
    router.push(`/school/grades/${state.id}`);
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3" data-testid="add-paper">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">What was it?</span>
        <input
          name="title"
          required
          maxLength={MAX_PAPER_TITLE}
          placeholder="Economics Paper 1 mock"
          aria-label="Paper name"
          className={FIELD}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Subject</span>
          <select name="subjectId" aria-label="Subject" className={FIELD} defaultValue="">
            <option value="">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">When you sat it</span>
          <input name="satOn" type="date" aria-label="Date sat" className={FIELD} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Grade you got</span>
          <input name="gradeAwarded" maxLength={MAX_GRADE} placeholder="C" aria-label="Grade awarded" className={`w-24 ${FIELD}`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Grade you want</span>
          <input name="gradeTarget" maxLength={MAX_GRADE} placeholder="A" aria-label="Grade wanted" className={`w-24 ${FIELD}`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Marks (optional)</span>
          <span className="flex items-center gap-1.5">
            <input name="marksScored" inputMode="numeric" placeholder="32" aria-label="Marks scored" className={`w-16 ${FIELD}`} />
            <span className="text-xs text-muted">of</span>
            <input name="marksTotal" inputMode="numeric" placeholder="60" aria-label="Marks available" className={`w-16 ${FIELD}`} />
          </span>
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={pending} className="mb-0.5">
          <Plus size={14} /> {pending ? "Adding…" : "Add paper"}
        </Button>
      </div>

      <p className="text-xs text-muted">
        Any scale your marker used — A*, 5.5, 62%. Nothing is converted into anything else.
      </p>

      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
    </form>
  );
}
