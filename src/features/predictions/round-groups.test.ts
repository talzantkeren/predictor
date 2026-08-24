import { describe, expect, it } from "vitest";

import { groupMatchesByRound } from "@/features/predictions/round-groups";
import type { LeagueMatchItem } from "@/features/predictions/types";

function createMatch(
  id: string,
  roundNumber: number,
  kickoffAt: string,
  hasPrediction = false,
): LeagueMatchItem {
  return {
    id,
    roundNumber,
    kickoffAt,
    predictionsLockedAt: null,
    status: "scheduled",
    providerStatus: null,
    homeScore: null,
    awayScore: null,
    homeTeam: { id: `${id}-home`, name: `בית ${id}`, shortName: null },
    awayTeam: { id: `${id}-away`, name: `חוץ ${id}`, shortName: null },
    ownPrediction: hasPrediction
      ? {
          id: `${id}-prediction`,
          predictedHomeScore: 1,
          predictedAwayScore: 0,
          predictedOutcome: "HOME",
          createdAt: "2026-08-24T10:00:00.000Z",
          updatedAt: "2026-08-24T10:00:00.000Z",
        }
      : null,
  };
}

describe("groupMatchesByRound", () => {
  it("groups and orders rounds and matches without changing the input", () => {
    const input = [
      createMatch("late", 2, "2026-09-02T18:00:00.000Z"),
      createMatch("second", 1, "2026-09-01T20:00:00.000Z", true),
      createMatch("first", 1, "2026-09-01T17:00:00.000Z"),
    ];
    const originalOrder = input.map((match) => match.id);

    const groups = groupMatchesByRound(input);

    expect(groups.map((group) => group.roundNumber)).toEqual([1, 2]);
    expect(groups[0]?.matches.map((match) => match.id)).toEqual([
      "first",
      "second",
    ]);
    expect(groups[0]?.predictionsSubmitted).toBe(1);
    expect(input.map((match) => match.id)).toEqual(originalOrder);
  });

  it("returns an empty list for an empty input", () => {
    expect(groupMatchesByRound([])).toEqual([]);
  });

  it("counts submitted predictions across mixed match states", () => {
    const finished = createMatch(
      "finished",
      3,
      "2026-09-03T17:00:00.000Z",
      true,
    );
    finished.status = "finished";
    finished.homeScore = 2;
    finished.awayScore = 1;
    const canceled = createMatch(
      "canceled",
      3,
      "2026-09-03T20:00:00.000Z",
    );
    canceled.status = "canceled";

    expect(groupMatchesByRound([canceled, finished])).toMatchObject([
      {
        roundNumber: 3,
        predictionsSubmitted: 1,
        matches: [{ id: "finished" }, { id: "canceled" }],
      },
    ]);
  });
});
