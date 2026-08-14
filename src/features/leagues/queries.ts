import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LeagueDashboardItem,
  LeagueSummary,
  SeasonOption,
} from "@/features/leagues/types";
import type { Database } from "@/types/database.generated";

type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; data: T };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSeasonOptions(
  supabase: SupabaseClient<Database>,
): Promise<QueryResult<SeasonOption[]>> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, competition:competitions!inner(name)")
    .eq("is_current", true)
    .order("starts_on", { ascending: false })
    .limit(20);

  if (error || !data) {
    return { ok: false, data: [] };
  }

  return {
    ok: true,
    data: data.map((season) => ({
      id: season.id,
      name: season.name,
      competitionName: season.competition.name,
    })),
  };
}

export async function getDashboardLeagues(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<QueryResult<LeagueDashboardItem[]>> {
  const { data: memberships, error: membershipsError } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (membershipsError || !memberships) {
    return { ok: false, data: [] };
  }

  // Defense in depth: these are uuid column values from our own database, but
  // they are interpolated into the PostgREST or() filter string below.
  const leagueIds = memberships
    .map((membership) => membership.league_id)
    .filter((leagueId) => UUID_PATTERN.test(leagueId));
  let query = supabase
    .from("leagues")
    .select("id, name, status, manager_id, season:seasons!inner(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  query =
    leagueIds.length > 0
      ? query.or(`manager_id.eq.${userId},id.in.(${leagueIds.join(",")})`)
      : query.eq("manager_id", userId);

  const { data, error } = await query;

  if (error || !data) {
    return { ok: false, data: [] };
  }

  return {
    ok: true,
    data: data.map((league) => ({
      id: league.id,
      name: league.name,
      seasonName: league.season.name,
      status: league.status,
      role: league.manager_id === userId ? "manager" : "member",
    })),
  };
}

export async function getLeagueSummary(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
): Promise<
  | { status: "found"; data: LeagueSummary }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select(
      "id, name, description, status, manager_id, demo_entry_fee_agorot, demo_payment_instructions, allow_late_join, joins_close_at, season:seasons!inner(name, competition:competitions!inner(name))",
    )
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) {
    return { status: "error" };
  }

  if (!league) {
    return { status: "not-found" };
  }

  // Reading the league row already proves the viewer is its manager or an
  // active member (RLS); scoring and prize rules follow the same policies.
  const [scoringResult, prizesResult] = await Promise.all([
    supabase
      .from("league_scoring_rules")
      .select(
        "exact_points, correct_outcome_points, incorrect_points, version, locked_at",
      )
      .eq("league_id", leagueId)
      .maybeSingle(),
    supabase
      .from("prize_rules")
      .select("position, percentage_bps")
      .eq("league_id", leagueId)
      .order("position", { ascending: true })
      .limit(100),
  ]);

  if (
    scoringResult.error ||
    !scoringResult.data ||
    prizesResult.error ||
    !prizesResult.data
  ) {
    return { status: "error" };
  }

  return {
    status: "found",
    data: {
      id: league.id,
      name: league.name,
      description: league.description,
      seasonName: league.season.name,
      competitionName: league.season.competition.name,
      status: league.status,
      demoEntryFeeAgorot: league.demo_entry_fee_agorot,
      demoPaymentInstructions: league.demo_payment_instructions,
      allowLateJoin: league.allow_late_join,
      joinsCloseAt: league.joins_close_at,
      role: league.manager_id === userId ? "manager" : "member",
      scoring: {
        exactPoints: scoringResult.data.exact_points,
        correctOutcomePoints: scoringResult.data.correct_outcome_points,
        incorrectPoints: scoringResult.data.incorrect_points,
        version: scoringResult.data.version,
        lockedAt: scoringResult.data.locked_at,
      },
      prizes: prizesResult.data.map((prize) => ({
        position: prize.position,
        percentageBps: prize.percentage_bps,
      })),
    },
  };
}
