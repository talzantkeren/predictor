import type { Database } from "@/types/database.generated";

export type ScoredMatchStatus = Extract<
  Database["public"]["Enums"]["match_status"],
  "finished" | "canceled"
>;

export type SystemMatchItem = {
  id: string;
  roundNumber: number;
  kickoffAt: string;
  status: Database["public"]["Enums"]["match_status"];
  homeScore: number | null;
  awayScore: number | null;
  resultVersion: number;
  isManuallyOverridden: boolean;
  homeTeamName: string;
  awayTeamName: string;
};

export type LeagueStanding = {
  leagueId: string;
  userId: string;
  displayName: string;
  totalPoints: number;
  correctOutcomes: number;
  exactScores: number;
  predictionsSubmitted: number;
  rank: number;
};

export type LeagueStandings = {
  league: { id: string; name: string };
  standings: LeagueStanding[];
};
