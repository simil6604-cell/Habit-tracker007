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

/** 1st, 2nd, 3rd, 4th… — "2th" in a headline reads like a bug. */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export type TableAnalysis = {
  mine: Standing;
  leader: Standing;
  /** Points between you and 1st. 0 when you are top. */
  gap: number;
  goalDiff: number;
  /** Goal difference you'd have to make up to win a tie on GD. */
  goalDiffGap: number;
  teamsInLeague: number;
  /** Matches each team plays in a full season — inferred, see seasonNote. */
  seasonMatches: number;
  seasonNote: string;
  matchesLeft: number;
  leaderMatchesLeft: number;
  /** Your points if you won every remaining match. */
  maxPoints: number;
  /** False when 1st is out of reach even if you win out and the leader loses out. */
  stillPossible: boolean;
  /** Leader's finish if they keep their current points-per-game. */
  leaderProjected: number;
  /** Points you'd need from your remaining matches to edge that projection. */
  pointsNeeded: number;
  winsNeeded: number;
  pointsPerMatchNeeded: number | null;
  insights: string[];
};

/**
 * Works out where a team really stands and what 1st place would take.
 *
 * The one thing a standings table can't tell us is how many matches a season
 * has — single or double round-robin — so it's inferred from the most-played
 * team and stated in the output rather than hidden. Everything that follows
 * from it (matches left, points needed) is arithmetic on the real numbers, and
 * the leader projection is labelled as a projection, never a prediction.
 */
export function analyzeTable(
  standings: Standing[],
  myTeamName: string,
  weaknesses: string[]
): TableAnalysis | null {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const mine = sorted.find((s) => s.teamName.toLowerCase() === myTeamName.toLowerCase());
  const leader = sorted[0];
  if (!mine || !leader) return null;

  const teamsInLeague = sorted.length;
  const gap = Math.max(0, leader.points - mine.points);
  const goalDiff = mine.goalsFor - mine.goalsAgainst;
  const leaderGoalDiff = leader.goalsFor - leader.goalsAgainst;
  const goalDiffGap = Math.max(0, leaderGoalDiff - goalDiff);

  const singleRound = Math.max(1, teamsInLeague - 1);
  const mostPlayed = Math.max(...sorted.map((s) => s.played), 0);
  const twoRounds = mostPlayed > singleRound;
  const seasonMatches = twoRounds ? singleRound * 2 : singleRound;
  const seasonNote = twoRounds
    ? `Assuming a home-and-away season (${seasonMatches} matches each) — someone has already played more than ${singleRound}.`
    : `Assuming each team plays every other once (${seasonMatches} matches each). If your league plays home and away, double the matches left.`;

  const matchesLeft = Math.max(0, seasonMatches - mine.played);
  const leaderMatchesLeft = Math.max(0, seasonMatches - leader.played);
  const maxPoints = mine.points + matchesLeft * 3;
  const stillPossible = mine.rank === 1 || maxPoints > leader.points || (maxPoints === leader.points && goalDiffGap === 0);

  const leaderPace = leader.played > 0 ? leader.points / leader.played : 0;
  const leaderProjected = Math.round(leader.points + leaderPace * leaderMatchesLeft);
  const pointsNeeded = Math.max(0, leaderProjected + 1 - mine.points);
  const winsNeeded = Math.ceil(pointsNeeded / 3);
  const pointsPerMatchNeeded = matchesLeft > 0 ? Number((pointsNeeded / matchesLeft).toFixed(2)) : null;

  const insights: string[] = [];

  if (mine.rank === 1) {
    insights.push(
      `You're 1st with ${mine.points} points. The chasing team is ${sorted[1]?.teamName ?? "—"} on ${sorted[1]?.points ?? 0} — a ${Math.max(0, mine.points - (sorted[1]?.points ?? 0))}-point cushion with ${matchesLeft} to play.`
    );
  } else {
    insights.push(
      `You're ${ordinal(mine.rank)} of ${teamsInLeague} on ${mine.points} points, ${gap} behind ${leader.teamName} in 1st, with ${matchesLeft} match${matchesLeft === 1 ? "" : "es"} left.`
    );
  }

  if (!stillPossible) {
    insights.push(
      `1st is out of reach on points: winning all ${matchesLeft} remaining matches gets you to ${maxPoints}, and ${leader.teamName} already has ${leader.points}. Second place is the target now.`
    );
  } else if (mine.rank !== 1) {
    insights.push(
      `If ${leader.teamName} keeps their current pace (${leaderPace.toFixed(2)} points per match) they finish on about ${leaderProjected}. To beat that you need ${pointsNeeded} points from ${matchesLeft} — that's ${winsNeeded} win${winsNeeded === 1 ? "" : "s"}, or ${pointsPerMatchNeeded} points per match. A projection from their form so far, not a prediction.`
    );
    if (pointsNeeded > matchesLeft * 3) {
      insights.push(`That's more than the ${matchesLeft * 3} points still available to you, so you also need them to drop points.`);
    }
    if (goalDiffGap > 0) {
      insights.push(
        `If you finish level on points and your league separates teams on goal difference, you'd need ${goalDiffGap} more goal${goalDiffGap === 1 ? "" : "s"} of difference — score ${goalDiffGap} more or concede ${goalDiffGap} fewer than they do over the run-in.`
      );
    }
  }

  const goalsPerMatch = mine.played > 0 ? mine.goalsFor / mine.played : 0;
  const concededPerMatch = mine.played > 0 ? mine.goalsAgainst / mine.played : 0;
  if (mine.played > 0) {
    insights.push(
      `You score ${goalsPerMatch.toFixed(1)} and concede ${concededPerMatch.toFixed(1)} per match (${mine.goalsFor}:${mine.goalsAgainst} in ${mine.played}). ${
        goalDiff < 0 ? "The negative difference says defending is the bigger lever right now." : "Keep that difference positive and the table takes care of itself."
      }`
    );
  }

  if (mine.played > 0 && mine.drawn >= mine.won && mine.drawn > 0) {
    insights.push(`${mine.drawn} of your ${mine.played} matches were draws — turning even two of those into wins is ${2 * 2} points, often a place or two.`);
  }

  if (weaknesses.length > 0) {
    insights.push(`Your own listed weaknesses (${weaknesses.join(", ")}) are where individual training moves the needle fastest.`);
  }

  return {
    mine,
    leader,
    gap,
    goalDiff,
    goalDiffGap,
    teamsInLeague,
    seasonMatches,
    seasonNote,
    matchesLeft,
    leaderMatchesLeft,
    maxPoints,
    stillPossible,
    leaderProjected,
    pointsNeeded,
    winsNeeded,
    pointsPerMatchNeeded,
    insights,
  };
}
