"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { SPOKEN_BOARD_STYLE } from "@/lib/ai/spoken-mode";
import { speechDirection, writingDirection } from "@/lib/ai/expression";
import type { ProviderImage } from "@/lib/ai/anthropic-provider";
import {
  deleteUploadedImage,
  readUploadedImage,
  saveUploadedDocument,
  saveUploadedImage,
} from "@/lib/uploads/save-image";
import {
  NO_REAL_AI_MESSAGE,
  buildSchoolAITurns,
  MAX_EDIT_CHARS,
  buildSchoolAIMessage,
  buildSchoolAISystemPrompt,
  type SchoolAITurn,
} from "./school-ai";
import {
  attachmentKind,
  isDocumentPath,
  MAX_PHOTOS_PER_MESSAGE,
  ownedUploadPaths,
  parseImagePaths,
  visionMediaType,
} from "./school-ai-photos";
import { schoolAITools } from "./ai-tools";
import type { ProviderDocument } from "@/lib/ai/anthropic-provider";
import { aiFailureMessage } from "@/lib/ai/api-key";
import { ADOPTED_CHAT_TITLE, chatLabel, cleanChatTitle } from "./chat-titles";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type SchoolAIMessageEntry = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  imagePaths: string[];
  createdAt: Date;
};

/**
 * How much picture data one question may carry.
 *
 * Twelve photos of a past paper is a normal thing to ask about; twelve
 * ten-megabyte photos is a request the API rejects outright, and a 413 from
 * someone else's server is not an error this app can explain. So the budget
 * is checked here, where we can say which photo pushed it over.
 */
const MAX_IMAGE_BYTES = 18 * 1024 * 1024;

/**
 * The pages a tool can change under the student's feet.
 *
 * Homework and exams show on /school, cards on the flashcards page, and the
 * unified tracker on /analytics reads all three. None of them would notice
 * a row written during a chat.
 */
const SCHOOL_PAGES = ["/school/ai", "/school", "/school/flashcards", "/analytics"];

/** How much of the conversation is kept on screen and available to the tutor. */
const HISTORY_LIMIT = 200;

function toEntry(m: { id: string; role: string; content: string; imagePaths: string | null; createdAt: Date }): SchoolAIMessageEntry {
  return {
    id: m.id,
    role: m.role as "USER" | "ASSISTANT",
    content: m.content,
    imagePaths: parseImagePaths(m.imagePaths),
    createdAt: m.createdAt,
  };
}

/**
 * The conversation, oldest turn first.
 *
 * Fetched newest-first and then reversed, because `orderBy: asc` with a `take`
 * returns the OLDEST 200 rows, not the newest. Past that many messages the
 * chat would have frozen: new replies land in the database and never appear,
 * and nothing about it looks like a bug from the outside.
 *
 * The id breaks a tie on createdAt — two rows written in the same millisecond
 * could otherwise come back with the answer above the question.
 */
export async function getSchoolAIMessages(chatId?: string): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  const messages = await prisma.schoolAIMessage.findMany({
    // The account scope is written here rather than built into a variable:
    // it has to be readable at the call site, by a person and by the test
    // that walks these queries looking for exactly this.
    where: { userId, ...(chatId ? { chatId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
  });
  return messages.reverse().map(toEntry);
}

export type UploadResult = { paths: string[]; error?: string };

/**
 * Saves a batch of photos and hands back the paths, without sending anything.
 *
 * Upload and ask are deliberately two steps: someone photographing four pages
 * of a question wants to see all four land, and be able to drop the blurry one,
 * before spending a turn on them.
 */
export async function uploadSchoolAIPhotos(formData: FormData): Promise<UploadResult> {
  const userId = await requireUserId();
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { paths: [], error: "Choose at least one photo." };
  if (files.length > MAX_PHOTOS_PER_MESSAGE) {
    return { paths: [], error: `That's ${files.length} photos — send up to ${MAX_PHOTOS_PER_MESSAGE} at a time.` };
  }

  await sweepAbandonedUploads(userId);

  const paths: string[] = [];
  const problems: string[] = [];

  for (const file of files) {
    // An iPhone's default HEIC saves fine but the vision API can't read it, so
    // it would sit in the thread as a photo the tutor silently never saw. Say
    // so at the point where it can still be re-taken.
    const kind = attachmentKind(file.type);
    if (!kind) {
      problems.push(
        `${file.name || "that file"} is ${file.type || "an unknown format"}, which the AI can't read. Send a JPEG, PNG or PDF — on iPhone: Settings → Camera → Formats → Most Compatible, or send a screenshot instead.`
      );
      continue;
    }
    try {
      // A PDF is stored beside the photos and sent as a document block, so a
      // past paper can be asked about as the real pages rather than as a
      // photograph of a screen.
      const path = kind === "document" ? await saveUploadedDocument(file, userId) : await saveUploadedImage(file, userId);
      if (path) {
        // Recorded as staged, which is what later tells this file apart from
        // every other photo sitting in the same directory.
        await prisma.schoolAIUpload.create({ data: { userId, path } });
        paths.push(path);
      }
    } catch (err) {
      problems.push(`${file.name || "a file"}: ${err instanceof Error ? err.message : "couldn't be saved"}`);
    }
  }

  return { paths, error: problems.length > 0 ? problems.join(" ") : undefined };
}

/**
 * Drops a photo that was uploaded but not yet sent.
 *
 * The path arrives from the browser, so it is caller-supplied input reaching a
 * delete. Being under this user's own upload directory is not enough to act
 * on: that is equally true of their progress photos and their note photos, and
 * a crafted call would have deleted one of those, leaving the row behind and
 * the picture gone. The staged row is the proof, and it only exists for a file
 * this user uploaded here and has not sent.
 */
export async function discardSchoolAIPhoto(imagePath: string): Promise<void> {
  const userId = await requireUserId();
  const [owned] = ownedUploadPaths([imagePath], userId);
  if (!owned) return;

  const { count } = await prisma.schoolAIUpload.deleteMany({ where: { userId, path: owned } });
  if (count === 0) return;
  await deleteUploadedImage(owned);
}

/** Staged photos older than this were abandoned — the tab was closed, or the question never got asked. */
const STAGED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes staged photos nobody came back for.
 *
 * Only ever rows in this table, so it can never reach a photo that belongs to
 * something else. Without it every abandoned upload stays on the disk for the
 * life of the deployment, unreachable and unnameable.
 */
async function sweepAbandonedUploads(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STAGED_UPLOAD_TTL_MS);
  const stale = await prisma.schoolAIUpload.findMany({ where: { userId, createdAt: { lt: cutoff } } });
  if (stale.length === 0) return;

  await prisma.schoolAIUpload.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  for (const row of stale) await deleteUploadedImage(row.path);
}

/**
 * Reads the attachments off the disk, as the two kinds the API takes.
 *
 * The budget is shared between them on purpose: twelve photos and a forty
 * page PDF is one request either way, and the limit that matters is the one
 * on the whole request rather than one per kind.
 */
async function loadAttachments(
  paths: string[]
): Promise<{ images: ProviderImage[]; documents: ProviderDocument[]; skipped: number }> {
  const images: ProviderImage[] = [];
  const documents: ProviderDocument[] = [];
  let skipped = 0;
  let bytes = 0;

  for (const path of paths) {
    const document = isDocumentPath(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = document ? null : visionMediaType(`image/${ext === "jpg" ? "jpeg" : ext}`);
    if (!document && !mediaType) {
      skipped += 1;
      continue;
    }
    const buffer = await readUploadedImage(path);
    if (!buffer || bytes + buffer.byteLength > MAX_IMAGE_BYTES) {
      skipped += 1;
      continue;
    }
    bytes += buffer.byteLength;
    if (document) documents.push({ base64: buffer.toString("base64"), title: path.split("/").pop() });
    else images.push({ base64: buffer.toString("base64"), mediaType: mediaType! });
  }

  return { images, documents, skipped };
}

/**
 * Asks, and writes the answer down.
 *
 * Pulled out of sending so that editing a question can reuse it: both have
 * to read the conversation up to that point, ask, and store one reply, and
 * two copies of that would drift the moment one of them changed.
 */
async function answerInChat(
  userId: string,
  chatId: string,
  history: { role: string; content: string; imagePaths: string | null }[],
  question: string,
  photos: string[],
  spoken: boolean
): Promise<void> {
  let reply: string;
  if (!isRealAIConfigured) {
    reply = NO_REAL_AI_MESSAGE;
  } else {
    const turns: SchoolAITurn[] = history.map((m) => ({
      role: m.role as "USER" | "ASSISTANT",
      content: m.content,
      photoCount: parseImagePaths(m.imagePaths).length,
    }));

    const { images, documents, skipped } = await loadAttachments(photos);
    // Appended rather than replacing: which syllabus they are on and what is
    // coming up still apply out loud. Only the shape of the answer changes.
    const base = await buildSchoolAISystemPrompt(userId);
    // How much life to put into it, as the student set it in Settings. Last
    // in the prompt, so it is the final word on tone.
    const expression = (
      await prisma.user.findUnique({ where: { id: userId }, select: { aiExpression: true } })
    )?.aiExpression;
    const system = spoken
      ? `${base}\n${SPOKEN_BOARD_STYLE}\n${speechDirection(expression)}`
      : `${base}\n${writingDirection(expression)}`;
    // Real turns rather than a transcript flattened into one message: this
    // is a conversation, and the API takes one.
    const conversation = buildSchoolAITurns(turns);
    const prompt = buildSchoolAIMessage(
      question || "Have a look at these and tell me what you see.",
      images.length,
      documents.length
    );

    /*
     * The hands.
     *
     * Built here, once per question, closed over the user id that came out
     * of the session at the top of the action — so the tools write to this
     * account and there is no argument through which they could write to
     * another. `done` fills as they run, and goes under the reply, because a
     * tutor that says it added something must be able to show that it did.
     */
    const { tools, done } = schoolAITools(userId);

    try {
      // A spoken reply now carries the board with it — two to four drawings
      // as well as the words. Cut off mid-SVG there is no picture at all,
      // only an unclosed block, so voice gets the same headroom the coach's
      // diagram replies already get.
      reply = await getAIProvider().generate(prompt, {
        system,
        turns: conversation,
        // Room for the answer AND the tool calls on the way to it: a reply
        // cut off mid tool call is a question that got nothing done and no
        // text either.
        maxTokens: spoken ? 4000 : 3000,
        images,
        documents,
        tools,
      });
    } catch (err) {
      reply = aiFailureMessage(err);
    }

    /*
     * What actually happened, under the answer.
     *
     * Written from this app's own record of the tools that ran, not from
     * what the reply claims — those are different things, and the only one
     * worth showing someone is the first.
     */
    if (done.length > 0) {
      reply = `${reply}\n\n**Done in your app:**\n${done.map((line) => `- ${line}`).join("\n")}`;
    }

    // Never let a photo go unanswered-for in silence: if one couldn't be read
    // or didn't fit, the reply says so rather than quietly covering the rest.
    if (skipped > 0) {
      reply = `_(${skipped} of your ${photos.length} files couldn't be included — too large, or the file is missing. Send ${skipped === 1 ? "it" : "them"} again on their own if ${skipped === 1 ? "it matters" : "they matter"}.)_\n\n${reply}`;
    }
  }

  await prisma.schoolAIMessage.create({ data: { userId, chatId, role: "ASSISTANT", content: reply } });
  // Moves it to the top of the list, which is what "recent" means there.
  await prisma.schoolAIChat.updateMany({ where: { id: chatId, userId }, data: { updatedAt: new Date() } });
}

export async function sendSchoolAIMessage(
  content: string,
  imagePaths: string[] = [],
  spoken = false,
  chatId?: string
): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  // Which conversation this belongs to, checked against the account.
  const chat = chatId
    ? await prisma.schoolAIChat.findFirst({ where: { id: chatId, userId }, select: { id: true } })
    : null;
  const activeChatId = chat?.id ?? (await currentSchoolAIChatId());
  const trimmed = content.trim();
  const photos = ownedUploadPaths(imagePaths, userId).slice(0, MAX_PHOTOS_PER_MESSAGE);
  // A photo on its own is a real question ("what's wrong with this?"), so an
  // empty box is only empty when nothing is attached either.
  if (!trimmed && photos.length === 0) return getSchoolAIMessages(activeChatId);

  // Newest first then reversed, for the same reason as getSchoolAIMessages:
  // taken ascending, the tutor's "recent context" freezes at the first 200
  // messages ever sent and never moves again.
  const history = (
    await prisma.schoolAIMessage.findMany({
      // This conversation only. Without the scope, asking about chemistry
      // here would be answered in the light of last week's maths.
      where: { userId, chatId: activeChatId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    })
  ).reverse();

  await prisma.schoolAIMessage.create({
    data: {
      userId,
      chatId: activeChatId,
      role: "USER",
      content: trimmed || "(sent photos without a question)",
      imagePaths: photos.length > 0 ? JSON.stringify(photos) : null,
    },
  });
  // They belong to the question now, so they are no longer staged — and the
  // sweep must never come back for them.
  if (photos.length > 0) {
    await prisma.schoolAIUpload.deleteMany({ where: { userId, path: { in: photos } } });
  }

  await answerInChat(userId, activeChatId, history, trimmed, photos, spoken);
  // The tutor can now add homework, exams and cards, so the pages that show
  // them are stale the moment it does. Revalidated unconditionally: whether
  // a tool ran is known inside answerInChat, and a wasted revalidate costs
  // less than a homework list that is one navigation behind.
  for (const page of SCHOOL_PAGES) revalidatePath(page);
  return getSchoolAIMessages(activeChatId);
}

/**
 * Fixes a question you have already sent, and asks it again.
 *
 * Everything after it goes. That is not tidiness: the answer below was an
 * answer to the old wording, and the turns after it were a conversation
 * about that answer. Left in place they would be sent back to Claude as
 * though they followed from the new question, and it would be reasoning
 * from a conversation that never happened.
 *
 * Photos stay attached. The usual reason to edit is a typo in the question
 * asked about a photographed worksheet, and making someone take the picture
 * again for a missing letter is not a feature.
 */
export async function editSchoolAIMessage(
  messageId: string,
  content: string
): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();

  const message = await prisma.schoolAIMessage.findFirst({
    where: { id: messageId, userId },
    select: { id: true, chatId: true, role: true, createdAt: true, imagePaths: true },
  });
  // Only your own, and only your own questions: an edited answer would be
  // this app putting words in Claude's mouth and then reading them back to
  // it as its own.
  if (!message || message.role !== "USER" || !message.chatId) return getSchoolAIMessages();

  const trimmed = content.trim().slice(0, MAX_EDIT_CHARS);
  const photos = parseImagePaths(message.imagePaths);
  if (!trimmed && photos.length === 0) return getSchoolAIMessages(message.chatId);

  // The conversation up to this question, which is what it was asked in the
  // light of. Newest-first then reversed, for the reason getSchoolAIMessages
  // explains.
  const history = (
    await prisma.schoolAIMessage.findMany({
      where: {
        userId,
        chatId: message.chatId,
        OR: [
          { createdAt: { lt: message.createdAt } },
          // Same millisecond: the id breaks the tie the same way the list
          // does, so what is "before" here and there cannot disagree.
          { createdAt: message.createdAt, id: { lt: message.id } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    })
  ).reverse();

  await prisma.schoolAIMessage.updateMany({
    where: { id: message.id, userId },
    data: { content: trimmed || "(sent photos without a question)" },
  });

  await prisma.schoolAIMessage.deleteMany({
    where: {
      userId,
      chatId: message.chatId,
      OR: [
        { createdAt: { gt: message.createdAt } },
        { createdAt: message.createdAt, id: { gt: message.id } },
      ],
    },
  });

  await answerInChat(userId, message.chatId, history, trimmed, photos, false);
  for (const page of SCHOOL_PAGES) revalidatePath(page);
  return getSchoolAIMessages(message.chatId);
}

export async function clearSchoolAIChat(chatId?: string): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  // Empties the conversation in front of them, not every conversation they
  // have ever had — which is what this used to do, back when there was only
  // one.
  const messages = await prisma.schoolAIMessage.findMany({
    where: { userId, ...(chatId ? { chatId } : {}) },
  });
  await prisma.schoolAIMessage.deleteMany({
    where: { userId, ...(chatId ? { chatId } : {}) },
  });
  // The photos belonged to this conversation and nothing else points at them,
  // so clearing it takes them off the disk too rather than leaving a pile of
  // orphaned files no screen in the app can ever show again.
  for (const message of messages) {
    for (const path of parseImagePaths(message.imagePaths)) {
      await deleteUploadedImage(path);
    }
  }
  revalidatePath("/school/ai");
  return [];
}

export type SchoolAIChatSummary = {
  id: string;
  /** What the student called it, if they did. */
  title: string | null;
  /** What to show: their name, else one made from the first question. */
  label: string;
  messageCount: number;
  updatedAt: Date;
};

/**
 * Puts messages that predate conversations into one.
 *
 * This app is deployed by pushing the schema, not by running migrations, so
 * the rows that were already there arrive with no chat attached. Dropping
 * them is unthinkable and a migration step is one more thing to forget, so
 * the first read adopts them — once, into a conversation that says what it
 * is.
 */
async function adoptLooseMessages(userId: string): Promise<void> {
  const loose = await prisma.schoolAIMessage.count({ where: { userId, chatId: null } });
  if (loose === 0) return;

  const oldest = await prisma.schoolAIMessage.findFirst({
    where: { userId, chatId: null },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const chat = await prisma.schoolAIChat.create({
    data: { userId, title: ADOPTED_CHAT_TITLE, createdAt: oldest?.createdAt ?? new Date() },
  });
  await prisma.schoolAIMessage.updateMany({ where: { userId, chatId: null }, data: { chatId: chat.id } });
}

/** Every conversation this account has, newest activity first. */
export async function listSchoolAIChats(): Promise<SchoolAIChatSummary[]> {
  const userId = await requireUserId();
  await adoptLooseMessages(userId);

  const chats = await prisma.schoolAIChat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      _count: { select: { messages: true } },
      // The first question, for a name when there is no typed one.
      messages: { where: { role: "USER" }, orderBy: { createdAt: "asc" }, take: 1, select: { content: true } },
    },
  });

  return chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    label: chatLabel({ title: chat.title, firstQuestion: chat.messages[0]?.content ?? null }),
    messageCount: chat._count.messages,
    updatedAt: chat.updatedAt,
  }));
}

/**
 * The conversation to open, making one if there is none.
 *
 * An empty conversation is reused rather than added to: pressing "new chat"
 * twice should not leave two blank rows in the list.
 */
export async function currentSchoolAIChatId(): Promise<string> {
  const userId = await requireUserId();
  await adoptLooseMessages(userId);
  const newest = await prisma.schoolAIChat.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (newest) return newest.id;
  const created = await prisma.schoolAIChat.create({ data: { userId } });
  return created.id;
}

export async function createSchoolAIChat(): Promise<{ chats: SchoolAIChatSummary[]; chatId: string }> {
  const userId = await requireUserId();
  const empty = await prisma.schoolAIChat.findFirst({
    where: { userId, messages: { none: {} } },
    orderBy: { updatedAt: "desc" },
  });
  // Already sitting on a blank one — touch it so it is at the top, rather
  // than stacking up empties.
  const chat = empty
    ? await prisma.schoolAIChat.update({ where: { id: empty.id }, data: { updatedAt: new Date() } })
    : await prisma.schoolAIChat.create({ data: { userId } });

  revalidatePath("/school");
  // The id is returned rather than left to be guessed from the top of the
  // list. Both this and the conversation just used are updated "now", and
  // which of them sorts first is not defined — picking the wrong one puts
  // the next question into the chat the student thought they had left.
  return { chats: await listSchoolAIChats(), chatId: chat.id };
}

export async function renameSchoolAIChat(chatId: string, title: string): Promise<SchoolAIChatSummary[]> {
  const userId = await requireUserId();
  // Scoped to the account: an id on its own is never enough to rename a row.
  await prisma.schoolAIChat.updateMany({ where: { id: chatId, userId }, data: { title: cleanChatTitle(title) } });
  revalidatePath("/school");
  return listSchoolAIChats();
}

export async function deleteSchoolAIChat(chatId: string): Promise<SchoolAIChatSummary[]> {
  const userId = await requireUserId();
  const owned = await prisma.schoolAIChat.findFirst({ where: { id: chatId, userId }, select: { id: true } });
  if (owned) {
    // The photos belonged to this conversation and nothing else points at
    // them, so they come off the disk with it.
    const messages = await prisma.schoolAIMessage.findMany({ where: { chatId, userId } });
    for (const message of messages) {
      for (const path of parseImagePaths(message.imagePaths)) await deleteUploadedImage(path);
    }
    await prisma.schoolAIChat.delete({ where: { id: owned.id } });
  }
  revalidatePath("/school");
  return listSchoolAIChats();
}
