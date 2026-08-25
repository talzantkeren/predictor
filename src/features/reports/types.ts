import type { LeagueStanding } from "@/features/scoring/types";
import type { Database } from "@/types/database.generated";

export type ReportLeagueStatus =
  Database["public"]["Enums"]["league_status"];

export type MembershipStatusSummary = {
  activeMembers: number;
  pendingApproval: number;
  pendingProof: number;
  rejected: number;
};

export type ManagerLeagueReport = {
  league: {
    id: string;
    name: string;
    status: ReportLeagueStatus;
  };
  membership: MembershipStatusSummary;
  standings: LeagueStanding[];
  standingsKind: "current" | "final";
};
