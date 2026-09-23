import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getSchoolAIMessages } from "@/lib/school/school-ai-actions";
import { SchoolAIPanel } from "@/components/school/school-ai-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isRealAIConfigured } from "@/lib/ai/provider";

export const metadata = { title: "School AI" };

export default async function SchoolAIPage() {
  const messages = await getSchoolAIMessages();

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
