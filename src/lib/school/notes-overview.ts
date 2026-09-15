import { prisma } from "@/lib/db/prisma";

export type NoteOverviewEntry = {
  id: string;
  kind: "PHOTO" | "RECORDING";
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  topicId: string;
  topicName: string;
  summary: string | null;
  createdAt: Date;
};

/**
 * Note photos and class recordings live under individual topics, which makes
 * them invisible unless you already know which topic you filed them under.
 * This pulls every one of them together so the School page can show what the
 * student actually has, and link back to the topic that can test them on it.
 */
export async function getSchoolNotesOverview(userId: string, limit = 12): Promise<NoteOverviewEntry[]> {
  const [photos, recordings] = await Promise.all([
    prisma.notePhoto.findMany({
      where: { userId },
      include: { topic: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.classRecording.findMany({
      where: { userId },
      include: { topic: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const entries: NoteOverviewEntry[] = [
    ...photos.map((p) => ({
      id: p.id,
      kind: "PHOTO" as const,
      subjectId: p.topic.subjectId,
      subjectName: p.topic.subject.name,
      subjectColor: p.topic.subject.color,
      topicId: p.topicId,
      topicName: p.topic.name,
      summary: p.summary,
      createdAt: p.createdAt,
    })),
    ...recordings.map((r) => ({
      id: r.id,
      kind: "RECORDING" as const,
      subjectId: r.topic.subjectId,
      subjectName: r.topic.subject.name,
      subjectColor: r.topic.subject.color,
      topicId: r.topicId,
      topicName: r.topic.name,
      summary: r.summary,
      createdAt: r.createdAt,
    })),
  ];

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
