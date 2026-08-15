"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/features/auth/session";
import { getInviteAccessTokenHash } from "@/features/membership/invite-access-server";
import { getInvitePath } from "@/features/membership/invite-fragment";
import {
  createOrRotateInviteInputSchema,
  approveJoinRequestInputSchema,
  getMembershipFieldErrors,
  rejectJoinRequestInputSchema,
  revokeInviteInputSchema,
  submitJoinRequestInputSchema,
  type MembershipFieldErrors,
} from "@/features/membership/schemas";
import {
  createOrRotateInvite,
  approveJoinRequest,
  rejectJoinRequest,
  revokeInvite,
  submitJoinRequest,
} from "@/features/membership/service";

export type MembershipActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  rawToken?: string;
  publicId?: string;
  fieldErrors?: MembershipFieldErrors;
};

export type JoinDecisionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: MembershipFieldErrors;
};

async function isLeagueManager(
  supabase: Awaited<ReturnType<typeof requireAuthenticatedUser>>["supabase"],
  leagueId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("leagues")
    .select("manager_id")
    .eq("id", leagueId)
    .maybeSingle();

  return !error && data?.manager_id === userId;
}

export async function createOrRotateInviteAction(
  _previousState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const parsed = createOrRotateInviteInputSchema.safeParse({
    leagueId: formData.get("leagueId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "פרטי הליגה אינם תקינים." };
  }

  if (!(await isLeagueManager(supabase, parsed.data.leagueId, user.id))) {
    return { status: "error", message: "הליגה המבוקשת אינה זמינה." };
  }

  const result = await createOrRotateInvite(supabase, parsed.data.leagueId);

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  revalidatePath(`/leagues/${parsed.data.leagueId}/settings`);
  revalidatePath("/dashboard");

  return {
    status: "success",
    message:
      "הקישור נוצר. יש להעתיק אותו עכשיו — לאחר רענון לא ניתן יהיה להציגו שוב.",
    rawToken: result.data.rawToken,
    publicId: result.data.publicId,
  };
}

export async function revokeInviteAction(
  _previousState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const parsed = revokeInviteInputSchema.safeParse({
    leagueId: formData.get("leagueId"),
    inviteId: formData.get("inviteId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "פרטי ההזמנה אינם תקינים." };
  }

  if (!(await isLeagueManager(supabase, parsed.data.leagueId, user.id))) {
    return { status: "error", message: "הליגה המבוקשת אינה זמינה." };
  }

  const result = await revokeInvite(supabase, parsed.data.inviteId);

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath(`/leagues/${parsed.data.leagueId}/settings`);

  return { status: "success", message: "קישור ההזמנה בוטל." };
}

export async function submitJoinRequestAction(
  _previousState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const publicIdValue = formData.get("publicId");
  const parsed = submitJoinRequestInputSchema.safeParse({
    publicId: publicIdValue,
  });
  const nextPath = parsed.success
    ? getInvitePath(parsed.data.publicId)
    : "/dashboard";
  const { supabase } = await requireAuthenticatedUser(nextPath);

  if (!parsed.success) {
    return { status: "error", message: "קישור ההזמנה אינו זמין." };
  }

  const tokenHash = await getInviteAccessTokenHash(parsed.data.publicId);
  if (!tokenHash) {
    return { status: "error", message: "קישור ההזמנה אינו זמין." };
  }

  const result = await submitJoinRequest(
    supabase,
    parsed.data.publicId,
    tokenHash,
  );

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath("/dashboard");
  revalidatePath(nextPath);

  return {
    status: "success",
    message: "בקשת ההצטרפות נפתחה. כעת יש להעלות תמונת Demo בלבד.",
  };
}

export async function approveJoinRequestAction(
  _previousState: JoinDecisionActionState,
  formData: FormData,
): Promise<JoinDecisionActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const parsed = approveJoinRequestInputSchema.safeParse({
    leagueId: formData.get("leagueId"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "פרטי הבקשה אינם תקינים." };
  }
  if (!(await isLeagueManager(supabase, parsed.data.leagueId, user.id))) {
    return { status: "error", message: "בקשת ההצטרפות אינה זמינה." };
  }

  const result = await approveJoinRequest(supabase, parsed.data.requestId);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/dashboard");
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  revalidatePath(`/leagues/${parsed.data.leagueId}/members`);
  return { status: "success", message: "הבקשה אושרה והחברות בליגה הופעלה." };
}

export async function rejectJoinRequestAction(
  _previousState: JoinDecisionActionState,
  formData: FormData,
): Promise<JoinDecisionActionState> {
  const { supabase, user } = await requireAuthenticatedUser("/dashboard");
  const parsed = rejectJoinRequestInputSchema.safeParse({
    leagueId: formData.get("leagueId"),
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "יש לתקן את סיבת הדחייה.",
      fieldErrors: getMembershipFieldErrors(parsed.error),
    };
  }
  if (!(await isLeagueManager(supabase, parsed.data.leagueId, user.id))) {
    return { status: "error", message: "בקשת ההצטרפות אינה זמינה." };
  }

  const result = await rejectJoinRequest(
    supabase,
    parsed.data.requestId,
    parsed.data.reason,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/dashboard");
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  revalidatePath(`/leagues/${parsed.data.leagueId}/members`);
  return { status: "success", message: "הבקשה נדחתה." };
}
