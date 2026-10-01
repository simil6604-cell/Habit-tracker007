"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseRevisionUrl } from "@/lib/utils/revision-url";
import { generateIndividualTraining } from "./training-generator";
import {
  fetchAndParseStandings,
  importStandingsFromText,
  readStandingsFromImage,
  type ImportResult,
  type ImportedStanding,
} from "./standings-import";
import { cleanLine, cleanNote, parseMatchDate, MAX_LOCATION } from "./match-details";
import type { FootballPosition } from "@/lib/data/football";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * The league table is read on both football pages.
 *
 * It is edited on /football/team but rendered on /football as well, so
 * revalidating only the editor left "Imported 12 teams" sitting above the old
 * table until the page was reloaded by hand.
 */
function revalidateFootball() {
  revalidatePath("/football");
  revalidatePath("/football/team");
}

export async function updateProfile(formData: FormData) {
  const userId = await requireUserId();
  const position = String(formData.get("position") ?? "ST");
  const weaknesses = formData.getAll("weaknesses").map(String);
  const teamName = String(formData.get("teamName") ?? "").trim();

  // null, not undefined: Prisma reads undefined as "leave unchanged", so
  // clearing the Team field silently kept the old team linked.
  let teamId: string | null = null;
  if (teamName) {
    // Scoped to this user's own profiles on purpose. Looking a team up by name
    // alone made the name the only credential: anyone who typed your club's
    // name joined the same row, and could then replace or delete its standings.
    let team = await prisma.footballTeam.findFirst({ where: { name: teamName, profiles: { some: { userId } } } });
    if (!team) team = await prisma.footballTeam.create({ data: { name: teamName, dataSource: "MANUAL" } });
    teamId = team.id;
  }

  await prisma.footballProfile.upsert({
    where: { userId },
    create: { userId, position, weaknesses: weaknesses.join(","), teamId },
    update: { position, weaknesses: weaknesses.join(","), teamId },
  });
  revalidatePath("/football");
  revalidatePath("/football/team");
}

export async function generateTrainingForWeaknesses() {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const weaknesses = profile.weaknesses ? profile.weaknesses.split(",").filter(Boolean) : [];
  const plan = generateIndividualTraining(profile.position as FootballPosition, weaknesses);

  await prisma.footballTraining.create({
    data: {
      profileId: profile.id,
      title: plan.title,
      durationMin: plan.durationMin,
      focus: plan.focus,
      drills: JSON.stringify(plan.drills),
      isTeamSession: false,
    },
  });
  revalidatePath("/football");
}

export async function createTraining(formData: FormData) {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const dateStr = String(formData.get("date") ?? "");
  await prisma.footballTraining.create({
    data: {
      profileId: profile.id,
      title: String(formData.get("title") ?? "Team Training"),
      date: dateStr ? new Date(dateStr) : null,
      durationMin: Number(formData.get("durationMin") ?? 60),
      focus: String(formData.get("focus") ?? "Conditioning"),
      drills: JSON.stringify([]),
      isTeamSession: true,
    },
  });
  revalidatePath("/football");
}

export async function toggleTrainingCompleted(trainingId: string) {
  const userId = await requireUserId();
  const training = await prisma.footballTraining.findFirst({
    where: { id: trainingId, profile: { userId } },
  });
  if (!training) return;
  await prisma.footballTraining.update({ where: { id: trainingId }, data: { completed: !training.completed } });
  revalidatePath("/football");
}

type StoredDrill = {
  name: string;
  minutes: number;
  cueText?: string;
  /** Legacy single link, kept so drills saved before multi-video still work. */
  videoUrl?: string;
  videoUrls?: string[];
};

/** Reads either shape and always hands back a list. */
function drillVideoList(drill: StoredDrill): string[] {
  const many = Array.isArray(drill.videoUrls) ? drill.videoUrls : [];
  return drill.videoUrl && !many.includes(drill.videoUrl) ? [drill.videoUrl, ...many] : many;
}

async function updateDrills(
  trainingId: string,
  userId: string,
  drillIndex: number,
  change: (drill: StoredDrill) => StoredDrill
) {
  const training = await prisma.footballTraining.findFirst({ where: { id: trainingId, profile: { userId } } });
  if (!training) return;

  let drills: StoredDrill[] = [];
  try {
    drills = JSON.parse(training.drills);
  } catch {
    return;
  }
  if (!drills[drillIndex]) return;
  drills[drillIndex] = change(drills[drillIndex]);

  await prisma.footballTraining.update({ where: { id: trainingId }, data: { drills: JSON.stringify(drills) } });
  revalidatePath("/football");
}

export async function attachDrillVideo(trainingId: string, drillIndex: number, formData: FormData) {
  const userId = await requireUserId();
  // Same check as the revision links: this ends up in an href, and a
  // javascript: URL there runs code when you tap your own saved reference.
  const videoUrl = parseRevisionUrl(String(formData.get("videoUrl") ?? ""));
  if (!videoUrl) return;

  await updateDrills(trainingId, userId, drillIndex, (drill) => {
    const existing = drillVideoList(drill);
    if (existing.includes(videoUrl)) return drill;
    // Collapses the legacy single field into the list so there's one shape from here on.
    return { ...drill, videoUrl: undefined, videoUrls: [...existing, videoUrl] };
  });
}

export async function removeDrillVideo(trainingId: string, drillIndex: number, videoUrl: string) {
  const userId = await requireUserId();
  await updateDrills(trainingId, userId, drillIndex, (drill) => ({
    ...drill,
    videoUrl: undefined,
    videoUrls: drillVideoList(drill).filter((u) => u !== videoUrl),
  }));
}

export async function updateTrainingDiary(trainingId: string, formData: FormData) {
  const userId = await requireUserId();
  const training = await prisma.footballTraining.findFirst({ where: { id: trainingId, profile: { userId } } });
  if (!training) return;

  await prisma.footballTraining.update({
    where: { id: trainingId },
    data: {
      wentWell: String(formData.get("wentWell") ?? "").trim() || null,
      toImprove: String(formData.get("toImprove") ?? "").trim() || null,
    },
  });
  revalidatePath("/football");
}

export async function deleteTraining(trainingId: string) {
  const userId = await requireUserId();
  await prisma.footballTraining.deleteMany({ where: { id: trainingId, profile: { userId } } });
  revalidatePath("/football");
}

export async function createMatch(formData: FormData) {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const date = parseMatchDate(formData.get("date"));
  const opponent = cleanLine(formData.get("opponent"), 80);
  if (!date || !opponent) return;

  await prisma.footballMatch.create({
    data: {
      profileId: profile.id,
      opponent,
      date,
      isHome: formData.get("isHome") === "on",
      location: cleanLine(formData.get("location"), MAX_LOCATION),
      notes: cleanNote(formData.get("notes")),
    },
  });
  revalidateFootball();
  revalidatePath("/calendar");
}

export async function recordMatchResult(matchId: string, formData: FormData) {
  const userId = await requireUserId();
  const match = await prisma.footballMatch.findFirst({ where: { id: matchId, profile: { userId } } });
  if (!match) return;

  await prisma.footballMatch.update({
    where: { id: matchId },
    data: {
      scoreFor: Number(formData.get("scoreFor") ?? 0),
      scoreAgainst: Number(formData.get("scoreAgainst") ?? 0),
    },
  });
  revalidatePath("/football");
}

export async function deleteMatch(matchId: string) {
  const userId = await requireUserId();
  await prisma.footballMatch.deleteMany({ where: { id: matchId, profile: { userId } } });
  revalidatePath("/football");
}

export async function addStanding(formData: FormData) {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile?.teamId) return;

  await prisma.teamStanding.create({
    data: {
      teamId: profile.teamId,
      rank: Number(formData.get("rank") ?? 0),
      teamName: String(formData.get("teamName") ?? "").trim(),
      played: Number(formData.get("played") ?? 0),
      won: Number(formData.get("won") ?? 0),
      drawn: Number(formData.get("drawn") ?? 0),
      lost: Number(formData.get("lost") ?? 0),
      goalsFor: Number(formData.get("goalsFor") ?? 0),
      goalsAgainst: Number(formData.get("goalsAgainst") ?? 0),
      points: Number(formData.get("points") ?? 0),
    },
  });
  revalidateFootball();
}

export async function deleteStanding(standingId: string) {
  const userId = await requireUserId();
  await prisma.teamStanding.deleteMany({ where: { id: standingId, team: { profiles: { some: { userId } } } } });
  revalidateFootball();
}

/**
 * Write a set of standings for this account's team, from wherever they came.
 *
 * Shared so a pasted table and a fetched one cannot drift apart: same
 * ownership check, same replace-in-one-transaction, same revalidation.
 */
async function replaceStandings(
  userId: string,
  rows: ImportedStanding[],
  source: { dataSource: string; sourceUrl?: string | null }
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile?.teamId) return { ok: false, error: "Save your team name in the Football profile first." };

  const teamId = profile.teamId;
  await prisma.$transaction([
    prisma.teamStanding.deleteMany({ where: { teamId } }),
    prisma.teamStanding.createMany({ data: rows.map((s) => ({ ...s, teamId })) }),
    prisma.footballTeam.update({
      where: { id: teamId },
      data: { dataSource: source.dataSource, sourceUrl: source.sourceUrl ?? null, lastSyncedAt: new Date() },
    }),
  ]);

  revalidateFootball();
  return { ok: true, count: rows.length };
}

/**
 * The table as text, copied out of the browser that CAN see the page.
 *
 * The fetch path fails on two kinds of site this app cannot do anything
 * about: pages that build their table with JavaScript, and pages that refuse
 * a server. Copy and paste works on both.
 */
export async function importStandingsFromPaste(
  text: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const parsed = await importStandingsFromText(text);
  if (!parsed.ok) return parsed;
  return replaceStandings(userId, parsed.data, { dataSource: "PASTED" });
}

/** What a phone camera produces, and what the API accepts. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Reads a photo of the league table and hands the rows back WITHOUT saving.
 *
 * Deliberately two steps. A model reading a column of numbers off a photo is
 * right most of the time and not all of the time, and a points column one out
 * changes what the app says about the race for first without ever looking
 * wrong. So the rows come back to be looked at, and saving them is a separate
 * decision made by the person who took the picture.
 *
 * The photo is never written to disk. It goes to the AI and is gone — there is
 * no reason to keep a picture of a table once the table itself is in.
 */
export async function readStandingsPhoto(formData: FormData): Promise<ImportResult> {
  await requireUserId();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a photo of the table first." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "That picture is too big (8MB max). Most phones let you send a smaller copy." };
  }
  if (!PHOTO_TYPES.includes(file.type)) {
    return { ok: false, error: "That file is not a picture. A photo or a screenshot of the table works — JPG, PNG or WebP." };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return readStandingsFromImage(base64, file.type);
}

/**
 * Saves rows that came back from a photo, after they have been looked at.
 *
 * The rows arrive from the browser, so they are checked here rather than
 * trusted: this is the user's own table, but a number that arrives as a string
 * or a name a thousand characters long would be written exactly as sent.
 */
export async function saveCheckedStandings(rows: unknown): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const userId = await requireUserId();

  const schema = z.array(
    z.object({
      rank: z.coerce.number().int().min(0).max(999),
      teamName: z.string().trim().min(1).max(80),
      played: z.coerce.number().int().min(0).max(999),
      won: z.coerce.number().int().min(0).max(999),
      drawn: z.coerce.number().int().min(0).max(999),
      lost: z.coerce.number().int().min(0).max(999),
      goalsFor: z.coerce.number().int().min(0).max(9999),
      goalsAgainst: z.coerce.number().int().min(0).max(9999),
      points: z.coerce.number().int().min(-99).max(999),
    })
  ).min(1).max(60);

  const parsed = schema.safeParse(rows);
  if (!parsed.success) {
    return { ok: false, error: "Some of those rows could not be read. Check the numbers and try again." };
  }

  return replaceStandings(userId, parsed.data, { dataSource: "PHOTO" });
}

export async function importStandingsFromLink(url: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile?.teamId) return { ok: false, error: "Save your team name in the Football profile first." };

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return { ok: false, error: "Paste a link first." };

  const result = await fetchAndParseStandings(trimmedUrl);
  if (!result.ok) return result;

  return replaceStandings(userId, result.data, { dataSource: "API", sourceUrl: trimmedUrl });
}
