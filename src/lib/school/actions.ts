"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseRevisionUrl } from "@/lib/utils/revision-url";
import { SUBJECT_COLORS } from "@/lib/data/cambridge";
import { FIXED_PERIOD_TYPES, inferCellPeriodType, type PeriodType } from "./timetable-grid";

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
      isExamSubject: formData.get("isExamSubject") === "on",
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

export async function toggleExamSubject(subjectId: string) {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;
  await prisma.subject.update({ where: { id: subjectId }, data: { isExamSubject: !subject.isExamSubject } });
  revalidatePath("/school");
  revalidatePath(`/school/subjects/${subjectId}`);
}

const VALID_SUBJECT_LEVELS = ["IGCSE_CORE", "IGCSE_EXTENDED", "AS_LEVEL", "A_LEVEL", "OTHER"];

export async function updateSubjectLevel(subjectId: string, level: string) {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;
  await prisma.subject.update({
    where: { id: subjectId },
    data: { level: VALID_SUBJECT_LEVELS.includes(level) ? level : null },
  });
  revalidatePath("/school");
  revalidatePath(`/school/subjects/${subjectId}`);
}

/**
 * Saves the revision site you work from for a subject. Only http(s) links are
 * kept — the value ends up in an href, and anything else there (javascript:,
 * data:) is a way to run code when you click your own bookmark.
 *
 * The app stores the link and nothing else: it never fetches the page or
 * copies its content, which for a paid revision site would mean redistributing
 * material you're licensed to read, not to republish.
 */
export async function updateSubjectRevisionUrl(subjectId: string, formData: FormData) {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject) return;

  const revisionUrl = parseRevisionUrl(String(formData.get("revisionUrl") ?? ""));

  await prisma.subject.update({ where: { id: subjectId }, data: { revisionUrl } });
  revalidatePath("/school");
  revalidatePath(`/school/subjects/${subjectId}`);
}

/**
 * The revision page for one topic. Separate from the subject's link because a
 * revision site has a page per topic, and "open the notes for this" is only
 * useful if it lands on the thing you are stuck on rather than the subject's
 * front page.
 */
export async function updateTopicRevisionUrl(topicId: string, subjectId: string, formData: FormData) {
  const userId = await requireUserId();
  const topic = await prisma.topic.findFirst({ where: { id: topicId, subject: { userId } } });
  if (!topic) return;

  await prisma.topic.update({
    where: { id: topicId },
    data: { revisionUrl: parseRevisionUrl(String(formData.get("revisionUrl") ?? "")) },
  });
  revalidatePath(`/school/subjects/${subjectId}`);
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

/**
 * Both of these take two ids, and the one that matters is the topic. Checking
 * the subject proves nothing about it: the caller sends both, so naming your
 * own subject alongside someone else's topic satisfied the check and wrote to
 * their row. The filter has to hang off the id being written.
 *
 * The progress value is clamped because it leaves this row: it feeds the
 * school score, the coach's prompt and the planner, so a number outside 0-100
 * is not a wrong pixel, it is a wrong recommendation.
 */
export async function updateTopicProgress(topicId: string, subjectId: string, progressPct: number) {
  const userId = await requireUserId();
  const pct = Math.min(100, Math.max(0, Math.round(Number(progressPct) || 0)));
  await prisma.topic.updateMany({ where: { id: topicId, subject: { userId } }, data: { progressPct: pct } });
  revalidatePath(`/school/subjects/${subjectId}`);
}

export async function deleteTopic(topicId: string, subjectId: string) {
  const userId = await requireUserId();
  await prisma.topic.deleteMany({ where: { id: topicId, subject: { userId } } });
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

const gridCellSchema = z.object({
  day: z.number().min(0).max(4),
  value: z.string(),
  highlight: z.boolean().optional(),
});

const gridRowSchema = z.object({
  periodName: z.string(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  periodType: z.string(),
  cells: z.array(gridCellSchema),
});

/**
 * Bulk-saves the weekly period grid (Mon-Fri). Only touches slots whose
 * (startTime, endTime) matches a submitted period row — a one-off slot added
 * elsewhere with a different time range is left alone.
 *
 * Each cell is free text: matched case-insensitively against the user's
 * subjects (-> a real lesson linked to that subject), or inferred as
 * Study/Free/Club, or fine as a plain label. This is what lets a single
 * period slot (e.g. "P5") be a real lesson on one day and "Study" on
 * another, matching how real school timetables actually work.
 */
export async function saveTimetableGrid(rows: unknown) {
  const userId = await requireUserId();
  const parsed = z.array(gridRowSchema).safeParse(rows);
  if (!parsed.success) return;

  const subjects = await prisma.subject.findMany({ where: { userId } });
  const subjectByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s]));

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.data) {
      await tx.timetableSlot.deleteMany({
        where: { userId, startTime: row.startTime, endTime: row.endTime, dayOfWeek: { lte: 4 } },
      });

      const rowType = row.periodType as PeriodType;
      const fixed = FIXED_PERIOD_TYPES.includes(rowType);

      for (const cell of row.cells) {
        const text = cell.value.trim();
        if (!text) continue;

        const matchedSubject = subjectByName.get(text.toLowerCase());
        const periodType = fixed ? rowType : inferCellPeriodType(rowType, text);

        await tx.timetableSlot.create({
          data: {
            userId,
            dayOfWeek: cell.day,
            startTime: row.startTime,
            endTime: row.endTime,
            periodName: row.periodName || null,
            periodType,
            subjectId: matchedSubject && !fixed ? matchedSubject.id : null,
            label: matchedSubject && !fixed ? null : text,
            highlight: cell.highlight ?? false,
            isFree: periodType === "FREE",
          },
        });
      }
    }
  });

  revalidatePath("/school");
  revalidatePath("/school/timetable");
}
