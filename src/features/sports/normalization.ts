import {
  MATCH_STATUSES,
  type MatchStatus,
  type NormalizedMatch,
  type RawSportsMatch,
} from "@/features/sports/types";

const statusAliases: Record<string, MatchStatus> = {
  scheduled: "scheduled",
  not_started: "scheduled",
  ns: "scheduled",
  live: "live",
  in_play: "live",
  finished: "finished",
  completed: "finished",
  ft: "finished",
  postponed: "postponed",
  canceled: "canceled",
  cancelled: "canceled",
};

function normalizeStatus(value: string): MatchStatus {
  const normalized = statusAliases[value.trim().toLowerCase()];

  if (!normalized || !MATCH_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported sports match status: ${value}`);
  }

  return normalized;
}

function officialScore(value: number | null | undefined, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Finished matches require a non-negative ${field}`);
  }

  return value;
}

export function normalizeMatch(input: RawSportsMatch): NormalizedMatch {
  const status = normalizeStatus(input.status);
  const hasOfficialResult = status === "finished";

  return {
    matchId: input.matchId,
    leagueId: input.leagueId,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    round: input.round,
    homeTeam: { ...input.homeTeam },
    awayTeam: { ...input.awayTeam },
    kickoffAt: new Date(input.kickoffAt).toISOString(),
    status,
    homeScore: hasOfficialResult
      ? officialScore(input.homeScore, "home score")
      : null,
    awayScore: hasOfficialResult
      ? officialScore(input.awayScore, "away score")
      : null,
  };
}
