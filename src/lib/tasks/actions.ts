"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/** Tasks are shown on /tasks and on each domain page, so all of them go stale together. */
function revalidateTaskViews() {
  for (const path of ["/tasks", "/school", "/gym", "/football", "/"]) revalidatePath(path);
}

export async function createTask(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const dueDate = String(formData.get("dueDate") ?? "");

  await prisma.task.create({
    data: {
      userId,
      title,
      category: String(formData.get("category") ?? "GENERAL"),
      priority: String(formData.get("priority") ?? "MEDIUM"),
      estimatedMin: formData.get("estimatedMin") ? Number(formData.get("estimatedMin")) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  revalidateTaskViews();
}

export async function cycleTaskStatus(taskId: string) {
  const userId = await requireUserId();
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) return;

  const next = task.status === "TODO" ? "IN_PROGRESS" : task.status === "IN_PROGRESS" ? "DONE" : "TODO";
  await prisma.task.update({ where: { id: taskId }, data: { status: next } });
  revalidateTaskViews();
}

export async function deleteTask(taskId: string) {
  const userId = await requireUserId();
  await prisma.task.deleteMany({ where: { id: taskId, userId } });
  revalidateTaskViews();
}
