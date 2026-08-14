export type SeasonOption = {
  id: string;
  name: string;
  competitionName: string;
};

export type LeagueRole = "manager" | "member";

export type LeagueDashboardItem = {
  id: string;
  name: string;
  seasonName: string;
  status: "draft" | "open" | "active" | "completed" | "archived";
  role: LeagueRole;
};

export type LeagueSummary = {
  id: string;
  name: string;
  description: string | null;
  seasonName: string;
  competitionName: string;
  status: "draft" | "open" | "active" | "completed" | "archived";
  demoEntryFeeAgorot: number;
  demoPaymentInstructions: string | null;
  allowLateJoin: boolean;
  joinsCloseAt: string | null;
  role: LeagueRole;
  scoring: {
    exactPoints: number;
    correctOutcomePoints: number;
    incorrectPoints: number;
    version: number;
    lockedAt: string | null;
  };
  prizes: {
    position: number;
    percentageBps: number;
  }[];
};
