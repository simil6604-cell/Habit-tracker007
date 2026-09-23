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
import { getSavedDrillVideos } from "@/lib/football/drill-video-actions";
import { Sparkles } from "lucide-react";
import { DomainHero } from "@/components/layout/domain-hero";
import { POSITION_FOCUS, type FootballPosition } from "@/lib/data/football";
import { DomainTasksPanel } from "@/components/tasks/domain-tasks-panel";
import { StandingsSyncPanel } from "@/components/football/standings-sync-panel";
import { LeagueSnapshot } from "@/components/football/league-snapshot";
import { UpcomingOpponentsCard } from "@/components/football/upcoming-opponents-card";
import { analyzeTable } from "@/lib/football/table-analysis";
import { previewOpponents } from "@/lib/football/opponents";
import { WeekView } from "@/components/calendar/week-view";
import { getCalendarItems } from "@/lib/calendar/items";
import { addDays, startOfDay } from "date-fns";

export default async function FootballPage() {
  const session = await auth();
  const userId = session!.user.id;

  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    include: {
      team: { include: { standings: { orderBy: { rank: "asc" } } } },
      trainings: { orderBy: { date: "asc" } },
      matches: { orderBy: { date: "asc" } },
    },
  });

  const goals = await prisma.goal.findMany({ where: { userId, category: "FOOTBALL" }, orderBy: { createdAt: "asc" } });

  const now = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));
  const [footballTasks, weekItems, savedDrillVideos] = await Promise.all([
    prisma.task.findMany({
      where: { userId, category: "FOOTBALL" },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),
    getCalendarItems(userId, weekDays[0], addDays(weekDays[6], 1)),
    getSavedDrillVideos(),
  ]);
  const footballWeekItems = weekItems.filter((i) => i.category === "FOOTBALL");

  const upcomingTrainings = profile?.trainings.filter((t) => !t.date || t.date >= now) ?? [];
  const upcomingMatches = profile?.matches.filter((m) => m.date >= now) ?? [];

  const standings = profile?.team?.standings ?? [];
  const weaknesses = profile?.weaknesses?.split(",").filter(Boolean) ?? [];
  const analysis = profile?.team ? analyzeTable(standings, profile.team.name, weaknesses) : null;
  const opponents = profile?.team ? previewOpponents(upcomingMatches, standings, profile.team.name) : [];

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
              <DrillLibraryPanel focusSkills={focusSkills} savedVideos={savedDrillVideos} />
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

          {profile.team && (
            <Card className="mt-4">
              <CardHeader><CardTitle>League table &amp; race for 1st</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <StandingsSyncPanel initialUrl={profile.team.sourceUrl} lastSyncedAt={profile.team.lastSyncedAt} />
                <LeagueSnapshot standings={standings} myTeamName={profile.team.name} analysis={analysis} />
              </CardContent>
            </Card>
          )}

          {profile.team && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Upcoming opponents</CardTitle></CardHeader>
              <CardContent>
                <UpcomingOpponentsCard previews={opponents} />
              </CardContent>
            </Card>
          )}

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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Football tasks</CardTitle></CardHeader>
          <CardContent>
            <DomainTasksPanel category="FOOTBALL" tasks={footballTasks} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This football week</CardTitle></CardHeader>
          <CardContent>
            {footballWeekItems.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing football-related in the next 7 days — add a training session, a match or a task.
              </p>
            ) : (
              <WeekView days={weekDays} items={footballWeekItems} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
