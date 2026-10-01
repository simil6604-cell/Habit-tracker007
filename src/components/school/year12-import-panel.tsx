"use client";

import { useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { importYear12Timetable } from "@/lib/school/timetable-import-actions";
import { Button } from "@/components/ui/button";

/**
 * One tap for the week that is already known.
 *
 * The assumptions are printed next to the button rather than hidden behind it:
 * this overwrites Monday to Friday, and it resolves the option blocks to one
 * subject each. Both are things you would want to know *before* pressing it,
 * not after discovering your hand-typed grid is gone.
 */
export function Year12ImportPanel({ hasSlots }: { hasSlots: boolean }) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await importYear12Timetable();
        if (!result.ok) {
          setStatus({ ok: false, message: result.error });
          return;
        }
        const added = result.createdSubjects.length
          ? ` Added as subjects: ${result.createdSubjects.join(", ")}.`
          : "";
        setStatus({ ok: true, message: `Filled in ${result.slots} periods, Monday to Friday.${added}` });
      } catch {
        setStatus({ ok: false, message: "That didn't go through. Check your connection and press it again." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Your week, as it stands on the Year 12 sheet: <strong className="text-foreground">German</strong>,{" "}
        <strong className="text-foreground">English</strong>, <strong className="text-foreground">Economics</strong>{" "}
        and <strong className="text-foreground">EPQ</strong>, plus PE, PSHE, Community &amp; Integration,
        registrations, break and lunch, and the after-school clubs on Tuesday and Thursday.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>
          <strong className="text-foreground">Maths</strong> is left as free time. You take it with Year 11, which
          runs on a different sheet — those periods say so, so you can put the real times in.
        </li>
        <li>Periods where an option you don&apos;t take runs (Physics, History, Psychology) come in as free periods.</li>
        <li>
          It replaces Monday to Friday{hasSlots ? ", including what is in the grid now" : ""}. Pressing it twice
          changes nothing — you get the same week, not two copies.
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={run} disabled={isPending} data-testid="import-year12">
          <CalendarPlus size={14} /> {isPending ? "Filling in…" : "Fill in my Year 12 week"}
        </Button>
        {status ? (
          <p role="status" className={`text-sm ${status.ok ? "text-success" : "text-danger"}`}>
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
