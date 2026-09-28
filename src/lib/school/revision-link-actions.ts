"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { MAX_REVISION_LINKS, parseLinkInput } from "./revision-links";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type LinkFormState = { error?: string; ok?: boolean } | undefined;

export async function addRevisionLink(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const userId = await requireUserId();

  const parsed = parseLinkInput({
    title: formData.get("title"),
    url: formData.get("url"),
    kind: formData.get("kind"),
  });
  if (!parsed.ok) return { error: parsed.error };

  // A subject or topic id arrives from a <select> the browser can rewrite, so
  // each is checked against this account before it is stored.
  const rawSubject = String(formData.get("subjectId") ?? "").trim();
  let subjectId: string | null = null;
  if (rawSubject) {
    const subject = await prisma.subject.findFirst({ where: { id: rawSubject, userId }, select: { id: true } });
    if (!subject) return { error: "That subject is not one of yours." };
    subjectId = subject.id;
  }

  const rawTopic = String(formData.get("topicId") ?? "").trim();
  let topicId: string | null = null;
  if (rawTopic) {
    const topic = await prisma.topic.findFirst({ where: { id: rawTopic, subject: { userId } }, select: { id: true } });
    if (!topic) return { error: "That topic is not one of yours." };
    topicId = topic.id;
  }

  const existing = await prisma.revisionLink.count({ where: { userId } });
  if (existing >= MAX_REVISION_LINKS) {
    return { error: `That is ${MAX_REVISION_LINKS} links already — delete one before adding another.` };
  }

  await prisma.revisionLink.create({
    data: { userId, subjectId, topicId, kind: parsed.value.kind, title: parsed.value.title, url: parsed.value.url },
  });

  revalidatePath("/school");
  if (subjectId) revalidatePath(`/school/subjects/${subjectId}`);
  return { ok: true };
}

export async function deleteRevisionLink(id: string): Promise<void> {
  const userId = await requireUserId();
  const owned = await prisma.revisionLink.findFirst({ where: { id, userId }, select: { id: true, subjectId: true } });
  if (!owned) return;

  await prisma.revisionLink.delete({ where: { id: owned.id } });

  revalidatePath("/school");
  if (owned.subjectId) revalidatePath(`/school/subjects/${owned.subjectId}`);
}
