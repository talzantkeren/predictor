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
  dashboardJoinRequestPageRpcSchema,
  inviteMetadataRpcSchema,
  inviteResolutionRpcSchema,
  managerJoinRequestPageRpcSchema,
  unavailableInviteResolutionRpcSchema,
} from "@/features/membership/schemas";
import type {
  InviteMetadata,
  InviteResolution,
  JoinRequestDashboardItem,
  JoinRequestDashboardPage,
  LeagueInviteSettings,
  ManagerJoinRequestItem,
  ManagerJoinRequestPage,
} from "@/features/membership/types";
import {
  buildKeysetPage,
  type KeysetCursor,
} from "@/lib/keyset-pagination";
import type { Database } from "@/types/database.generated";

const JOIN_REQUEST_PAGE_SIZE = 25;

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
  cursor?: KeysetCursor,
): Promise<
  | { ok: true; data: JoinRequestDashboardPage }
  | { ok: false; data: JoinRequestDashboardPage }
> {
  const { data, error } = await invokeMembershipRpc(
    supabase,
    "get_my_join_requests_page",
    {
      p_page_size: JOIN_REQUEST_PAGE_SIZE,
      ...(cursor
        ? {
            p_cursor_created_at: cursor.at,
            p_cursor_request_id: cursor.id,
          }
        : {}),
    },
  );

  if (error) {
    return {
      ok: false,
      data: { items: [], hasMore: false, nextCursor: null },
    };
  }

  const parsed = dashboardJoinRequestPageRpcSchema.safeParse(data);
  return parsed.success
    ? {
        ok: true,
        data: buildKeysetPage(
          parsed.data,
          JOIN_REQUEST_PAGE_SIZE,
          (request): JoinRequestDashboardItem => request,
          (request) => ({ at: request.createdAt, id: request.requestId }),
        ),
      }
    : {
        ok: false,
        data: { items: [], hasMore: false, nextCursor: null },
      };
}

export async function getManagerJoinRequests(
  supabase: SupabaseClient<Database>,
  leagueId: string,
  userId: string,
  cursor?: KeysetCursor,
  status?: ManagerJoinRequestItem["status"],
): Promise<
  | {
      status: "found";
      league: { id: string; name: string };
      requests: ManagerJoinRequestPage;
    }
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
    "get_manager_join_requests_page",
    {
      p_league_id: leagueId,
      p_page_size: JOIN_REQUEST_PAGE_SIZE,
      ...(status ? { p_status: status } : {}),
      ...(cursor
        ? {
            p_cursor_created_at: cursor.at,
            p_cursor_request_id: cursor.id,
          }
        : {}),
    },
  );
  if (error) return { status: "error" };

  const parsed = managerJoinRequestPageRpcSchema.safeParse(data);
  return parsed.success
    ? {
        status: "found",
        league: { id: league.id, name: league.name },
        requests: buildKeysetPage(
          parsed.data,
          JOIN_REQUEST_PAGE_SIZE,
          (request): ManagerJoinRequestItem => request,
          (request) => ({ at: request.createdAt, id: request.requestId }),
        ),
      }
    : { status: "error" };
}
