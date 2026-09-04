"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { SUBJECT_COLORS } from "@/lib/data/cambridge";

const payloadSchema = z.object({
  optimizeSchool: z.boolean(),
  optimizeGym: z.boolean(),
  optimizeFootball: z.boolean(),

  schoolName: z.string().optional(),
  educationSystem: z.string().optional(),
  yearGroup: z.string().optional(),
  subjects: z.array(z.string()).default([]),

  gymGoals: z.array(z.string()).default([]),

  footballPosition: z.string().optional(),
  footballTeamName: z.string().optional(),
  footballStrengths: z.array(z.string()).default([]),
  footballWeaknesses: z.array(z.string()).default([]),
});

export type OnboardingPayload = z.infer<typeof payloadSchema>;

export async function completeOnboarding(raw: OnboardingPayload) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const data = payloadSchema.parse(raw);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        optimizeSchool: data.optimizeSchool,
        optimizeGym: data.optimizeGym,
        optimizeFootball: data.optimizeFootball,
      },
    });

    if (data.optimizeSchool && data.schoolName) {
      const school = await tx.school.upsert({
        where: { userId },
        create: {
          userId,
          name: data.schoolName,
          educationSystem: data.educationSystem ?? "OTHER",
          yearGroup: data.yearGroup,
        },
        update: {
          name: data.schoolName,
          educationSystem: data.educationSystem ?? "OTHER",
          yearGroup: data.yearGroup,
        },
      });
      void school;

      for (const [i, name] of data.subjects.entries()) {
        const existing = await tx.subject.findFirst({ where: { userId, name } });
        if (!existing) {
          await tx.subject.create({
            data: { userId, name, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] },
          });
        }
      }
    }

    if (data.optimizeGym) {
      for (const title of data.gymGoals) {
        const existing = await tx.goal.findFirst({ where: { userId, category: "GYM", title } });
        if (!existing) {
          await tx.goal.create({ data: { userId, category: "GYM", title } });
        }
      }
    }

    if (data.optimizeFootball && data.footballPosition) {
      let teamId: string | undefined;
      if (data.footballTeamName) {
        let team = await tx.footballTeam.findFirst({ where: { name: data.footballTeamName } });
        if (!team) {
          team = await tx.footballTeam.create({
            data: { name: data.footballTeamName, dataSource: "MANUAL" },
          });
        }
        teamId = team.id;
      }

      await tx.footballProfile.upsert({
        where: { userId },
        create: {
          userId,
          position: data.footballPosition,
          teamId,
          strengths: data.footballStrengths.join(","),
          weaknesses: data.footballWeaknesses.join(","),
        },
        update: {
          position: data.footballPosition,
          teamId,
          strengths: data.footballStrengths.join(","),
          weaknesses: data.footballWeaknesses.join(","),
        },
      });
    }

    await tx.user.update({ where: { id: userId }, data: { onboardingComplete: true } });
  });

  redirect("/");
}
