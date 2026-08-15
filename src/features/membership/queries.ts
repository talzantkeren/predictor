import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isValidInvitePublicId,
  isValidInviteTokenHash,
} from "@/features/membership/invite-token";
import {
  getSingleMembershipRpcRecord,
  invokeMembershipRpc,
} from "@/features/membership/rpc";
import {
  dashboardJoinRequestsRpcSchema,
  inviteMetadataRpcSchema,
  inviteResolutionRpcSchema,
  unavailableInviteResolutionRpcSchema,
  managerJoinRequestsRpcSchema,
} from "@/features/membership/schemas";
import type {
  InviteMetadata,
  InviteResolution,
  JoinRequestDashboardItem,
  LeagueInviteSettings,
  ManagerJoinRequestItem,
} from "@/features/membership/types";
import type { Database } from "@/types/database.generated";

export async function resolveInvite(
  supabase: SupabaseClient<Database>,
  publicId: string,
  tokenHash: string,
): Promise<
  | { status: "found"; data: InviteResolution }
  | { status: "unavailable" }
  | { status: "error" }
> {
  if (
    !isValidInvitePublicId(publicId) ||
    !isValidInviteTokenHash(tokenHash)
  ) {
    return { status: "unavailable" };
  }

  const { data, error } = await invokeMembershipRpc(
    supabase,
    "resolve_invite",
    { p_public_id: publicId, p_token_hash: tokenHash },
  );

  if (error) {
    return { status: "error" };
  }

  const record = getSingleMembershipRpcRecord(data);

  if (
    record === null ||
    unavailableInviteResolutionRpcSchema.safeParse(record).success
  ) {
    return { status: "unavailable" };
  }

  const parsed = inviteResolutionRpcSchema.safeParse(record);
  return parsed.success
    ? { status: "found", data: parsed.data }
    : { status: "unavailable" };
}

export async function getLeagueInviteSettings(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
): Promise<
  | {
      status: "found";
      league: LeagueInviteSettings;
      invite: InviteMetadata | null;
    }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id, name, status, manager_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) {
    return { status: "error" };
  }

  if (!league || league.manager_id !== userId) {
    return { status: "not-found" };
  }

  const { data, error } = await invokeMembershipRpc(
    supabase,
    "get_league_invite_metadata",
    { p_league_id: leagueId },
  );

  if (error) {
    return { status: "error" };
  }

  const record = getSingleMembershipRpcRecord(data);

  if (record === null) {
    return {
      status: "found",
      league: {
        id: league.id,
        name: league.name,
        status: league.status,
      },
      invite: null,
    };
  }

  const parsed = inviteMetadataRpcSchema.safeParse(record);

  if (!parsed.success) {
    return { status: "error" };
  }

  return {
    status: "found",
    league: {
      id: league.id,
      name: league.name,
      status: league.status,
    },
    invite: parsed.data,
  };
}

export async function getMyJoinRequests(
  supabase: SupabaseClient<Database>,
): Promise<
  | { ok: true; data: JoinRequestDashboardItem[] }
  | { ok: false; data: [] }
> {
  const { data, error } = await invokeMembershipRpc(
    supabase,
    "get_my_join_requests_v2",
  );

  if (error) {
    return { ok: false, data: [] };
  }

  const parsed = dashboardJoinRequestsRpcSchema.safeParse(data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, data: [] };
}

export async function getManagerJoinRequests(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
): Promise<
  | { status: "found"; league: { id: string; name: string }; requests: ManagerJoinRequestItem[] }
  | { status: "not-found" }
  | { status: "error" }
> {
  const { data: league, error: leagueError } = await supabase
    .from("leagues")
    .select("id, name, manager_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError) return { status: "error" };
  if (!league || league.manager_id !== userId) return { status: "not-found" };

  const { data, error } = await invokeMembershipRpc(
    supabase,
    "get_manager_join_requests",
    { p_league_id: leagueId },
  );
  if (error) return { status: "error" };

  const parsed = managerJoinRequestsRpcSchema.safeParse(data);
  return parsed.success
    ? { status: "found", league: { id: league.id, name: league.name }, requests: parsed.data }
    : { status: "error" };
}
