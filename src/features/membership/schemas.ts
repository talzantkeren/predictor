import { z } from "zod";

import { INVITE_TOKEN_PATTERN } from "@/features/membership/invite-token";

const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable().optional().default(null);

export const leagueIdSchema = z.string().uuid("מזהה הליגה אינו תקין.");
export const inviteIdSchema = z.string().uuid("מזהה ההזמנה אינו תקין.");
export const inviteTokenSchema = z
  .string()
  .regex(INVITE_TOKEN_PATTERN, "קישור ההזמנה אינו תקין.");

export const createOrRotateInviteInputSchema = z.object({
  leagueId: leagueIdSchema,
});

export const revokeInviteInputSchema = z.object({
  leagueId: leagueIdSchema,
  inviteId: inviteIdSchema,
});

export const submitJoinRequestInputSchema = z.object({
  token: inviteTokenSchema,
});

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
    created_at: timestampSchema,
    updated_at: timestampSchema,
    proofs: z.array(proofSummarySchema).max(5).optional().default([]),
  })
  .transform((request) => ({
    requestId: request.request_id,
    leagueName: request.league_name,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    proofs: request.proofs,
  }));

export const dashboardJoinRequestsRpcSchema = z
  .array(dashboardJoinRequestRpcSchema)
  .max(100);

export type MembershipFieldErrors = Record<string, string[] | undefined>;

export function getMembershipFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as MembershipFieldErrors;
}
