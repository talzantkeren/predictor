import type { SupabaseClient } from "@supabase/supabase-js";

import { getUtcDateRange } from "@/features/predictions/display";
import type {
  EligibleLeague,
  EligibleLeaguePage,
  LeagueMatchItem,
  LeagueMatchList,
  MatchDetail,
  MatchListFilter,
  MatchStatus,
  OwnPrediction,
} from "@/features/predictions/types";
import {
  eligibleLeaguePageRpcSchema,
  matchDetailContextRpcSchema,
  matchSelectionContextRpcSchema,
  revealedPredictionPageRpcSchema,
  type MatchContextRpcRow,
  type MatchDetailContextRpcRow,
} from "@/features/predictions/schemas";
import {
  buildKeysetPage,
  getPostgrestKeysetFilter,
  type KeysetCursor,
} from "@/lib/keyset-pagination";
import type { Database } from "@/types/database.generated";

const MATCH_PAGE_SIZE = 25;
const ELIGIBLE_LEAGUE_PAGE_SIZE = 20;
const REVEALED_PREDICTION_PAGE_SIZE = 25;

type PredictionRow = Database["public"]["Tables"]["predictions"]["Row"];
type LeagueMatchResultRow =
  Database["public"]["Views"]["league_match_results"]["Row"];
type ValidLeagueMatchResultRow = LeagueMatchResultRow & {
  id: string;
  round_number: number;
  kickoff_at: string;
  status: MatchStatus;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
};

const matchStatuses = [
  "scheduled",
  "live",
  "finished",
  "postponed",
  "canceled",
] as const satisfies readonly MatchStatus[];

function isValidLeagueMatchResultRow(
  row: LeagueMatchResultRow,
): row is ValidLeagueMatchResultRow {
  return (
    typeof row.id === "string" &&
    Number.isSafeInteger(row.round_number) &&
    typeof row.kickoff_at === "string" &&
    typeof row.status === "string" &&
    (matchStatuses as readonly string[]).includes(row.status) &&
    typeof row.home_team_id === "string" &&
    typeof row.home_team_name === "string" &&
    typeof row.away_team_id === "string" &&
    typeof row.away_team_name === "string"
  );
}

function mapOwnPrediction(
  prediction: Pick<
    PredictionRow,
    | "id"
    | "predicted_home_score"
    | "predicted_away_score"
    | "predicted_outcome"
    | "created_at"
    | "updated_at"
  >,
): OwnPrediction | null {
  if (!prediction.predicted_outcome) return null;

  return {
    id: prediction.id,
    predictedHomeScore: prediction.predicted_home_score,
    predictedAwayScore: prediction.predicted_away_score,
    predictedOutcome: prediction.predicted_outcome,
    createdAt: prediction.created_at,
    updatedAt: prediction.updated_at,
  };
}

async function getPredictionDatabaseTime(
  supabase: SupabaseClient<Database>,
) {
  const { data, error } = await supabase.rpc("get_prediction_database_time");
  if (error || typeof data !== "string" || !Number.isFinite(Date.parse(data))) {
    return null;
  }
  return data;
}

export async function getLeagueMatchList(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
  filter: MatchListFilter,
  cursor?: KeysetCursor,
): Promise<
  | { status: "found"; data: LeagueMatchList }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select(
      "id, name, manager_id, season_id, status, season:seasons!inner(name, competition:competitions!inner(name))",
    )
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) return { status: "error" };
  if (!league) return { status: "not-found" };

  let matchesQuery = supabase
    .from("league_match_results")
    .select(
      "league_id, id, round_number, kickoff_at, predictions_locked_at, status, provider_status, home_score, away_score, home_team_id, home_team_name, home_team_short_name, away_team_id, away_team_name, away_team_short_name",
    )
    .eq("league_id", league.id)
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MATCH_PAGE_SIZE + 1);

  if (filter?.kind === "round") {
    matchesQuery = matchesQuery.eq("round_number", filter.round);
  } else if (filter?.kind === "date") {
    const range = getUtcDateRange(filter.date);
    matchesQuery = matchesQuery
      .gte("kickoff_at", range.start)
      .lt("kickoff_at", range.end);
  }

  if (cursor) {
    matchesQuery = matchesQuery.or(
      getPostgrestKeysetFilter("kickoff_at", "ascending", cursor),
    );
  }

  const [membershipResult, clock, matchesResult] = await Promise.all([
      supabase
        .from("league_members")
        .select("status")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .maybeSingle(),
      getPredictionDatabaseTime(supabase),
      matchesQuery,
    ]);

  if (
    membershipResult.error ||
    !clock ||
    matchesResult.error ||
    !matchesResult.data
  ) {
    return { status: "error" };
  }

  if (!matchesResult.data.every(isValidLeagueMatchResultRow)) {
    return { status: "error" };
  }

  const viewerIsActiveMember = membershipResult.data?.status === "active";
  const visibleMatchRows = matchesResult.data.slice(0, MATCH_PAGE_SIZE);
  const matchIds = visibleMatchRows.map((match) => match.id);
  const predictionsResult =
    viewerIsActiveMember && matchIds.length > 0
      ? await supabase
          .from("predictions")
          .select(
            "id, match_id, predicted_home_score, predicted_away_score, predicted_outcome, created_at, updated_at",
          )
          .eq("league_id", leagueId)
          .eq("user_id", userId)
          .in("match_id", matchIds)
          .limit(MATCH_PAGE_SIZE)
      : { data: [], error: null };

  if (predictionsResult.error || !predictionsResult.data) {
    return { status: "error" };
  }

  const predictionsByMatchId = new Map<string, OwnPrediction>();
  for (const prediction of predictionsResult.data) {
    const mapped = mapOwnPrediction(prediction);
    if (!mapped) return { status: "error" };
    predictionsByMatchId.set(prediction.match_id, mapped);
  }

  return {
    status: "found",
    data: {
      league: {
        id: league.id,
        name: league.name,
        status: league.status,
        seasonName: league.season.name,
        competitionName: league.season.competition.name,
      },
      viewerIsActiveMember,
      viewerIsManager: league.manager_id === userId,
      databaseNow: clock,
      matches: buildKeysetPage(
        matchesResult.data,
        MATCH_PAGE_SIZE,
        (match): LeagueMatchItem => ({
          id: match.id,
          roundNumber: match.round_number,
          kickoffAt: match.kickoff_at,
          predictionsLockedAt: match.predictions_locked_at,
          status: match.status,
          providerStatus: match.provider_status,
          homeScore: match.home_score,
          awayScore: match.away_score,
          homeTeam: {
            id: match.home_team_id,
            name: match.home_team_name,
            shortName: match.home_team_short_name,
          },
          awayTeam: {
            id: match.away_team_id,
            name: match.away_team_name,
            shortName: match.away_team_short_name,
          },
          ownPrediction: predictionsByMatchId.get(match.id) ?? null,
        }),
        (match) => ({ at: match.kickoff_at, id: match.id }),
      ),
    },
  };
}

export async function getPredictionWriteAuthorization(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  matchId: string,
  userId: string,
) {
  const [leagueResult, membershipResult, matchResult] = await Promise.all([
    supabase
      .from("leagues")
      .select("season_id, status")
      .eq("id", leagueId)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("status")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("matches")
      .select("season_id")
      .eq("id", matchId)
      .maybeSingle(),
  ]);

  if (leagueResult.error || membershipResult.error || matchResult.error) {
    return { status: "error" as const };
  }

  if (
    !leagueResult.data ||
    membershipResult.data?.status !== "active" ||
    !matchResult.data ||
    leagueResult.data.season_id !== matchResult.data.season_id
  ) {
    return { status: "denied" as const };
  }

  if (
    leagueResult.data.status === "completed" ||
    leagueResult.data.status === "archived"
  ) {
    return { status: "state-conflict" as const };
  }

  return { status: "authorized" as const };
}

function mapMatchContext(row: MatchContextRpcRow): MatchDetail["match"] {
  return {
    id: row.match_id,
    roundNumber: row.round_number,
    kickoffAt: row.kickoff_at,
    predictionsLockedAt: row.predictions_locked_at,
    status: row.match_status,
    providerStatus: row.provider_status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      shortName: row.home_team_short_name,
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      shortName: row.away_team_short_name,
    },
  };
}

function mapContextOwnPrediction(
  row: MatchDetailContextRpcRow,
): OwnPrediction | null {
  if (
    row.own_prediction_id === null ||
    row.own_predicted_home_score === null ||
    row.own_predicted_away_score === null ||
    row.own_predicted_outcome === null ||
    row.own_prediction_created_at === null ||
    row.own_prediction_updated_at === null
  ) {
    return null;
  }

  return {
    id: row.own_prediction_id,
    predictedHomeScore: row.own_predicted_home_score,
    predictedAwayScore: row.own_predicted_away_score,
    predictedOutcome: row.own_predicted_outcome,
    createdAt: row.own_prediction_created_at,
    updatedAt: row.own_prediction_updated_at,
  };
}

async function getEligibleLeaguePage(
  supabase: SupabaseClient<Database>,
  matchId: string,
  cursor?: KeysetCursor,
) {
  const { data, error } = await supabase.rpc(
    "get_match_eligible_leagues_page",
    {
      p_match_id: matchId,
      p_page_size: ELIGIBLE_LEAGUE_PAGE_SIZE,
      ...(cursor
        ? {
            p_cursor_created_at: cursor.at,
            p_cursor_league_id: cursor.id,
          }
        : {}),
    },
  );
  const parsed = eligibleLeaguePageRpcSchema.safeParse(data);
  if (error || !parsed.success) return null;

  return buildKeysetPage(
    parsed.data,
    ELIGIBLE_LEAGUE_PAGE_SIZE,
    (league): EligibleLeague => ({
      id: league.league_id,
      name: league.league_name,
      status: league.league_status,
    }),
    (league) => ({
      at: league.league_created_at,
      id: league.league_id,
    }),
  );
}

export async function getMatchDetail(
  supabase: SupabaseClient<Database>,
  matchId: string,
  userId: string,
  options: {
    requestedLeagueId?: string;
    eligibleLeagueCursor?: KeysetCursor;
    revealedPredictionCursor?: KeysetCursor;
  } = {},
): Promise<
  | { status: "found"; data: MatchDetail }
  | {
      status: "selection-required";
      match: MatchDetail["match"];
      eligibleLeagues: EligibleLeaguePage;
      databaseNow: string;
    }
  | { status: "not-found" }
  | { status: "error" }
> {
  const eligibleLeagues = await getEligibleLeaguePage(
    supabase,
    matchId,
    options.eligibleLeagueCursor,
  );
  if (!eligibleLeagues) return { status: "error" };

  const selectedLeagueId =
    options.requestedLeagueId ??
    (options.eligibleLeagueCursor === undefined &&
    eligibleLeagues.items.length === 1 &&
    !eligibleLeagues.hasMore
      ? eligibleLeagues.items[0]?.id
      : undefined);

  if (!selectedLeagueId) {
    const { data, error } = await supabase.rpc(
      "get_match_selection_context",
      { p_match_id: matchId },
    );
    const parsed = matchSelectionContextRpcSchema.safeParse(data);
    if (error || !parsed.success) return { status: "error" };
    const context = parsed.data[0];
    if (!context) return { status: "not-found" };

    return {
      status: "selection-required",
      match: mapMatchContext(context),
      eligibleLeagues,
      databaseNow: context.database_time,
    };
  }

  const { data: detailData, error: detailError } = await supabase.rpc(
    "get_match_detail_context",
    { p_match_id: matchId, p_league_id: selectedLeagueId },
  );
  const parsedDetail = matchDetailContextRpcSchema.safeParse(detailData);
  if (detailError || !parsedDetail.success) return { status: "error" };
  const detail = parsedDetail.data[0];
  if (!detail) return { status: "not-found" };

  const { data: revealedData, error: revealedError } = await supabase.rpc(
    "get_revealed_predictions_page",
    {
      p_league_id: selectedLeagueId,
      p_match_id: matchId,
      p_page_size: REVEALED_PREDICTION_PAGE_SIZE,
      ...(options.revealedPredictionCursor
        ? {
            p_cursor_created_at: options.revealedPredictionCursor.at,
            p_cursor_prediction_id: options.revealedPredictionCursor.id,
          }
        : {}),
    },
  );
  const parsedRevealed = revealedPredictionPageRpcSchema.safeParse(revealedData);
  if (revealedError || !parsedRevealed.success) return { status: "error" };

  return {
    status: "found",
    data: {
      league: {
        id: detail.league_id,
        name: detail.league_name,
        status: detail.league_status,
      },
      eligibleLeagues,
      match: mapMatchContext(detail),
      databaseNow: detail.database_time,
      ownPrediction: mapContextOwnPrediction(detail),
      revealedPredictions: buildKeysetPage(
        parsedRevealed.data,
        REVEALED_PREDICTION_PAGE_SIZE,
        (prediction) => ({
          id: prediction.prediction_id,
          userId: prediction.user_id,
          displayName: prediction.display_name,
          isViewer: prediction.user_id === userId,
          predictedHomeScore: prediction.predicted_home_score,
          predictedAwayScore: prediction.predicted_away_score,
          predictedOutcome: prediction.predicted_outcome,
          createdAt: prediction.created_at,
          updatedAt: prediction.updated_at,
        }),
        (prediction) => ({
          at: prediction.created_at,
          id: prediction.prediction_id,
        }),
      ),
    },
  };
}
