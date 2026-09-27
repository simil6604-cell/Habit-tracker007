"use client";

import { useState, useTransition } from "react";
import { recordReadiness } from "@/lib/school/exam-plan-actions";
import { cn } from "@/lib/utils";

const SCALE = [
  { value: 1, label: "Lost" },
  { value: 2, label: "Shaky" },
  { value: 3, label: "Could pass" },
  { value: 4, label: "Solid" },
  { value: 5, label: "Ready" },
];

/**
 * Today's reading, in five words rather than a percentage.
 *
 * A 0-100 slider asks you to invent precision you don't have, and the number
 * you invent is different every evening. Five named steps you can pick
 * honestly in two seconds is what makes the line worth reading later.
 */
export function ReadinessCheckIn({ planId, current }: { planId: string; current: number | null }) {
  const [value, setValue] = useState<number | null>(current);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2" data-testid="readiness-check-in">
      <div className="flex flex-wrap gap-1.5">
        {SCALE.map((step) => (
          <button
            key={step.value}
            type="button"
            disabled={pending}
            onClick={() => {
              setValue(step.value);
              startTransition(async () => recordReadiness(planId, step.value));
            }}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs transition",
              value === step.value
                ? "border-cat-school bg-cat-school text-white"
                : "border-border text-muted hover:text-foreground"
            )}
          >
            <span className="font-semibold">{step.value}</span> · {step.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {value === null
          ? "How ready does this exam feel right now?"
          : "Saved for today. Rate it again any time — today's reading is replaced, not stacked."}
      </p>
    </div>
  );
}
