import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LeagueStanding,
  LeagueStandings,
  SystemMatchItem,
} from "@/features/scoring/types";
import type { Database } from "@/types/database.generated";

const MAX_SYSTEM_MATCHES = 200;
const MAX_LEAGUE_MEMBERS = 500;

export async function getSystemAdminAuthorization(
  supabase: SupabaseClient<Database>,
) {
  const { data, error } = await supabase.rpc("is_system_admin");
  if (error || typeof data !== "boolean") {
    return { status: "error" as const };
  }
  return data
    ? { status: "authorized" as const }
    : { status: "denied" as const };
}

export async function getManualResultAuthorization(
  supabase: SupabaseClient<Database>,
  matchId: string,
) {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  const { data, error } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .maybeSingle();

  if (error) return { status: "error" as const };
  if (!data) return { status: "not-found" as const };
  return { status: "authorized" as const };
}

export async function getSystemMatchList(
  supabase: SupabaseClient<Database>,
): Promise<
  | { status: "found"; matches: SystemMatchItem[] }
  | { status: "denied" }
  | { status: "error" }
> {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, round_number, kickoff_at, status, home_score, away_score, result_version, is_manually_overridden, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
    )
    .order("kickoff_at", { ascending: false })
    .limit(MAX_SYSTEM_MATCHES + 1);

  if (error || !data || data.length > MAX_SYSTEM_MATCHES) {
    return { status: "error" };
  }

  return {
    status: "found",
    matches: data.map((match) => ({
      id: match.id,
      roundNumber: match.round_number,
      kickoffAt: match.kickoff_at,
      status: match.status,
      homeScore: match.home_score,
      awayScore: match.away_score,
      resultVersion: match.result_version,
      isManuallyOverridden: match.is_manually_overridden,
      homeTeamName: match.home_team.name,
      awayTeamName: match.away_team.name,
    })),
  };
}

function isSafeMetric(value: number | null, minimum = 0): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= minimum;
}

function mapStanding(
  row: Database["public"]["Views"]["league_leaderboard"]["Row"],
): LeagueStanding | null {
  if (
    !row.league_id ||
    !row.user_id ||
    !row.display_name ||
    !isSafeMetric(row.total_points) ||
    !isSafeMetric(row.correct_outcomes) ||
    !isSafeMetric(row.exact_scores) ||
    !isSafeMetric(row.predictions_submitted) ||
    !isSafeMetric(row.rank, 1)
  ) {
    return null;
  }

  return {
    leagueId: row.league_id,
    userId: row.user_id,
    displayName: row.display_name,
    totalPoints: row.total_points,
    correctOutcomes: row.correct_outcomes,
    exactScores: row.exact_scores,
    predictionsSubmitted: row.predictions_submitted,
    rank: row.rank,
  };
}

export async function getLeagueStandings(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
): Promise<
  | { status: "found"; data: LeagueStandings }
  | { status: "not-found" }
  | { status: "error" }
> {
  const [leagueResult, membershipResult] = await Promise.all([
    supabase
      .from("leagues")
      .select("id, name, manager_id")
      .eq("id", leagueId)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("status")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (leagueResult.error || membershipResult.error) {
    return { status: "error" };
  }
  if (!leagueResult.data) return { status: "not-found" };

  const authorized =
    leagueResult.data.manager_id === userId ||
    membershipResult.data?.status === "active";
  if (!authorized) return { status: "not-found" };

  const { data, error } = await supabase
    .from("league_leaderboard")
    .select(
      "league_id, user_id, display_name, total_points, correct_outcomes, exact_scores, predictions_submitted, rank",
    )
    .eq("league_id", leagueId)
    .order("rank", { ascending: true })
    .order("display_name", { ascending: true })
    .limit(MAX_LEAGUE_MEMBERS + 1);

  if (error || !data || data.length > MAX_LEAGUE_MEMBERS) {
    return { status: "error" };
  }

  const standings = data.map(mapStanding);
  if (standings.some((standing) => standing === null)) {
    return { status: "error" };
  }

  return {
    status: "found",
    data: {
      league: { id: leagueResult.data.id, name: leagueResult.data.name },
      standings: standings as LeagueStanding[],
    },
  };
}
