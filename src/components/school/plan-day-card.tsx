import { format } from "date-fns";
import { commitDayPlan } from "@/lib/ai/plan-actions";
import type { DayPlanResult } from "@/lib/ai/schedule-generator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PlanDayCard({ date, plan }: { date: Date; plan: DayPlanResult }) {
  const studyBlocks = plan.blocks.filter((b) => b.category === "STUDY");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{format(date, "EEEE, MMM d")}</CardTitle>
        {plan.overloaded && <Badge variant="danger">⚠️ Too demanding</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plan.reasons.length > 0 && (
          <ul className="rounded-lg bg-surface-muted p-3 text-xs text-muted">
            {plan.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        )}

        {studyBlocks.length === 0 ? (
          <p className="text-sm text-muted">No focused study needed — no upcoming exam topics under 85% right now.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {plan.blocks.map((b, i) => (
              <li key={i} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={b.category === "RECOVERY" ? "text-muted" : "font-medium"}>
                    {format(b.start, "HH:mm")}–{format(b.end, "HH:mm")} {b.label}
                  </span>
                </div>
                {b.category === "STUDY" && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-xs text-accent">Why?</summary>
                    <p className="mt-1 text-xs text-muted">{b.reason}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        {studyBlocks.length > 0 && (
          <form action={commitDayPlan.bind(null, date.toISOString())}>
            <Button type="submit" size="sm" variant="secondary">Accept & add to calendar</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
