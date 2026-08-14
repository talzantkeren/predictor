import { describe, expect, it, vi } from "vitest";

import {
  authorizePaymentProof,
  consumeProofUploadAttempt,
  finalizePaymentProof,
  getJoinRequestUploadContext,
} from "@/features/files/rpc";

const requestId = "11111111-1111-4111-8111-111111111111";
const leagueId = "22222222-2222-4222-8222-222222222222";
const proofId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";

function clientWith(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe("proof RPC boundary", () => {
  it("loads only the authorized upload context with the exact request argument", async () => {
    const client = clientWith([{
      request_id: requestId,
      league_id: leagueId,
      status: "pending_proof",
    }]);

    await expect(getJoinRequestUploadContext(client, requestId)).resolves.toEqual({
      requestId,
      leagueId,
      status: "pending_proof",
    });
    expect(client.rpc).toHaveBeenCalledWith("get_join_request_upload_context", {
      p_request_id: requestId,
    });
  });

  it("turns an absent upload context into an opaque denial", async () => {
    await expect(
      getJoinRequestUploadContext(clientWith([]), requestId),
    ).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE", status: 404 });
  });

  it("uses the durable rate-limit RPC and exposes only a bounded Retry-After", async () => {
    const client = clientWith([{ allowed: false, retry_after_seconds: 37 }]);

    await expect(
      consumeProofUploadAttempt(client, requestId),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 37,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "consume_proof_upload_rate_limit",
      { p_request_id: requestId },
    );
  });

  it("finalizes with no actor, league, status, MIME, or path supplied by the client", async () => {
    const client = clientWith([{
      proof_id: proofId,
      request_id: requestId,
      status: "pending_approval",
      replayed: false,
    }]);

    await finalizePaymentProof(client, {
      requestId,
      proofId,
      idempotencyKey,
      sha256: "a".repeat(64),
      sizeBytes: 123,
    });

    expect(client.rpc).toHaveBeenCalledWith("finalize_payment_proof", {
      p_request_id: requestId,
      p_proof_id: proofId,
      p_idempotency_key: idempotencyKey,
      p_sha256: "a".repeat(64),
      p_size_bytes: 123,
    });
  });

  it("authorizes a proof ID before returning DB-derived object coordinates", async () => {
    const client = clientWith([{
      proof_id: proofId,
      request_id: requestId,
      league_id: leagueId,
    }]);

    await expect(authorizePaymentProof(client, proofId)).resolves.toEqual({
      proofId,
      requestId,
      leagueId,
    });
    expect(client.rpc).toHaveBeenCalledWith("authorize_payment_proof_access", {
      p_proof_id: proofId,
    });
  });

  it.each([
    ["UNAUTHENTICATED", "UNAUTHENTICATED", 401],
    ["FORBIDDEN", "RESOURCE_UNAVAILABLE", 404],
    ["REQUEST_NOT_UPLOADABLE", "REQUEST_NOT_UPLOADABLE", 409],
    ["PROOF_LIMIT_REACHED", "PROOF_LIMIT_REACHED", 409],
    ["PROOF_IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT", 409],
    ["PROOF_OBJECT_MISSING", "STORAGE_UNAVAILABLE", 503],
    ["VALIDATION_ERROR", "INTERNAL_ERROR", 500],
  ])("maps database error %s without exposing provider details", async (message, code, status) => {
    await expect(
      getJoinRequestUploadContext(
        clientWith(null, {
          code: "P0001",
          message,
          details: "private SQL detail",
        }),
        requestId,
      ),
    ).rejects.toMatchObject({
      code,
      status,
      definitiveDatabaseRejection: true,
    });
  });

  it("keeps an unknown provider failure classified as an ambiguous outcome", async () => {
    await expect(
      finalizePaymentProof(
        clientWith(null, {
          code: "",
          message: "gateway response unavailable",
        }),
        {
          requestId,
          proofId,
          idempotencyKey,
          sha256: "a".repeat(64),
          sizeBytes: 123,
        },
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      definitiveDatabaseRejection: false,
    });
  });

  it.each([
    ["P0001", true],
    ["22001", true],
    ["23505", true],
    ["40001", true],
    ["40P01", true],
    ["40003", false],
    ["08007", false],
    ["57P01", false],
    ["42601", false],
    ["ZZ999", false],
  ])(
    "classifies PostgreSQL SQLSTATE %s conservatively",
    async (sqlState, definitiveDatabaseRejection) => {
      await expect(
        finalizePaymentProof(
          clientWith(null, {
            code: sqlState,
            message: "unrecognized database outcome",
          }),
          {
            requestId,
            proofId,
            idempotencyKey,
            sha256: "a".repeat(64),
            sizeBytes: 123,
          },
        ),
      ).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        definitiveDatabaseRejection,
      });
    },
  );

  it("fails closed on malformed privileged JSON", async () => {
    await expect(
      authorizePaymentProof(clientWith({ storage_path: "private/path" }), proofId),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });

  it("fails closed when a singleton RPC unexpectedly returns multiple rows", async () => {
    await expect(
      authorizePaymentProof(
        clientWith([
          { proof_id: proofId, request_id: requestId, league_id: leagueId },
          { proof_id: proofId, request_id: requestId, league_id: leagueId },
        ]),
        proofId,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });
});
