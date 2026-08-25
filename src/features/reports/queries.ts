import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MembershipStatusSummary,
  ReportLeagueStatus,
} from "@/features/reports/types";
import type { Database } from "@/types/database.generated";

export const MAX_REPORT_ROWS = 500;

type ExactCountResult = {
  count: number | null;
  error: unknown;
};

export function mapBoundedExactCount(
  result: ExactCountResult,
  maximum = MAX_REPORT_ROWS,
): number | null {
  if (
    result.error ||
    result.count === null ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0 ||
    result.count > maximum
  ) {
    return null;
  }

  return result.count;
}

export async function getManagerReportSummary(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
): Promise<
  | {
      status: "found";
      league: {
        id: string;
        name: string;
        status: ReportLeagueStatus;
      };
      membership: MembershipStatusSummary;
    }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id, name, status, manager_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) return { status: "error" };
  if (!league || league.manager_id !== userId) {
    return { status: "not-found" };
  }

  const [activeMembers, pendingApproval, pendingProof, rejected] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .eq("status", "active"),
      supabase
        .from("join_requests")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .eq("status", "pending_approval"),
      supabase
        .from("join_requests")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .eq("status", "pending_proof"),
      supabase
        .from("join_requests")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueId)
        .eq("status", "rejected"),
    ]);

  const membership = {
    activeMembers: mapBoundedExactCount(activeMembers),
    pendingApproval: mapBoundedExactCount(pendingApproval),
    pendingProof: mapBoundedExactCount(pendingProof),
    rejected: mapBoundedExactCount(rejected),
  };

  if (Object.values(membership).some((count) => count === null)) {
    return { status: "error" };
  }

  return {
    status: "found",
    league: { id: league.id, name: league.name, status: league.status },
    membership: membership as MembershipStatusSummary,
  };
}
