"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { SUBJECT_COLORS } from "@/lib/data/cambridge";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createSubject(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const count = await prisma.subject.count({ where: { userId } });
  await prisma.subject.create({
    data: {
      userId,
      name,
      teacher: String(formData.get("teacher") ?? "") || null,
      room: String(formData.get("room") ?? "") || null,
      color: SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    },
  });
  revalidatePath("/school");
}

export async function deleteSubject(subjectId: string) {
  const userId = await requireUserId();
  await prisma.subject.deleteMany({ where: { id: subjectId, userId } });
  revalidatePath("/school");
}

const timetableSchema = z.object({
  subjectId: z.string().optional(),
  dayOfWeek: z.coerce.number().min(0).max(6),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  label: z.string().optional(),
  room: z.string().optional(),
});

export async function addTimetableSlot(formData: FormData) {
  const userId = await requireUserId();
  const parsed = timetableSchema.safeParse({
    subjectId: formData.get("subjectId") || undefined,
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    label: formData.get("label") || undefined,
    room: formData.get("room") || undefined,
  });
  if (!parsed.success) return;

  const { subjectId, ...rest } = parsed.data;
  await prisma.timetableSlot.create({
    data: {
      userId,
      subjectId: subjectId || null,
      isFree: !subjectId && !rest.label,
      ...rest,
    },
  });
  revalidatePath("/school");
}

export async function deleteTimetableSlot(slotId: string) {
  const userId = await requireUserId();
  await prisma.timetableSlot.deleteMany({ where: { id: slotId, userId } });
  revalidatePath("/school");
}

export async function addTopic(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;

  await prisma.topic.create({
    data: {
      subjectId,
      name: String(formData.get("name") ?? "").trim(),
      priority: String(formData.get("priority") ?? "MEDIUM"),
      examRelevance: String(formData.get("examRelevance") ?? "MEDIUM"),
      progressPct: Number(formData.get("progressPct") ?? 0),
    },
  });
  revalidatePath(`/school/subjects/${subjectId}`);
}

export async function updateTopicProgress(topicId: string, subjectId: string, progressPct: number) {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;
  await prisma.topic.update({ where: { id: topicId }, data: { progressPct } });
  revalidatePath(`/school/subjects/${subjectId}`);
}

export async function deleteTopic(topicId: string, subjectId: string) {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;
  await prisma.topic.delete({ where: { id: topicId } });
  revalidatePath(`/school/subjects/${subjectId}`);
}

export async function createHomework(formData: FormData) {
  const userId = await requireUserId();
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!dueDate) return;

  await prisma.homework.create({
    data: {
      userId,
      title: String(formData.get("title") ?? "").trim(),
      subjectId: String(formData.get("subjectId") ?? "") || null,
      dueDate: new Date(dueDate),
    },
  });
  revalidatePath("/school");
}

export async function toggleHomeworkStatus(homeworkId: string) {
  const userId = await requireUserId();
  const hw = await prisma.homework.findFirst({ where: { id: homeworkId, userId } });
  if (!hw) return;
  await prisma.homework.update({
    where: { id: homeworkId },
    data: { status: hw.status === "DONE" ? "PENDING" : "DONE" },
  });
  revalidatePath("/school");
}

export async function createExam(formData: FormData) {
  const userId = await requireUserId();
  const date = String(formData.get("date") ?? "");
  if (!date) return;

  await prisma.exam.create({
    data: {
      userId,
      title: String(formData.get("title") ?? "").trim(),
      subjectId: String(formData.get("subjectId") ?? "") || null,
      date: new Date(date),
      weight: String(formData.get("weight") ?? "MEDIUM"),
    },
  });
  revalidatePath("/school");
}

export async function deleteExam(examId: string) {
  const userId = await requireUserId();
  await prisma.exam.deleteMany({ where: { id: examId, userId } });
  revalidatePath("/school");
}
