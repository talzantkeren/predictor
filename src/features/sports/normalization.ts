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

const ISO_TIMESTAMP_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

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

function normalizeKickoffAt(value: string) {
  if (!ISO_TIMESTAMP_WITH_OFFSET.test(value)) {
    throw new Error("kickoffAt must be an ISO-8601 timestamp with an explicit offset");
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error("kickoffAt must be a valid timestamp");
  }

  return new Date(timestamp).toISOString();
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
    roundLabel: input.roundLabel ?? `Round ${input.round}`,
    homeTeam: { ...input.homeTeam },
    awayTeam: { ...input.awayTeam },
    kickoffAt: normalizeKickoffAt(input.kickoffAt),
    status,
    providerStatus: input.status,
    locksPredictions: status === "live" || status === "finished",
    resultDisposition: hasOfficialResult ? "official" : "none",
    reviewCode: null,
    homeScore: hasOfficialResult
      ? officialScore(input.homeScore, "home score")
      : null,
    awayScore: hasOfficialResult
      ? officialScore(input.awayScore, "away score")
      : null,
  };
}
