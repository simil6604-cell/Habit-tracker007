import { prisma } from "@/lib/db/prisma";
import { daysUntil } from "@/lib/planner/days-until";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { generateDayPlan } from "./schedule-generator";
import { computeDomainScores } from "@/lib/planner/scores";
import { runWeeklyBalanceCheck } from "./balance-engine";
import { getAIProvider, isRealAIConfigured } from "./provider";
import { buildAcademicSystemPrompt } from "./academic-prompt";

const KEYWORDS = {
  exam: /\b(exam|test|klausur|pr[uü]fung)\b/i,
  football: /\b(football|fu[ßs]ball|soccer|match|spiel)\b/i,
  gym: /\b(gym|workout|training|kraft|fitness)\b/i,
  optimizeWeek: /(optimi[sz]e|plan).*(week|woche)|entire week|whole week/i,
  tired: /\b(tired|exhausted|müde|erschöpft|overwhelmed)\b/i,
  // Asking to be shown something, in either language the student uses.
  wantsPicture:
    /\b(draw|sketch|diagram|picture|visuali[sz]e|show me|zeichne|skizz\w*|diagramm|bild|zeig mir|male)\b/i,
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

function describeMainFocus(focus: string | null | undefined) {
  switch (focus) {
    case "school":
      return "The student's stated main focus is school — when the three compete for the same hours, protect study and exam prep first.";
    case "gym":
      return "The student's stated main focus is the gym — when the three compete for the same hours, protect training and recovery first.";
    case "football":
      return "The student's stated main focus is football — when the three compete for the same hours, protect training, matches and recovery first.";
    default:
      return "The student wants all three kept roughly balanced — don't systematically favour one over the others.";
  }
}

// The coach is often explaining something spatial — a week's layout, a
// session's structure, how load and recovery trade off — where a drawing
// beats a paragraph. Same contract as the topic tutor, so one sanitizer and
// one renderer cover both.
const COACH_DIAGRAM_PROMPT = [
  "When a simple picture would genuinely make your point clearer — a week laid out as blocks, a session broken into phases, a load/recovery curve, a pitch or gym diagram — include exactly one in your reply as a fenced code block starting with ```svg and ending with ```.",
  "Keep it simple: a `viewBox=\"0 0 320 220\"`, basic shapes only (rect, circle, ellipse, line, polyline, polygon, path, text), clear <text> labels, no more than ~40 elements, no external references, no scripts. Only include one when it truly helps — most replies won't need one.",
  "Your reply may be read aloud, so write in plain speakable sentences: no markdown headings, no asterisks for emphasis, and no LaTeX math delimiters. Use real symbols (², √, ×, ≤) where natural.",
].join("\n");

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

  // The canned branches below answer from stored data and can't draw. When
  // the student is explicitly asking to be shown something, that request wins:
  // hand it to the AI, which gets the same data in its system prompt and can
  // actually produce a diagram. Without a real AI connected there's nothing to
  // gain, so the normal routing stands.
  if (isRealAIConfigured && KEYWORDS.wantsPicture.test(userMessage)) {
    const drawn = await askCoachAI(userId, userMessage);
    // You asked to be shown something. Quietly answering a different question
    // from stored data would look like the AI is broken, which is exactly the
    // confusion to avoid — say what went wrong instead.
    if (drawn.ok) return drawn.text;
    return `I couldn't reach the AI to draw that just now (${drawn.error}). Try again in a moment — or ask without asking for a picture and I'll answer from your stored schedule instead.`;
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

    const daysToExam = daysUntil(exam.date);
    lines.push(
      "",
      `Why: your ${exam.subject?.name ?? ""} exam is in ${daysToExam} day${daysToExam === 1 ? "" : "s"}${topic ? `, and "${topic.name}" is currently at ${topic.progressPct}%` : ""}. I kept your training in place and built revision around it instead of replacing it — recovery and match/training performance matter too.`
    );

    return lines.join("\n");
  }

  if (mentionsExam) {
    const exam = await nearestExam(userId);
    if (!exam) return "I don't see any upcoming exams logged yet — add one under School → Upcoming Exams and I'll help you prepare.";
    const daysToExam = daysUntil(exam.date);
    const weakest = (exam.subject?.topics ?? []).sort((a, b) => a.progressPct - b.progressPct)[0];
    return `Your next exam is ${exam.subject?.name ?? exam.title} in ${daysToExam} day${daysToExam === 1 ? "" : "s"}.${weakest ? ` Your weakest topic there is "${weakest.name}" at ${weakest.progressPct}% — that's where I'd focus first.` : ""} Check the Study Planner for a full day-by-day plan.`;
  }

  if (mentionsFootball || mentionsGym) {
    const plan = await generateDayPlan(userId, addDays(new Date(), 1));
    return `Looking at tomorrow: ${plan.reasons.join(" ") || "nothing heavy is scheduled yet."} ${plan.overloaded ? "It's shaping up to be a lot — consider lightening the load somewhere." : "It looks manageable."}`;
  }

  // Generic fallback: ask a real AI if one's connected, else summarize tomorrow.
  if (isRealAIConfigured) {
    const fromAI = await askCoachAI(userId, userMessage);
    if (fromAI.ok) return fromAI.text;
    // The summary below is still a useful answer, but it isn't the one that was
    // asked for, so it doesn't get to masquerade as one.
    return `(Couldn't reach the AI just now — ${fromAI.error}. Here's what I can tell you from your own data.)\n\n${await ruleBasedSummary(userId)}`;
  }

  return ruleBasedSummary(userId);
}

/**
 * The coach's real-AI path: the student's actual scores, next exam and stated
 * focus as context, and permission to draw.
 *
 * A failure is reported, not swallowed: the caller decides what to show, and
 * the reason is logged so "the AI doesn't work" can actually be diagnosed
 * rather than guessed at.
 */
type CoachAIResult = { ok: true; text: string } | { ok: false; error: string };

async function askCoachAI(userId: string, userMessage: string): Promise<CoachAIResult> {
  {
    const [school, scores, exam, user] = await Promise.all([
      prisma.school.findUnique({ where: { userId } }),
      computeDomainScores(userId),
      nearestExam(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { mainFocus: true } }),
    ]);
    const daysToExam = exam ? daysUntil(exam.date) : null;
    const system = [
      "You are the AI Coach inside a personal School/Gym/Football optimization app, talking directly to the student.",
      buildAcademicSystemPrompt(school?.educationSystem),
      "You also help balance training, recovery and school workload. Reason honestly from the real data below — never invent numbers, results, or syllabus content.",
      `Current scores — School ${scores.school}%, Gym ${scores.gym}%, Football ${scores.football}%, Recovery ${scores.recovery}%.`,
      exam ? `Next exam: ${exam.subject?.name ?? exam.title} in ${daysToExam} day${daysToExam === 1 ? "" : "s"}.` : "No upcoming exam logged yet.",
      describeMainFocus(user?.mainFocus),
      COACH_DIAGRAM_PROMPT,
    ].join("\n");

    try {
      // A reply carrying a diagram runs well past the 1024-token default, and
      // being cut off mid-SVG produces no usable text at all. Measured replies
      // reach ~3000 characters, and the model's own reasoning is counted too,
      // so this is set well clear of the observed ceiling rather than at it.
      return { ok: true, text: await getAIProvider().generate(userMessage, { system, maxTokens: 4000 }) };
    } catch (err) {
      const error = err instanceof Error ? err.message : "unknown error";
      console.error("[coach] AI call failed:", error);
      return { ok: false, error };
    }
  }
}

async function ruleBasedSummary(userId: string): Promise<string> {
  const plan = await generateDayPlan(userId, addDays(new Date(), 1));
  const scores = await computeDomainScores(userId);
  return [
    `Here's where things stand: School ${scores.school}% · Gym ${scores.gym}% · Football ${scores.football}% · Recovery ${scores.recovery}%.`,
    plan.reasons.length ? `For tomorrow (${format(addDays(new Date(), 1), "EEEE")}): ${plan.reasons.join(" ")}` : "Nothing urgent is scheduled for tomorrow.",
    "Ask me things like \"I have an exam tomorrow and football today, what should I do?\" or \"optimize my entire week\".",
  ].join("\n\n");
}
