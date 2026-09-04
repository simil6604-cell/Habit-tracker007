import { prisma } from "@/lib/db/prisma";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { generateDayPlan } from "./schedule-generator";
import { computeDomainScores } from "@/lib/planner/scores";
import { runWeeklyBalanceCheck } from "./balance-engine";

const KEYWORDS = {
  exam: /\b(exam|test|klausur|pr[uü]fung)\b/i,
  football: /\b(football|fu[ßs]ball|soccer|match|spiel)\b/i,
  gym: /\b(gym|workout|training|kraft|fitness)\b/i,
  optimizeWeek: /(optimi[sz]e|plan).*(week|woche)|entire week|whole week/i,
  tired: /\b(tired|exhausted|müde|erschöpft|overwhelmed)\b/i,
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

async function todaysFootballOrGym(userId: string) {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  const [training, match, session] = await Promise.all([
    prisma.footballTraining.findFirst({ where: { profile: { userId }, date: { gte: start, lte: end } } }),
    prisma.footballMatch.findFirst({ where: { profile: { userId }, date: { gte: start, lte: end } } }),
    prisma.workoutSession.findFirst({ where: { userId, date: { gte: start, lte: end } }, include: { workout: true } }),
  ]);
  if (match) return { label: `Match vs ${match.opponent}`, at: match.date };
  if (training?.date) return { label: training.title, at: training.date };
  if (session) return { label: session.workout?.name ?? "Workout", at: session.date };
  return null;
}

async function nearestExam(userId: string) {
  return prisma.exam.findFirst({
    where: { userId, date: { gte: new Date() } },
    include: { subject: { include: { topics: true } } },
    orderBy: { date: "asc" },
  });
}

export async function generateCoachReply(userId: string, userMessage: string): Promise<string> {
  if (KEYWORDS.optimizeWeek.test(userMessage)) {
    await runWeeklyBalanceCheck(userId);
    const scores = await computeDomainScores(userId);
    const pending = await prisma.aIRecommendation.findMany({
      where: { userId, status: { in: ["PENDING", "INFO"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const lines = [
      `Here's your balanced weekly overview:`,
      `School ${scores.school}% · Gym ${scores.gym}% · Football ${scores.football}% · Recovery ${scores.recovery}%`,
      "",
      ...pending.map((r) => `${r.title}\n${r.message}`),
    ];
    return lines.join("\n");
  }

  if (KEYWORDS.tired.test(userMessage)) {
    return "It's completely normal to feel stretched sometimes. Recovery isn't optional — if you're consistently exhausted, that's a sign to scale back gym or football volume, not push through. If this feeling persists, it's worth talking to a parent, coach or doctor rather than relying on an app.";
  }

  const mentionsExam = KEYWORDS.exam.test(userMessage);
  const mentionsFootball = KEYWORDS.football.test(userMessage);
  const mentionsGym = KEYWORDS.gym.test(userMessage) && !mentionsFootball;

  if (mentionsExam && (mentionsFootball || mentionsGym)) {
    const exam = await nearestExam(userId);
    const todaySession = await todaysFootballOrGym(userId);

    if (!exam) {
      return "I don't see an upcoming exam in your School section yet — add it there and I can build a proper plan around it.";
    }

    const weakTopics = (exam.subject?.topics ?? []).filter((t) => t.progressPct < 70).sort((a, b) => a.progressPct - b.progressPct);
    const topic = weakTopics[0];

    const lines: string[] = [];
    const now = new Date();
    let cursor = now.getHours() < 15 ? new Date(now.setHours(16, 0, 0, 0)) : new Date();

    if (todaySession) {
      const beforeTraining = todaySession.at.getTime() - cursor.getTime() > 45 * 60 * 1000;
      if (beforeTraining) {
        lines.push(`${fmtTime(cursor)} – ${fmtTime(new Date(cursor.getTime() + 30 * 60 * 1000))}\nRest + snack`);
        cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
        const revisionEnd = new Date(Math.min(todaySession.at.getTime() - 15 * 60 * 1000, cursor.getTime() + 60 * 60 * 1000));
        lines.push(`${fmtTime(cursor)} – ${fmtTime(revisionEnd)}\n${exam.subject?.name ?? "Exam"} revision${topic ? ` – ${topic.name}` : ""}`);
        lines.push(`${fmtTime(revisionEnd)} – ${fmtTime(todaySession.at)}\nBreak`);
      }
      lines.push(`${fmtTime(todaySession.at)} – ${todaySession.label}`);
      lines.push(`After ${todaySession.label.toLowerCase().includes("match") ? "the match" : "training"}:\nLight review only — no new material, just skim your notes.`);
    } else {
      lines.push(`${fmtTime(cursor)} – ${fmtTime(new Date(cursor.getTime() + 45 * 60 * 1000))}\n${exam.subject?.name ?? "Exam"} revision${topic ? ` – ${topic.name}` : ""}`);
    }

    const daysUntil = Math.max(0, Math.round((exam.date.getTime() - Date.now()) / 86400000));
    lines.push(
      "",
      `Why: your ${exam.subject?.name ?? ""} exam is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}${topic ? `, and "${topic.name}" is currently at ${topic.progressPct}%` : ""}. I kept your training in place and built revision around it instead of replacing it — recovery and match/training performance matter too.`
    );

    return lines.join("\n");
  }

  if (mentionsExam) {
    const exam = await nearestExam(userId);
    if (!exam) return "I don't see any upcoming exams logged yet — add one under School → Upcoming Exams and I'll help you prepare.";
    const daysUntil = Math.max(0, Math.round((exam.date.getTime() - Date.now()) / 86400000));
    const weakest = (exam.subject?.topics ?? []).sort((a, b) => a.progressPct - b.progressPct)[0];
    return `Your next exam is ${exam.subject?.name ?? exam.title} in ${daysUntil} day${daysUntil === 1 ? "" : "s"}.${weakest ? ` Your weakest topic there is "${weakest.name}" at ${weakest.progressPct}% — that's where I'd focus first.` : ""} Check the Study Planner for a full day-by-day plan.`;
  }

  if (mentionsFootball || mentionsGym) {
    const plan = await generateDayPlan(userId, addDays(new Date(), 1));
    return `Looking at tomorrow: ${plan.reasons.join(" ") || "nothing heavy is scheduled yet."} ${plan.overloaded ? "It's shaping up to be a lot — consider lightening the load somewhere." : "It looks manageable."}`;
  }

  // Generic fallback: summarize tomorrow.
  const plan = await generateDayPlan(userId, addDays(new Date(), 1));
  const scores = await computeDomainScores(userId);
  return [
    `Here's where things stand: School ${scores.school}% · Gym ${scores.gym}% · Football ${scores.football}% · Recovery ${scores.recovery}%.`,
    plan.reasons.length ? `For tomorrow (${format(addDays(new Date(), 1), "EEEE")}): ${plan.reasons.join(" ")}` : "Nothing urgent is scheduled for tomorrow.",
    "Ask me things like \"I have an exam tomorrow and football today, what should I do?\" or \"optimize my entire week\".",
  ].join("\n\n");
}
