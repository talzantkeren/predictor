import { parseUuid } from "@/features/files/identifiers";

export type ProofObjectCoordinates = {
  leagueId: string;
  requestId: string;
  proofId: string;
};

export function normalizeProofObjectCoordinates(
  coordinates: ProofObjectCoordinates,
) {
  const leagueId = parseUuid(coordinates.leagueId);
  const requestId = parseUuid(coordinates.requestId);
  const proofId = parseUuid(coordinates.proofId);

  if (!leagueId || !requestId || !proofId) {
    throw new Error("Invalid proof object coordinates");
  }

  return { leagueId, requestId, proofId };
}

export function createProofStoragePath(coordinates: ProofObjectCoordinates) {
  const { leagueId, requestId, proofId } =
    normalizeProofObjectCoordinates(coordinates);

  return `league/${leagueId}/request/${requestId}/${proofId}.webp`;
}

export function isExpectedProofStoragePath(
  path: string,
  coordinates: ProofObjectCoordinates,
) {
  try {
    return path === createProofStoragePath(coordinates);
  } catch {
    return false;
  }
}
