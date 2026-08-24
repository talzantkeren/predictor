import type { Database } from "@/types/database.generated";

export type MatchStatus = Database["public"]["Enums"]["match_status"];
export type LeagueStatus = Database["public"]["Enums"]["league_status"];
export type PredictedOutcome = Database["public"]["Enums"]["outcome"];

export type MatchListFilter =
  | { kind: "round"; round: number }
  | { kind: "date"; date: string }
  | undefined;

export type TeamSummary = {
  id: string;
  name: string;
  shortName: string | null;
};

export type OwnPrediction = {
  id: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedOutcome: PredictedOutcome;
  createdAt: string;
  updatedAt: string;
};

export type LeagueMatchItem = {
  id: string;
  roundNumber: number;
  kickoffAt: string;
  predictionsLockedAt: string | null;
  status: MatchStatus;
  providerStatus: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  ownPrediction: OwnPrediction | null;
};

export type LeagueMatchList = {
  league: {
    id: string;
    name: string;
    status: LeagueStatus;
    seasonName: string;
    competitionName: string;
  };
  viewerIsActiveMember: boolean;
  databaseNow: string;
  roundOptions: number[];
  matches: LeagueMatchItem[];
};

export type EligibleLeague = {
  id: string;
  name: string;
  status: LeagueStatus;
};

export type RevealedPrediction = OwnPrediction & {
  userId: string;
  displayName: string;
  isViewer: boolean;
};

export type MatchDetail = {
  league: EligibleLeague;
  eligibleLeagues: EligibleLeague[];
  match: Omit<LeagueMatchItem, "ownPrediction">;
  databaseNow: string;
  ownPrediction: OwnPrediction | null;
  revealedPredictions: RevealedPrediction[];
};
