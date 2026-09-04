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
  if (mine.rank === 1) {
    insights.push("You're currently top of the table — focus on maintaining consistency.");
  } else if (gap > 0) {
    insights.push(`You are ${gap} point${gap === 1 ? "" : "s"} behind ${leader.teamName} in 1st place.`);
  }
  if (goalDiff < 0) {
    insights.push("Your goal difference is negative — defensive solidity should be a priority.");
  }
  if (weaknesses.length > 0) {
    insights.push(`Your reported weaknesses (${weaknesses.join(", ")}) are a good place to focus individual training this week.`);
  }

  return { mine, leader, gap, goalDiff, insights };
}
