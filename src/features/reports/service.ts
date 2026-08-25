import type { SupabaseClient } from "@supabase/supabase-js";

import { getManagerReportSummary } from "@/features/reports/queries";
import type {
  ManagerLeagueReport,
  ReportLeagueStatus,
} from "@/features/reports/types";
import { getLeagueStandings } from "@/features/scoring/queries";
import type { Database } from "@/types/database.generated";

type ReportDependencies = {
  getSummary: typeof getManagerReportSummary;
  getStandings: typeof getLeagueStandings;
};

const defaultDependencies: ReportDependencies = {
  getSummary: getManagerReportSummary,
  getStandings: getLeagueStandings,
};

export function getReportStandingsKind(
  status: ReportLeagueStatus,
): ManagerLeagueReport["standingsKind"] {
  return status === "completed" ? "final" : "current";
}

export async function getManagerLeagueReport(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
  dependencies: ReportDependencies = defaultDependencies,
): Promise<
  | { status: "found"; data: ManagerLeagueReport }
  | { status: "not-found" }
  | { status: "error" }
> {
  // The manager-only resource check must succeed before standings are read.
  // getLeagueStandings also authorizes under RLS and remains the single source
  // of ranking/mapping behavior shared with the member standings page.
  const summary = await dependencies.getSummary(supabase, leagueId, userId);
  if (summary.status !== "found") return summary;

  const standings = await dependencies.getStandings(
    supabase,
    leagueId,
    userId,
  );
  if (standings.status !== "found") return standings;

  if (
    standings.data.league.id !== summary.league.id ||
    standings.data.league.name !== summary.league.name ||
    !standings.data.viewerIsManager
  ) {
    return { status: "error" };
  }

  return {
    status: "found",
    data: {
      league: summary.league,
      membership: summary.membership,
      standings: standings.data.standings,
      standingsKind: getReportStandingsKind(summary.league.status),
    },
  };
}
