import { describe, expect, it } from "vitest";

import { allocatePrizeShares } from "@/features/scoring/prize-allocation";

describe("shared-place prize allocation", () => {
  it("pools the occupied prize positions and splits them equally", () => {
    expect(
      allocatePrizeShares(
        [
          { participantId: "member-a", rank: 1 },
          { participantId: "member-b", rank: 1 },
          { participantId: "member-c", rank: 3 },
          { participantId: "member-d", rank: 4 },
        ],
        [
          { position: 1, percentageBps: 6000 },
          { position: 2, percentageBps: 3000 },
          { position: 3, percentageBps: 1000 },
        ],
      ),
    ).toEqual([
      {
        participantId: "member-a",
        rank: 1,
        occupiedPrizePositions: [1, 2],
        shareNumeratorBps: 9000,
        shareDenominator: 2,
      },
      {
        participantId: "member-b",
        rank: 1,
        occupiedPrizePositions: [1, 2],
        shareNumeratorBps: 9000,
        shareDenominator: 2,
      },
      {
        participantId: "member-c",
        rank: 3,
        occupiedPrizePositions: [3],
        shareNumeratorBps: 1000,
        shareDenominator: 1,
      },
    ]);
  });

  it("keeps a non-divisible equal share as an exact integer ratio", () => {
    const shares = allocatePrizeShares(
      [
        { participantId: "member-a", rank: 1 },
        { participantId: "member-b", rank: 1 },
        { participantId: "member-c", rank: 1 },
      ],
      [
        { position: 1, percentageBps: 5001 },
        { position: 2, percentageBps: 3000 },
        { position: 3, percentageBps: 1999 },
      ],
    );

    expect(shares).toHaveLength(3);
    expect(
      shares.every(
        (share) =>
          share.shareNumeratorBps === 10000 && share.shareDenominator === 3,
      ),
    ).toBe(true);
  });

  it("does not allocate a percentage to a place outside the prize table", () => {
    expect(
      allocatePrizeShares(
        [{ participantId: "member-a", rank: 2 }],
        [{ position: 1, percentageBps: 10000 }],
      ),
    ).toEqual([]);
  });
});
