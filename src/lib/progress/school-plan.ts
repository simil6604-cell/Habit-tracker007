import { prisma } from "@/lib/db/prisma";
import { buildPlan, type Milestone, type ProgressPlan } from "./milestones";

/**
 * School's own progress plan.
 *
 * Its own file, its own milestones, its own page. Gym and Football have theirs
 * beside it and nothing is added across the three — a combined number would
 * hide the one thing this is for, which is seeing where you stand in ONE of
 * them and what would move it.
 *
 * Every target below is measured against real rows. Nothing here is a grade
 * and nothing is an estimate: "12 of 20" is a fact you can check against your
 * own memory, and that is what makes the rest of the page worth believing.
 */
export async function getSchoolProgress(userId: string, now: Date = new Date()): Promise<ProgressPlan> {
  const [
    subjects,
    topics,
    flashcards,
    homeworkDone,
    notePhotos,
    logEntries,
    recordings,
    studyMinutes,
    examPlans,
    habitLogs,
    slots,
  ] = await Promise.all([
    prisma.subject.count({ where: { userId } }),
    prisma.topic.findMany({
      where: { subject: { userId } },
      select: { name: true, progressPct: true, subject: { select: { name: true } } },
    }),
    prisma.flashcard.findMany({ where: { userId }, select: { interval: true, lastResult: true } }),
    prisma.homework.count({ where: { userId, status: "DONE" } }),
    prisma.notePhoto.count({ where: { userId } }),
    prisma.learningLogEntry.findMany({ where: { userId }, select: { type: true } }),
    prisma.classRecording.count({ where: { userId } }),
    prisma.studySession.findMany({ where: { userId, completed: true }, select: { start: true, end: true } }),
    prisma.examPlan.count({ where: { userId } }),
    prisma.schoolHabitLog.count({ where: { habit: { userId } } }),
    prisma.timetableSlot.count({ where: { userId } }),
  ]);

  const minutes = studyMinutes.reduce(
    (total, s) => total + Math.max(0, Math.round((s.end.getTime() - s.start.getTime()) / 60000)),
    0
  );
  const solid = topics.filter((t) => t.progressPct >= 80).length;
  const halfway = topics.filter((t) => t.progressPct >= 50).length;
  const answered = flashcards.filter((c) => c.lastResult !== null).length;
  const strong = flashcards.filter((c) => c.interval >= 21).length;
  const confusions = logEntries.filter((e) => e.type === "CONFUSED").length;

  const milestones: Milestone[] = [
    { id: "school-subjects", name: "Subjects in", description: "Add 5 subjects you actually take", category: "Setup", target: 5, value: subjects, unit: "subjects" },
    { id: "school-timetable", name: "Timetable up", description: "Fill in 10 lessons of your week", category: "Setup", target: 10, value: slots, unit: "lessons" },
    { id: "school-topics", name: "Topic map", description: "Break your subjects into 20 topics", category: "Setup", target: 20, value: topics.length, unit: "topics" },
    { id: "school-halfway", name: "Halfway there", description: "Get 10 topics past 50%", category: "Mastery", target: 10, value: halfway, unit: "topics" },
    { id: "school-solid", name: "Solid ground", description: "Get 10 topics past 80%", category: "Mastery", target: 10, value: solid, unit: "topics" },
    { id: "school-cards", name: "Deck builder", description: "Make 30 flashcards", category: "Revision", target: 30, value: flashcards.length, unit: "cards" },
    { id: "school-answered", name: "Actually reviewing", description: "Answer 50 flashcards", category: "Revision", target: 50, value: answered, unit: "cards" },
    { id: "school-strong", name: "It stuck", description: "Get 10 cards to a 21-day interval", category: "Revision", target: 10, value: strong, unit: "cards" },
    { id: "school-notes", name: "Note keeper", description: "Save 15 photos of your notes", category: "Material", target: 15, value: notePhotos, unit: "photos" },
    { id: "school-recordings", name: "Caught the lesson", description: "Record 3 classes", category: "Material", target: 3, value: recordings, unit: "recordings" },
    { id: "school-confusions", name: "Says what it doesn't get", description: "Write down 10 things you didn't understand", category: "Honesty", target: 10, value: confusions, unit: "notes" },
    { id: "school-homework", name: "Homework done", description: "Finish 25 pieces of homework", category: "Consistency", target: 25, value: homeworkDone, unit: "pieces" },
    { id: "school-habits", name: "Daily habits", description: "Tick 50 school habits", category: "Consistency", target: 50, value: habitLogs, unit: "ticks" },
    { id: "school-hours", name: "Hours in", description: "Log 20 hours of study you ticked off", category: "Consistency", target: 20 * 60, value: minutes, unit: "minutes" },
    { id: "school-examplan", name: "Planned a paper", description: "Build a day-by-day plan up to an exam", category: "Exams", target: 1, value: examPlans, unit: "plans" },
  ];

  /**
   * Where there is room to get better.
   *
   * Separate from the milestone list because a list of targets says what is
   * UNFINISHED, and that is not the same question as what is WEAK. These are
   * read off the real numbers and each one names something to do.
   */
  const focus: string[] = [];

  const weakest = [...topics].filter((t) => t.progressPct < 60).sort((a, b) => a.progressPct - b.progressPct).slice(0, 3);
  if (weakest.length > 0) {
    focus.push(
      `Weakest topics right now: ${weakest.map((t) => `${t.name} (${t.progressPct}%)`).join(", ")}.`
    );
  }

  // The same "last four weeks" line Gym and Football carry, so the three plans
  // answer the consistency question the same way.
  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
  const recentMinutes = studyMinutes
    .filter((s) => s.start >= fourWeeksAgo)
    .reduce((total, s) => total + Math.max(0, Math.round((s.end.getTime() - s.start.getTime()) / 60000)), 0);
  if (minutes > 0) {
    focus.push(`Last four weeks: ${Math.round(recentMinutes / 60)}h of study you ticked off, about ${Math.round(recentMinutes / 4 / 60 * 10) / 10}h a week.`);
  }

  const untouched = topics.filter((t) => t.progressPct === 0).length;
  if (untouched > 0) {
    focus.push(`${untouched} ${untouched === 1 ? "topic has" : "topics have"} not been started at all yet.`);
  }

  if (flashcards.length > 0 && answered === 0) {
    focus.push("You have cards but have never answered one — the whole point of them starts at the first review.");
  }

  if (confusions > 0) {
    focus.push(`${confusions} thing${confusions === 1 ? "" : "s"} you marked as not understood can be turned into flashcards in one click.`);
  }

  if (topics.length === 0) {
    focus.push("No topics yet, so nothing here can measure how well you know anything. Add them under a subject.");
  }

  const bestSubject = new Map<string, { total: number; count: number }>();
  for (const topic of topics) {
    const entry = bestSubject.get(topic.subject.name) ?? { total: 0, count: 0 };
    entry.total += topic.progressPct;
    entry.count++;
    bestSubject.set(topic.subject.name, entry);
  }
  const ranked = [...bestSubject.entries()].map(([name, e]) => ({ name, avg: Math.round(e.total / e.count) })).sort((a, b) => a.avg - b.avg);
  if (ranked.length >= 2) {
    focus.push(`Across subjects, ${ranked[0].name} is your lowest at ${ranked[0].avg}% and ${ranked[ranked.length - 1].name} your highest at ${ranked[ranked.length - 1].avg}%.`);
  }

  return buildPlan("SCHOOL", milestones, {
    focus,
    highlights: [
      { label: "Topics tracked", value: String(topics.length), note: `${solid} past 80%` },
      { label: "Study logged", value: `${Math.round(minutes / 60)}h`, note: "ticked off, not planned" },
    ],
  });
}
