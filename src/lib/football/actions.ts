"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateIndividualTraining } from "./training-generator";
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
    let team = await prisma.footballTeam.findFirst({ where: { name: teamName } });
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
