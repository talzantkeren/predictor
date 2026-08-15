import type { SupabaseClient } from "@supabase/supabase-js";

import { getSafeMembershipErrorMessage } from "@/features/membership/errors";
import {
  isValidInvitePublicId,
  isValidInviteTokenHash,
} from "@/features/membership/invite-token";
import {
  getSingleMembershipRpcRecord,
  invokeMembershipRpc,
} from "@/features/membership/rpc";
import {
  createdInviteRpcSchema,
  joinRequestRpcSchema,
  approvedJoinRequestRpcSchema,
  rejectedJoinRequestRpcSchema,
} from "@/features/membership/schemas";
import type { Database } from "@/types/database.generated";

export async function createOrRotateInvite(
  supabase: SupabaseClient<Database>,
  leagueId: string,
) {
  const { data, error } = await invokeMembershipRpc(
    supabase,
    "create_or_rotate_invite",
    { p_league_id: leagueId },
  );

  if (error) {
    return { ok: false as const, message: getSafeMembershipErrorMessage(error) };
  }

  const parsed = createdInviteRpcSchema.safeParse(
    getSingleMembershipRpcRecord(data),
  );

  if (!parsed.success) {
    return {
      ok: false as const,
      message: "ההזמנה נוצרה, אך לא ניתן להציג את הקישור. יש ליצור קישור חדש.",
    };
  }

  return { ok: true as const, data: parsed.data };
}

export async function approveJoinRequest(
  supabase: SupabaseClient<Database>,
  requestId: string,
) {
  const { data, error } = await invokeMembershipRpc(
    supabase,
    "approve_join_request",
    { p_request_id: requestId },
  );
  if (error) return { ok: false as const, message: getSafeMembershipErrorMessage(error) };

  const parsed = approvedJoinRequestRpcSchema.safeParse(
    getSingleMembershipRpcRecord(data),
  );
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : { ok: false as const, message: "לא ניתן לאשר את הבקשה כרגע. יש לרענן ולנסות שוב." };
}

export async function rejectJoinRequest(
  supabase: SupabaseClient<Database>,
  requestId: string,
  reason: string,
) {
  const { data, error } = await invokeMembershipRpc(
    supabase,
    "reject_join_request",
    { p_request_id: requestId, p_reason: reason },
  );
  if (error) return { ok: false as const, message: getSafeMembershipErrorMessage(error) };

  const parsed = rejectedJoinRequestRpcSchema.safeParse(
    getSingleMembershipRpcRecord(data),
  );
  return parsed.success
    ? { ok: true as const, data: parsed.data }
    : { ok: false as const, message: "לא ניתן לדחות את הבקשה כרגע. יש לרענן ולנסות שוב." };
}

export async function revokeInvite(
  supabase: SupabaseClient<Database>,
  inviteId: string,
) {
  const { error } = await invokeMembershipRpc(supabase, "revoke_invite", {
    p_invite_id: inviteId,
  });

  if (error) {
    return { ok: false as const, message: getSafeMembershipErrorMessage(error) };
  }

  return { ok: true as const };
}

export async function submitJoinRequest(
  supabase: SupabaseClient<Database>,
  publicId: string,
  tokenHash: string,
) {
  if (
    !isValidInvitePublicId(publicId) ||
    !isValidInviteTokenHash(tokenHash)
  ) {
    return { ok: false as const, message: "קישור ההזמנה אינו זמין." };
  }

  const { data, error } = await invokeMembershipRpc(
    supabase,
    "submit_join_request",
    { p_public_id: publicId, p_token_hash: tokenHash },
  );

  if (error) {
    return { ok: false as const, message: getSafeMembershipErrorMessage(error) };
  }

  const parsed = joinRequestRpcSchema.safeParse(
    getSingleMembershipRpcRecord(data),
  );

  if (!parsed.success) {
    return {
      ok: false as const,
      message: "לא ניתן לקרוא את מצב הבקשה כרגע. יש לרענן ולנסות שוב.",
    };
  }

  return { ok: true as const, data: parsed.data };
}
