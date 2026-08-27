import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

export type MembershipRpcName =
  | "create_or_rotate_invite"
  | "revoke_invite"
  | "resolve_invite"
  | "submit_join_request"
  | "get_league_invite_metadata"
  | "get_my_join_requests_page"
  | "get_manager_join_requests_page"
  | "approve_join_request"
  | "reject_join_request";

type MembershipRpcResponse = {
  data: unknown;
  error: unknown;
};

type MembershipRpcInvoker = {
  rpc(
    name: MembershipRpcName,
    args: Record<string, unknown>,
  ): PromiseLike<MembershipRpcResponse>;
};

export async function invokeMembershipRpc(
  supabase: SupabaseClient<Database>,
  name: MembershipRpcName,
  args: Record<string, unknown> = {},
) {
  const rpcClient = supabase as unknown as MembershipRpcInvoker;
  return rpcClient.rpc(name, args);
}

export function getSingleMembershipRpcRecord(data: unknown) {
  if (Array.isArray(data)) {
    return data.length === 1 ? data[0] : null;
  }

  return data;
}
