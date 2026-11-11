"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { EXPRESSIONS, type ExpressionId } from "@/lib/ai/expression";
import { updateAIExpression } from "@/lib/settings/actions";

/**
 * How much life the AI puts into it.
 *
 * One tap rather than a dropdown and a Save button: this is a thing someone
 * changes because of the mood they are in right now — flat out before a
 * test, quiet at eleven at night — and a setting that takes three actions
 * to change is a setting nobody changes twice.
 *
 * Saved immediately, with the choice shown straight away rather than after
 * the round trip: the server is the truth, but waiting half a second to see
 * whether a tap registered is what makes an app feel slow.
 */
export function ExpressionPicker({ current }: { current: string }) {
  const [chosen, setChosen] = useState<string>(current);
  const [pending, startTransition] = useTransition();

  function choose(id: ExpressionId) {
    if (id === chosen) return;
    const previous = chosen;
    setChosen(id);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("aiExpression", id);
        await updateAIExpression(form);
      } catch {
        // Put it back rather than showing a choice that was not saved.
        setChosen(previous);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="expression-picker">
      {EXPRESSIONS.map((style) => {
        const active = style.id === chosen;
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => choose(style.id)}
            disabled={pending}
            aria-pressed={active}
            data-testid={`expression-${style.id}`}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${
              active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/50"
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                active ? "border-accent bg-accent text-accent-foreground" : "border-border"
              }`}
            >
              {active && <Check size={11} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{style.label}</span>
              <span className="block text-xs text-muted">{style.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
