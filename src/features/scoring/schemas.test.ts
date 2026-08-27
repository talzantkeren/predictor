import { describe, expect, it } from "vitest";

import {
  completedReconciliationDecisionSchema,
  manualMatchInputSchema,
  manualOverrideClearConfirmationSchema,
  manualResultInputSchema,
  parseSystemMatchFilters,
  resultReviewDecisionSchema,
} from "@/features/scoring/schemas";

const matchId = "26000000-0000-4000-8000-000000000201";

describe("manual result input", () => {
  it("accepts and normalizes a finished result", () => {
    expect(
      manualResultInputSchema.parse({
        matchId,
        status: "finished",
        homeScore: "2",
        awayScore: "1",
      }),
    ).toEqual({
      matchId,
      status: "finished",
      homeScore: 2,
      awayScore: 1,
    });
  });

  it("accepts a cancellation only without scores", () => {
    expect(
      manualResultInputSchema.parse({
        matchId,
        status: "canceled",
        homeScore: "",
        awayScore: null,
      }),
    ).toEqual({
      matchId,
      status: "canceled",
      homeScore: null,
      awayScore: null,
    });
  });

  it.each([
    { status: "finished", homeScore: "", awayScore: "1" },
    { status: "finished", homeScore: "1.5", awayScore: "1" },
    { status: "finished", homeScore: "31", awayScore: "1" },
    { status: "canceled", homeScore: "1", awayScore: "1" },
    { status: "live", homeScore: "1", awayScore: "1" },
  ])("rejects invalid status/score composition: %o", (input) => {
    expect(
      manualResultInputSchema.safeParse({ matchId, ...input }).success,
    ).toBe(false);
  });
});

describe("manual match create/correct input", () => {
  const validInput = {
    operation: "create",
    matchId: "8d36fd45-2485-4fc5-9f22-29a18ef37080",
    seasonId: "26000000-0000-4000-8000-000000000027",
    homeTeamId: "26000000-0000-4000-8000-000000000101",
    awayTeamId: "26000000-0000-4000-8000-000000000102",
    roundNumber: "3",
    kickoffAt: "2026-10-31T16:45",
    status: "scheduled",
    homeScore: "",
    awayScore: "",
  };

  it("normalizes an explicitly labelled UTC minute and strict round", () => {
    expect(manualMatchInputSchema.parse(validInput)).toMatchObject({
      roundNumber: 3,
      kickoffAt: "2026-10-31T16:45:00.000Z",
      homeScore: null,
      awayScore: null,
    });
  });

  it("preserves the exact stored UTC instant for an unchanged correction", () => {
    const storedKickoff = "2026-10-31T16:45:23.123456+00:00";
    expect(
      manualMatchInputSchema.parse({
        ...validInput,
        operation: "correct",
        kickoffAt: storedKickoff,
      }).kickoffAt,
    ).toBe(storedKickoff);
  });

  it.each(["2026-02-30T16:45", "2026-13-01T16:45", "2026-10-31T24:00"])(
    "rejects an impossible UTC calendar value: %s",
    (kickoffAt) => {
      expect(
        manualMatchInputSchema.safeParse({ ...validInput, kickoffAt }).success,
      ).toBe(false);
    },
  );

  it.each(["0000-01-01T00:00", "0000-01-01T00:00:00.000000+00:00"])(
    "rejects a UTC year PostgreSQL cannot store: %s",
    (kickoffAt) => {
      expect(
        manualMatchInputSchema.safeParse({ ...validInput, kickoffAt }).success,
      ).toBe(false);
    },
  );

  it("requires distinct existing-team identifiers", () => {
    expect(
      manualMatchInputSchema.safeParse({
        ...validInput,
        awayTeamId: validInput.homeTeamId,
      }).success,
    ).toBe(false);
  });

  it("accepts scores only with a finished status", () => {
    expect(
      manualMatchInputSchema.safeParse({
        ...validInput,
        status: "finished",
        homeScore: "2",
        awayScore: "1",
      }).success,
    ).toBe(true);
    expect(
      manualMatchInputSchema.safeParse({
        ...validInput,
        status: "live",
        homeScore: "2",
        awayScore: "1",
      }).success,
    ).toBe(false);
  });
});

describe("manual override clear confirmation", () => {
  it("accepts only the explicit provider-handoff confirmation", () => {
    expect(
      manualOverrideClearConfirmationSchema.parse({
        confirmation: "CONFIRM_PROVIDER_HANDOFF",
      }),
    ).toEqual({ confirmation: "CONFIRM_PROVIDER_HANDOFF" });
  });

  it.each([undefined, null, "", "confirm", "true"])(
    "rejects a missing or forged confirmation: %s",
    (confirmation) => {
      expect(
        manualOverrideClearConfirmationSchema.safeParse({ confirmation })
          .success,
      ).toBe(false);
    },
  );
});

describe("Slice 9 lifecycle decisions", () => {
  it("normalizes a finished review decision and a scoreless cancellation", () => {
    expect(
      resultReviewDecisionSchema.parse({
        selectedStatus: "finished",
        selectedHomeScore: "2",
        selectedAwayScore: "1",
      }),
    ).toEqual({
      selectedStatus: "finished",
      selectedHomeScore: 2,
      selectedAwayScore: 1,
    });
    expect(
      resultReviewDecisionSchema.parse({
        selectedStatus: "canceled",
        selectedHomeScore: "",
        selectedAwayScore: "",
      }),
    ).toEqual({
      selectedStatus: "canceled",
      selectedHomeScore: null,
      selectedAwayScore: null,
    });
  });

  it.each([
    { selectedStatus: "finished", selectedHomeScore: "", selectedAwayScore: "1" },
    { selectedStatus: "finished", selectedHomeScore: "31", selectedAwayScore: "1" },
    { selectedStatus: "canceled", selectedHomeScore: "1", selectedAwayScore: "" },
    { selectedStatus: "live", selectedHomeScore: "1", selectedAwayScore: "1" },
  ])("rejects malformed review decision input: %o", (input) => {
    expect(resultReviewDecisionSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only explicit apply or dismiss reconciliation decisions", () => {
    expect(
      completedReconciliationDecisionSchema.parse({ decision: "apply" }),
    ).toEqual({ decision: "apply" });
    expect(
      completedReconciliationDecisionSchema.safeParse({ decision: "approve" })
        .success,
    ).toBe(false);
  });
});

describe("system match URL filters", () => {
  it("accepts combined filters and normalizes exact empty values", () => {
    expect(
      parseSystemMatchFilters({
        season: "26000000-0000-4000-8000-000000000027",
        status: "finished",
        round: "12",
      }),
    ).toEqual({
      success: true,
      data: {
        seasonId: "26000000-0000-4000-8000-000000000027",
        status: "finished",
        roundNumber: 12,
      },
    });
    expect(
      parseSystemMatchFilters({ season: "", status: "", round: "" }),
    ).toEqual({
      success: true,
      data: {
        seasonId: undefined,
        status: undefined,
        roundNumber: undefined,
      },
    });
  });

  it.each([
    { status: ["live", "finished"] },
    { status: "" as string, round: ["1"] },
    { status: "unknown" },
    { season: "not-a-uuid" },
    { round: "0" },
    { round: "1.5" },
    { round: " 1" },
  ])("rejects malformed or repeated filters: %j", (value) => {
    expect(parseSystemMatchFilters(value).success).toBe(false);
  });
});
