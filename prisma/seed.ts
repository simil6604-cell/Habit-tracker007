/**
 * Optional demo-data seed. Populates one demo account with realistic
 * example data (mock, not real Cambridge/league content) so charts and
 * progress views aren't empty on first look. Not required for normal use —
 * real accounts start empty via the onboarding flow.
 *
 * The timetable below is transcribed from a real IGCSE school timetable
 * photo the user shared, so the diagram view has a genuine example to show.
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
    { name: "IGCSE Mathematics", color: "#6366f1", isExamSubject: true, topics: [["Algebra", 90], ["Functions", 75], ["Geometry", 50], ["Statistics", 80]] },
    { name: "IGCSE Biology", color: "#0ea5e9", isExamSubject: true, topics: [["Cell Biology", 60], ["Genetics", 35], ["Ecology", 70]] },
    { name: "English", color: "#22c55e", isExamSubject: false, topics: [["Comprehension", 85], ["Essay Writing", 65]] },
    { name: "German", color: "#f97316", isExamSubject: false, topics: [] },
    { name: "Economics", color: "#8b5cf6", isExamSubject: false, topics: [] },
    { name: "PSHE", color: "#64748b", isExamSubject: false, topics: [] },
    { name: "PE", color: "#14b8a6", isExamSubject: false, topics: [] },
  ] as const;

  const subjectByName = new Map<string, { id: string }>();
  for (const def of subjectDefs) {
    const existing = await prisma.subject.findFirst({ where: { userId: user.id, name: def.name } });
    const subject =
      existing ??
      (await prisma.subject.create({
        data: { userId: user.id, name: def.name, color: def.color, isExamSubject: def.isExamSubject },
      }));
    subjectByName.set(def.name, subject);
    for (const [name, progress] of def.topics) {
      const t = await prisma.topic.findFirst({ where: { subjectId: subject.id, name } });
      if (!t) {
        await prisma.topic.create({
          data: { subjectId: subject.id, name, progressPct: progress, examRelevance: progress < 60 ? "HIGH" : "MEDIUM" },
        });
      }
    }
  }

  const biology = subjectByName.get("IGCSE Biology")!;
  const maths = subjectByName.get("IGCSE Mathematics")!;

  const existingExam = await prisma.exam.findFirst({ where: { userId: user.id, subjectId: biology.id, title: "IGCSE Biology Mid-Term" } });
  if (!existingExam) {
    await prisma.exam.create({
      data: { userId: user.id, subjectId: biology.id, title: "IGCSE Biology Mid-Term", date: new Date(Date.now() + 4 * 86400000) },
    });
  }
  const existingHomework = await prisma.homework.findFirst({ where: { userId: user.id, subjectId: maths.id, title: "Functions worksheet" } });
  if (!existingHomework) {
    await prisma.homework.create({ data: { userId: user.id, subjectId: maths.id, title: "Functions worksheet", dueDate: new Date(Date.now() + 86400000) } });
  }

  // ---------- Real timetable (Mon-Fri), transcribed from the user's photo ----------
  // Each row: [periodName, start, end, periodType, [Mon, Tue, Wed, Thu, Fri]]
  // A cell is a subject name (-> linked lesson), a plain label, or null (free).
  const CLUB = (name: string) => ({ label: name, highlight: true });
  type Cell = string | { label: string; highlight: boolean } | null;
  const timetableRows: [string, string, string, string, Cell[]][] = [
    ["AM Regs", "08:30", "08:40", "REGISTRATION", ["AM Regs", "AM Regs", "AM Regs", "AM Regs", "AM Regs"]],
    ["P1", "08:40", "09:35", "LESSON", ["German", "Economics", "German", "English", "PSHE"]],
    ["P2", "09:35", "10:30", "LESSON", ["German", null, "IGCSE Mathematics", null, "English"]],
    ["AM Break", "10:30", "10:55", "BREAK", ["Break", "Break", "Break", "Break", "Break"]],
    ["P3", "10:55", "11:50", "LESSON", ["PE", "German", "English", "German", "Economics"]],
    ["P4", "11:50", "12:45", "LESSON", ["IGCSE Biology", "English", "Economics", null, null]],
    ["Lunch", "12:45", "13:30", "LUNCH", ["Lunch", "Lunch", "Lunch", "Lunch", "Lunch"]],
    ["P5", "13:30", "14:25", "LESSON", ["English", "Study", "PE", "Study", "IGCSE Biology"]],
    ["P6", "14:25", "15:20", "LESSON", ["Economics", "Study", "Study", null, "Study"]],
    ["PM Regs", "15:20", "15:30", "REGISTRATION", ["PM Regs", "PM Regs", "PM Regs", "PM Regs", "PM Regs"]],
    ["Clubs", "15:30", "16:30", "CLUB", [null, CLUB("IGCSE Science Club"), null, CLUB("IGCSE Maths Club"), null]],
  ];

  const existingSlots = await prisma.timetableSlot.count({ where: { userId: user.id } });
  if (existingSlots === 0) {
    for (const [periodName, startTime, endTime, periodType, cells] of timetableRows) {
      for (let day = 0; day < cells.length; day++) {
        const cell = cells[day];
        if (!cell) continue;
        const text = typeof cell === "object" ? cell.label : cell;
        const highlightFlag = typeof cell === "object" ? cell.highlight : false;
        const subject = subjectByName.get(text);
        await prisma.timetableSlot.create({
          data: {
            userId: user.id,
            dayOfWeek: day,
            startTime,
            endTime,
            periodName,
            periodType: subject ? "LESSON" : text === "Study" ? "STUDY" : periodType,
            subjectId: subject?.id ?? null,
            label: subject ? null : text,
            highlight: highlightFlag,
          },
        });
      }
    }
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

  const habitDefs = [
    { name: "Homework done", emoji: "📓" },
    { name: "Reviewed today's lessons", emoji: "📖" },
    { name: "No missed periods", emoji: "🕒" },
  ];
  const habits = [];
  for (let i = 0; i < habitDefs.length; i++) {
    const existing = await prisma.schoolHabit.findFirst({ where: { userId: user.id, name: habitDefs[i].name } });
    habits.push(
      existing ?? (await prisma.schoolHabit.create({ data: { userId: user.id, ...habitDefs[i], order: i } }))
    );
  }

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  for (let daysAgo = 0; daysAgo < 21; daysAgo++) {
    const date = new Date(todayMidnight);
    date.setDate(date.getDate() - daysAgo);
    for (const habit of habits) {
      // A plausible, varied-but-improving pattern — not real tracked history.
      const chance = 0.5 + (21 - daysAgo) * 0.015;
      if (Math.random() < chance) {
        await prisma.schoolHabitLog.upsert({
          where: { habitId_date: { habitId: habit.id, date } },
          create: { habitId: habit.id, date },
          update: {},
        });
      }
    }
  }

  console.log(`Seeded demo account: ${email} / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
