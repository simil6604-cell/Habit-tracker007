"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseRevisionUrl } from "@/lib/utils/revision-url";
import { estimateCaloriesBurned } from "./calories";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function logBodyWeight(formData: FormData) {
  const userId = await requireUserId();
  const weightKg = Number(formData.get("weightKg"));
  if (!weightKg || weightKg <= 0) return;

  await prisma.$transaction([
    prisma.bodyWeightLog.create({ data: { userId, weightKg } }),
    prisma.user.update({ where: { id: userId }, data: { weightKg: Math.round(weightKg) } }),
  ]);

  revalidatePath("/gym");
  revalidatePath("/gym/history");
}

export async function deleteBodyWeightLog(logId: string) {
  const userId = await requireUserId();
  await prisma.bodyWeightLog.deleteMany({ where: { id: logId, userId } });
  revalidatePath("/gym/history");
}

export async function createWorkout(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const dayOfWeek = formData.get("dayOfWeek");

  await prisma.workout.create({
    data: {
      userId,
      name,
      dayOfWeek: dayOfWeek !== null && dayOfWeek !== "" ? Number(dayOfWeek) : null,
    },
  });
  revalidatePath("/gym");
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireUserId();
  await prisma.workout.deleteMany({ where: { id: workoutId, userId } });
  revalidatePath("/gym");
}

/**
 * A number field's value, or the default when it is empty or nonsense.
 *
 * `formData.get` returns "" for a cleared input, and `"" ?? 3` is "", which
 * Number() turns into 0 rather than into the default anyone would expect.
 */
function positiveOr(raw: FormDataEntryValue | null, fallback: number): number {
  const value = Number(String(raw ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function addExercise(formData: FormData) {
  const userId = await requireUserId();
  const workoutId = String(formData.get("workoutId") ?? "");
  const workout = await prisma.workout.findFirst({ where: { id: workoutId, userId } });
  if (!workout) return;

  const order = await prisma.exercise.count({ where: { workoutId } });
  await prisma.exercise.create({
    data: {
      workoutId,
      name: String(formData.get("name") ?? "").trim(),
      // An empty number input arrives as "", not as null, so `?? 3` never
      // fired: a cleared box stored 0 sets, and an exercise with zero sets
      // renders no rows to type into and can never be logged again.
      targetSets: positiveOr(formData.get("targetSets"), 3),
      targetReps: positiveOr(formData.get("targetReps"), 10),
      targetWeight: formData.get("targetWeight") ? Number(formData.get("targetWeight")) : null,
      cueText: String(formData.get("cueText") ?? "").trim() || null,
      // Validated, not just trimmed: it is rendered as an href.
      videoUrl: parseRevisionUrl(String(formData.get("videoUrl") ?? "")),
      order,
    },
  });
  revalidatePath("/gym");
}

export async function deleteExercise(exerciseId: string) {
  const userId = await requireUserId();
  await prisma.exercise.deleteMany({ where: { id: exerciseId, workout: { userId } } });
  revalidatePath("/gym");
}

export async function logWorkoutSession(formData: FormData) {
  const userId = await requireUserId();
  const workoutId = String(formData.get("workoutId") ?? "");
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    include: { exercises: true },
  });
  if (!workout) return;

  const completed = formData.get("completed") === "on";
  const difficulty = String(formData.get("difficulty") ?? "MODERATE");
  const notes = String(formData.get("notes") ?? "") || null;
  const wentWell = String(formData.get("wentWell") ?? "") || null;
  const toImprove = String(formData.get("toImprove") ?? "") || null;
  const durationMin = formData.get("durationMin") ? Number(formData.get("durationMin")) : null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const caloriesBurned = durationMin ? estimateCaloriesBurned(durationMin, difficulty, user?.weightKg ?? null) : null;

  const session = await prisma.workoutSession.create({
    data: { userId, workoutId, completed, difficulty, notes, wentWell, toImprove, durationMin, caloriesBurned },
  });

  for (const exercise of workout.exercises) {
    // Find this exercise's best weight so far, to flag new personal bests.
    // Tracked as a running value so multiple sets at the same weight within
    // this same session only count the first one as a PB.
    const previousBest = await prisma.setLog.findFirst({
      where: { exerciseId: exercise.id },
      orderBy: { weight: "desc" },
    });
    // Starting from -Infinity made the first set a personal best whatever it
    // weighed — including a bodyweight set at 0 kg, which then showed up as
    // "🏆 New personal best" at 0 kg in history and in the diary tip.
    let bestWeightSoFar = previousBest?.weight ?? 0;

    for (let setNumber = 1; setNumber <= exercise.targetSets; setNumber++) {
      const repsRaw = formData.get(`reps-${exercise.id}-${setNumber}`);
      const weightRaw = formData.get(`weight-${exercise.id}-${setNumber}`);
      if (repsRaw === null && weightRaw === null) continue;
      const reps = Number(repsRaw ?? 0);
      const weight = Number(weightRaw ?? 0);
      if (reps === 0 && weight === 0) continue;

      const isPB = weight > bestWeightSoFar;
      if (isPB) bestWeightSoFar = weight;
      await prisma.setLog.create({
        data: { sessionId: session.id, exerciseId: exercise.id, setNumber, reps, weight, isPB },
      });
    }
  }

  revalidatePath("/gym");
  revalidatePath("/gym/history");
}

export async function deleteWorkoutSession(sessionId: string) {
  const userId = await requireUserId();
  await prisma.workoutSession.deleteMany({ where: { id: sessionId, userId } });
  revalidatePath("/gym/history");
}
