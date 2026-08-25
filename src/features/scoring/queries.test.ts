import { describe, expect, it } from "vitest";

import { mapStanding } from "@/features/scoring/queries";

describe("league standing mapping", () => {
  const validRow = {
    league_id: "62000000-0000-4000-8000-000000000001",
    user_id: "b6222222-2222-4222-8222-222222222222",
    display_name: "חברה א",
    total_points: 3,
    correct_outcomes: 1,
    exact_scores: 1,
    predictions_submitted: 1,
    rank: 1,
  };

  it("uses a neutral label when profile RLS hides a member name", () => {
    expect(mapStanding({ ...validRow, display_name: null })).toMatchObject({
      userId: validRow.user_id,
      displayName: "משתתף",
    });
  });

  it("still rejects malformed aggregate rows", () => {
    expect(mapStanding({ ...validRow, total_points: null })).toBeNull();
    expect(
      mapStanding({
        ...validRow,
        total_points: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toBeNull();
  });
});
