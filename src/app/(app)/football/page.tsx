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
import { ProgressPlanPanel } from "@/components/progress/progress-plan";
import { getFootballProgress } from "@/lib/progress/football-plan";
import { parseMilestoneTab } from "@/lib/progress/milestones";
import { POSITION_FOCUS, type FootballPosition } from "@/lib/data/football";
import { DomainTasksPanel } from "@/components/tasks/domain-tasks-panel";
import { StandingsSyncPanel } from "@/components/football/standings-sync-panel";
import { StandingsPhotoPanel } from "@/components/football/standings-photo-panel";
import { LeagueLinksPanel } from "@/components/football/league-links-panel";
import { LeagueSnapshot } from "@/components/football/league-snapshot";
import { UpcomingOpponentsCard } from "@/components/football/upcoming-opponents-card";
import { analyzeTable } from "@/lib/football/table-analysis";
import { previewOpponents } from "@/lib/football/opponents";
import { WeekView } from "@/components/calendar/week-view";
import { getCalendarItems } from "@/lib/calendar/items";
import { addDays, startOfDay } from "date-fns";

export default async function FootballPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  // Football's OWN progress plan — separate from School's and Gym's.
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const milestoneTab = parseMilestoneTab(one("mtab"));
  const milestoneQuery = (one("mq") ?? "").slice(0, 60);
  const footballProgress = await getFootballProgress(userId);

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
  const leagueLinks = await prisma.footballLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, title: true, url: true },
  });
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

      <div id="progress" className="mt-6 scroll-mt-20">
        <ProgressPlanPanel
          plan={footballProgress}
          title="Football progress"
          tab={milestoneTab}
          query={milestoneQuery}
          basePath="/football"
        />
      </div>

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
              {/*
                Labelled, not just placeheld: a placeholder disappears the
                moment you type, and this gets filled in on a phone the night
                before, one field at a time, with the team chat open next to it.
              */}
              <form action={createMatch} data-testid="match-form" className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-muted">Against</span>
                  <input
                    name="opponent"
                    required
                    placeholder="FC Baar"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-muted">Day and kick-off time</span>
                  <input
                    name="date"
                    type="datetime-local"
                    required
                    className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-xs font-medium text-muted">Where</span>
                  <input
                    name="location"
                    placeholder="Sportplatz Herti, Zug — pitch 2"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-xs font-medium text-muted">Anything else (optional)</span>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder={"Besammlung 13:00\nRotes Trikot\nPapa fährt"}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="isHome" defaultChecked /> Home game
                  </label>
                  <Button type="submit" size="sm" variant="secondary">Add match</Button>
                </div>
              </form>
              <MatchList matches={upcomingMatches} />
            </CardContent>
          </Card>

          {/*
            The league's own pages, above the table the app builds. One tap and
            you are on the real thing — which is the only route that cannot
            fail for a reason outside this app, since a league site is free to
            refuse the importer below and some do.
          */}
          <Card className="mt-4">
            <CardHeader><CardTitle>Your league&apos;s pages</CardTitle></CardHeader>
            <CardContent>
              <LeagueLinksPanel links={leagueLinks} />
            </CardContent>
          </Card>

          {profile.team && (
            <Card className="mt-4">
              <CardHeader><CardTitle>League table &amp; race for 1st</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <StandingsSyncPanel initialUrl={profile.team.sourceUrl} lastSyncedAt={profile.team.lastSyncedAt} />
                <StandingsPhotoPanel />
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
