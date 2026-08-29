import { z } from "zod";

import {
  INVITE_PUBLIC_ID_PATTERN,
  INVITE_TOKEN_HASH_PATTERN,
  INVITE_TOKEN_PATTERN,
} from "@/features/membership/invite-token";
import { containsDangerousBidiControl } from "@/lib/untrusted-text";

const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable().optional().default(null);

export const leagueIdSchema = z.string().uuid("מזהה הליגה אינו תקין.");
export const joinRequestIdSchema = z
  .string()
  .uuid("מזהה בקשת ההצטרפות אינו תקין.");
export const inviteIdSchema = z.string().uuid("מזהה ההזמנה אינו תקין.");
export const inviteTokenSchema = z
  .string()
  .regex(INVITE_TOKEN_PATTERN, "קישור ההזמנה אינו תקין.");
export const invitePublicIdSchema = z
  .string()
  .regex(INVITE_PUBLIC_ID_PATTERN, "מזהה ההזמנה אינו תקין.");
export const inviteTokenHashSchema = z
  .string()
  .regex(INVITE_TOKEN_HASH_PATTERN, "קישור ההזמנה אינו תקין.");

export const createOrRotateInviteInputSchema = z.object({
  leagueId: leagueIdSchema,
});

export const revokeInviteInputSchema = z.object({
  leagueId: leagueIdSchema,
  inviteId: inviteIdSchema,
});

export const submitJoinRequestInputSchema = z.object({
  publicId: invitePublicIdSchema,
});

export const approveJoinRequestInputSchema = z.object({
  leagueId: leagueIdSchema,
  requestId: joinRequestIdSchema,
});

export const rejectJoinRequestInputSchema = approveJoinRequestInputSchema.extend({
  reason: z
    .string()
    .trim()
    .min(3, "יש לכתוב סיבה באורך של 3 תווים לפחות.")
    .max(300, "סיבת הדחייה יכולה להכיל עד 300 תווים.")
    .refine((value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value), {
      message: "סיבת הדחייה חייבת להיכתב בשורה אחת.",
    })
    .refine((value) => !containsDangerousBidiControl(value), {
      message: "סיבת הדחייה מכילה תווי כיווניות בלתי־נראים שאינם מותרים.",
    }),
});

export const inviteExchangeInputSchema = z
  .object({
    tokenHash: inviteTokenHashSchema,
  })
  .strict();

const proofSummarySchema = z
  .object({
    id: z.string().uuid(),
    mime_type: z.literal("image/webp"),
    size_bytes: z.number().int().positive().max(4_000_000),
    uploaded_at: timestampSchema,
  })
  .transform((proof) => ({
    id: proof.id,
    mimeType: proof.mime_type,
    sizeBytes: proof.size_bytes,
    uploadedAt: proof.uploaded_at,
  }));

export const inviteMetadataRpcSchema = z
  .object({
    invite_id: z.string().uuid(),
    status: z.enum(["active", "revoked"]),
    created_at: timestampSchema,
    expires_at: timestampSchema,
    revoked_at: nullableTimestampSchema,
    is_expired: z.boolean(),
  })
  .transform((invite) => ({
    id: invite.invite_id,
    status: invite.status,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
    revokedAt: invite.revoked_at,
    isExpired: invite.is_expired,
  }));

export const createdInviteRpcSchema = z
  .object({
    invite_id: z.string().uuid(),
    public_id: invitePublicIdSchema,
    status: z.literal("active"),
    created_at: timestampSchema,
    expires_at: timestampSchema,
    revoked_at: z.null().optional().default(null),
    raw_token: inviteTokenSchema,
  })
  .transform((invite) => ({
    metadata: {
      id: invite.invite_id,
      status: invite.status,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      revokedAt: invite.revoked_at,
    },
    publicId: invite.public_id,
    rawToken: invite.raw_token,
  }));

export const inviteResolutionRpcSchema = z
  .object({
    available: z.literal(true),
    league_name: z.string().min(1).max(80),
    demo_entry_fee_agorot: z.number().int().nonnegative(),
    demo_payment_instructions: z.string().max(500).nullable(),
    joins_close_at: nullableTimestampSchema,
    viewer_state: z.enum([
      "guest",
      "eligible",
      "manager",
      "active_member",
      "pending_proof",
      "pending_approval",
      "approved",
      "rejected",
      "closed",
    ]),
    join_request_id: z.string().uuid().nullable().optional().default(null),
    join_request_status: z
      .enum(["pending_proof", "pending_approval", "approved", "rejected"])
      .nullable()
      .optional()
      .default(null),
    request_created_at: nullableTimestampSchema,
    request_updated_at: nullableTimestampSchema,
    proofs: z.array(proofSummarySchema).max(5).optional().default([]),
  })
  .transform((resolution) => ({
    available: resolution.available,
    leagueName: resolution.league_name,
    demoEntryFeeAgorot: resolution.demo_entry_fee_agorot,
    demoPaymentInstructions: resolution.demo_payment_instructions,
    joinsCloseAt: resolution.joins_close_at,
    viewerState: resolution.viewer_state,
    joinRequestId: resolution.join_request_id,
    joinRequestStatus: resolution.join_request_status,
    requestCreatedAt: resolution.request_created_at,
    requestUpdatedAt: resolution.request_updated_at,
    proofs: resolution.proofs,
  }));

export const unavailableInviteResolutionRpcSchema = z.object({
  available: z.literal(false),
});

export const joinRequestRpcSchema = z
  .object({
    request_id: z.string().uuid(),
    status: z.enum([
      "pending_proof",
      "pending_approval",
      "approved",
      "rejected",
    ]),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .transform((request) => ({
    requestId: request.request_id,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
  }));

const dashboardJoinRequestRpcSchema = z
  .object({
    request_id: z.string().uuid(),
    league_name: z.string().min(1).max(80),
    status: z.enum([
      "pending_proof",
      "pending_approval",
      "approved",
      "rejected",
    ]),
    rejection_reason: z.string().max(300).nullable().optional().default(null),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    proofs: z.array(proofSummarySchema).max(5).optional().default([]),
  })
  .transform((request) => ({
    requestId: request.request_id,
    leagueName: request.league_name,
    status: request.status,
    rejectionReason: request.rejection_reason,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    proofs: request.proofs,
  }));

export const dashboardJoinRequestPageRpcSchema = z
  .array(dashboardJoinRequestRpcSchema)
  .max(26);

const managerJoinRequestRpcSchema = z
  .object({
    request_id: z.string().uuid(),
    requester_display_name: z.string().min(1).max(80),
    status: z.enum([
      "pending_proof",
      "pending_approval",
      "approved",
      "rejected",
    ]),
    rejection_reason: z.string().max(300).nullable().optional().default(null),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    decided_at: nullableTimestampSchema,
    proofs: z.array(proofSummarySchema).max(5).optional().default([]),
  })
  .transform((request) => ({
    requestId: request.request_id,
    requesterDisplayName: request.requester_display_name,
    status: request.status,
    rejectionReason: request.rejection_reason,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    decidedAt: request.decided_at,
    proofs: request.proofs,
  }));

export const managerJoinRequestPageRpcSchema = z
  .array(managerJoinRequestRpcSchema)
  .max(26);

const activeLeagueMemberRpcSchema = z
  .object({
    membership_id: z.string().uuid(),
    display_name: z.string().min(1).max(80),
    approved_at: timestampSchema,
  })
  .strict()
  .transform((member) => ({
    membershipId: member.membership_id,
    displayName: member.display_name,
    approvedAt: member.approved_at,
  }));

export const activeLeagueMemberPageRpcSchema = z
  .array(activeLeagueMemberRpcSchema)
  .max(26);

const joinRequestStatusFilterSchema = z.enum([
  "pending_proof",
  "pending_approval",
  "approved",
  "rejected",
]);

export function parseJoinRequestStatusFilter(value: unknown):
  | {
      success: true;
      data:
        | "pending_proof"
        | "pending_approval"
        | "approved"
        | "rejected"
        | undefined;
    }
  | { success: false } {
  if (value === undefined || value === "") {
    return { success: true, data: undefined };
  }

  const parsed = joinRequestStatusFilterSchema.safeParse(value);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false };
}

export const approvedJoinRequestRpcSchema = z
  .object({
    request_id: z.string().uuid(),
    request_status: z.literal("approved"),
    member_id: z.string().uuid(),
    member_status: z.literal("active"),
    decided_at: timestampSchema,
  })
  .transform((result) => ({
    requestId: result.request_id,
    status: result.request_status,
    memberId: result.member_id,
    decidedAt: result.decided_at,
  }));

export const rejectedJoinRequestRpcSchema = z
  .object({
    request_id: z.string().uuid(),
    request_status: z.literal("rejected"),
    rejection_reason: z.string().min(3).max(300),
    decided_at: timestampSchema,
  })
  .transform((result) => ({
    requestId: result.request_id,
    status: result.request_status,
    rejectionReason: result.rejection_reason,
    decidedAt: result.decided_at,
  }));

export type MembershipFieldErrors = Record<string, string[] | undefined>;

export function getMembershipFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as MembershipFieldErrors;
}
