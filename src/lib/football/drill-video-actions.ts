"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { FOOTBALL_SKILLS, drillVideoRejection } from "@/lib/data/football";
import { parseRevisionUrl } from "@/lib/utils/revision-url";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type SavedDrillVideo = { id: string; skill: string; url: string; label: string | null };

const MAX_LABEL_LENGTH = 60;

export async function getSavedDrillVideos(): Promise<SavedDrillVideo[]> {
  const userId = await requireUserId();
  const videos = await prisma.drillVideo.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return videos.map((v) => ({ id: v.id, skill: v.skill, url: v.url, label: v.label }));
}

export type AddDrillVideoResult = { videos: SavedDrillVideo[]; error?: string };

/**
 * Saves a link you pasted as an example for one skill.
 *
 * The app has never invented or fetched a video and doesn't start here: this
 * is where the ones nobody could verify for you come from. The URL goes into
 * an href and an iframe src, so a scheme that can execute is refused outright.
 */
export async function saveDrillVideo(skill: string, rawUrl: string, rawLabel?: string): Promise<AddDrillVideoResult> {
  const userId = await requireUserId();

  if (!FOOTBALL_SKILLS.includes(skill)) {
    return { videos: await getSavedDrillVideos(), error: "That isn't one of the skills." };
  }

  const url = parseRevisionUrl(rawUrl);
  if (!url) {
    return { videos: await getSavedDrillVideos(), error: "Paste a full http(s) link — a YouTube one embeds in place." };
  }

  const existing = await prisma.drillVideo.findMany({ where: { userId, skill } });
  const rejection = drillVideoRejection(existing.map((v) => v.url), url);
  if (rejection) return { videos: await getSavedDrillVideos(), error: rejection };

  const label = (rawLabel ?? "").trim().slice(0, MAX_LABEL_LENGTH) || null;
  await prisma.drillVideo.create({ data: { userId, skill, url, label } });
  revalidatePath("/football");
  return { videos: await getSavedDrillVideos() };
}

export async function deleteSavedDrillVideo(videoId: string): Promise<SavedDrillVideo[]> {
  const userId = await requireUserId();
  await prisma.drillVideo.deleteMany({ where: { id: videoId, userId } });
  revalidatePath("/football");
  return getSavedDrillVideos();
}
