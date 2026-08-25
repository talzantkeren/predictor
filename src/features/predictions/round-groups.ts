import type { LeagueMatchItem } from "@/features/predictions/types";

export type LeagueRoundGroup = {
  roundNumber: number;
  matches: LeagueMatchItem[];
  predictionsSubmitted: number;
};

export function groupMatchesByRound(
  matches: readonly LeagueMatchItem[],
): LeagueRoundGroup[] {
  const groups = new Map<number, LeagueMatchItem[]>();

  for (const match of matches) {
    const group = groups.get(match.roundNumber);
    if (group) {
      group.push(match);
    } else {
      groups.set(match.roundNumber, [match]);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([roundNumber, roundMatches]) => {
      const orderedMatches = [...roundMatches].sort(
        (left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt),
      );
      return {
        roundNumber,
        matches: orderedMatches,
        predictionsSubmitted: orderedMatches.filter(
          (match) => match.ownPrediction !== null,
        ).length,
      };
    });
}
