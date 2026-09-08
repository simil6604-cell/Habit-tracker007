export type Standing = {
  rank: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export function analyzeTable(standings: Standing[], myTeamName: string, weaknesses: string[]) {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const mine = sorted.find((s) => s.teamName.toLowerCase() === myTeamName.toLowerCase());
  if (!mine) return null;

  const leader = sorted[0];
  const gap = leader ? leader.points - mine.points : 0;
  const goalDiff = mine.goalsFor - mine.goalsAgainst;

  const insights: string[] = [];
  let winsToFirst: number | null = null;
  if (mine.rank === 1) {
    insights.push("You're currently top of the table — focus on maintaining consistency.");
  } else if (gap > 0) {
    insights.push(`You are ${gap} point${gap === 1 ? "" : "s"} behind ${leader.teamName} in 1st place.`);
    winsToFirst = Math.ceil(gap / 3);
    insights.push(
      `Best case: winning your next ${winsToFirst} match${winsToFirst === 1 ? "" : "es"} in a row (3 points each) while ${leader.teamName} takes none would draw you level — a simplified scenario, not a prediction, since it ignores their own remaining results.`
    );
  }
  if (goalDiff < 0) {
    insights.push("Your goal difference is negative — defensive solidity should be a priority.");
  }
  if (weaknesses.length > 0) {
    insights.push(`Your reported weaknesses (${weaknesses.join(", ")}) are a good place to focus individual training this week.`);
  }

  return { mine, leader, gap, goalDiff, winsToFirst, insights };
}
