import { prisma } from "@/lib/db/prisma";
import { buildPlan, type Milestone, type ProgressPlan } from "./milestones";

/**
 * Football's own progress plan — its own milestones, its own page.
 *
 * Kept apart from School and Gym on purpose. Training twice a week is a
 * football fact; it says nothing about your topics or your lifts, and adding
 * the three together would produce a number that answers no question anyone
 * actually has.
 */
export async function getFootballProgress(userId: string, now: Date = new Date()): Promise<ProgressPlan> {
  const profile = await prisma.footballProfile.findUnique({
    where: { userId },
    select: { id: true, position: true, strengths: true, weaknesses: true, teamId: true },
  });

  const [trainings, matches, drillVideos] = await Promise.all([
    profile
      ? prisma.footballTraining.findMany({
          where: { profileId: profile.id },
          select: { date: true, completed: true, durationMin: true, focus: true, wentWell: true, toImprove: true },
        })
      : Promise.resolve([]),
    profile
      ? prisma.footballMatch.findMany({
          where: { profileId: profile.id },
          select: { date: true, scoreFor: true, scoreAgainst: true, notes: true },
        })
      : Promise.resolve([]),
    prisma.drillVideo.count({ where: { userId } }),
  ]);

  const done = trainings.filter((t) => t.completed);
  const minutes = done.reduce((total, t) => total + t.durationMin, 0);
  const focuses = new Set(done.map((t) => t.focus.trim()).filter(Boolean));
  const diaryEntries = trainings.filter((t) => (t.wentWell ?? "").trim() || (t.toImprove ?? "").trim()).length;
  const scored = matches.filter((m) => m.scoreFor != null && m.scoreAgainst != null);
  const wins = scored.filter((m) => (m.scoreFor ?? 0) > (m.scoreAgainst ?? 0)).length;
  const weaknesses = (profile?.weaknesses ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  const strengths = (profile?.strengths ?? "").split(",").map((w) => w.trim()).filter(Boolean);

  const milestones: Milestone[] = [
    { id: "fb-profile", name: "Position picked", description: "Set the position you actually play", category: "Setup", target: 1, value: profile?.position ? 1 : 0, unit: "profile" },
    { id: "fb-team", name: "Team linked", description: "Connect your team so the table means something", category: "Setup", target: 1, value: profile?.teamId ? 1 : 0, unit: "team" },
    { id: "fb-weaknesses", name: "Named the weak spots", description: "Write down 3 things you want to fix", category: "Setup", target: 3, value: weaknesses.length, unit: "weaknesses", unitOne: "weakness" },
    { id: "fb-first", name: "First sessions", description: "Complete 10 training sessions", category: "Consistency", target: 10, value: done.length, unit: "sessions" },
    { id: "fb-fifty", name: "Season's work", description: "Complete 50 training sessions", category: "Consistency", target: 50, value: done.length, unit: "sessions" },
    { id: "fb-minutes", name: "Hours on the pitch", description: "Train for 40 hours", category: "Consistency", target: 40 * 60, value: minutes, unit: "minutes" },
    { id: "fb-variety", name: "Not just one thing", description: "Train 5 different focus areas", category: "Range", target: 5, value: focuses.size, unit: "areas" },
    { id: "fb-drills", name: "Drill library", description: "Save 8 drill videos to work from", category: "Range", target: 8, value: drillVideos, unit: "videos" },
    { id: "fb-matches", name: "Matches logged", description: "Record 15 matches", category: "Matches", target: 15, value: matches.length, unit: "matches", unitOne: "match" },
    { id: "fb-scores", name: "Results written in", description: "Put the score on 15 matches", category: "Matches", target: 15, value: scored.length, unit: "results" },
    { id: "fb-notes", name: "What happened", description: "Write notes on 10 matches", category: "Matches", target: 10, value: matches.filter((m) => (m.notes ?? "").trim()).length, unit: "notes" },
    { id: "fb-diary", name: "Honest after training", description: "Write what went well or badly after 15 sessions", category: "Reflection", target: 15, value: diaryEntries, unit: "entries", unitOne: "entry" },
  ];

  const focus: string[] = [];

  if (!profile) {
    focus.push("No football profile yet, so nothing here can measure anything. Set your position first.");
  } else {
    if (weaknesses.length > 0) {
      focus.push(`You named these as weak: ${weaknesses.join(", ")} — the training generator uses them, so keep them honest.`);
    } else {
      focus.push("No weaknesses written down. That is the one field the training generator leans on hardest.");
    }

    if (strengths.length > 0 && focuses.size > 0) {
      const untrained = weaknesses.filter(
        (weak) => ![...focuses].some((f) => f.toLowerCase().includes(weak.toLowerCase()))
      );
      if (untrained.length > 0) {
        focus.push(`Nothing you have trained so far was focused on: ${untrained.join(", ")}.`);
      }
    }
  }

  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
  const recent = done.filter((t) => t.date != null && t.date >= fourWeeksAgo).length;
  if (done.length > 0) {
    focus.push(`Last four weeks: ${recent} ${recent === 1 ? "session" : "sessions"} completed.`);
  }

  if (matches.length > 0) {
    focus.push(
      scored.length === 0
        ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} logged but no score on any of them, so there is no record of how they went.`
        : `${wins} won of ${scored.length} matches with a result recorded.`
    );
  }

  if (trainings.length > 0 && diaryEntries === 0) {
    focus.push("No training diary entries yet — what went well and what didn't is the part that turns sessions into progress.");
  }

  return buildPlan("FOOTBALL", milestones, {
    focus,
    highlights: [
      { label: "Sessions done", value: String(done.length), note: `${Math.round(minutes / 60)}h on the pitch` },
      { label: "Matches", value: String(matches.length), note: scored.length > 0 ? `${wins} won of ${scored.length}` : "no results recorded yet" },
    ],
  });
}
