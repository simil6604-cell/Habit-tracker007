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
  const goalRaw = formData.get("dailyCalorieGoal");
  await prisma.user.update({
    where: { id: userId },
    data: {
      weightKg: weightRaw ? Number(weightRaw) : null,
      dailyCalorieGoal: goalRaw ? Number(goalRaw) : null,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/gym");
}

export async function deleteAccount() {
  const userId = await requireUserId();
  await prisma.user.delete({ where: { id: userId } });
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
