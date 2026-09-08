import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { deleteWorkoutSession, deleteBodyWeightLog } from "@/lib/gym/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsistencyChart, VolumeChart, CaloriesChart } from "@/components/charts/gym-charts";
import { WeightChart } from "@/components/charts/weight-chart";
import { BodyPhotosPanel } from "@/components/gym/body-photos-panel";
import { generateWorkoutDiaryTip } from "@/lib/gym/diary-assistant";
import { format, startOfWeek, subWeeks } from "date-fns";
import { Trash2 } from "lucide-react";

export default async function GymHistoryPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [sessions, weightLogs, bodyPhotos, user] = await Promise.all([
    prisma.workoutSession.findMany({
      where: { userId },
      include: { workout: true, setLogs: { include: { exercise: true } } },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.bodyWeightLog.findMany({ where: { userId }, orderBy: { date: "asc" }, take: 60 }),
    prisma.bodyPhoto.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 60 }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const weightChartData = weightLogs.map((w) => ({ date: format(w.date, "MMM d"), weightKg: w.weightKg }));

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

  const totalCaloriesBurned = sessions.reduce((sum, s) => sum + (s.caloriesBurned ?? 0), 0);

  const caloriesData = [...sessions]
    .reverse()
    .filter((s) => s.caloriesBurned)
    .map((s) => ({ date: format(s.date, "MMM d"), kcal: s.caloriesBurned! }))
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Calories Burned (estimate)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalCaloriesBurned.toLocaleString()} kcal</p>
            <p className="mb-2 text-xs text-muted">Across all logged sessions — a rough MET-based estimate, not a medical measurement.</p>
            {caloriesData.length > 0 && <CaloriesChart data={caloriesData} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Body Weight</CardTitle></CardHeader>
          <CardContent>
            {weightChartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Log your weight on the Gym page to see a trend here.</p>
            ) : (
              <WeightChart data={weightChartData} targetWeightKg={user?.targetWeightKg ?? null} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Progress Photos</CardTitle></CardHeader>
        <CardContent>
          <BodyPhotosPanel photos={bodyPhotos} />
        </CardContent>
      </Card>

      {weightLogs.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Weight Log</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {[...weightLogs].reverse().slice(0, 10).map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{w.weightKg} kg</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{format(w.date, "MMM d, yyyy")}</span>
                    <form action={deleteBodyWeightLog.bind(null, w.id)}>
                      <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
              <li key={s.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.workout?.name ?? "Workout"}</p>
                    <p className="text-xs text-muted">
                      {format(s.date, "EEE, MMM d")} {s.durationMin ? `· ${s.durationMin}min` : ""}
                      {s.caloriesBurned ? ` · ~${s.caloriesBurned} kcal` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.completed ? <Badge variant="success">Completed</Badge> : <Badge variant="warning">Skipped</Badge>}
                    {s.difficulty && <Badge>{s.difficulty}</Badge>}
                    <form action={deleteWorkoutSession.bind(null, s.id)}>
                      <button type="submit" className="text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </form>
                  </div>
                </div>
                {(s.wentWell || s.toImprove) && (
                  <div className="mt-1.5 flex flex-col gap-0.5 pl-0 text-xs text-muted">
                    {s.wentWell && <p>✅ Went well: {s.wentWell}</p>}
                    {s.toImprove && <p>🎯 To improve: {s.toImprove}</p>}
                  </div>
                )}
                {(() => {
                  const tip = generateWorkoutDiaryTip({
                    difficulty: s.difficulty,
                    completed: s.completed,
                    toImprove: s.toImprove,
                    hasPB: s.setLogs.some((l) => l.isPB),
                  });
                  return tip ? <p className="mt-1.5 rounded-lg bg-surface-muted p-2 text-xs">🤖 {tip}</p> : null;
                })()}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
