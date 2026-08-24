import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fixturesEnvelope from "@/features/sports/__fixtures__/api-football/fixtures-sample-383-2026.json";
import roundsEnvelope from "@/features/sports/__fixtures__/api-football/rounds-383-2026.json";
import teamsEnvelope from "@/features/sports/__fixtures__/api-football/teams-383-2026.json";
import { apiFootballFixtureSchema } from "@/features/sports/api-football-client";
import {
  mapApiFootballTeam,
  normalizeApiFootballFixture,
  parseApiFootballRound,
} from "@/features/sports/api-football-provider";

function fixtureWith(
  input: {
    status?: string;
    goals?: { home: number | null; away: number | null };
    fulltime?: { home: number | null; away: number | null };
    date?: string;
    timestamp?: number;
    round?: string;
  } = {},
) {
  const fixture = apiFootballFixtureSchema.parse(
    structuredClone(fixturesEnvelope.response[0]),
  );
  fixture.fixture.status.short = input.status ?? "NS";
  if (input.goals) fixture.goals = input.goals;
  if (input.fulltime) fixture.score.fulltime = input.fulltime;
  if (input.date) fixture.fixture.date = input.date;
  if (input.timestamp) fixture.fixture.timestamp = input.timestamp;
  if (input.round) fixture.league.round = input.round;
  return apiFootballFixtureSchema.parse(fixture);
}

describe("API-Football domain normalization", () => {
  it("maps all 14 stable team IDs to distinct Hebrew names, ignoring duplicate codes", () => {
    const mapped = teamsEnvelope.response.map(({ team }) =>
      mapApiFootballTeam(team),
    );
    expect(mapped).toHaveLength(14);
    expect(new Set(mapped.map((team) => team.name)).size).toBe(14);
    expect(mapped.every((team) => team.isNameMapped)).toBe(true);
    expect(
      teamsEnvelope.response.filter(({ team }) => team.code === "MAC"),
    ).toHaveLength(4);
  });

  it("keeps an unknown future team separate with a sanitized operator-visible fallback", () => {
    expect(mapApiFootballTeam({ id: 999999, name: " Future\u0000 Team " })).toEqual({
      teamId: "999999",
      name: "Future Team (לא ממופה)",
      shortName: "Future Team (לא ממופה)",
      providerName: "Future Team",
      isNameMapped: false,
    });

    const longFallback = mapApiFootballTeam({
      id: 999998,
      name: "A future provider team with an unusually long official name",
    });
    expect(longFallback.name).toContain("לא ממופה");
    expect(longFallback.shortName).toContain("לא ממופה");
    expect(longFallback.shortName.length).toBeLessThanOrEqual(30);
  });

  it("preserves all 26 recorded round labels and marks future stages for review", () => {
    const rounds = roundsEnvelope.response.map(parseApiFootballRound);
    expect(rounds).toHaveLength(26);
    expect(rounds.map((round) => round.roundNumber)).toEqual(
      Array.from({ length: 26 }, (_, index) => index + 1),
    );
    expect(parseApiFootballRound("Championship Round - 1")).toEqual({
      label: "Championship Round - 1",
      roundNumber: null,
      requiresReview: true,
    });
  });

  it("normalizes every documented status with an exhaustive fail-safe contract", () => {
    const expected = {
      TBD: ["scheduled", false], NS: ["scheduled", false],
      "1H": ["live", true], HT: ["live", true], "2H": ["live", true],
      ET: ["live", true], BT: ["live", true], P: ["live", true], LIVE: ["live", true],
      PST: ["postponed", false], SUSP: ["postponed", true], INT: ["postponed", true],
      FT: ["finished", true], AET: ["finished", true], PEN: ["finished", true],
      CANC: ["canceled", false], ABD: ["canceled", false], AWD: ["canceled", false], WO: ["canceled", false],
    } as const;

    for (const [status, [normalizedStatus, locks]] of Object.entries(expected)) {
      const match = normalizeApiFootballFixture(
        fixtureWith({
          status,
          fulltime: status === "FT" ? { home: 2, away: 1 } : { home: null, away: null },
        }),
      );
      expect([match.status, match.locksPredictions]).toEqual([
        normalizedStatus,
        locks,
      ]);
    }
    expect(() => normalizeApiFootballFixture(fixtureWith({ status: "FUT" }))).toThrow(
      "could not be normalized safely",
    );
  });

  it("never treats live goals as official and uses score.fulltime for FT", () => {
    const live = normalizeApiFootballFixture(
      fixtureWith({ status: "1H", goals: { home: 4, away: 3 } }),
    );
    expect([live.homeScore, live.awayScore, live.resultDisposition]).toEqual([
      null,
      null,
      "none",
    ]);

    const finished = normalizeApiFootballFixture(
      fixtureWith({
        status: "FT",
        goals: { home: 9, away: 9 },
        fulltime: { home: 2, away: 1 },
      }),
    );
    expect([finished.homeScore, finished.awayScore]).toEqual([2, 1]);
  });

  it("rejects missing or invalid FT scores and quarantines AET/PEN", () => {
    expect(() =>
      normalizeApiFootballFixture(
        fixtureWith({ status: "FT", fulltime: { home: null, away: 1 } }),
      ),
    ).toThrow();
    expect(() =>
      normalizeApiFootballFixture(
        fixtureWith({ status: "FT", fulltime: { home: 31, away: 1 } }),
      ),
    ).toThrow();

    expect(normalizeApiFootballFixture(fixtureWith({ status: "AET" }))).toMatchObject({
      resultDisposition: "review",
      reviewCode: "AET_REQUIRES_REVIEW",
      homeScore: null,
      awayScore: null,
    });
    expect(normalizeApiFootballFixture(fixtureWith({ status: "PEN" }))).toMatchObject({
      resultDisposition: "review",
      reviewCode: "PEN_REQUIRES_REVIEW",
    });
  });

  it("requires UTC ISO and numeric timestamp consistency while accepting nullable venue/referee", () => {
    const recorded = apiFootballFixtureSchema.parse(fixturesEnvelope.response[0]);
    expect(recorded.fixture.referee).toBeNull();
    expect(recorded.fixture.venue.id).toBeNull();
    expect(normalizeApiFootballFixture(recorded).kickoffAt).toMatch(/Z$/);
    expect(() =>
      normalizeApiFootballFixture(
        fixtureWith({ date: "2026-09-01T18:00:00.000Z", timestamp: 1 }),
      ),
    ).toThrow();
  });

  it("marks a non-regular stage collision for review without inventing a round", () => {
    expect(
      normalizeApiFootballFixture(
        fixtureWith({ round: "Championship Round - 1" }),
      ),
    ).toMatchObject({
      round: 1,
      roundLabel: "Championship Round - 1",
      reviewCode: "ROUND_REQUIRES_REVIEW",
    });

    expect(
      normalizeApiFootballFixture(
        fixtureWith({ status: "AET", round: "Championship Round - 1" }),
      ),
    ).toMatchObject({
      resultDisposition: "review",
      roundLabel: "Championship Round - 1",
      reviewCode: "ROUND_REQUIRES_REVIEW",
    });
  });
});
