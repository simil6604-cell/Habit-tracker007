"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { createSchoolHabit } from "@/lib/school/habit-actions";
import { HABIT_SUGGESTIONS } from "@/lib/data/school-habits";

/**
 * Add a habit, in your own words.
 *
 * This used to be a `<datalist>` on the text field. On a phone that puts the
 * suggestion list straight over the input as soon as you focus it, so typing
 * your own habit looks impossible — the field appears to offer a fixed menu
 * and nothing else. It was never a menu; it just looked like one, which for a
 * box whose whole point is "write whatever you want" is the same thing.
 *
 * So the field is now an ordinary text input with nothing attached to it, and
 * the suggestions sit underneath as buttons. They are more visible there than
 * they ever were in a dropdown, and they cannot get in the way of typing.
 */
export function AddHabitForm() {
  const nameRef = useRef<HTMLInputElement>(null);

  function applySuggestion(text: string) {
    const field = nameRef.current;
    if (!field) return;
    field.value = text;
    field.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={createSchoolHabit} className="flex flex-wrap gap-2">
        <input
          name="emoji"
          placeholder="📘"
          maxLength={4}
          aria-label="Emoji (optional)"
          className="w-16 rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm"
        />
        <input
          ref={nameRef}
          name="name"
          required
          autoComplete="off"
          placeholder="Write your own…"
          aria-label="Habit"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <Button type="submit" size="sm" variant="secondary">
          Add habit
        </Button>
      </form>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted">Or start from one of these — you can edit it before adding:</p>
        <div className="flex flex-wrap gap-1.5" data-testid="habit-suggestions">
          {HABIT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => applySuggestion(suggestion)}
              className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted transition hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        Fully your own — type anything worth tracking daily for school. Nothing here is preset or graded for you.
      </p>
    </div>
  );
}
