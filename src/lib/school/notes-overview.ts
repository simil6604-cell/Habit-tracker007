import { prisma } from "@/lib/db/prisma";

export type NoteOverviewEntry = {
  id: string;
  kind: "PHOTO" | "RECORDING";
  // Nullable since a lesson can be recorded from the school AI while it is
  // happening, with no subject picked and no topic to file it under. A note
  // with nowhere to put it is still a note, and hiding it would lose it.
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string;
  topicId: string | null;
  topicName: string | null;
  summary: string | null;
  createdAt: Date;
};

/** For a recording filed under nothing — the dot still needs a colour. */
const UNFILED_COLOR = "#6b7280";

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
      include: { topic: { include: { subject: true } }, subject: true },
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
    ...recordings.map((r) => {
      // Either route fills this in: recorded from a topic it has one, and
      // recorded from the school AI it has at most a subject.
      const subject = r.topic?.subject ?? r.subject;
      return {
        id: r.id,
        kind: "RECORDING" as const,
        subjectId: subject?.id ?? null,
        subjectName: subject?.name ?? null,
        subjectColor: subject?.color ?? UNFILED_COLOR,
        topicId: r.topicId,
        topicName: r.topic?.name ?? null,
        summary: r.summary,
        createdAt: r.createdAt,
      };
    }),
  ];

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
