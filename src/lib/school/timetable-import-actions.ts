"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { SUBJECT_COLORS } from "@/lib/data/cambridge";
import { YEAR12_SUBJECTS, YEAR12_TIMETABLE } from "./year12-timetable";
import { schemaErrorMessage } from "@/lib/config/schema-check";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type ImportResult = { ok: true; slots: number; createdSubjects: string[] } | { ok: false; error: string };

/**
 * Writes the Year 12 week into the grid in one tap.
 *
 * Filling the grid by hand is forty-odd cells, on a phone, from a photo — the
 * kind of job that gets abandoned halfway, after which every feature that
 * reads the timetable (today's agenda, what clashes with training, the free
 * periods the planner puts revision into) has half a week to work from.
 *
 * It replaces Mon-Fri rather than adding to them, so pressing it twice leaves
 * the same week behind instead of two overlapping copies. Weekend slots, if
 * there ever are any, are left alone — they are not on this sheet.
 *
 * Subjects are matched to the ones already on the account case-insensitively
 * and only created when genuinely missing, so an existing Economics keeps its
 * topics, flashcards, homework and revision links.
 */
export async function importYear12Timetable(): Promise<ImportResult> {
  const userId = await requireUserId();
  try {
    return await writeYear12Week(userId);
  } catch (error) {
    const schema = schemaErrorMessage(error);
    if (schema) return { ok: false, error: schema };
    throw error;
  }
}

async function writeYear12Week(userId: string): Promise<ImportResult> {
  const existing = await prisma.subject.findMany({ where: { userId }, select: { id: true, name: true } });
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const createdSubjects: string[] = [];

  let colorIndex = existing.length;
  for (const name of YEAR12_SUBJECTS) {
    if (byName.has(name.toLowerCase())) continue;
    const created = await prisma.subject.create({
      data: {
        userId,
        name,
        isExamSubject: true,
        color: SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length],
      },
      select: { id: true },
    });
    byName.set(name.toLowerCase(), created.id);
    createdSubjects.push(name);
    colorIndex += 1;
  }

  await prisma.$transaction(async (tx) => {
    await tx.timetableSlot.deleteMany({ where: { userId, dayOfWeek: { lte: 4 } } });

    for (const slot of YEAR12_TIMETABLE) {
      const subjectId = slot.subject ? byName.get(slot.subject.toLowerCase()) ?? null : null;
      await tx.timetableSlot.create({
        data: {
          userId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          periodName: slot.periodName,
          periodType: slot.periodType,
          subjectId,
          label: subjectId ? null : slot.label ?? null,
          room: slot.room ?? null,
          isFree: slot.periodType === "FREE",
          highlight: slot.periodType === "CLUB",
        },
      });
    }
  });

  revalidatePath("/school");
  revalidatePath("/school/timetable");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return { ok: true, slots: YEAR12_TIMETABLE.length, createdSubjects };
}
