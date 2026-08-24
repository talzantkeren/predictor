export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "canceled",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type SportsProviderId = "manual" | "api-football";

export type FixtureQuery =
  | { date: string }
  | { round: number }
  | undefined;

export interface SportsTeam {
  teamId: string;
  name: string;
  shortName: string;
  providerName?: string;
  isNameMapped?: boolean;
}

export interface SportsCompetition {
  competitionId: string;
  name: string;
  countryCode: string;
}

export interface SportsSeason {
  seasonId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface SportsRound {
  label: string;
  roundNumber: number | null;
  requiresReview: boolean;
}

export type ResultDisposition = "none" | "official" | "review";

export interface NormalizedMatch {
  matchId: string;
  leagueId: string;
  competitionId: string;
  seasonId: string;
  round: number;
  roundLabel: string;
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  kickoffAt: string;
  status: MatchStatus;
  providerStatus: string;
  locksPredictions: boolean;
  resultDisposition: ResultDisposition;
  reviewCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface RawSportsMatch {
  matchId: string;
  leagueId: string;
  competitionId: string;
  seasonId: string;
  round: number;
  roundLabel?: string;
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

export type SportsSyncPlan =
  | { kind: "catalog" | "reconciliation" }
  | { kind: "targeted"; fixtureIds: string[] };

export interface SportsQuotaSnapshot {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
}

export interface SportsSyncSnapshot {
  provider: SportsProviderId;
  plan: SportsSyncPlan;
  competition: SportsCompetition | null;
  season: SportsSeason | null;
  teams: SportsTeam[];
  rounds: SportsRound[];
  fixtures: NormalizedMatch[];
  quota: SportsQuotaSnapshot;
}

export interface SportsProvider {
  readonly providerId: SportsProviderId;
  getCompetition(): Promise<SportsCompetition>;
  getTeams(seasonId: string): Promise<SportsTeam[]>;
  getRounds(seasonId: string): Promise<SportsRound[]>;
  getFixtures(query?: FixtureQuery): Promise<NormalizedMatch[]>;
  getResults(query?: FixtureQuery): Promise<NormalizedMatch[]>;
  getSyncSnapshot(plan: SportsSyncPlan): Promise<SportsSyncSnapshot>;
}
