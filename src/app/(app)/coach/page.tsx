import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCoachMessages, triggerWeeklyOptimization } from "@/lib/ai/coach-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VoiceChatPanel } from "@/components/coach/voice-chat-panel";
import { RecommendationCard } from "@/components/coach/recommendation-card";
import { AutoOptimize } from "@/components/coach/auto-optimize";
import { Sparkles } from "lucide-react";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const [messages, recommendations] = await Promise.all([
    getCoachMessages(),
    prisma.aIRecommendation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <AutoOptimize shouldRun={intent === "optimize-week"} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="text-accent" /> AI Coach
          </h1>
          <p className="mt-1 text-muted">Speak or type. Balances school, gym, football and recovery using your real data, and draws a picture when that explains it better.</p>
        </div>
        <form action={triggerWeeklyOptimization}>
          <Button type="submit" variant="outline" size="sm">Re-check my week</Button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex h-[600px] flex-col lg:col-span-2">
          <CardHeader>
            <CardTitle>Talk to your coach</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden">
            <VoiceChatPanel initialMessages={messages} />
          </CardContent>
        </Card>

        <Card className="flex h-[600px] flex-col">
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted">No recommendations yet — click &quot;Re-check my week&quot; to analyze your schedule.</p>
            ) : (
              recommendations.map((r) => <RecommendationCard key={r.id} rec={r} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
