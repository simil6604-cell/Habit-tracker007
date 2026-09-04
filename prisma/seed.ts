/**
 * Optional demo-data seed. Populates one demo account with realistic
 * example data (mock, not real Cambridge/league content) so charts and
 * progress views aren't empty on first look. Not required for normal use —
 * real accounts start empty via the onboarding flow.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@optimize.app";
  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Demo Student", passwordHash, onboardingComplete: true },
    update: {},
  });

  await prisma.school.upsert({
    where: { userId: user.id },
    create: { userId: user.id, name: "Riverside International School", educationSystem: "IGCSE", yearGroup: "Year 11" },
    update: {},
  });

  const subjectDefs = [
    { name: "Mathematics", color: "#6366f1", topics: [["Algebra", 90], ["Functions", 75], ["Geometry", 50], ["Statistics", 80]] },
    { name: "Physics", color: "#0ea5e9", topics: [["Forces", 60], ["Electricity", 35], ["Waves", 70]] },
    { name: "English Language", color: "#22c55e", topics: [["Comprehension", 85], ["Essay Writing", 65]] },
  ] as const;

  for (const def of subjectDefs) {
    const existing = await prisma.subject.findFirst({ where: { userId: user.id, name: def.name } });
    const subject = existing ?? (await prisma.subject.create({ data: { userId: user.id, name: def.name, color: def.color } }));
    for (const [name, progress] of def.topics) {
      const t = await prisma.topic.findFirst({ where: { subjectId: subject.id, name } });
      if (!t) {
        await prisma.topic.create({
          data: { subjectId: subject.id, name, progressPct: progress, examRelevance: progress < 60 ? "HIGH" : "MEDIUM" },
        });
      }
    }
  }

  const maths = await prisma.subject.findFirst({ where: { userId: user.id, name: "Mathematics" } });
  const physics = await prisma.subject.findFirst({ where: { userId: user.id, name: "Physics" } });
  if (physics) {
    await prisma.exam.create({
      data: { userId: user.id, subjectId: physics.id, title: "Physics Mid-Term", date: new Date(Date.now() + 4 * 86400000) },
    });
  }
  if (maths) {
    await prisma.homework.create({ data: { userId: user.id, subjectId: maths.id, title: "Functions worksheet", dueDate: new Date(Date.now() + 86400000) } });
  }

  const workout = await prisma.workout.upsert({
    where: { id: "seed-upper-body" },
    create: { id: "seed-upper-body", userId: user.id, name: "Upper Body", dayOfWeek: 0 },
    update: {},
  });
  const exerciseNames = [
    ["Bench Press", 3, 8, 40],
    ["Lat Pulldown", 3, 10, 35],
    ["Shoulder Press", 3, 10, 20],
  ] as const;
  for (const [name, sets, reps, weight] of exerciseNames) {
    const existing = await prisma.exercise.findFirst({ where: { workoutId: workout.id, name } });
    if (!existing) {
      await prisma.exercise.create({ data: { workoutId: workout.id, name, targetSets: sets, targetReps: reps, targetWeight: weight } });
    }
  }

  const footballProfile = await prisma.footballProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, position: "ST", weaknesses: "First Touch,Weak Foot" },
    update: {},
  });

  const existingTraining = await prisma.footballTraining.findFirst({ where: { profileId: footballProfile.id } });
  if (!existingTraining) {
    await prisma.footballTraining.create({
      data: {
        profileId: footballProfile.id,
        title: "Team Training",
        date: new Date(new Date().setHours(20, 0, 0, 0)),
        durationMin: 90,
        focus: "Conditioning",
        drills: "[]",
        isTeamSession: true,
      },
    });
  }

  console.log(`Seeded demo account: ${email} / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
