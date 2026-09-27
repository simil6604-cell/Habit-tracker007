import Link from "next/link";
import { notFound } from "next/navigation";
import { format, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { daysUntil, daysUntilLabel } from "@/lib/planner/days-until";
import { planProgress, readinessSeries } from "@/lib/school/exam-plan";
import { archiveExamPlan } from "@/lib/school/exam-plan-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExamPlanDays } from "@/components/school/exam-plan-days";
import { ReadinessCheckIn } from "@/components/school/readiness-check-in";
import { ReadinessChart } from "@/components/charts/readiness-chart";
import { ProgressRing } from "@/components/school/progress-ring";

export default async function ExamPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const plan = await prisma.examPlan.findFirst({
    where: { id, userId },
    include: {
      days: { orderBy: { date: "asc" } },
      checkIns: { orderBy: { date: "asc" } },
    },
  });
  // Someone else's plan is not a plan you have — same answer as one that
  // never existed, so the id gives nothing away.
  if (!plan) notFound();

  const today = startOfDay(new Date());
  const progress = planProgress(plan.days, today);
  const left = daysUntil(plan.examDate, today);

  const checkInMap = new Map(plan.checkIns.map((c) => [format(c.date, "yyyy-MM-dd"), c.readiness]));
  const doneMap = new Map(plan.days.map((d) => [format(d.date, "yyyy-MM-dd"), d.done]));
  const series = readinessSeries(
    plan.days.map((d) => d.date),
    checkInMap,
    doneMap
  );
  const todayReading = checkInMap.get(format(today, "yyyy-MM-dd")) ?? null;
  const latest = [...plan.checkIns].reverse()[0] ?? null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Exam plan</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}</h1>
          <p className="mt-1 text-muted">
            {format(plan.examDate, "EEEE d MMMM")} — {daysUntilLabel(plan.examDate, today)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/school"><Button variant="outline" size="sm">Back to School</Button></Link>
          {!plan.archivedAt && (
            <form action={archiveExamPlan.bind(null, plan.id)}>
              <Button type="submit" variant="outline" size="sm">Archive</Button>
            </form>
          )}
        </div>
      </div>

      {plan.brief && (
        <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
          Built around what you said: &ldquo;{plan.brief}&rdquo;
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 pt-5 sm:flex-row sm:items-center">
          <ProgressRing
            pct={progress.pct}
            value={`${progress.pct}%`}
            label="of the plan done"
            size={116}
            stroke={9}
          />
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <strong>{progress.done}</strong> of {progress.total} days done
              </span>
              {progress.missed > 0 && (
                <span className="text-danger">
                  <strong>{progress.missed}</strong> missed
                </span>
              )}
              <span>
                <strong>{left}</strong> day{left === 1 ? "" : "s"} to go
              </span>
              {latest && (
                <span className="text-muted">
                  Last rated <strong className="text-foreground">{latest.readiness}/5</strong> on{" "}
                  {format(latest.date, "d MMM")}
                </span>
              )}
            </div>
            <ReadinessCheckIn planId={plan.id} current={todayReading} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>How ready it has felt</CardTitle></CardHeader>
        <CardContent>
          <ReadinessChart data={series.map((p) => ({ label: p.label, readiness: p.readiness }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>The run-up</CardTitle></CardHeader>
        <CardContent>
          {plan.days.length === 0 ? (
            <p className="text-sm text-muted">This plan has no days in it.</p>
          ) : (
            <ExamPlanDays planId={plan.id} days={plan.days} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
