import { auth } from "@/lib/auth/auth";
import { getAnalyticsData } from "@/lib/analytics/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRow } from "@/components/ui/progress-bar";
import { ConsistencyChart } from "@/components/charts/gym-charts";
import { SubjectProgressChart } from "@/components/charts/subject-progress-chart";
import { FocusDistributionChart } from "@/components/charts/focus-distribution-chart";
import { WeeklyTimeSplitCard } from "@/components/analytics/weekly-time-split-card";
import { EffortDonut } from "@/components/charts/effort-donut-client";
import { SectionHeading } from "@/components/analytics/section-heading";

/** A figure with its label, used across all three domain blocks. */
function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-surface p-4">
      <span className={`text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

export default async function AnalyticsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const data = await getAnalyticsData(userId);

  const winRate = data.matchesPlayed > 0 ? Math.round((data.matchesWon / data.matchesPlayed) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Your week, measured</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Analytics</h1>
      <p className="mt-1 text-muted">
        School, gym and football — each with its own block, so you can look at one without reading all three.
      </p>

      <div className="mt-6">
        <SectionHeading
          domain="overview"
          emoji="📊"
          title="Overview"
          subtitle="Where the time has actually gone"
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Where your time goes</CardTitle></CardHeader>
            <CardContent>
              {data.effortSplit.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  Nothing logged yet. Tick off a study block, a workout or a training and this fills in.
                </p>
              ) : (
                <>
                  <EffortDonut data={data.effortSplit} />
                  <p className="mt-3 text-xs text-muted">
                    Everything you have ever ticked off — completed study blocks, workouts and trainings. Not a
                    target, just where the hours went.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Overall progress</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <ScoreRow label="School" value={data.scores.school} colorClassName="bg-cat-school" />
              <ScoreRow label="Gym" value={data.scores.gym} colorClassName="bg-cat-gym" />
              <ScoreRow label="Football" value={data.scores.football} colorClassName="bg-cat-football" />
              <div className="my-1 h-px bg-border" />
              <ScoreRow label="Balance" value={data.balance} colorClassName="bg-accent" />
              <ScoreRow label="Consistency" value={data.consistency} colorClassName="bg-cat-study" />
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader><CardTitle>Week by week</CardTitle></CardHeader>
          <CardContent>
            <WeeklyTimeSplitCard
              initialWeekOffset={data.weeklyTimeSplit.weekOffset}
              initialWeekLabel={data.weeklyTimeSplit.weekLabel}
              initialData={data.weeklyTimeSplit.data}
            />
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        domain="school"
        emoji="🎓"
        title="School"
        subtitle="Subjects, study time and homework"
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Subject progress</CardTitle></CardHeader>
          <CardContent>
            {data.subjectProgress.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Add subjects and topics to see progress here.</p>
            ) : (
              <SubjectProgressChart data={data.subjectProgress} />
            )}
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Stat
            value={`${Math.round(data.totalStudyMinutes / 60)}h`}
            label="Logged study time"
            accent="text-cat-school"
          />
          <Stat value={`${data.homeworkRate}%`} label="Homework completion" />
        </div>
      </div>

      <SectionHeading
        domain="gym"
        emoji="🏋️"
        title="Gym"
        subtitle="How often you actually turn up"
      />
      <Card className="mt-4">
        <CardHeader><CardTitle>Sessions per week</CardTitle></CardHeader>
        <CardContent data-testid="gym-consistency">
          <ConsistencyChart data={data.consistencyData} emptyMessage="No workout logged in the last eight weeks." />
        </CardContent>
      </Card>

      <SectionHeading
        domain="football"
        emoji="⚽"
        title="Football"
        subtitle="Training, matches and what you work on"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={`${data.trainingsCompleted}/${data.trainingsTotal}`}
          label="Trainings completed"
          accent="text-cat-football"
        />
        <Stat value={String(data.matchesPlayed)} label="Matches played" />
        <Stat value={String(data.matchesWon)} label="Matches won" />
        {/* Null rather than 0% when nothing has been played: a win rate of
            zero is a claim, and "no matches yet" is the truth. */}
        <div data-testid="win-rate">
          <Stat value={winRate === null ? "—" : `${winRate}%`} label="Win rate" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Training consistency</CardTitle></CardHeader>
          <CardContent data-testid="football-consistency">
            <ConsistencyChart
              data={data.footballConsistencyData}
              color="var(--cat-football)"
              emptyMessage="No training marked as completed in the last eight weeks."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>What you focus on</CardTitle></CardHeader>
          <CardContent>
            {data.focusDistribution.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Log some trainings to see what you focus on most.</p>
            ) : (
              <FocusDistributionChart data={data.focusDistribution} />
            )}
          </CardContent>
        </Card>
      </div>

      {data.goals.length > 0 && (
        <>
          <SectionHeading
            domain="overview"
            emoji="🎯"
            title="Development goals"
            subtitle="What you set yourself"
          />
          <Card className="mt-4">
            <CardContent className="flex flex-col gap-3 pt-6">
              {data.goals.map((g) => (
                <ScoreRow key={g.id} label={g.title} value={g.progressPct} />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
