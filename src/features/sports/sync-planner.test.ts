import { describe, expect, it } from "vitest";
import { z } from "zod";

import contractFixture from "@/features/sports/__fixtures__/sync-contract.json";
import { normalizeMatch } from "@/features/sports/normalization";
import {
  batchTargetFixtureIds,
  buildApiFootballApplyPlan,
  planSyncResults,
  type StoredMatchSnapshot,
} from "@/features/sports/sync-planner";
import { MATCH_STATUSES } from "@/features/sports/types";
import type {
  NormalizedMatch,
  SportsSyncSnapshot,
} from "@/features/sports/types";

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

function normalizedFixture(index: number): NormalizedMatch {
  return {
    matchId: String(2_000_000 + index),
    leagueId: "383",
    competitionId: "383",
    seasonId: "2026",
    round: (index % 26) + 1,
    roundLabel: `Regular Season - ${(index % 26) + 1}`,
    homeTeam: { teamId: "563", name: "הפועל באר שבע", shortName: "הפועל באר שבע" },
    awayTeam: { teamId: "604", name: "מכבי תל אביב", shortName: "מכבי תל אביב" },
    kickoffAt: new Date(Date.UTC(2026, 8, 1, 18, index)).toISOString(),
    status: "scheduled",
    providerStatus: "NS",
    locksPredictions: false,
    resultDisposition: "none",
    reviewCode: null,
    homeScore: null,
    awayScore: null,
  };
}

function snapshot(fixtures: NormalizedMatch[]): SportsSyncSnapshot {
  return {
    provider: "api-football",
    plan: { kind: "catalog" },
    competition: {
      competitionId: "383",
      name: "ליגת העל הישראלית",
      countryCode: "IL",
    },
    season: {
      seasonId: "2026",
      name: "2026/27",
      startsOn: "2026-08-22",
      endsOn: "2027-05-31",
      isCurrent: true,
    },
    teams: [
      { teamId: "563", name: "הפועל באר שבע", shortName: "הפועל באר שבע", isNameMapped: true },
      { teamId: "604", name: "מכבי תל אביב", shortName: "מכבי תל אביב", isNameMapped: true },
    ],
    rounds: [],
    fixtures,
    quota: {
      dailyLimit: 7500,
      dailyRemaining: 7400,
      minuteLimit: 300,
      minuteRemaining: 299,
    },
  };
}

describe("API-Football bounded apply planning", () => {
  it("batches targeted fixture IDs by the provider maximum of 20", () => {
    const ids = Array.from({ length: 45 }, (_, index) => String(index + 1));
    expect(batchTargetFixtureIds(ids).map((batch) => batch.length)).toEqual([
      20,
      20,
      5,
    ]);
    expect(() => batchTargetFixtureIds(["1", "1"])).toThrow("unique");
  });

  it("produces atomic apply batches of at most 50 and is idempotent/pure", () => {
    const source = snapshot(
      Array.from({ length: 101 }, (_, index) => normalizedFixture(index)),
    );
    const before = structuredClone(source);
    const first = buildApiFootballApplyPlan(source);
    const second = buildApiFootballApplyPlan(source);

    expect(first.batches.map((batch) => batch.fixtures.length)).toEqual([
      50,
      50,
      1,
    ]);
    expect(first).toEqual(second);
    expect(source).toEqual(before);
    expect(first.batches[1].competition).toBeNull();
    expect(first.batches[1].teams).toEqual([]);
  });

  it("quarantines unknown rounds and reports unmapped teams safely", () => {
    const reviewFixture = {
      ...normalizedFixture(1),
      reviewCode: "ROUND_REQUIRES_REVIEW",
      roundLabel: "Championship Round - 1",
    };
    const source = snapshot([reviewFixture]);
    source.teams[0] = { ...source.teams[0], isNameMapped: false };
    source.rounds = [
      { label: "Regular Season - 1", roundNumber: 1, requiresReview: false },
      {
        label: "Championship Round - 1",
        roundNumber: null,
        requiresReview: true,
      },
    ];

    expect(buildApiFootballApplyPlan(source)).toMatchObject({
      fixturesSeen: 1,
      operatorNotes: ["ROUND_REQUIRES_REVIEW:2000001", "UNMAPPED_TEAM:563"],
      batches: [
        {
          rounds: [
            {
              label: "Regular Season - 1",
              roundNumber: 1,
              requiresReview: false,
            },
            {
              label: "Championship Round - 1",
              roundNumber: null,
              requiresReview: true,
            },
          ],
          fixtures: [],
        },
      ],
    });
  });

  it("persists AET as review-only work without exposing a score to apply", () => {
    const reviewFixture = {
      ...normalizedFixture(2),
      status: "finished" as const,
      providerStatus: "AET",
      locksPredictions: true,
      resultDisposition: "review" as const,
      reviewCode: "AET_REQUIRES_REVIEW",
    };

    expect(buildApiFootballApplyPlan(snapshot([reviewFixture]))).toMatchObject({
      fixturesSeen: 1,
      operatorNotes: ["AET_REQUIRES_REVIEW:2000002"],
      batches: [
        {
          fixtures: [
            {
              externalId: "2000002",
              status: "finished",
              providerStatus: "AET",
              locksPredictions: true,
              resultDisposition: "review",
              homeScore: null,
              awayScore: null,
            },
          ],
        },
      ],
    });
  });

  it("carries an unknown fixture team into targeted apply by provider ID", () => {
    const targeted = snapshot([normalizedFixture(3)]);
    targeted.plan = { kind: "targeted", fixtureIds: ["2000003"] };
    targeted.competition = null;
    targeted.season = null;
    targeted.teams = [];
    targeted.fixtures[0] = {
      ...targeted.fixtures[0],
      awayTeam: {
        teamId: "999999",
        name: "Future Team (לא ממופה)",
        shortName: "Future Team (לא ממופה)",
        isNameMapped: false,
      },
    };

    expect(buildApiFootballApplyPlan(targeted)).toMatchObject({
      operatorNotes: ["UNMAPPED_TEAM:999999"],
      batches: [
        {
          teams: [
            { externalId: "563" },
            {
              externalId: "999999",
              name: "Future Team (לא ממופה)",
            },
          ],
          fixtures: [
            {
              externalId: "2000003",
              awayTeamExternalId: "999999",
            },
          ],
        },
      ],
    });
  });

  it("splits more than 20 fixture-derived teams before applying fixtures", () => {
    const targeted = snapshot(
      Array.from({ length: 11 }, (_, index) => ({
        ...normalizedFixture(index),
        homeTeam: {
          teamId: String(10_000 + index * 2),
          name: `Home ${index}`,
          shortName: `Home ${index}`,
        },
        awayTeam: {
          teamId: String(10_001 + index * 2),
          name: `Away ${index}`,
          shortName: `Away ${index}`,
        },
      })),
    );
    targeted.plan = {
      kind: "targeted",
      fixtureIds: targeted.fixtures.map((fixture) => fixture.matchId),
    };
    targeted.competition = null;
    targeted.season = null;
    targeted.teams = [];

    const plan = buildApiFootballApplyPlan(targeted);
    expect(plan.batches.map((batch) => batch.teams.length)).toEqual([20, 2, 0]);
    expect(plan.batches.map((batch) => batch.fixtures.length)).toEqual([0, 0, 11]);
  });
});
