import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LeagueStanding,
  PendingLeagueReconciliation,
  LeagueStandings,
  SystemMatchFilters,
  SystemMatchEditorCatalog,
  SystemMatchItem,
  SystemMatchPage,
} from "@/features/scoring/types";
import {
  buildKeysetPage,
  getPostgrestKeysetFilter,
  type KeysetCursor,
} from "@/lib/keyset-pagination";
import type { Database } from "@/types/database.generated";

const SYSTEM_MATCH_PAGE_SIZE = 25;
const MAX_SYSTEM_MATCH_SEASONS = 100;
const MAX_SYSTEM_MATCH_TEAMS = 500;
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
  filters: SystemMatchFilters = {},
  cursor?: KeysetCursor,
): Promise<
  | { status: "found"; matches: SystemMatchPage }
  | { status: "denied" }
  | { status: "error" }
> {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  let query = supabase
    .from("matches")
    .select(
      "id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, result_version, requires_review, review_code, review_result_version, is_manually_overridden, external_provider, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
    )
    .order("kickoff_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SYSTEM_MATCH_PAGE_SIZE + 1);

  if (filters.seasonId) query = query.eq("season_id", filters.seasonId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.roundNumber) {
    query = query.eq("round_number", filters.roundNumber);
  }
  if (cursor) {
    query = query.or(
      getPostgrestKeysetFilter("kickoff_at", "descending", cursor),
    );
  }

  const { data, error } = await query;

  if (error || !data) {
    return { status: "error" };
  }

  return {
    status: "found",
    matches: buildKeysetPage(
      data,
      SYSTEM_MATCH_PAGE_SIZE,
      (match): SystemMatchItem => ({
        id: match.id,
        seasonId: match.season_id,
        roundNumber: match.round_number,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        kickoffAt: match.kickoff_at,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        resultVersion: match.result_version,
        requiresReview: match.requires_review,
        reviewCode: match.review_code,
        reviewResultVersion: match.review_result_version,
        isManuallyOverridden: match.is_manually_overridden,
        externalProvider: match.external_provider,
        homeTeamName: match.home_team.name,
        awayTeamName: match.away_team.name,
      }),
      (match) => ({ at: match.kickoff_at, id: match.id }),
    ),
  };
}

const PENDING_RECONCILIATION_LIMIT = 25;

export async function getPendingLeagueReconciliations(
  supabase: SupabaseClient<Database>,
): Promise<
  | { status: "found"; items: PendingLeagueReconciliation[]; hasMore: boolean }
  | { status: "denied" }
  | { status: "error" }
> {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  const { data: reconciliations, error } = await supabase
    .from("league_match_reconciliations")
    .select(
      "id, league_id, match_id, result_version, candidate_status, candidate_home_score, candidate_away_score, created_at",
    )
    .eq("disposition", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PENDING_RECONCILIATION_LIMIT + 1);

  if (error || !reconciliations) return { status: "error" };
  const visible = reconciliations.slice(0, PENDING_RECONCILIATION_LIMIT);
  const matchIds = [...new Set(visible.map((item) => item.match_id))];
  const matchesResult =
    matchIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("matches")
          .select(
            "id, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)",
          )
          .in("id", matchIds)
          .limit(PENDING_RECONCILIATION_LIMIT);

  if (matchesResult.error || !matchesResult.data) return { status: "error" };
  const matchesById = new Map(
    matchesResult.data.map((match) => [
      match.id,
      {
        homeTeamName: match.home_team.name,
        awayTeamName: match.away_team.name,
      },
    ]),
  );

  const items: PendingLeagueReconciliation[] = [];
  for (const reconciliation of visible) {
    const match = matchesById.get(reconciliation.match_id);
    const candidateStatus = reconciliation.candidate_status;
    if (
      !match ||
      (candidateStatus !== "finished" && candidateStatus !== "canceled")
    ) {
      return { status: "error" };
    }
    items.push({
      id: reconciliation.id,
      leagueId: reconciliation.league_id,
      matchId: reconciliation.match_id,
      resultVersion: reconciliation.result_version,
      candidateStatus,
      candidateHomeScore: reconciliation.candidate_home_score,
      candidateAwayScore: reconciliation.candidate_away_score,
      createdAt: reconciliation.created_at,
      ...match,
    });
  }

  return {
    status: "found",
    items,
    hasMore: reconciliations.length > PENDING_RECONCILIATION_LIMIT,
  };
}

export async function getSystemMatchEditorCatalog(
  supabase: SupabaseClient<Database>,
): Promise<
  | { status: "found"; catalog: SystemMatchEditorCatalog }
  | { status: "denied" }
  | { status: "error" }
> {
  const authorization = await getSystemAdminAuthorization(supabase);
  if (authorization.status !== "authorized") return authorization;

  const [seasonResult, teamResult] = await Promise.all([
    supabase
      .from("seasons")
      .select(
        "id, name, competition:competitions!seasons_competition_id_fkey(name)",
      )
      .order("starts_on", { ascending: false })
      .order("id", { ascending: true })
      .limit(MAX_SYSTEM_MATCH_SEASONS + 1),
    supabase
      .from("teams")
      .select("id, name, short_name")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_SYSTEM_MATCH_TEAMS + 1),
  ]);

  if (
    seasonResult.error ||
    teamResult.error ||
    !seasonResult.data ||
    !teamResult.data ||
    seasonResult.data.length > MAX_SYSTEM_MATCH_SEASONS ||
    teamResult.data.length > MAX_SYSTEM_MATCH_TEAMS
  ) {
    return { status: "error" };
  }

  return {
    status: "found",
    catalog: {
      seasons: seasonResult.data.map((season) => ({
        id: season.id,
        name: season.name,
        competitionName: season.competition.name,
      })),
      teams: teamResult.data.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
      })),
    },
  };
}

function isSafeMetric(value: number | null, minimum = 0): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= minimum;
}

export function mapStanding(
  row: Database["public"]["Views"]["league_leaderboard"]["Row"],
): LeagueStanding | null {
  if (
    !row.league_id ||
    !row.user_id ||
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
    displayName: row.display_name?.trim() || "משתתף",
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
      viewerIsManager: leagueResult.data.manager_id === userId,
      standings: standings as LeagueStanding[],
    },
  };
}
