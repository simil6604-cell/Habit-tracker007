"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function updateProfileName(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  await prisma.user.update({ where: { id: userId }, data: { name } });
  revalidatePath("/settings");
}

export async function updateOptimizationDomains(formData: FormData) {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: {
      optimizeSchool: formData.get("optimizeSchool") === "on",
      optimizeGym: formData.get("optimizeGym") === "on",
      optimizeFootball: formData.get("optimizeFootball") === "on",
    },
  });
  revalidatePath("/settings");
}

export async function updateNutritionSettings(formData: FormData) {
  const userId = await requireUserId();
  const weightRaw = formData.get("weightKg");
  const targetRaw = formData.get("targetWeightKg");
  const goalRaw = formData.get("dailyCalorieGoal");
  const proteinGoalRaw = formData.get("dailyProteinGoalG");
  const carbsGoalRaw = formData.get("dailyCarbsGoalG");
  const fatGoalRaw = formData.get("dailyFatGoalG");
  const waterGoalRaw = formData.get("dailyWaterGoalMl");
  await prisma.user.update({
    where: { id: userId },
    data: {
      weightKg: weightRaw ? Number(weightRaw) : null,
      targetWeightKg: targetRaw ? Number(targetRaw) : null,
      dailyCalorieGoal: goalRaw ? Number(goalRaw) : null,
      dailyProteinGoalG: proteinGoalRaw ? Number(proteinGoalRaw) : 150,
      dailyCarbsGoalG: carbsGoalRaw ? Number(carbsGoalRaw) : 250,
      dailyFatGoalG: fatGoalRaw ? Number(fatGoalRaw) : 70,
      dailyWaterGoalMl: waterGoalRaw ? Number(waterGoalRaw) : 2000,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/gym");
  revalidatePath("/gym/history");
  revalidatePath("/gym/meal-plan");
}

export async function deleteAccount() {
  const userId = await requireUserId();
  await prisma.user.delete({ where: { id: userId } });
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
