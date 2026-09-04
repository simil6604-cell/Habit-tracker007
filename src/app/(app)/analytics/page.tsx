import { auth } from "@/lib/auth/auth";
import { getAnalyticsData } from "@/lib/analytics/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRow } from "@/components/ui/progress-bar";
import { ConsistencyChart } from "@/components/charts/gym-charts";
import { SubjectProgressChart } from "@/components/charts/subject-progress-chart";

export default async function AnalyticsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const data = await getAnalyticsData(userId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-muted">How school, gym and football are trending, and how balanced your week really is.</p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Overall Progress</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <ScoreRow label="School" value={data.scores.school} colorClassName="bg-cat-school" />
          <ScoreRow label="Gym" value={data.scores.gym} colorClassName="bg-cat-gym" />
          <ScoreRow label="Football" value={data.scores.football} colorClassName="bg-cat-football" />
          <ScoreRow label="Balance" value={data.balance} colorClassName="bg-accent" />
          <ScoreRow label="Consistency" value={data.consistency} colorClassName="bg-cat-study" />
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>🎓 School — Subject Progress</CardTitle></CardHeader>
          <CardContent>
            {data.subjectProgress.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Add subjects and topics to see progress here.</p>
            ) : (
              <SubjectProgressChart data={data.subjectProgress} />
            )}
            <div className="mt-3 flex justify-between text-sm text-muted">
              <span>{Math.round(data.totalStudyMinutes / 60)}h logged study time</span>
              <span>{data.homeworkRate}% homework completion</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>🏋️ Gym — Consistency</CardTitle></CardHeader>
          <CardContent>
            <ConsistencyChart data={data.consistencyData} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>⚽ Football</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-semibold">{data.trainingsCompleted}/{data.trainingsTotal}</p>
            <p className="text-xs text-muted">Trainings completed</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-semibold">{data.matchesPlayed}</p>
            <p className="text-xs text-muted">Matches played</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-semibold">{data.matchesWon}</p>
            <p className="text-xs text-muted">Matches won</p>
          </div>
        </CardContent>
      </Card>

      {data.goals.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Development Goals</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.goals.map((g) => (
              <ScoreRow key={g.id} label={g.title} value={g.progressPct} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
