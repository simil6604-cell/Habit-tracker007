import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { deleteWorkoutSession } from "@/lib/gym/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsistencyChart, VolumeChart } from "@/components/charts/gym-charts";
import { format, startOfWeek, subWeeks } from "date-fns";
import { Trash2 } from "lucide-react";

export default async function GymHistoryPage() {
  const session = await auth();
  const userId = session!.user.id;

  const sessions = await prisma.workoutSession.findMany({
    where: { userId },
    include: { workout: true, setLogs: { include: { exercise: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });

  const weeks = Array.from({ length: 8 }, (_, i) => startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 }));
  const consistencyData = weeks.map((weekStart) => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const count = sessions.filter((s) => s.completed && s.date >= weekStart && s.date < weekEnd).length;
    return { week: format(weekStart, "MMM d"), sessions: count };
  });

  const volumeData = [...sessions]
    .reverse()
    .map((s) => ({
      date: format(s.date, "MMM d"),
      volume: s.setLogs.reduce((sum, l) => sum + l.reps * l.weight, 0),
    }))
    .filter((d) => d.volume > 0)
    .slice(-20);

  const personalBests = sessions
    .flatMap((s) => s.setLogs.filter((l) => l.isPB).map((l) => ({ ...l, date: s.date })))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Gym History & Progress</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Workout Consistency</CardTitle></CardHeader>
          <CardContent><ConsistencyChart data={consistencyData} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Training Volume</CardTitle></CardHeader>
          <CardContent>
            {volumeData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Log a few workouts to see your volume trend.</p>
            ) : (
              <VolumeChart data={volumeData} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Personal Bests</CardTitle></CardHeader>
        <CardContent>
          {personalBests.length === 0 ? (
            <p className="text-sm text-muted">No personal bests recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {personalBests.map((pb) => (
                <li key={pb.id} className="flex items-center justify-between py-2 text-sm">
                  <span>🏆 {pb.exercise.name} — {pb.weight}kg × {pb.reps}</span>
                  <span className="text-xs text-muted">{format(pb.date, "MMM d")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Session History</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {sessions.length === 0 && <p className="py-2 text-sm text-muted">No sessions logged yet.</p>}
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{s.workout?.name ?? "Workout"}</p>
                  <p className="text-xs text-muted">{format(s.date, "EEE, MMM d")} {s.durationMin ? `· ${s.durationMin}min` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.completed ? <Badge variant="success">Completed</Badge> : <Badge variant="warning">Skipped</Badge>}
                  {s.difficulty && <Badge>{s.difficulty}</Badge>}
                  <form action={deleteWorkoutSession.bind(null, s.id)}>
                    <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
