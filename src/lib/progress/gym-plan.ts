import { prisma } from "@/lib/db/prisma";
import { buildPlan, type Milestone, type ProgressPlan } from "./milestones";

/**
 * Gym's own progress plan — its own milestones, its own page.
 *
 * Nothing here is shared with School or Football. A gym milestone is about
 * what you lifted, ate and logged, and the only honest way to say where you
 * stand in the gym is to count gym rows.
 */
export async function getGymProgress(userId: string, now: Date = new Date()): Promise<ProgressPlan> {
  const [user, workouts, sessions, setLogs, meals, waterLogs, weights, photos, scans] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { weightKg: true, targetWeightKg: true, dailyProteinGoalG: true, dailyWaterGoalMl: true },
    }),
    prisma.workout.count({ where: { userId } }),
    prisma.workoutSession.findMany({
      where: { userId },
      select: { date: true, completed: true, durationMin: true, wentWell: true, toImprove: true },
    }),
    prisma.setLog.findMany({
      where: { session: { userId } },
      select: { reps: true, weight: true, isPB: true },
    }),
    prisma.meal.findMany({ where: { userId }, select: { date: true, proteinG: true, kcal: true } }),
    prisma.waterLog.findMany({ where: { userId }, select: { loggedAt: true, amountMl: true } }),
    prisma.bodyWeightLog.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, weightKg: true } }),
    prisma.bodyPhoto.count({ where: { userId } }),
    prisma.scannedProduct.count({ where: { userId } }),
  ]);

  const done = sessions.filter((s) => s.completed);
  const diaryEntries = sessions.filter((s) => (s.wentWell ?? "").trim() || (s.toImprove ?? "").trim()).length;
  const trainedMinutes = done.reduce((total, s) => total + (s.durationMin ?? 0), 0);
  const volumeKg = Math.round(setLogs.reduce((total, log) => total + log.reps * log.weight, 0));
  const personalBests = setLogs.filter((log) => log.isPB).length;

  // Days where the protein logged reached the goal. Counted per day rather
  // than per meal: hitting the goal is a property of a day.
  const proteinByDay = new Map<string, number>();
  for (const meal of meals) {
    const key = meal.date.toISOString().slice(0, 10);
    proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + (meal.proteinG ?? 0));
  }
  const proteinDays = [...proteinByDay.values()].filter((g) => g >= user.dailyProteinGoalG).length;

  const waterByDay = new Map<string, number>();
  for (const log of waterLogs) {
    const key = log.loggedAt.toISOString().slice(0, 10);
    waterByDay.set(key, (waterByDay.get(key) ?? 0) + log.amountMl);
  }
  const waterDays = [...waterByDay.values()].filter((ml) => ml >= user.dailyWaterGoalMl).length;

  const milestones: Milestone[] = [
    { id: "gym-plan", name: "A plan exists", description: "Build 3 workout plans", category: "Setup", target: 3, value: workouts, unit: "plans" },
    { id: "gym-first", name: "Showed up", description: "Complete 10 sessions", category: "Consistency", target: 10, value: done.length, unit: "sessions" },
    { id: "gym-fifty", name: "Fifty in", description: "Complete 50 sessions", category: "Consistency", target: 50, value: done.length, unit: "sessions" },
    { id: "gym-minutes", name: "Time under the bar", description: "Train for 30 hours", category: "Consistency", target: 30 * 60, value: trainedMinutes, unit: "minutes" },
    { id: "gym-sets", name: "Logged the work", description: "Record 200 sets", category: "Logging", target: 200, value: setLogs.length, unit: "sets" },
    { id: "gym-volume", name: "Tonnage", description: "Move 50,000 kg in total", category: "Strength", target: 50_000, value: volumeKg, unit: "kg" },
    { id: "gym-pb", name: "Getting stronger", description: "Set 15 personal bests", category: "Strength", target: 15, value: personalBests, unit: "PBs" },
    { id: "gym-meals", name: "Food written down", description: "Log 100 meals", category: "Nutrition", target: 100, value: meals.length, unit: "meals" },
    { id: "gym-protein", name: "Protein hit", description: "Reach your protein goal on 20 days", category: "Nutrition", target: 20, value: proteinDays, unit: "days" },
    { id: "gym-water", name: "Actually drinking", description: "Reach your water goal on 20 days", category: "Nutrition", target: 20, value: waterDays, unit: "days" },
    { id: "gym-scan", name: "Reads the label", description: "Scan 15 products", category: "Nutrition", target: 15, value: scans, unit: "products" },
    { id: "gym-weights", name: "On the scale", description: "Log your weight 25 times", category: "Tracking", target: 25, value: weights.length, unit: "weigh-ins" },
    { id: "gym-photos", name: "Seeing the change", description: "Take 8 progress photos", category: "Tracking", target: 8, value: photos, unit: "photos" },
    { id: "gym-diary", name: "Honest after training", description: "Write what went well or badly after 15 sessions", category: "Reflection", target: 15, value: diaryEntries, unit: "entries", unitOne: "entry" },
  ];

  const focus: string[] = [];

  if (workouts === 0) {
    focus.push("No workout plan yet — without one there is nothing to log sets against.");
  }

  // Sessions per week over the last four weeks, which is the number that
  // actually decides whether any of the rest moves.
  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
  const recent = done.filter((s) => s.date >= fourWeeksAgo).length;
  if (done.length > 0) {
    focus.push(`Last four weeks: ${recent} ${recent === 1 ? "session" : "sessions"}, about ${(recent / 4).toFixed(1)} a week.`);
  }

  if (user.weightKg != null && user.targetWeightKg != null && weights.length > 0) {
    const latest = weights[weights.length - 1].weightKg;
    const gap = Math.round((latest - user.targetWeightKg) * 10) / 10;
    focus.push(
      gap === 0
        ? `You are at your target weight of ${user.targetWeightKg} kg.`
        : `${Math.abs(gap)} kg ${gap > 0 ? "above" : "below"} your target of ${user.targetWeightKg} kg — last weigh-in ${latest} kg.`
    );
  } else if (user.targetWeightKg == null) {
    focus.push("No target weight set, so nothing here can say whether you are moving towards one.");
  }

  const loggedProteinDays = proteinByDay.size;
  if (loggedProteinDays > 0 && proteinDays / loggedProteinDays < 0.5) {
    focus.push(`Protein reached its goal on ${proteinDays} of the ${loggedProteinDays} days you logged food — that is the easiest number here to move.`);
  }

  if (meals.length === 0) {
    focus.push("No meals logged, so the nutrition milestones cannot measure anything yet.");
  }

  if (setLogs.length > 0 && personalBests === 0) {
    focus.push("No personal best recorded yet — mark one when a set beats what you did before, or the strength milestones stay flat.");
  }

  return buildPlan("GYM", milestones, {
    focus,
    highlights: [
      { label: "Sessions done", value: String(done.length), note: `${Math.round(trainedMinutes / 60)}h under the bar` },
      {
        label: "Total volume",
        // Tonnes past ten thousand: "29\'792 kg" is five digits plus a
        // separator and wrapped the tile onto two lines at every width.
        value: volumeKg >= 10_000 ? `${(volumeKg / 1000).toFixed(1)}t` : `${volumeKg} kg`,
        note: `${personalBests} personal ${personalBests === 1 ? "best" : "bests"}`,
      },
    ],
  });
}
