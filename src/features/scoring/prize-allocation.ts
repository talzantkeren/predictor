export type RankedParticipant = {
  participantId: string;
  rank: number;
};

export type PrizeRule = {
  position: number;
  percentageBps: number;
};

export type PrizeShare = {
  participantId: string;
  rank: number;
  occupiedPrizePositions: number[];
  shareNumeratorBps: number;
  shareDenominator: number;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

export function allocatePrizeShares(
  standings: RankedParticipant[],
  prizeRules: PrizeRule[],
): PrizeShare[] {
  const prizesByPosition = new Map<number, number>();

  for (const prize of prizeRules) {
    assertPositiveInteger(prize.position, "Prize position");
    assertPositiveInteger(prize.percentageBps, "Prize percentage");
    if (prizesByPosition.has(prize.position)) {
      throw new Error("Prize positions must be unique.");
    }
    prizesByPosition.set(prize.position, prize.percentageBps);
  }

  const participantsByRank = new Map<number, RankedParticipant[]>();
  for (const participant of standings) {
    assertPositiveInteger(participant.rank, "Participant rank");
    const group = participantsByRank.get(participant.rank) ?? [];
    group.push(participant);
    participantsByRank.set(participant.rank, group);
  }

  const shares: PrizeShare[] = [];
  for (const [rank, participants] of [...participantsByRank].sort(
    ([left], [right]) => left - right,
  )) {
    const occupiedPrizePositions = Array.from(
      { length: participants.length },
      (_, index) => rank + index,
    ).filter((position) => prizesByPosition.has(position));
    const shareNumeratorBps = occupiedPrizePositions.reduce(
      (total, position) => total + (prizesByPosition.get(position) ?? 0),
      0,
    );

    if (shareNumeratorBps === 0) continue;

    for (const participant of participants) {
      shares.push({
        participantId: participant.participantId,
        rank,
        occupiedPrizePositions,
        shareNumeratorBps,
        shareDenominator: participants.length,
      });
    }
  }

  return shares;
}
