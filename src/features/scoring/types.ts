import type { Database } from "@/types/database.generated";
import type { KeysetPage } from "@/lib/keyset-pagination";

export type ScoredMatchStatus = Extract<
  Database["public"]["Enums"]["match_status"],
  "finished" | "canceled"
>;

export type SystemMatchItem = {
  id: string;
  seasonId: string;
  roundNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: Database["public"]["Enums"]["match_status"];
  homeScore: number | null;
  awayScore: number | null;
  resultVersion: number;
  isManuallyOverridden: boolean;
  externalProvider: string | null;
  homeTeamName: string;
  awayTeamName: string;
};

export type SystemMatchPage = KeysetPage<SystemMatchItem>;

export type SystemMatchFilters = {
  seasonId?: string;
  status?: Database["public"]["Enums"]["match_status"];
  roundNumber?: number;
};

export type SystemMatchSeasonOption = {
  id: string;
  name: string;
  competitionName: string;
};

export type SystemMatchTeamOption = {
  id: string;
  name: string;
  shortName: string | null;
};

export type SystemMatchEditorCatalog = {
  seasons: SystemMatchSeasonOption[];
  teams: SystemMatchTeamOption[];
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
  viewerIsManager: boolean;
  standings: LeagueStanding[];
};
