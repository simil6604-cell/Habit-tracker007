"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { addStudyBlock, type PlannerFormState } from "@/lib/school/planner-actions";
import { MAX_TITLE_LENGTH } from "@/lib/school/planner-entry";

const FIELD = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

/**
 * Write your own study block.
 *
 * The planner only ever showed what the app had worked out for you, with an
 * "accept" button. There was nothing here to write in, so the one thing you
 * had already decided to do could not be put down anywhere — which makes a
 * planner something you read rather than something you use.
 *
 * The title field is an ordinary text input with no list attached, for the
 * same reason the habit field is: anything that looks like a fixed menu on a
 * phone reads as "these are your options".
 */
export function AddStudyBlockForm({
  days,
  subjects,
}: {
  /** The dates the planner is showing, as yyyy-mm-dd, earliest first. */
  days: { value: string; label: string }[];
  subjects: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<PlannerFormState, FormData>(addStudyBlock, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        // Clears the title but keeps date, time and subject: writing three
        // blocks for one evening is the normal case, and re-picking the day
        // each time is the kind of small friction that stops people using it.
        const title = formRef.current?.elements.namedItem("title");
        if (title instanceof HTMLInputElement) {
          title.value = "";
          title.focus();
        }
      }}
      className="flex flex-col gap-2"
      data-testid="add-study-block"
    >
      <div className="flex flex-wrap gap-2">
        <input
          name="title"
          required
          autoComplete="off"
          maxLength={MAX_TITLE_LENGTH}
          placeholder="What are you studying?"
          aria-label="What are you studying?"
          className={`min-w-0 flex-1 ${FIELD}`}
        />
        <select name="subjectId" aria-label="Subject (optional)" className={FIELD} defaultValue="">
          <option value="">No subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select name="date" aria-label="Day" className={FIELD} defaultValue={days[0]?.value}>
          {days.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <input name="time" type="time" required defaultValue="17:00" aria-label="Start time" className={FIELD} />
        <input
          name="minutes"
          type="number"
          required
          min={10}
          max={360}
          step={5}
          defaultValue={45}
          aria-label="Minutes"
          className={`w-24 ${FIELD}`}
        />
        <span className="text-xs text-muted">minutes</span>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add my block"}
        </Button>
      </div>

      {state?.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
      )}
    </form>
  );
}
