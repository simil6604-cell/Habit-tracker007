import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { computeDomainScores } from "@/lib/planner/scores";
import { getAgendaForDay } from "@/lib/planner/agenda";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRow, ProgressBar } from "@/components/ui/progress-bar";
import { AgendaList } from "@/components/dashboard/agenda-list";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [scores, today, tomorrow, exams, homework, openTasks] = await Promise.all([
    computeDomainScores(userId),
    getAgendaForDay(userId, now),
    getAgendaForDay(userId, new Date(now.getTime() + 86400000)),
    prisma.exam.findMany({ where: { userId, date: { gte: now, lte: in7 } }, include: { subject: true }, orderBy: { date: "asc" } }),
    prisma.homework.findMany({ where: { userId, dueDate: { gte: now, lte: in7 }, status: "PENDING" }, include: { subject: true }, orderBy: { dueDate: "asc" } }),
    prisma.task.count({ where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Global Dashboard</h1>
      <p className="mt-1 text-muted">A full picture of your week across school, gym, football and recovery.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today&apos;s Score</CardTitle>
            <span className="text-xl font-semibold tabular-nums">{scores.overall}%</span>
          </CardHeader>
          <CardContent>
            <ProgressBar value={scores.overall} size="lg" className="mb-5" />
            <div className="flex flex-col gap-2.5">
              <ScoreRow label="School" value={scores.school} colorClassName="bg-cat-school" />
              <ScoreRow label="Gym" value={scores.gym} colorClassName="bg-cat-gym" />
              <ScoreRow label="Football" value={scores.football} colorClassName="bg-cat-football" />
              <ScoreRow label="Recovery" value={scores.recovery} colorClassName="bg-cat-recovery" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Open tasks</span>
              <span className="text-lg font-semibold">{openTasks}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Homework due (7d)</span>
              <span className="text-lg font-semibold">{homework.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Exams (7d)</span>
              <span className="text-lg font-semibold">{exams.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            <AgendaList items={today} emptyLabel="Nothing scheduled today." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tomorrow</CardTitle>
          </CardHeader>
          <CardContent>
            <AgendaList items={tomorrow} emptyLabel="Nothing scheduled tomorrow." />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Important Deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            {exams.length === 0 && homework.length === 0 ? (
              <p className="text-sm text-muted">No deadlines in the next 7 days.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {exams.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium">📝 {e.title}</p>
                      <p className="text-xs text-muted">{e.subject?.name ?? "General"}</p>
                    </div>
                    <Badge variant="danger">{formatDistanceToNow(e.date, { addSuffix: true })}</Badge>
                  </li>
                ))}
                {homework.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium">📓 {h.title}</p>
                      <p className="text-xs text-muted">{h.subject?.name ?? "General"}</p>
                    </div>
                    <Badge variant="accent">{formatDistanceToNow(h.dueDate, { addSuffix: true })}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
