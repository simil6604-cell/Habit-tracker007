import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createTraining, createMatch, generateTrainingForWeaknesses } from "@/lib/football/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/football/profile-form";
import { TrainingList } from "@/components/football/training-list";
import { MatchList } from "@/components/football/match-list";
import { GoalsPanel } from "@/components/shared/goals-panel";
import { DrillLibraryPanel } from "@/components/football/drill-library-panel";
import { Sparkles } from "lucide-react";
import { DomainHero } from "@/components/layout/domain-hero";
import { POSITION_FOCUS, type FootballPosition } from "@/lib/data/football";

export default async function FootballPage() {
  const session = await auth();
  const userId = session!.user.id;

  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    include: { team: true, trainings: { orderBy: { date: "asc" } }, matches: { orderBy: { date: "asc" } } },
  });

  const goals = await prisma.goal.findMany({ where: { userId, category: "FOOTBALL" }, orderBy: { createdAt: "asc" } });

  const now = new Date();
  const upcomingTrainings = profile?.trainings.filter((t) => !t.date || t.date >= now) ?? [];
  const upcomingMatches = profile?.matches.filter((m) => m.date >= now) ?? [];

  const focusSkills = profile
    ? [...new Set([...(POSITION_FOCUS[profile.position as FootballPosition] ?? []), ...(profile.weaknesses?.split(",").filter(Boolean) ?? [])])]
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <DomainHero
        domain="football"
        emoji="⚽"
        title="Football"
        subtitle="Position-specific training, matches and team performance."
        actions={
          profile?.team && (
            <Link href="/football/team">
              <Button className="bg-white text-emerald-700 hover:opacity-90">Team & table</Button>
            </Link>
          )
        }
      />

      <Card className="mt-6">
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      {profile && (
        <>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Training</CardTitle>
              <form action={generateTrainingForWeaknesses}>
                <Button type="submit" size="sm" variant="outline"><Sparkles size={14} />Generate individual training</Button>
              </form>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form action={createTraining} className="flex flex-wrap gap-2">
                <input name="title" placeholder="Team Training" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
                <input name="date" type="datetime-local" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
                <input name="durationMin" type="number" defaultValue={60} className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
                <input name="focus" placeholder="Focus (e.g. Conditioning)" className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
                <Button type="submit" size="sm" variant="secondary">Add session</Button>
              </form>
              <TrainingList trainings={upcomingTrainings} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Drill Library</CardTitle></CardHeader>
            <CardContent>
              <DrillLibraryPanel focusSkills={focusSkills} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Matches</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form action={createMatch} className="flex flex-wrap items-center gap-2">
                <input name="opponent" required placeholder="Opponent" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
                <input name="date" type="datetime-local" required className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="isHome" defaultChecked /> Home</label>
                <Button type="submit" size="sm" variant="secondary">Add match</Button>
              </form>
              <MatchList matches={upcomingMatches} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle>Development Goals</CardTitle></CardHeader>
            <CardContent>
              <GoalsPanel goals={goals} category="FOOTBALL" path="/football" />
            </CardContent>
          </Card>
        </>
      )}

      {!profile && (
        <p className="mt-4 text-sm text-muted">Save your profile above to unlock training, matches and goals.</p>
      )}
    </div>
  );
}
