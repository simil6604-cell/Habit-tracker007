import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ExamPlanBuilder } from "@/components/school/exam-plan-builder";
import { SchoolAIPanel } from "@/components/school/school-ai-panel";
import { StuckLinks } from "@/components/school/stuck-links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isRealAIConfigured } from "@/lib/ai/provider";
import type { SchoolAISectionData } from "@/lib/school/school-ai-section";

/**
 * The school tutor, on the school page.
 *
 * It had its own row in the sidebar and its own page, which read as a separate
 * destination — you went to School, or you went to the AI. It is not a separate
 * thing: it is the part of School you ask. So it sits here, directly under the
 * hero, and `/school/ai` now redirects to this anchor rather than rendering a
 * second copy that could drift from this one.
 */
export function SchoolAISection({ data }: { data: SchoolAISectionData }) {
  return (
    <section id="school-ai" className="mt-6 scroll-mt-20">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2" data-testid="school-ai-section-title">
            <GraduationCap className="text-accent" /> Your school AI
          </CardTitle>
          <p className="text-xs text-muted">Cambridge IGCSE and A Level — school only</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isRealAIConfigured && (
            <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
              No AI service is connected yet, so this can&apos;t answer you. Set <code>ANTHROPIC_API_KEY</code> where
              your app&apos;s environment variables are set, then check it under{" "}
              <Link href="/settings" className="underline">Settings</Link>.
            </p>
          )}

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-4">
            <p className="text-sm font-medium">Too much to do before an exam?</p>
            <p className="text-xs text-muted">
              Say so in the chat and it will talk it through with you — or build the whole run-up here: every day from
              now to the paper, and a daily reading of how ready it feels.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ExamPlanBuilder exams={data.exams} />
              {data.livePlans.map((plan) => (
                <Link key={plan.id} href={`/school/plan/${plan.id}`}>
                  <Button variant="outline" size="sm">📋 {plan.title}</Button>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex h-[60vh] min-h-[440px] flex-col overflow-hidden">
            <SchoolAIPanel initialMessages={data.messages} />
          </div>

          {/*
            Directly under the chat, because this is where "I still don't get
            it" happens. The app renders these from the saved URL rather than
            asking the model to type one into its answer — a link is either
            exactly right or useless.
          */}
          <StuckLinks links={data.links} className="border-t border-border pt-3" />
        </CardContent>
      </Card>
    </section>
  );
}
