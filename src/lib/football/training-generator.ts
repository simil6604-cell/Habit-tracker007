import { POSITION_FOCUS, type FootballPosition } from "@/lib/data/football";

export type Drill = { name: string; minutes: number };

/**
 * Deterministic, position- and weakness-aware individual training generator.
 * Rule-based stand-in for an LLM call — always produces drills relevant to
 * the player's actual position and self-reported weaknesses.
 */
export function generateIndividualTraining(position: FootballPosition, weaknesses: string[]): {
  title: string;
  durationMin: number;
  focus: string;
  drills: Drill[];
} {
  const positionFocus = POSITION_FOCUS[position] ?? [];
  const weakFocus = weaknesses.filter((w) => !positionFocus.includes(w));

  // Weaknesses get more minutes since they're the priority; position focus fills the rest.
  const drills: Drill[] = [];
  for (const w of weakFocus.slice(0, 2)) drills.push({ name: w, minutes: 10 });
  for (const f of positionFocus.slice(0, 3)) {
    if (drills.find((d) => d.name === f)) continue;
    drills.push({ name: f, minutes: drills.length < 2 ? 10 : 5 });
  }
  if (drills.length === 0) drills.push({ name: "General Ball Mastery", minutes: 20 });

  const durationMin = drills.reduce((sum, d) => sum + d.minutes, 0);

  return {
    title: "Individual Training",
    durationMin,
    focus: weakFocus[0] ?? positionFocus[0] ?? "General",
    drills,
  };
}
