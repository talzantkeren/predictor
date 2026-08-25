import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getSafeMembershipErrorMessage } from "@/features/membership/errors";
import {
  encodeInviteAccessCookie,
  getInviteAccessCookieOptions,
  isTrustedInviteExchangeOrigin,
  parseInviteAccessCookie,
} from "@/features/membership/invite-access";
import {
  getInviteEffectiveStatus,
  getJoinRequestStatusCountLabel,
  isInviteEffectivelyActive,
} from "@/features/membership/display";
import {
  buildInviteShareUrl,
  parseInviteSecretFragment,
} from "@/features/membership/invite-fragment";
import {
  hashInviteToken,
  isValidInvitePublicId,
  isValidInviteToken,
  isValidInviteTokenHash,
} from "@/features/membership/invite-token";
import {
  createdInviteRpcSchema,
  dashboardJoinRequestsRpcSchema,
  inviteMetadataRpcSchema,
  inviteResolutionRpcSchema,
  managerJoinRequestsRpcSchema,
  rejectJoinRequestInputSchema,
  unavailableInviteResolutionRpcSchema,
} from "@/features/membership/schemas";
import { resolveInvite } from "@/features/membership/queries";
import {
  approveJoinRequest,
  rejectJoinRequest,
  submitJoinRequest,
} from "@/features/membership/service";
import type { Database } from "@/types/database.generated";

const validToken = "A".repeat(43);
const publicId = "26000000-0000-4000-8000-000000000031";
const validTokenHash =
  "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a";
const timestamp = "2026-08-14T10:00:00+00:00";

describe("membership status display", () => {
  it("uses action-specific labels for request counts", () => {
    expect(getJoinRequestStatusCountLabel("pending_proof")).toBe(
      "ממתינות לתמונת Demo",
    );
    expect(getJoinRequestStatusCountLabel("pending_approval")).toBe(
      "ממתינות לבדיקת מנהל/ת הליגה",
    );
    expect(getJoinRequestStatusCountLabel("rejected")).toBe("בקשות שנדחו");
  });
});

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

  it("validates the public identifier and lowercase digest independently", () => {
    expect(isValidInvitePublicId(publicId)).toBe(true);
    expect(isValidInviteTokenHash(validTokenHash)).toBe(true);

    expect(
      isValidInvitePublicId("26000000-0000-4000-8000-0000000000AB"),
    ).toBe(false);
    expect(isValidInvitePublicId("not-a-uuid")).toBe(false);
    expect(isValidInviteTokenHash(validTokenHash.toUpperCase())).toBe(false);
    expect(isValidInviteTokenHash(validToken)).toBe(false);
  });

  it("keeps the raw bearer in an exact URL Fragment and out of the request path", () => {
    const shareUrl = buildInviteShareUrl(
      "https://predictor.example/app",
      publicId,
      validToken,
    );
    const parsedUrl = new URL(shareUrl);

    expect(parsedUrl.pathname).toBe(`/invite/${publicId}`);
    expect(parsedUrl.pathname).not.toContain(validToken);
    expect(parsedUrl.search).toBe("");
    expect(parseInviteSecretFragment(parsedUrl.hash)).toBe(validToken);
  });

  it("rejects ambiguous, encoded, duplicated, or malformed invite fragments", () => {
    for (const fragment of [
      "",
      `#${validToken}`,
      `#invite=${validToken}&invite=${validToken}`,
      `#invite=${encodeURIComponent(validToken).replace("A", "%41")}`,
      `#invite=${"A".repeat(42)}`,
      `#other=${validToken}`,
      null,
    ]) {
      expect(parseInviteSecretFragment(fragment)).toBeNull();
    }
  });
});

describe("short-lived invite access cookie", () => {
  it("binds one validated digest to the exact public path", () => {
    const value = encodeInviteAccessCookie(publicId, validTokenHash);

    expect(parseInviteAccessCookie(value, publicId)).toBe(validTokenHash);
    expect(
      parseInviteAccessCookie(
        value,
        "26000000-0000-4000-8000-000000000032",
      ),
    ).toBeNull();
    expect(parseInviteAccessCookie(`${value}.extra`, publicId)).toBeNull();
    expect(getInviteAccessCookieOptions(publicId, 1_800)).toMatchObject({
      httpOnly: true,
      maxAge: 1_800,
      path: `/invite/${publicId}`,
      sameSite: "lax",
    });
  });

  it("allows only the configured or exact HTTPS preview Origin", () => {
    expect(
      isTrustedInviteExchangeOrigin(
        "https://predictor.example",
        "https://predictor.example/app",
      ),
    ).toBe(true);
    expect(
      isTrustedInviteExchangeOrigin(
        "https://slice.example.vercel.app",
        "https://predictor.example",
        ["slice.example.vercel.app"],
      ),
    ).toBe(true);

    for (const origin of [
      null,
      "https://attacker.example",
      "https://slice.example.vercel.app.attacker.test",
      "http://slice.example.vercel.app",
    ]) {
      expect(
        isTrustedInviteExchangeOrigin(origin, "https://predictor.example", [
          "slice.example.vercel.app",
        ]),
      ).toBe(false);
    }
  });
});

describe("membership RPC response validation", () => {
  it("accepts a one-time raw token only in the invite-creation response", () => {
    const result = createdInviteRpcSchema.parse({
      invite_id: "26000000-0000-4000-8000-000000000031",
      public_id: publicId,
      status: "active",
      created_at: timestamp,
      expires_at: "2026-08-21T10:00:00+00:00",
      revoked_at: null,
      raw_token: validToken,
    });

    expect(result.rawToken).toBe(validToken);
    expect(result.publicId).toBe(publicId);
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

  it("maps manager rows without retaining proof-internal fields", () => {
    const result = managerJoinRequestsRpcSchema.parse([
      {
        request_id: "26000000-0000-4000-8000-000000000032",
        requester_display_name: "מבקשת בדיקה",
        status: "pending_approval",
        rejection_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
        decided_at: null,
        proofs: [
          {
            id: "26000000-0000-4000-8000-000000000033",
            mime_type: "image/webp",
            size_bytes: 512,
            uploaded_at: timestamp,
            storage_path: "private/path.webp",
            sha256: "f".repeat(64),
          },
        ],
      },
    ]);

    expect(result[0]?.proofs[0]).toEqual({
      id: "26000000-0000-4000-8000-000000000033",
      mimeType: "image/webp",
      sizeBytes: 512,
      uploadedAt: timestamp,
    });
    expect(JSON.stringify(result)).not.toContain("storage_path");
    expect(JSON.stringify(result)).not.toContain("sha256");
  });

  it("requires a bounded single-line rejection reason", () => {
    const base = {
      leagueId: publicId,
      requestId: "26000000-0000-4000-8000-000000000032",
    };

    expect(rejectJoinRequestInputSchema.safeParse({ ...base, reason: "לא תקין" }).success).toBe(true);
    expect(rejectJoinRequestInputSchema.safeParse({ ...base, reason: "x" }).success).toBe(false);
    expect(rejectJoinRequestInputSchema.safeParse({ ...base, reason: "שורה\nנוספת" }).success).toBe(false);
  });
});

describe("membership RPC token boundary", () => {
  it("rejects a malformed token before querying the database", async () => {
    const rpc = vi.fn();

    await expect(
      resolveInvite(clientWithRpc(rpc), "short", validTokenHash),
    ).resolves.toEqual({ status: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only the public ID and validated digest to invite resolution", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ available: false }],
      error: null,
    });

    await expect(
      resolveInvite(clientWithRpc(rpc), publicId, validTokenHash),
    ).resolves.toEqual({ status: "unavailable" });
    expect(rpc).toHaveBeenCalledWith("resolve_invite", {
      p_public_id: publicId,
      p_token_hash: validTokenHash,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(validToken);
  });

  it("rejects a malformed join token before querying the database", async () => {
    const rpc = vi.fn();

    await expect(
      submitJoinRequest(clientWithRpc(rpc), publicId, "short"),
    ).resolves.toEqual({
      ok: false,
      message: "קישור ההזמנה אינו זמין.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only the public ID and validated digest to join submission", async () => {
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
      submitJoinRequest(clientWithRpc(rpc), publicId, validTokenHash),
    ).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("submit_join_request", {
      p_public_id: publicId,
      p_token_hash: validTokenHash,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(validToken);
  });
});

describe("manager decision RPC boundary", () => {
  const requestId = "26000000-0000-4000-8000-000000000032";

  it("sends only the request identifier when approving", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        request_id: requestId,
        request_status: "approved",
        member_id: "26000000-0000-4000-8000-000000000034",
        member_status: "active",
        decided_at: timestamp,
      }],
      error: null,
    });

    await expect(approveJoinRequest(clientWithRpc(rpc), requestId)).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("approve_join_request", { p_request_id: requestId });
  });

  it("sends the validated decision reason and maps unknown errors opaquely", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          request_id: requestId,
          request_status: "rejected",
          rejection_reason: "הוכחת Demo אינה מתאימה",
          decided_at: timestamp,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "private row detail" } });

    await expect(rejectJoinRequest(clientWithRpc(rpc), requestId, "הוכחת Demo אינה מתאימה"))
      .resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenNthCalledWith(1, "reject_join_request", {
      p_request_id: requestId,
      p_reason: "הוכחת Demo אינה מתאימה",
    });
    await expect(approveJoinRequest(clientWithRpc(rpc), requestId)).resolves.toEqual({
      ok: false,
      message: "לא ניתן להשלים את הפעולה כרגע. יש לנסות שוב.",
    });
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
