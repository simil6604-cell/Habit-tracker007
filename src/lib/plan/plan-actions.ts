"use server";

import { revalidatePath } from "next/cache";
import { startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isPlanStatus, MAX_PLAN_NOTE, MAX_PLAN_TIME, parseDay, type PlanStatus } from "./plan";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/** "homework:abc123" — the shape this app writes, and nothing else. */
function splitSourceKey(raw: string): { table: string; id: string } | null {
  const match = /^(homework|exam|workout|training|match|task):([A-Za-z0-9_-]+)$/.exec(raw);
  return match ? { table: match[1], id: match[2] } : null;
}

/**
 * Mirrors the mark onto the thing itself, where the thing has somewhere to
 * put it.
 *
 * Without this the School page would still show homework as pending after it
 * was ticked here, and two screens disagreeing about the same piece of work
 * is worse than either of them being wrong on its own.
 *
 * Scoped to this account at every call. A source key arrives from the
 * browser, so the id in it is a stranger's id until proven otherwise.
 */
async function mirrorOntoSource(userId: string, raw: string, status: PlanStatus | null): Promise<void> {
  const parsed = splitSourceKey(raw);
  if (!parsed) return;
  if (parsed.table === "homework") {
    await prisma.homework.updateMany({
      where: { id: parsed.id, userId },
      data: { status: status ?? "PENDING" },
    });
  } else if (parsed.table === "task") {
    await prisma.task.updateMany({
      where: { id: parsed.id, userId },
      data: { status: status === "DONE" ? "DONE" : status === "MISSED" ? "MISSED" : "TODO" },
    });
  } else if (parsed.table === "training") {
    // Only a session with a date of its own: a weekly one repeats, and the
    // flag on the row cannot say which week.
    await prisma.footballTraining.updateMany({
      where: { id: parsed.id, profile: { userId }, date: { not: null } },
      data: { completed: status === "DONE" },
    });
  }
}

export type PlanCheckState = { error?: string; ok?: boolean } | undefined;

/**
 * Ticks something off, or records that it did not happen and why.
 *
 * The note and the time are the half of this that the tick cannot carry: "I
 * didn't get to it, the match was moved to Saturday" is the thing you want to
 * read back in a week, and a box that only holds yes or no cannot hold it.
 */
export async function setPlanCheck(_prev: PlanCheckState, formData: FormData): Promise<PlanCheckState> {
  const userId = await requireUserId();

  const sourceKey = String(formData.get("sourceKey") ?? "");
  if (!splitSourceKey(sourceKey)) return { error: "That is not something this page can mark." };

  const date = parseDay(String(formData.get("date") ?? ""));
  if (!date) return { error: "That day could not be read." };

  const rawStatus = String(formData.get("status") ?? "");
  // An empty status clears the mark — the undo for a mis-tap.
  if (rawStatus === "") {
    await prisma.planCheck.deleteMany({ where: { userId, sourceKey, date: startOfDay(date) } });
    await mirrorOntoSource(userId, sourceKey, null);
    revalidatePath("/tasks");
    return { ok: true };
  }
  if (!isPlanStatus(rawStatus)) return { error: "That is not a state this page knows." };

  const note = String(formData.get("note") ?? "").trim().slice(0, MAX_PLAN_NOTE) || null;
  const atTime = String(formData.get("atTime") ?? "").trim().slice(0, MAX_PLAN_TIME) || null;

  // Keyed on (account, thing, day), so marking the same day twice edits the
  // one row rather than stacking up a history nobody asked for.
  await prisma.planCheck.upsert({
    where: { userId_sourceKey_date: { userId, sourceKey, date: startOfDay(date) } },
    create: { userId, sourceKey, date: startOfDay(date), status: rawStatus, note, atTime },
    update: { status: rawStatus, note, atTime },
  });
  await mirrorOntoSource(userId, sourceKey, rawStatus);

  revalidatePath("/tasks");
  revalidatePath("/school");
  revalidatePath("/football");
  return { ok: true };
}
