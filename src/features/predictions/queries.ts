import type { SupabaseClient } from "@supabase/supabase-js";

import { getUtcDateRange } from "@/features/predictions/display";
import type {
  EligibleLeague,
  LeagueMatchItem,
  LeagueMatchList,
  MatchDetail,
  MatchListFilter,
  OwnPrediction,
} from "@/features/predictions/types";
import type { Database } from "@/types/database.generated";

const MAX_MATCHES_PER_PAGE = 100;
const MAX_LEAGUES_PER_USER = 100;
const MAX_ACTIVE_MEMBERS_PER_LEAGUE = 200;

type PredictionRow = Database["public"]["Tables"]["predictions"]["Row"];

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
): Promise<
  | { status: "found"; data: LeagueMatchList }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select(
      "id, name, manager_id, season_id, season:seasons!inner(name, competition:competitions!inner(name))",
    )
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) return { status: "error" };
  if (!league) return { status: "not-found" };

  let matchesQuery = supabase
    .from("matches")
    .select(
      "id, round_number, kickoff_at, status, home_score, away_score, home_team:teams!matches_home_team_id_fkey(id, name, short_name), away_team:teams!matches_away_team_id_fkey(id, name, short_name)",
    )
    .eq("season_id", league.season_id)
    .order("kickoff_at", { ascending: true })
    .limit(MAX_MATCHES_PER_PAGE);

  if (filter?.kind === "round") {
    matchesQuery = matchesQuery.eq("round_number", filter.round);
  } else if (filter?.kind === "date") {
    const range = getUtcDateRange(filter.date);
    matchesQuery = matchesQuery
      .gte("kickoff_at", range.start)
      .lt("kickoff_at", range.end);
  }

  const [membershipResult, clock, matchesResult, roundsResult] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("status")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .maybeSingle(),
      getPredictionDatabaseTime(supabase),
      matchesQuery,
      supabase
        .from("matches")
        .select("round_number")
        .eq("season_id", league.season_id)
        .order("round_number", { ascending: true })
        .limit(MAX_MATCHES_PER_PAGE),
    ]);

  if (
    membershipResult.error ||
    !clock ||
    matchesResult.error ||
    !matchesResult.data ||
    roundsResult.error ||
    !roundsResult.data
  ) {
    return { status: "error" };
  }

  const viewerIsActiveMember = membershipResult.data?.status === "active";
  const matchIds = matchesResult.data.map((match) => match.id);
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
          .limit(MAX_MATCHES_PER_PAGE)
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

  const matches: LeagueMatchItem[] = matchesResult.data.map((match) => ({
    id: match.id,
    roundNumber: match.round_number,
    kickoffAt: match.kickoff_at,
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    homeTeam: {
      id: match.home_team.id,
      name: match.home_team.name,
      shortName: match.home_team.short_name,
    },
    awayTeam: {
      id: match.away_team.id,
      name: match.away_team.name,
      shortName: match.away_team.short_name,
    },
    ownPrediction: predictionsByMatchId.get(match.id) ?? null,
  }));

  return {
    status: "found",
    data: {
      league: {
        id: league.id,
        name: league.name,
        seasonName: league.season.name,
        competitionName: league.season.competition.name,
      },
      viewerIsActiveMember,
      databaseNow: clock,
      roundOptions: [
        ...new Set(roundsResult.data.map((match) => match.round_number)),
      ],
      matches,
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
      .select("season_id")
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

  return { status: "authorized" as const };
}

export async function getMatchDetail(
  supabase: SupabaseClient<Database>,
  matchId: string,
  userId: string,
  requestedLeagueId?: string,
): Promise<
  | { status: "found"; data: MatchDetail }
  | {
      status: "selection-required";
      match: MatchDetail["match"];
      eligibleLeagues: EligibleLeague[];
      databaseNow: string;
    }
  | { status: "not-found" }
  | { status: "error" }
> {
  const [matchResult, clock, membershipsResult] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, season_id, round_number, kickoff_at, status, home_score, away_score, home_team:teams!matches_home_team_id_fkey(id, name, short_name), away_team:teams!matches_away_team_id_fkey(id, name, short_name)",
      )
      .eq("id", matchId)
      .maybeSingle(),
    getPredictionDatabaseTime(supabase),
    supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(MAX_LEAGUES_PER_USER),
  ]);

  if (
    matchResult.error ||
    membershipsResult.error ||
    !membershipsResult.data ||
    !clock
  ) {
    return { status: "error" };
  }
  if (!matchResult.data) return { status: "not-found" };

  const match = matchResult.data;
  const membershipLeagueIds = membershipsResult.data.map(
    (membership) => membership.league_id,
  );
  if (membershipLeagueIds.length === 0) return { status: "not-found" };

  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("id, name")
    .in("id", membershipLeagueIds)
    .eq("season_id", match.season_id)
    .order("created_at", { ascending: true })
    .limit(MAX_LEAGUES_PER_USER);

  if (leaguesError || !leagues) return { status: "error" };
  if (leagues.length === 0) return { status: "not-found" };

  const eligibleLeagues: EligibleLeague[] = leagues.map((league) => ({
    id: league.id,
    name: league.name,
  }));
  const mappedMatch: MatchDetail["match"] = {
    id: match.id,
    roundNumber: match.round_number,
    kickoffAt: match.kickoff_at,
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    homeTeam: {
      id: match.home_team.id,
      name: match.home_team.name,
      shortName: match.home_team.short_name,
    },
    awayTeam: {
      id: match.away_team.id,
      name: match.away_team.name,
      shortName: match.away_team.short_name,
    },
  };

  const selectedLeague = requestedLeagueId
    ? eligibleLeagues.find((league) => league.id === requestedLeagueId)
    : eligibleLeagues.length === 1
      ? eligibleLeagues[0]
      : undefined;

  if (requestedLeagueId && !selectedLeague) return { status: "not-found" };
  if (!selectedLeague) {
    return {
      status: "selection-required",
      match: mappedMatch,
      eligibleLeagues,
      databaseNow: clock,
    };
  }

  const { data: activeMembers, error: membersError } = await supabase
    .from("league_members")
    .select("user_id")
    .eq("league_id", selectedLeague.id)
    .eq("status", "active")
    .order("approved_at", { ascending: true })
    .limit(MAX_ACTIVE_MEMBERS_PER_LEAGUE);

  if (membersError || !activeMembers) return { status: "error" };
  const activeMemberIds = activeMembers.map((member) => member.user_id);
  if (!activeMemberIds.includes(userId)) return { status: "not-found" };

  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select(
      "id, user_id, predicted_home_score, predicted_away_score, predicted_outcome, created_at, updated_at",
    )
    .eq("league_id", selectedLeague.id)
    .eq("match_id", matchId)
    .in("user_id", activeMemberIds)
    .order("updated_at", { ascending: true })
    .limit(MAX_ACTIVE_MEMBERS_PER_LEAGUE);

  if (predictionsError || !predictions) return { status: "error" };
  const predictionUserIds = predictions.map((prediction) => prediction.user_id);
  const profilesResult =
    predictionUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", predictionUserIds)
          .limit(MAX_ACTIVE_MEMBERS_PER_LEAGUE)
      : { data: [], error: null };

  if (profilesResult.error || !profilesResult.data) return { status: "error" };
  const displayNames = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.display_name]),
  );

  let ownPrediction: OwnPrediction | null = null;
  const revealedPredictions = [];
  for (const prediction of predictions) {
    const mapped = mapOwnPrediction(prediction);
    const displayName = displayNames.get(prediction.user_id);
    if (!mapped || !displayName) return { status: "error" };
    if (prediction.user_id === userId) ownPrediction = mapped;
    revealedPredictions.push({
      ...mapped,
      userId: prediction.user_id,
      displayName,
      isViewer: prediction.user_id === userId,
    });
  }

  return {
    status: "found",
    data: {
      league: selectedLeague,
      eligibleLeagues,
      match: mappedMatch,
      databaseNow: clock,
      ownPrediction,
      revealedPredictions,
    },
  };
}
