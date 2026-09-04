import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { computeDomainScores } from "@/lib/planner/scores";
import { getAgendaForDay } from "@/lib/planner/agenda";
import { DomainCard } from "@/components/home/domain-card";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRow } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, scores, today, tomorrow, pendingRecs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    computeDomainScores(userId),
    getAgendaForDay(userId, new Date()),
    getAgendaForDay(userId, new Date(Date.now() + 86400000)),
    prisma.aIRecommendation.count({ where: { userId, status: "PENDING" } }),
  ]);

  const schoolToday = today.filter((i) => i.category === "SCHOOL" || i.category === "EXAM");
  const gymToday = today.find((i) => i.category === "GYM");
  const footballToday = today.find((i) => i.category === "FOOTBALL");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.name ?? "there"} 👋
          </h1>
          <p className="mt-1 text-muted">What do you want to optimize today?</p>
        </div>
        {pendingRecs > 0 && (
          <Link href="/coach">
            <Badge variant="accent" className="px-3 py-1.5 text-sm">
              <Sparkles size={14} /> {pendingRecs} new AI recommendation{pendingRecs > 1 ? "s" : ""}
            </Badge>
          </Link>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row">
        <DomainCard
          href="/school"
          domain="school"
          emoji="🎓"
          title="School"
          stats={[
            `${schoolToday.length} item${schoolToday.length === 1 ? "" : "s"} today`,
            tomorrow.some((i) => i.category === "EXAM") ? "Exam coming up tomorrow" : "No exam tomorrow",
          ]}
        />
        <DomainCard
          href="/gym"
          domain="gym"
          emoji="🏋️"
          title="Gym"
          stats={gymToday ? [gymToday.title, gymToday.time ?? ""] : ["No workout scheduled today"]}
        />
        <DomainCard
          href="/football"
          domain="football"
          emoji="⚽"
          title="Football"
          stats={footballToday ? [footballToday.title, footballToday.time ?? ""] : ["No training scheduled today"]}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Today&apos;s Optimization</h2>
              <span className="text-2xl font-semibold tabular-nums">{scores.overall}%</span>
            </div>
            <div className="flex flex-col gap-2.5">
              <ScoreRow label="School" value={scores.school} colorClassName="bg-cat-school" />
              <ScoreRow label="Gym" value={scores.gym} colorClassName="bg-cat-gym" />
              <ScoreRow label="Football" value={scores.football} colorClassName="bg-cat-football" />
              <ScoreRow label="Recovery" value={scores.recovery} colorClassName="bg-cat-recovery" />
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles size={16} className="text-accent" /> AI Coach
            </div>
            <p className="flex-1 text-sm text-muted">
              Let the AI Coach analyze school, gym, football and recovery together and build one balanced weekly plan.
            </p>
            <Link href="/coach?intent=optimize-week">
              <Button className="w-full">Optimize my entire week</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
