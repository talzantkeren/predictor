import type {
  MatchStatus,
  NormalizedMatch,
  SportsTeam,
  SportsSyncSnapshot,
} from "@/features/sports/types";

export const API_FOOTBALL_TARGET_BATCH_SIZE = 20;
export const API_FOOTBALL_APPLY_TEAM_BATCH_SIZE = 20;
export const API_FOOTBALL_APPLY_BATCH_SIZE = 50;

export interface ApiFootballApplyTeam {
  externalId: string;
  name: string;
  shortName: string;
}

export interface ApiFootballApplyFixture {
  externalId: string;
  roundNumber: number;
  roundLabel: string;
  kickoffAt: string;
  status: MatchStatus;
  providerStatus: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  homeScore: number | null;
  awayScore: number | null;
  locksPredictions: boolean;
  resultDisposition: NormalizedMatch["resultDisposition"];
}

export interface ApiFootballApplyRound {
  label: string;
  roundNumber: number | null;
  requiresReview: boolean;
}

export interface ApiFootballApplyBatch {
  competition: {
    externalId: string;
    name: string;
    slug: string;
    countryCode: string;
  } | null;
  season: {
    externalId: string;
    name: string;
    startsOn: string;
    endsOn: string;
    isCurrent: boolean;
  } | null;
  teams: ApiFootballApplyTeam[];
  rounds: ApiFootballApplyRound[];
  fixtures: ApiFootballApplyFixture[];
}

export interface PlannedApiFootballApply {
  batches: ApiFootballApplyBatch[];
  fixturesSeen: number;
  operatorNotes: string[];
}

function chunk<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

export function batchTargetFixtureIds(fixtureIds: readonly string[]) {
  if (
    fixtureIds.some((id) => !/^[1-9]\d*$/.test(id)) ||
    new Set(fixtureIds).size !== fixtureIds.length
  ) {
    throw new Error("Target fixture IDs must be unique positive integers");
  }
  return chunk(fixtureIds, API_FOOTBALL_TARGET_BATCH_SIZE);
}

export function buildApiFootballApplyPlan(
  snapshot: SportsSyncSnapshot,
): PlannedApiFootballApply {
  if (snapshot.provider !== "api-football") {
    throw new Error("API-Football apply planning requires its provider snapshot");
  }

  const operatorNotes = new Set<string>();
  const teamsById = new Map<string, ApiFootballApplyTeam>();
  const addTeam = (team: SportsTeam) => {
    const plannedTeam = {
      externalId: team.teamId,
      name: team.name,
      shortName: team.shortName,
    };
    const existing = teamsById.get(team.teamId);
    if (
      existing &&
      (existing.name !== plannedTeam.name ||
        existing.shortName !== plannedTeam.shortName)
    ) {
      throw new Error("Snapshot team IDs must have consistent metadata");
    }
    teamsById.set(team.teamId, plannedTeam);
    if (team.isNameMapped === false) {
      operatorNotes.add(`UNMAPPED_TEAM:${team.teamId}`);
    }
  };
  for (const team of snapshot.teams) {
    if (teamsById.has(team.teamId)) {
      throw new Error("Snapshot team IDs must be unique");
    }
    addTeam(team);
  }

  const fixtureIds = new Set<string>();
  const applicableFixtures: ApiFootballApplyFixture[] = [];
  for (const fixture of snapshot.fixtures) {
    if (fixtureIds.has(fixture.matchId)) {
      throw new Error("Snapshot fixture IDs must be unique");
    }
    fixtureIds.add(fixture.matchId);
    addTeam(fixture.homeTeam);
    addTeam(fixture.awayTeam);
    if (fixture.reviewCode) {
      operatorNotes.add(`${fixture.reviewCode}:${fixture.matchId}`);
      if (fixture.reviewCode === "ROUND_REQUIRES_REVIEW") continue;
    }
    applicableFixtures.push({
      externalId: fixture.matchId,
      roundNumber: fixture.round,
      roundLabel: fixture.roundLabel,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      providerStatus: fixture.providerStatus,
      homeTeamExternalId: fixture.homeTeam.teamId,
      awayTeamExternalId: fixture.awayTeam.teamId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      locksPredictions: fixture.locksPredictions,
      resultDisposition: fixture.resultDisposition,
    });
  }

  const teams = [...teamsById.values()];
  const fixtureChunks = chunk(applicableFixtures, API_FOOTBALL_APPLY_BATCH_SIZE);
  if (
    fixtureChunks.length === 0 &&
    (snapshot.competition ||
      snapshot.season ||
      snapshot.rounds.length > 0 ||
      teams.length > 0)
  ) {
    fixtureChunks.push([]);
  }

  const teamChunks = chunk(teams, API_FOOTBALL_APPLY_TEAM_BATCH_SIZE);
  if (teamChunks.length > 1) {
    const metadataBatches = teamChunks.map(
      (teamBatch, index): ApiFootballApplyBatch => ({
        competition:
          index === 0 && snapshot.competition
            ? {
                externalId: snapshot.competition.competitionId,
                name: snapshot.competition.name,
                slug: "israeli-premier-league-api-football",
                countryCode: snapshot.competition.countryCode,
              }
            : null,
        season:
          index === 0 && snapshot.season
            ? {
                externalId: snapshot.season.seasonId,
                name: snapshot.season.name,
                startsOn: snapshot.season.startsOn,
                endsOn: snapshot.season.endsOn,
                isCurrent: snapshot.season.isCurrent,
              }
            : null,
        teams: teamBatch,
        rounds:
          index === 0
            ? snapshot.rounds.map((round) => ({
                label: round.label,
                roundNumber: round.roundNumber,
                requiresReview: round.requiresReview,
              }))
            : [],
        fixtures: [],
      }),
    );
    const fixtureBatches = fixtureChunks
      .filter((fixtures) => fixtures.length > 0)
      .map(
        (fixtures): ApiFootballApplyBatch => ({
          competition: null,
          season: null,
          teams: [],
          rounds: [],
          fixtures,
        }),
      );
    return {
      batches: [...metadataBatches, ...fixtureBatches],
      fixturesSeen: snapshot.fixtures.length,
      operatorNotes: [...operatorNotes].sort(),
    };
  }

  const batches = fixtureChunks.map((fixtures, index): ApiFootballApplyBatch => ({
    competition:
      index === 0 && snapshot.competition
        ? {
            externalId: snapshot.competition.competitionId,
            name: snapshot.competition.name,
            slug: "israeli-premier-league-api-football",
            countryCode: snapshot.competition.countryCode,
          }
        : null,
    season:
      index === 0 && snapshot.season
        ? {
            externalId: snapshot.season.seasonId,
            name: snapshot.season.name,
            startsOn: snapshot.season.startsOn,
            endsOn: snapshot.season.endsOn,
            isCurrent: snapshot.season.isCurrent,
          }
        : null,
    teams: index === 0 ? (teamChunks[0] ?? []) : [],
    rounds:
      index === 0
        ? snapshot.rounds.map((round) => ({
            label: round.label,
            roundNumber: round.roundNumber,
            requiresReview: round.requiresReview,
          }))
        : [],
    fixtures,
  }));

  return {
    batches,
    fixturesSeen: snapshot.fixtures.length,
    operatorNotes: [...operatorNotes].sort(),
  };
}

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
