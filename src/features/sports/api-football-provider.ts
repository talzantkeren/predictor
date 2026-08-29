import "server-only";

import {
  ApiFootballClient,
  ApiFootballClientError,
  type ApiFootballFixture,
  type ApiFootballQuota,
  type ApiFootballTeam,
} from "@/features/sports/api-football-client";
import type {
  FixtureQuery,
  NormalizedMatch,
  ResultDisposition,
  SportsCompetition,
  SportsProvider,
  SportsQuotaSnapshot,
  SportsRound,
  SportsSyncPlan,
  SportsTeam,
} from "@/features/sports/types";
import { containsDangerousBidiControl } from "@/lib/untrusted-text";

export const API_FOOTBALL_PROVIDER_ID = "api-football" as const;
export const API_FOOTBALL_LEAGUE_ID = "383";
export const API_FOOTBALL_SEASON_ID = "2026";

const hebrewTeamNames = new Map<number, string>([
  [563, "הפועל באר שבע"],
  [604, "מכבי תל אביב"],
  [657, 'בית"ר ירושלים'],
  [2253, "הפועל חיפה"],
  [4195, "מכבי חיפה"],
  [4481, "בני סכנין"],
  [4486, "הפועל ירושלים"],
  [4488, "הפועל פתח תקווה"],
  [4489, "הפועל רמת גן"],
  [4495, "מכבי פתח תקווה"],
  [4501, "הפועל תל אביב"],
  [4505, "מכבי נתניה"],
  [4510, "עירוני קריית שמונה"],
  [6181, "עירוני טבריה"],
]);

type StatusRule = {
  status: NormalizedMatch["status"];
  locksPredictions: boolean;
  resultDisposition: ResultDisposition;
  reviewCode: string | null;
};

const statusRules: Readonly<Record<string, StatusRule>> = {
  TBD: { status: "scheduled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  NS: { status: "scheduled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  "1H": { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  HT: { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  "2H": { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  ET: { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  BT: { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  P: { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  LIVE: { status: "live", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  PST: { status: "postponed", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  SUSP: { status: "postponed", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  INT: { status: "postponed", locksPredictions: true, resultDisposition: "none", reviewCode: null },
  FT: { status: "finished", locksPredictions: true, resultDisposition: "official", reviewCode: null },
  AET: { status: "finished", locksPredictions: true, resultDisposition: "review", reviewCode: "AET_REQUIRES_REVIEW" },
  PEN: { status: "finished", locksPredictions: true, resultDisposition: "review", reviewCode: "PEN_REQUIRES_REVIEW" },
  CANC: { status: "canceled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  ABD: { status: "canceled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  AWD: { status: "canceled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
  WO: { status: "canceled", locksPredictions: false, resultDisposition: "none", reviewCode: null },
};

export class ApiFootballNormalizationError extends Error {
  readonly code = "PROVIDER_CONTRACT_ERROR";

  constructor() {
    super("API-Football data could not be normalized safely.");
    this.name = "ApiFootballNormalizationError";
  }
}

function safeProviderName(value: string) {
  if (containsDangerousBidiControl(value)) {
    throw new ApiFootballNormalizationError();
  }
  const normalized = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2 || normalized.length > 80) {
    throw new ApiFootballNormalizationError();
  }
  return normalized;
}

export function mapApiFootballTeam(
  team: Pick<ApiFootballTeam["team"], "id" | "name">,
): SportsTeam {
  const providerName = safeProviderName(team.name);
  const mappedName = hebrewTeamNames.get(team.id);
  const unmappedSuffix = " (לא ממופה)";
  const name = mappedName ?? `${providerName}${unmappedSuffix}`;
  const shortName =
    mappedName ??
    `${providerName.slice(0, 30 - unmappedSuffix.length).trimEnd()}${unmappedSuffix}`;
  return {
    teamId: String(team.id),
    name,
    shortName,
    providerName,
    isNameMapped: mappedName !== undefined,
  };
}

export function parseApiFootballRound(label: string): SportsRound {
  const normalized = safeProviderName(label);
  const regular = /^Regular Season - ([1-9]\d*)$/.exec(normalized);
  if (!regular) {
    return { label: normalized, roundNumber: null, requiresReview: true };
  }
  const roundNumber = Number(regular[1]);
  if (!Number.isSafeInteger(roundNumber) || roundNumber > 32_767) {
    throw new ApiFootballNormalizationError();
  }
  return { label: normalized, roundNumber, requiresReview: false };
}

function officialScore(value: number | null) {
  if (!Number.isInteger(value) || value === null || value < 0 || value > 30) {
    throw new ApiFootballNormalizationError();
  }
  return value;
}

export function normalizeApiFootballFixture(
  input: ApiFootballFixture,
): NormalizedMatch {
  if (
    input.league.id !== Number(API_FOOTBALL_LEAGUE_ID) ||
    input.league.season !== Number(API_FOOTBALL_SEASON_ID) ||
    input.teams.home.id === input.teams.away.id
  ) {
    throw new ApiFootballNormalizationError();
  }
  const statusRule = statusRules[input.fixture.status.short];
  if (!statusRule) throw new ApiFootballNormalizationError();

  const date = Date.parse(input.fixture.date);
  if (
    !Number.isFinite(date) ||
    Math.abs(date - input.fixture.timestamp * 1_000) > 1_000
  ) {
    throw new ApiFootballNormalizationError();
  }

  const round = parseApiFootballRound(input.league.round);
  const reviewCode = round.requiresReview
    ? "ROUND_REQUIRES_REVIEW"
    : statusRule.reviewCode;
  const hasOfficialResult = statusRule.resultDisposition === "official";

  return {
    matchId: String(input.fixture.id),
    leagueId: API_FOOTBALL_LEAGUE_ID,
    competitionId: API_FOOTBALL_LEAGUE_ID,
    seasonId: API_FOOTBALL_SEASON_ID,
    round: round.roundNumber ?? 1,
    roundLabel: round.label,
    homeTeam: mapApiFootballTeam(input.teams.home),
    awayTeam: mapApiFootballTeam(input.teams.away),
    kickoffAt: new Date(date).toISOString(),
    status: statusRule.status,
    providerStatus: input.fixture.status.short,
    locksPredictions: statusRule.locksPredictions,
    resultDisposition: statusRule.resultDisposition,
    reviewCode,
    homeScore: hasOfficialResult
      ? officialScore(input.score.fulltime.home)
      : null,
    awayScore: hasOfficialResult
      ? officialScore(input.score.fulltime.away)
      : null,
  };
}

function mergeQuota(quotas: readonly ApiFootballQuota[]): SportsQuotaSnapshot {
  const minimum = (selector: (quota: ApiFootballQuota) => number | null) => {
    const values = quotas.map(selector).filter((value): value is number => value !== null);
    return values.length > 0 ? Math.min(...values) : null;
  };
  return {
    dailyLimit: minimum((quota) => quota.dailyLimit),
    dailyRemaining: minimum((quota) => quota.dailyRemaining),
    minuteLimit: minimum((quota) => quota.minuteLimit),
    minuteRemaining: minimum((quota) => quota.minuteRemaining),
  };
}

function matchesQuery(match: NormalizedMatch, query: FixtureQuery) {
  if (!query) return true;
  if ("round" in query) return match.round === query.round;
  return match.kickoffAt.slice(0, 10) === query.date;
}

export class ApiFootballProvider implements SportsProvider {
  readonly providerId = API_FOOTBALL_PROVIDER_ID;

  constructor(private readonly client: ApiFootballClient) {}

  async getCompetition(): Promise<SportsCompetition> {
    const { data } = await this.client.getLeague();
    if (data.length !== 1 || data[0].league.id !== 383 || data[0].country.code !== "IL") {
      throw new ApiFootballNormalizationError();
    }
    return {
      competitionId: API_FOOTBALL_LEAGUE_ID,
      name: "ליגת העל הישראלית",
      countryCode: data[0].country.code,
    };
  }

  async getTeams(seasonId: string) {
    if (seasonId !== API_FOOTBALL_SEASON_ID) throw new ApiFootballNormalizationError();
    const { data } = await this.client.getTeams();
    return data.map((item) => mapApiFootballTeam(item.team));
  }

  async getRounds(seasonId: string) {
    if (seasonId !== API_FOOTBALL_SEASON_ID) throw new ApiFootballNormalizationError();
    const { data } = await this.client.getRounds();
    return data.map(parseApiFootballRound);
  }

  async getFixtures(query?: FixtureQuery) {
    const { data } = await this.client.getSeasonFixtures();
    return data.map(normalizeApiFootballFixture).filter((match) => matchesQuery(match, query));
  }

  async getResults(query?: FixtureQuery) {
    return (await this.getFixtures(query)).filter(
      (match) => match.resultDisposition === "official",
    );
  }

  async getSyncSnapshot(plan: SportsSyncPlan) {
    if (plan.kind === "targeted") {
      const result = await this.client.getFixturesByIds(plan.fixtureIds);
      return {
        provider: this.providerId,
        plan,
        competition: null,
        season: null,
        teams: [],
        rounds: [],
        fixtures: result.data.map(normalizeApiFootballFixture),
        quota: mergeQuota([result.quota]),
      };
    }

    if (plan.kind === "reconciliation") {
      const result = await this.client.getSeasonFixtures();
      return {
        provider: this.providerId,
        plan,
        competition: null,
        season: null,
        teams: [],
        rounds: [],
        fixtures: result.data.map(normalizeApiFootballFixture),
        quota: mergeQuota([result.quota]),
      };
    }

    const [league, teams, rounds, fixtures] = await Promise.all([
      this.client.getLeague(),
      this.client.getTeams(),
      this.client.getRounds(),
      this.client.getSeasonFixtures(),
    ]);
    if (league.data.length !== 1 || league.data[0].league.id !== 383) {
      throw new ApiFootballNormalizationError();
    }
    const season = league.data[0].seasons.find((item) => item.year === 2026);
    if (!season || league.data[0].country.code !== "IL") {
      throw new ApiFootballNormalizationError();
    }

    return {
      provider: this.providerId,
      plan,
      competition: {
        competitionId: API_FOOTBALL_LEAGUE_ID,
        name: "ליגת העל הישראלית",
        countryCode: "IL",
      },
      season: {
        seasonId: API_FOOTBALL_SEASON_ID,
        name: "2026/27",
        startsOn: season.start,
        endsOn: season.end,
        isCurrent: season.current,
      },
      teams: teams.data.map((item) => mapApiFootballTeam(item.team)),
      rounds: rounds.data.map(parseApiFootballRound),
      fixtures: fixtures.data.map(normalizeApiFootballFixture),
      quota: mergeQuota([league.quota, teams.quota, rounds.quota, fixtures.quota]),
    };
  }
}

export function getApiFootballSafeErrorCode(error: unknown) {
  if (error instanceof ApiFootballClientError) return error.code;
  if (error instanceof ApiFootballNormalizationError) return error.code;
  return "PROVIDER_UNAVAILABLE" as const;
}
