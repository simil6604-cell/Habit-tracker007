"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveExamPlan, deleteExamPlan } from "@/lib/school/exam-plan-actions";
import { clientFailureMessage } from "@/lib/utils/action-error";

/**
 * What you can do to a whole plan: put it away, or get rid of it.
 *
 * Both, because they are not the same thing and the page only offered one.
 * Archiving keeps the record — the days ticked off are work that was
 * actually done — and deleting is for a plan that should never have
 * existed, built for the wrong exam or in the wrong language. Having only
 * Archive meant a wrong plan sat in the database for ever, which is what
 * "ich kann hier nichts löschen" was about.
 *
 * Delete asks twice, like every other delete in this app, and there is no
 * undo behind it.
 */
export function ExamPlanActionsBar({ planId, archived }: { planId: string; archived: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ error?: string }>, done: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await work();
        if (result.error) setError(result.error);
        else done();
      } catch {
        // Never let it reach the error boundary: that replaces the whole
        // plan page with "This page didn't load".
        setError(clientFailureMessage("That change"));
      }
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="archive-plan"
            onClick={() => run(() => archiveExamPlan(planId), () => router.push("/school"))}
          >
            <Archive size={14} /> Archive
          </Button>
        )}
        {armed ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              data-testid="confirm-delete-plan"
              className="border-danger/50 text-danger"
              onClick={() => run(() => deleteExamPlan(planId), () => router.push("/school"))}
            >
              Delete it all?
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setArmed(false)}>
              No
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="delete-plan"
            onClick={() => setArmed(true)}
          >
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>
      {armed && !error && (
        <p className="text-xs text-muted">
          Deleting removes the plan, its days and your readings. Archive keeps all of it.
        </p>
      )}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
