import type {
  MatchStatus,
  NormalizedMatch,
} from "@/features/sports/types";

export interface StoredMatchSnapshot {
  id: string;
  externalId: string | null;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  isManuallyOverridden: boolean;
}

export interface PlannedMatchResult {
  matchId: string;
  status: "finished" | "canceled";
  homeScore: number | null;
  awayScore: number | null;
}

function uniqueExternalMatches(matches: readonly StoredMatchSnapshot[]) {
  const byExternalId = new Map<string, StoredMatchSnapshot>();

  for (const match of matches) {
    if (match.externalId === null) continue;
    if (byExternalId.has(match.externalId)) {
      throw new Error("Stored match snapshots require unique external IDs");
    }
    byExternalId.set(match.externalId, match);
  }

  return byExternalId;
}

function resultChanged(
  stored: StoredMatchSnapshot,
  provider: NormalizedMatch,
) {
  return (
    stored.status !== provider.status ||
    stored.homeScore !== provider.homeScore ||
    stored.awayScore !== provider.awayScore
  );
}

/**
 * Executable contract for a future live-provider path. Slice 7 does not call
 * this planner from the Cron route and does not write its output to the DB.
 */
export function planSyncResults(
  storedMatches: readonly StoredMatchSnapshot[],
  providerSnapshot: readonly NormalizedMatch[],
): PlannedMatchResult[] {
  const storedByExternalId = uniqueExternalMatches(storedMatches);
  const seenProviderIds = new Set<string>();
  const results: PlannedMatchResult[] = [];

  for (const providerMatch of providerSnapshot) {
    if (seenProviderIds.has(providerMatch.matchId)) {
      throw new Error("Provider snapshots require unique match IDs");
    }
    seenProviderIds.add(providerMatch.matchId);

    const stored = storedByExternalId.get(providerMatch.matchId);
    if (
      !stored ||
      stored.isManuallyOverridden ||
      (providerMatch.status !== "finished" &&
        providerMatch.status !== "canceled") ||
      !resultChanged(stored, providerMatch)
    ) {
      continue;
    }

    results.push({
      matchId: stored.id,
      status: providerMatch.status,
      homeScore: providerMatch.homeScore,
      awayScore: providerMatch.awayScore,
    });
  }

  return results;
}
