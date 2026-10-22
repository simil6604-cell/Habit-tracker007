"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { listCourses, listCourseWork, listSubmissions } from "./classroom";
import { accessTokenFor, disconnectGoogle, recordSyncResult } from "./connection";
import { IMPORT_SOURCE, planImport, type ExistingHomework } from "./import-plan";
import { GoogleError, GOOGLE_FAILURE_MESSAGE } from "./oauth";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type SyncResult = {
  ok: boolean;
  courses: number;
  created: number;
  updated: number;
  skippedNoDueDate: number;
  skippedTooOld: number;
  error: string | null;
};

const EMPTY: Omit<SyncResult, "ok" | "error"> = {
  courses: 0,
  created: 0,
  updated: 0,
  skippedNoDueDate: 0,
  skippedTooOld: 0,
};

/**
 * Reads this student's Classroom and brings their work into the app.
 *
 * Nothing is deleted. If a teacher removes an assignment, the row it created
 * stays until the student deletes it — a sync that failed halfway through
 * would otherwise read as "that course has no work" and take real homework
 * with it.
 */
export async function syncClassroom(): Promise<SyncResult> {
  const userId = await requireUserId();

  try {
    const accessToken = await accessTokenFor(userId);
    const courses = await listCourses(accessToken);

    const work = [];
    const submissions = [];
    for (const course of courses) {
      work.push(...(await listCourseWork(course.id, accessToken)));
      submissions.push(...(await listSubmissions(course.id, accessToken)));
    }

    const [subjects, existingRows] = await Promise.all([
      prisma.subject.findMany({ where: { userId }, select: { id: true, name: true } }),
      prisma.homework.findMany({
        where: { userId, externalId: { not: null } },
        select: { id: true, externalId: true, source: true, status: true },
      }),
    ]);

    const plan = planImport({
      courses,
      work,
      submissions,
      subjects,
      existing: existingRows as ExistingHomework[],
      now: new Date(),
    });

    for (const row of plan.create) {
      await prisma.homework.create({ data: { userId, source: IMPORT_SOURCE, ...row } });
    }
    for (const row of plan.update) {
      // Scoped by userId as well as id: the id came from this account's own
      // query, and keeping the scope on the write means it stays true even if
      // that ever stops being the case.
      await prisma.homework.updateMany({ where: { id: row.id, userId }, data: row.data });
    }

    await recordSyncResult(userId, null);
    revalidatePath("/school");
    revalidatePath("/settings");

    return {
      ok: true,
      courses: courses.length,
      created: plan.create.length,
      updated: plan.update.length,
      skippedNoDueDate: plan.skippedNoDueDate,
      skippedTooOld: plan.skippedTooOld,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof GoogleError
        ? error.message
        : `${GOOGLE_FAILURE_MESSAGE.UNKNOWN} (${error instanceof Error ? error.message : "unknown"})`;
    // Kept on the connection so the card can still say what went wrong after
    // a reload, rather than only in the moment.
    await recordSyncResult(userId, message);
    revalidatePath("/settings");
    return { ok: false, ...EMPTY, error: message };
  }
}

export async function disconnectClassroom(): Promise<void> {
  const userId = await requireUserId();
  await disconnectGoogle(userId);
  // The homework that was imported stays: it is this student's actual work,
  // and deleting it because a connection was removed would be a surprise.
  revalidatePath("/settings");
  revalidatePath("/school");
}
