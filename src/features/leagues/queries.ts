import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getSeasonSourceLabel } from "@/features/leagues/display";
import type {
  LeagueDashboardItem,
  LeagueDashboardPage,
  LeagueSummary,
  SeasonOption,
} from "@/features/leagues/types";
import {
  buildKeysetPage,
  type KeysetCursor,
} from "@/lib/keyset-pagination";
import type { Database } from "@/types/database.generated";

type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; data: T };

const DASHBOARD_LEAGUE_PAGE_SIZE = 20;

const dashboardLeaguePageSchema = z
  .array(
    z
      .object({
        league_id: z.string().uuid(),
        league_name: z.string().min(1).max(80),
        league_status: z.enum([
          "draft",
          "open",
          "active",
          "completed",
          "archived",
        ]),
        league_created_at: z.string().datetime({ offset: true }),
        season_name: z.string().min(1).max(80),
        viewer_role: z.enum(["manager", "member"]),
      })
      .strict(),
  )
  .max(DASHBOARD_LEAGUE_PAGE_SIZE + 1);

export async function getSeasonOptions(
  supabase: SupabaseClient<Database>,
): Promise<QueryResult<SeasonOption[]>> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, external_provider, competition:competitions!inner(name)")
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
      sourceLabel: getSeasonSourceLabel(season.external_provider),
    })),
  };
}

export async function getDashboardLeagues(
  supabase: SupabaseClient<Database>,
  cursor?: KeysetCursor,
): Promise<QueryResult<LeagueDashboardPage>> {
  const { data, error } = await supabase.rpc("get_dashboard_leagues_page", {
    p_page_size: DASHBOARD_LEAGUE_PAGE_SIZE,
    ...(cursor
      ? {
          p_cursor_created_at: cursor.at,
          p_cursor_league_id: cursor.id,
        }
      : {}),
  });

  const parsed = dashboardLeaguePageSchema.safeParse(data);

  if (error || !parsed.success) {
    return {
      ok: false,
      data: { items: [], hasMore: false, nextCursor: null },
    };
  }

  return {
    ok: true,
    data: buildKeysetPage(
      parsed.data,
      DASHBOARD_LEAGUE_PAGE_SIZE,
      (league): LeagueDashboardItem => ({
        id: league.league_id,
        name: league.league_name,
        seasonName: league.season_name,
        status: league.league_status,
        role: league.viewer_role,
      }),
      (league) => ({
        at: league.league_created_at,
        id: league.league_id,
      }),
    ),
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
