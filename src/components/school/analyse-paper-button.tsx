"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { analyseMarkedPaper } from "@/lib/school/marked-paper-actions";
import { Button } from "@/components/ui/button";

/**
 * Ask the AI to read the paper.
 *
 * Says plainly what it will and will not do. It is not re-marking the paper —
 * the marker already did that, and second-guessing a grade is not something
 * this can honestly offer. It reads what the question asked against what the
 * answer took it to mean.
 */
export function AnalysePaperButton({
  paperId,
  questionCount,
  analysedAt,
}: {
  paperId: string;
  questionCount: number;
  analysedAt: Date | null;
}) {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await analyseMarkedPaper(paperId);
        if (result.ok) {
          setStatus({ ok: true, message: `Read ${result.questions} question${result.questions === 1 ? "" : "s"}.` });
          router.refresh();
        } else {
          setStatus({ ok: false, message: result.error });
        }
      } catch {
        setStatus({ ok: false, message: "That didn't get through — check your connection and try again." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        It does not re-mark the paper — your marker already did that. It reads what each question was asking against
        what your answer took it to mean, and says how to put it instead.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={run} disabled={isPending || questionCount === 0} data-testid="analyse-paper">
          <Sparkles size={14} />
          {isPending ? "Reading…" : analysedAt ? "Read it again" : "Analyse this paper"}
        </Button>
        {status && (
          <p role="status" className={`text-sm ${status.ok ? "text-success" : "text-danger"}`}>{status.message}</p>
        )}
        {!status && analysedAt && (
          <span className="text-xs text-muted">Last read {analysedAt.toLocaleDateString()}.</span>
        )}
      </div>
    </div>
  );
}
