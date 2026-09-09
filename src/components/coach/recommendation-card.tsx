"use client";

import { useTransition } from "react";
import Link from "next/link";
import { respondToRecommendation } from "@/lib/ai/coach-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Recommendation = {
  id: string;
  type: string;
  title: string;
  message: string;
  reasoning: string;
  status: string;
};

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [pending, startTransition] = useTransition();
  let reasons: string[] = [];
  try {
    reasons = JSON.parse(rec.reasoning);
  } catch {}

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{rec.title}</p>
        {rec.status !== "PENDING" && <Badge variant={rec.status === "ACCEPTED" ? "success" : "default"}>{rec.status}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">{rec.message}</p>

      {reasons.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-accent">Why?</summary>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
            {reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </details>
      )}

      {rec.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => respondToRecommendation(rec.id, "ACCEPTED"))}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => respondToRecommendation(rec.id, "DECLINED"))}
          >
            Decline
          </Button>
          <Link href="/school/planner">
            <Button size="sm" variant="ghost">Edit plan</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
