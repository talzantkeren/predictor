import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getSafeMembershipErrorMessage } from "@/features/membership/errors";
import {
  getInviteEffectiveStatus,
  isInviteEffectivelyActive,
} from "@/features/membership/display";
import {
  hashInviteToken,
  isValidInviteToken,
} from "@/features/membership/invite-token";
import {
  createdInviteRpcSchema,
  dashboardJoinRequestsRpcSchema,
  inviteMetadataRpcSchema,
  inviteResolutionRpcSchema,
  unavailableInviteResolutionRpcSchema,
} from "@/features/membership/schemas";
import { resolveInvite } from "@/features/membership/queries";
import { submitJoinRequest } from "@/features/membership/service";
import type { Database } from "@/types/database.generated";

const validToken = "A".repeat(43);
const validTokenHash =
  "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a";
const timestamp = "2026-08-14T10:00:00+00:00";

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("secure invite token boundary", () => {
  it("accepts only an exact unpadded 43-character base64url token", () => {
    expect(isValidInviteToken(validToken)).toBe(true);
    expect(isValidInviteToken("aZ09_-".repeat(7) + "A")).toBe(true);

    for (const candidate of [
      "A".repeat(42),
      "A".repeat(44),
      `${"A".repeat(42)}=`,
      `${"A".repeat(42)}/`,
      `${"A".repeat(42)}+`,
      null,
      undefined,
    ]) {
      expect(isValidInviteToken(candidate)).toBe(false);
    }
  });

  it("hashes a validated token deterministically", async () => {
    await expect(hashInviteToken(validToken)).resolves.toBe(validTokenHash);
    await expect(hashInviteToken("short")).rejects.toThrow(
      "INVALID_INVITE_TOKEN",
    );
  });
});

describe("membership RPC response validation", () => {
  it("accepts a one-time raw token only in the invite-creation response", () => {
    const result = createdInviteRpcSchema.parse({
      invite_id: "26000000-0000-4000-8000-000000000031",
      status: "active",
      created_at: timestamp,
      expires_at: "2026-08-21T10:00:00+00:00",
      revoked_at: null,
      raw_token: validToken,
    });

    expect(result.rawToken).toBe(validToken);
    expect(result.metadata).not.toHaveProperty("rawToken");
  });

  it("uses the database-derived expiry flag while preserving stored status", () => {
    const result = inviteMetadataRpcSchema.parse({
      invite_id: "26000000-0000-4000-8000-000000000031",
      status: "active",
      created_at: timestamp,
      expires_at: "2026-08-21T10:00:00+00:00",
      revoked_at: null,
      is_expired: true,
    });

    expect(result.status).toBe("active");
    expect(result.isExpired).toBe(true);
    expect(getInviteEffectiveStatus(result)).toBe("expired");
    expect(isInviteEffectivelyActive(result)).toBe(false);
  });

  it("maps a safe invite DTO and strips internal proof fields", () => {
    const result = inviteResolutionRpcSchema.parse({
      available: true,
      league_name: "ליגת חברים",
      demo_entry_fee_agorot: 0,
      demo_payment_instructions: null,
      joins_close_at: null,
      viewer_state: "pending_approval",
      join_request_id: "26000000-0000-4000-8000-000000000032",
      join_request_status: "pending_approval",
      request_created_at: timestamp,
      request_updated_at: timestamp,
      proofs: [
        {
          id: "26000000-0000-4000-8000-000000000033",
          mime_type: "image/webp",
          size_bytes: 1024,
          uploaded_at: timestamp,
          storage_path: "must/not/escape.webp",
          sha256: "f".repeat(64),
        },
      ],
    });

    expect(result.proofs[0]).toEqual({
      id: "26000000-0000-4000-8000-000000000033",
      mimeType: "image/webp",
      sizeBytes: 1024,
      uploadedAt: timestamp,
    });
    expect(result.proofs[0]).not.toHaveProperty("storagePath");
    expect(result.proofs[0]).not.toHaveProperty("sha256");
  });

  it("recognizes the opaque unavailable response", () => {
    expect(
      unavailableInviteResolutionRpcSchema.safeParse({
        available: false,
        league_name: null,
        token_hash: "private",
      }).success,
    ).toBe(true);
  });

  it("limits proof history and validates dashboard rows", () => {
    const result = dashboardJoinRequestsRpcSchema.safeParse([
      {
        request_id: "26000000-0000-4000-8000-000000000032",
        league_name: "ליגת חברים",
        status: "pending_proof",
        created_at: timestamp,
        updated_at: timestamp,
        proofs: Array.from({ length: 6 }, (_, index) => ({
          id: `26000000-0000-4000-8000-0000000000${40 + index}`,
          mime_type: "image/webp",
          size_bytes: 100,
          uploaded_at: timestamp,
        })),
      },
    ]);

    expect(result.success).toBe(false);
  });
});

describe("membership RPC token boundary", () => {
  it("rejects a malformed token before querying the database", async () => {
    const rpc = vi.fn();

    await expect(resolveInvite(clientWithRpc(rpc), "short")).resolves.toEqual({
      status: "unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only the validated token hash to invite resolution", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ available: false }],
      error: null,
    });

    await expect(resolveInvite(clientWithRpc(rpc), validToken)).resolves.toEqual({
      status: "unavailable",
    });
    expect(rpc).toHaveBeenCalledWith("resolve_invite", {
      p_token_hash: validTokenHash,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(validToken);
  });

  it("rejects a malformed join token before querying the database", async () => {
    const rpc = vi.fn();

    await expect(
      submitJoinRequest(clientWithRpc(rpc), "short"),
    ).resolves.toEqual({
      ok: false,
      message: "קישור ההזמנה אינו זמין.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only the validated token hash to join submission", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          request_id: "26000000-0000-4000-8000-000000000032",
          status: "pending_proof",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      error: null,
    });

    await expect(
      submitJoinRequest(clientWithRpc(rpc), validToken),
    ).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("submit_join_request", {
      p_token_hash: validTokenHash,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(validToken);
  });
});

describe("safe membership errors", () => {
  it("maps stable conflicts without exposing unknown database details", () => {
    expect(
      getSafeMembershipErrorMessage({ message: "INVITE_NOT_ALLOWED" }),
    ).toBe("הליגה אינה מקבלת בקשות הצטרפות חדשות.");
    expect(getSafeMembershipErrorMessage({ message: "JOIN_CLOSED" })).toBe(
      "הליגה אינה מקבלת בקשות הצטרפות חדשות.",
    );

    const fallback = getSafeMembershipErrorMessage({
      message: "relation private.invite_links leaked",
      details: "stack trace",
    });
    expect(fallback).toBe("לא ניתן להשלים את הפעולה כרגע. יש לנסות שוב.");
    expect(fallback).not.toContain("invite_links");
  });
});
