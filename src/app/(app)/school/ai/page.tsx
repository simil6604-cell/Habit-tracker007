import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getSchoolAIMessages } from "@/lib/school/school-ai-actions";
import { getPlannableExams } from "@/lib/school/exam-plan-actions";
import { ExamPlanBuilder } from "@/components/school/exam-plan-builder";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { SchoolAIPanel } from "@/components/school/school-ai-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isRealAIConfigured } from "@/lib/ai/provider";

export const metadata = { title: "School AI" };

export default async function SchoolAIPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [messages, exams, livePlans] = await Promise.all([
    getSchoolAIMessages(),
    getPlannableExams(),
    prisma.examPlan.findMany({
      where: { userId, archivedAt: null },
      orderBy: { examDate: "asc" },
      take: 4,
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCap className="text-accent" /> School AI
          </h1>
          <p className="mt-1 text-muted">
            Your own tutor for Cambridge IGCSE and A Level — school only, nothing else. Talk to it, or photograph a
            question and ask.
          </p>
        </div>
        <Link href="/school">
          <Button variant="outline" size="sm">Back to School</Button>
        </Link>
      </div>

      {!isRealAIConfigured && (
        <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
          No AI service is connected yet, so this page can&apos;t answer you. Set <code>ANTHROPIC_API_KEY</code> where
          your app&apos;s environment variables are set, then check it under <Link href="/settings" className="underline">Settings</Link>.
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">Too much to do before an exam?</p>
        <p className="text-xs text-muted">
          Say so in the chat and it will talk it through with you — or build the whole run-up here: every day from now
          to the paper, and a daily reading of how ready it feels.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ExamPlanBuilder exams={exams} />
          {livePlans.map((plan) => (
            <Link key={plan.id} href={`/school/plan/${plan.id}`}>
              <Button variant="outline" size="sm">📋 {plan.title}</Button>
            </Link>
          ))}
        </div>
      </div>

      <Card className="flex h-[70vh] min-h-[520px] flex-col">
        <CardHeader>
          <CardTitle>Ask your school AI</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden">
          <SchoolAIPanel initialMessages={messages} />
        </CardContent>
      </Card>
    </div>
  );
}
