import { ordinal, type Standing } from "./table-analysis";

export type UpcomingMatch = {
  id: string;
  opponent: string;
  date: Date;
  isHome: boolean;
};

export type OpponentPreview = {
  match: UpcomingMatch;
  /** Their row in the league table, when the name could be matched to one. */
  standing: Standing | null;
  /** Negative means they sit above you. Null when either side isn't in the table. */
  rankDelta: number | null;
  read: string;
};

/**
 * Team names get typed by hand ("Zug 94") but arrive from a league page in
 * their full form ("FC Zug 94 a"), so matching is done on a normalised name
 * and falls back to a containment check. No match means no standing — the
 * fixture still shows, just without table context, rather than being paired
 * with the wrong team.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|sc|sv|fv|ac|as|us|cs|bsc|vfl|vfb|tsv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function findStanding(opponent: string, standings: Standing[]): Standing | null {
  const target = normalize(opponent);
  if (!target) return null;

  const exact = standings.find((s) => normalize(s.teamName) === target);
  if (exact) return exact;

  const contained = standings.filter((s) => {
    const n = normalize(s.teamName);
    return n.includes(target) || target.includes(n);
  });
  // Ambiguous ("Zug" matching two Zug sides) is treated as no match, not a coin flip.
  return contained.length === 1 ? contained[0] : null;
}

export function previewOpponents(
  matches: UpcomingMatch[],
  standings: Standing[],
  myTeamName: string,
  limit = 5
): OpponentPreview[] {
  const mine = standings.find((s) => s.teamName.toLowerCase() === myTeamName.toLowerCase()) ?? null;

  return matches.slice(0, limit).map((match) => {
    const standing = findStanding(match.opponent, standings);
    const rankDelta = standing && mine ? standing.rank - mine.rank : null;

    let read: string;
    if (!standing) {
      read = "Not matched to a table row — check the spelling against the league table, or they play in another league.";
    } else {
      const theirGD = standing.goalsFor - standing.goalsAgainst;
      const form = `${ordinal(standing.rank)} on ${standing.points} ${standing.points === 1 ? "pt" : "pts"}, ${standing.goalsFor}:${standing.goalsAgainst} (${theirGD >= 0 ? "+" : ""}${theirGD})`;
      if (rankDelta !== null && rankDelta < 0) {
        read = `${form} — above you, so this is a six-pointer: a win takes points directly off a rival.`;
      } else if (rankDelta !== null && rankDelta > 0) {
        read = `${form} — below you. These are the matches a title run can't afford to drop.`;
      } else {
        read = form;
      }
      const perMatch = standing.played > 0 ? standing.goalsFor / standing.played : 0;
      if (standing.played > 0 && perMatch >= 2) read += ` They score ${perMatch.toFixed(1)} a game — the back line decides this one.`;
    }

    return { match, standing, rankDelta, read };
  });
}
