import { describe, expect, it } from "vitest";

import { manualResultInputSchema } from "@/features/scoring/schemas";

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
