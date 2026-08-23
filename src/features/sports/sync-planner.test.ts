import { describe, expect, it } from "vitest";
import { z } from "zod";

import contractFixture from "@/features/sports/__fixtures__/sync-contract.json";
import { normalizeMatch } from "@/features/sports/normalization";
import {
  planSyncResults,
  type StoredMatchSnapshot,
} from "@/features/sports/sync-planner";
import { MATCH_STATUSES } from "@/features/sports/types";

const teamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
});

const rawMatchSchema = z.object({
  matchId: z.string().min(1),
  leagueId: z.string().min(1),
  competitionId: z.string().min(1),
  seasonId: z.string().min(1),
  round: z.number().int().positive(),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  kickoffAt: z.string().min(1),
  status: z.string().min(1),
  homeScore: z.number().int().nonnegative().nullable().optional(),
  awayScore: z.number().int().nonnegative().nullable().optional(),
});

const storedMatchSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string().min(1).nullable(),
  status: z.enum(MATCH_STATUSES),
  homeScore: z.number().int().nonnegative().nullable(),
  awayScore: z.number().int().nonnegative().nullable(),
  isManuallyOverridden: z.boolean(),
});

const contractSchema = z.object({
  storedMatches: z.array(storedMatchSchema),
  initialSnapshot: z.array(rawMatchSchema),
  correctedSnapshot: rawMatchSchema,
  unknownStatusSnapshot: rawMatchSchema,
});

const contract = contractSchema.parse(contractFixture);

describe("future provider sync result planner", () => {
  it("normalizes all supported statuses but plans only terminal result changes", () => {
    const normalized = contract.initialSnapshot.map(normalizeMatch);

    expect(normalized.map((match) => match.status)).toEqual([
      "scheduled",
      "live",
      "finished",
      "postponed",
      "canceled",
      "finished",
    ]);
    expect(normalized[1]).toMatchObject({
      status: "live",
      homeScore: null,
      awayScore: null,
    });
    expect(planSyncResults(contract.storedMatches, normalized)).toEqual([
      {
        matchId: "72000000-0000-4000-8000-000000000003",
        status: "finished",
        homeScore: 1,
        awayScore: 1,
      },
      {
        matchId: "72000000-0000-4000-8000-000000000005",
        status: "canceled",
        homeScore: null,
        awayScore: null,
      },
    ]);
  });

  it("always excludes a manually overridden match without changing it", () => {
    const overrideBefore = structuredClone(contract.storedMatches[5]);

    const planned = planSyncResults(
      contract.storedMatches,
      contract.initialSnapshot.map(normalizeMatch),
    );

    expect(planned).not.toContainEqual(
      expect.objectContaining({ matchId: overrideBefore.id }),
    );
    expect(contract.storedMatches[5]).toEqual(overrideBefore);
  });

  it("plans a corrected official result for the same external match", () => {
    const storedAfterInitialResult: StoredMatchSnapshot[] =
      contract.storedMatches.map((match) =>
        match.externalId === "contract-finished"
          ? {
              ...match,
              status: "finished",
              homeScore: 1,
              awayScore: 1,
            }
          : match,
      );

    expect(
      planSyncResults(storedAfterInitialResult, [
        normalizeMatch(contract.correctedSnapshot),
      ]),
    ).toEqual([
      {
        matchId: "72000000-0000-4000-8000-000000000003",
        status: "finished",
        homeScore: 2,
        awayScore: 1,
      },
    ]);
  });

  it("does not plan an unchanged terminal result on retry", () => {
    const storedAfterInitialResult: StoredMatchSnapshot[] = [
      {
        ...contract.storedMatches[2],
        status: "finished",
        homeScore: 1,
        awayScore: 1,
      },
    ];
    const initialFinished = contract.initialSnapshot.find(
      (match) => match.matchId === "contract-finished",
    );

    expect(initialFinished).toBeDefined();
    expect(
      planSyncResults(storedAfterInitialResult, [
        normalizeMatch(initialFinished!),
      ]),
    ).toEqual([]);
  });

  it("rejects an unknown status instead of treating it as official", () => {
    expect(() => normalizeMatch(contract.unknownStatusSnapshot)).toThrow(
      "Unsupported sports match status",
    );
  });

  it("rejects ambiguous duplicate provider or stored identities", () => {
    const normalized = normalizeMatch(contract.initialSnapshot[0]);

    expect(() =>
      planSyncResults(contract.storedMatches, [normalized, normalized]),
    ).toThrow("unique match IDs");
    expect(() =>
      planSyncResults(
        [contract.storedMatches[0], contract.storedMatches[0]],
        [normalized],
      ),
    ).toThrow("unique external IDs");
  });
});
