"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseRevisionUrl } from "@/lib/utils/revision-url";
import { generateIndividualTraining } from "./training-generator";
import { fetchAndParseStandings } from "./standings-import";
import type { FootballPosition } from "@/lib/data/football";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function updateProfile(formData: FormData) {
  const userId = await requireUserId();
  const position = String(formData.get("position") ?? "ST");
  const weaknesses = formData.getAll("weaknesses").map(String);
  const teamName = String(formData.get("teamName") ?? "").trim();

  let teamId: string | undefined;
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

  const dateStr = String(formData.get("date") ?? "");
  if (!dateStr) return;

  await prisma.footballMatch.create({
    data: {
      profileId: profile.id,
      opponent: String(formData.get("opponent") ?? "").trim(),
      date: new Date(dateStr),
      isHome: formData.get("isHome") === "on",
    },
  });
  revalidatePath("/football");
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
  revalidatePath("/football/team");
}

export async function deleteStanding(standingId: string) {
  const userId = await requireUserId();
  await prisma.teamStanding.deleteMany({ where: { id: standingId, team: { profiles: { some: { userId } } } } });
  revalidatePath("/football/team");
}

export async function importStandingsFromLink(url: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const profile = await prisma.footballProfile.findUnique({ where: { userId } });
  if (!profile?.teamId) return { ok: false, error: "Save your team name in the Football profile first." };

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return { ok: false, error: "Paste a link first." };

  const result = await fetchAndParseStandings(trimmedUrl);
  if (!result.ok) return result;

  const teamId = profile.teamId;
  await prisma.$transaction([
    prisma.teamStanding.deleteMany({ where: { teamId } }),
    prisma.teamStanding.createMany({ data: result.data.map((s) => ({ ...s, teamId })) }),
    prisma.footballTeam.update({
      where: { id: teamId },
      data: { dataSource: "API", sourceUrl: trimmedUrl, lastSyncedAt: new Date() },
    }),
  ]);

  revalidatePath("/football/team");
  return { ok: true, count: result.data.length };
}
