export const MATCH_STATUSES = [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "canceled",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type FixtureQuery =
  | { date: string }
  | { round: number }
  | undefined;

export interface SportsTeam {
  teamId: string;
  name: string;
  shortName: string;
}

export interface SportsCompetition {
  competitionId: string;
  name: string;
  countryCode: string;
}

export interface NormalizedMatch {
  matchId: string;
  leagueId: string;
  competitionId: string;
  seasonId: string;
  round: number;
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  kickoffAt: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface RawSportsMatch {
  matchId: string;
  leagueId: string;
  competitionId: string;
  seasonId: string;
  round: number;
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  kickoffAt: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface SportsProvider {
  getCompetition(): Promise<SportsCompetition>;
  getTeams(seasonId: string): Promise<SportsTeam[]>;
  getFixtures(query?: FixtureQuery): Promise<NormalizedMatch[]>;
  getResults(query?: FixtureQuery): Promise<NormalizedMatch[]>;
}
